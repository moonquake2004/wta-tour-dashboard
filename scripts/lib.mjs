/**
 * Shared helpers for the WTA Dashboard data pipeline.
 *
 * All data is retrieved from the official WTA public JSON API that powers
 * wtatennis.com (https://api.wtatennis.com/tennis).  Nothing is scraped from
 * HTML: every record is the same payload the official site itself consumes.
 *
 * The API is undocumented and rate-limited, so every request goes through a
 * politeness gate (small concurrency + spacing) and is retried with
 * exponential backoff.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const API = 'https://api.wtatennis.com/tennis';
export const ROOT = resolve(import.meta.dirname, '..');
export const DATA_DIR = resolve(ROOT, 'data');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/* ------------------------------------------------------------------ */
/* Politeness gate                                                     */
/* ------------------------------------------------------------------ */

const MAX_CONCURRENCY = Number(process.env.WTA_CONCURRENCY || 5);
const MIN_GAP_MS = Number(process.env.WTA_GAP_MS || 90);

let active = 0;
let lastStart = 0;
const queue = [];

function pump() {
  if (active >= MAX_CONCURRENCY || queue.length === 0) return;
  const wait = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
  if (wait > 0) {
    setTimeout(pump, wait);
    return;
  }
  const job = queue.shift();
  active += 1;
  lastStart = Date.now();
  job
    .run()
    .then(job.resolve, job.reject)
    .finally(() => {
      active -= 1;
      setTimeout(pump, 0);
    });
  pump();
}

function schedule(run) {
  return new Promise((res, rej) => {
    queue.push({ run, resolve: res, reject: rej });
    pump();
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

export async function apiGet(path, params = {}, { retries = 4 } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 250);
    try {
      const res = await schedule(() =>
        fetch(url, {
          headers: {
            'User-Agent': UA,
            Accept: 'application/json, text/plain, */*',
            Origin: 'https://www.wtatennis.com',
            Referer: 'https://www.wtatennis.com/',
          },
          signal: AbortSignal.timeout(45_000),
        }),
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url.pathname}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`GET ${path} failed after ${retries + 1} attempts: ${lastErr?.message}`);
}

/* ------------------------------------------------------------------ */
/* Data endpoints                                                      */
/* ------------------------------------------------------------------ */

/** Official WTA singles ranking table. The API caps a page at 100 rows. */
export async function fetchSinglesRankings({ max = 300, at } = {}) {
  const out = [];
  for (let page = 0; out.length < max; page += 1) {
    const chunk = await apiGet('/players/ranked', {
      page,
      pageSize: 100,
      type: 'rankSingles',
      sort: 'asc',
      metric: 'SINGLES',
      at,
    });
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    out.push(...chunk);
    if (chunk.length < 100) break;
  }
  return out.slice(0, max);
}

/** Official WTA doubles ranking table. */
export async function fetchDoublesRankings({ max = 100, at } = {}) {
  const out = [];
  for (let page = 0; out.length < max; page += 1) {
    const chunk = await apiGet('/players/ranked', {
      page,
      pageSize: 100,
      type: 'rankDoubles',
      sort: 'asc',
      metric: 'DOUBLES',
      at,
    });
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    out.push(...chunk);
    if (chunk.length < 100) break;
  }
  return out.slice(0, max);
}

/** Porsche Race to the WTA Finals standings (calendar-year points). */
export async function fetchRaceRankings({ max = 100, at } = {}) {
  const out = [];
  for (let page = 0; out.length < max; page += 1) {
    const chunk = await apiGet('/players/ranked', {
      page,
      pageSize: 100,
      type: 'rankChampSingles',
      sort: 'asc',
      metric: 'CHAMPIONSSINGLES',
      at,
    });
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    out.push(...chunk);
    if (chunk.length < 100) break;
  }
  return out.slice(0, max);
}

/** Long biographical record: bio fields + career W/L + titles + prize money. */
export const fetchPlayerDetailed = (id) => apiGet(`/players/${id}/detailed`);

/** Season aggregate statistics (serve/return splits used for leaderboards). */
export const fetchPlayerSeason = (id, year) => apiGet(`/players/${id}/year/${year}`);

/** Full week-by-week singles/doubles ranking history. */
export const fetchPlayerRankingHistory = (id, params = {}) =>
  apiGet(`/players/${id}/ranking`, params);

/** Match-by-match results for a player. */
export const fetchPlayerMatches = (id, params = {}) =>
  apiGet(`/players/${id}/matches`, { page: 0, pageSize: 100, ...params });

export const fetchHeadToHead = (a, b) => apiGet(`/players/${a}/headtohead/${b}`);

export const fetchTournaments = (params = {}) => apiGet('/tournaments', params);

export const fetchTournament = (groupId, year) => apiGet(`/tournaments/${groupId}/${year}`);

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(value, null, 0) + '\n', 'utf8');
  const kb = (Buffer.byteLength(JSON.stringify(value)) / 1024).toFixed(1);
  console.log(`  ✓ ${path}  (${kb} KB)`);
  return abs;
}

export function log(step, msg) {
  console.log(`\n[${step}] ${msg}`);
}

/** Try a list of async producers, returning the first non-empty result. */
export async function firstOk(tasks) {
  for (const task of tasks) {
    try {
      const value = await task();
      if (value) return value;
    } catch {
      /* keep trying */
    }
  }
  return null;
}
