#!/usr/bin/env node
/**
 * Fetch complete per-event match results.
 *
 * The calendar panel needs the full draw, not just each player's own log: the
 * official tournament feed returns every match of an event — qualifying included
 * — with seeds, scores and the winner, which is exactly a results page.
 *
 * Output: data/event-matches.json
 *   { "<groupId>|<year>": { event, year, level, surface, rounds: [{ key, matches: [...] }] } }
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, apiGet, writeJson, log } from './lib.mjs';

const SEASONS_BACK = Number(process.env.WTA_EVENT_SEASONS || 2);
const CONCURRENCY = Number(process.env.WTA_EVENT_WORKERS || 5);

const read = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(ROOT, 'data', f), 'utf8'));
  } catch {
    return fallback;
  }
};

const tour = await read('tournaments.json', { events: [] });
const season = Number(process.env.WTA_SEASON || new Date().getUTCFullYear());

const targets = tour.events.filter((e) => e.year >= season - (SEASONS_BACK - 1) && e.id);
log('events', `Fetching full draws for ${targets.length} events (${season - SEASONS_BACK + 1}–${season})…`);

/**
 * Round labels.
 *
 * The feed's `RoundID` is a per-event draw index, not a fixed vocabulary: at the
 * 2026 majors `1`/`2`/`3`/`4` mean R128…R16, while a 28-player WTA 500 uses `1`
 * for its first round.  The reliable signal is therefore **how many matches a
 * round holds**, since a knockout round of n matches implies n×2 entrants:
 *
 *   matches  1   2   4   8   16   32   64
 *   round    F  SF  QF  R16 R32  R64  R128
 *
 * The round code is only used to break ties between rounds that hold the same
 * number of matches, and an explicit letter code wins outright.
 */
const CODE_ROUND = { F: 'F', S: 'SF', Q: 'QF' };
const COUNT_ROUND = [
  { max: 1, label: 'F' },
  { max: 2, label: 'SF' },
  { max: 4, label: 'QF' },
  { max: 8, label: 'R16' },
  { max: 16, label: 'R32' },
  { max: 32, label: 'R64' },
  { max: 64, label: 'R128' },
];
const ROUND_ORDER = { R128: 30, R64: 40, R32: 50, R16: 60, QF: 70, SF: 80, F: 90 };

/** Rank a round from its match count, letting an explicit code win. */
function classifyRound(code, matchCount) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  if (CODE_ROUND[c]) return { label: CODE_ROUND[c], order: ROUND_ORDER[CODE_ROUND[c]] };
  if (/^R\d+$/.test(c)) return { label: c, order: ROUND_ORDER[c] || 35 };
  const bucket = COUNT_ROUND.find((b) => matchCount <= b.max) || COUNT_ROUND[COUNT_ROUND.length - 1];
  return { label: bucket.label, order: ROUND_ORDER[bucket.label] };
}

function playerOf(m, side) {
  const id = m[`PlayerID${side}`];
  const first = (m[`PlayerNameFirst${side}`] || '').trim();
  const last = (m[`PlayerNameLast${side}`] || '').trim();
  if (!id && !last) return null;
  return {
    id: id ? Number(id) : null,
    name: `${first} ${last}`.replace(/\s+/g, ' ').trim(),
    country: m[`PlayerCountry${side}`] || '',
    seed: m[`Seed${side}`] || null,
  };
}

function normalise(m) {
  if (m.DrawMatchType !== 'S') return null; // singles only
  const a = playerOf(m, 'A');
  const b = playerOf(m, 'B');
  if (!a || !b) return null;

  const winner = Number(m.Winner);
  // 1 ⇒ A won, 2 ⇒ B won.  3 (and anything else) means the winner is not flagged
  // in the `Winner` column, so it is derived from the set scores — the score
  // string is authoritative either way, and a retirement still yields a winner.
  let winnerSide = winner === 1 ? 'A' : winner === 2 ? 'B' : '';
  if (!winnerSide) winnerSide = setWinner(a, b, m) || 'A';

  let note = '';
  if (/RET/i.test(m.ResultString || '')) note = 'ret.';
  else if (/W\/O|WALKOVER/i.test(m.ResultString || '')) note = 'w/o';
  else if (!m.ScoreString) note = 'w/o';

  return {
    round: String(m.RoundID == null ? '' : m.RoundID).trim().toUpperCase(),
    qualifying: m.DrawLevelType === 'Q',
    a,
    b,
    score: normaliseScore(m, winnerSide),
    winnerSide,
    note,
    state: m.MatchState || '',
    date: (m.MatchTimeStamp || '').slice(0, 10),
    court: (m.Venue && m.Venue.name) || '',
  };
}

/**
 * Render the score string set by set, keeping tie-break points, so it matches the
 * convention used elsewhere on the site ("6-4 7-6(3)" rather than comma-separated).
 */
function normaliseScore(m, winnerSide) {
  const sets = [];
  for (let i = 1; i <= 5; i += 1) {
    const sa = m[`ScoreSet${i}A`];
    const sb = m[`ScoreSet${i}B`];
    if (sa === '' || sb === '' || sa == null || sb == null) continue;
    const tb = m[`ScoreTbSet${i}`];
    // The losing side of a tie-break carries the points in parentheses.
    // The feed puts the tie-break points in ScoreTbSetN and the loser's points in
    // the losing set column, so "7-6(3)" needs the bracket appended explicitly.
    sets.push(tb ? `${sa}-${sb}(${tb})` : `${sa}-${sb}`);
  }
  if (sets.length) return sets.join(' ');
  return String(m.ScoreString || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Score-based winner: count the sets won by each side. */
function setWinner(a, b, m) {
  let aw = 0, bw = 0;
  for (let i = 1; i <= 5; i += 1) {
    const sa = m[`ScoreSet${i}A`], sb = m[`ScoreSet${i}B`];
    if (sa === '' || sb === '' || sa == null || sb == null) continue;
    const na = Number(sa), nb = Number(sb);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) continue;
    if (na > nb) aw += 1; else if (nb > na) bw += 1;
  }
  if (aw > bw) return 'A';
  if (bw > aw) return 'B';
  return '';
}

/** Group an array into a Map keyed by a derived value. */
function groupBy(list, keyOf) {
  const map = new Map();
  for (const item of list) {
    const k = keyOf(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

const out = {};
let done = 0;
let failed = 0;
let totalMatches = 0;

async function handle(event) {
  const res = await apiGet(`/tournaments/${event.id}/${event.year}/matches`, {
    page: 0,
    pageSize: 500,
  });
  const raw = Array.isArray(res?.matches) ? res.matches : [];
  if (!raw.length) return;

  const singles = raw.map(normalise).filter(Boolean);
  const main = singles.filter((m) => !m.qualifying);
  const qual = singles.filter((m) => m.qualifying);

  const rounds = [];

  const mainGroups = [...groupBy(main, (m) => m.round).entries()].map(([code, matches]) => ({
    code,
    matches,
    ...classifyRound(code, matches.length),
  }));
  // Two rounds can hold the same number of matches when a draw is incomplete;
  // the code breaks the tie so the printed labels stay distinct.
  const seenLabels = new Map();
  for (const g of mainGroups) {
    let label = g.label;
    if (seenLabels.has(label)) {
      // Shift outwards until the label is free.
      const order = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
      let idx = order.indexOf(label);
      while (idx > 0 && seenLabels.has(order[idx])) idx -= 1;
      label = order[idx];
    }
    seenLabels.set(label, true);
    rounds.push({
      key: `M|${label}`,
      label,
      order: ROUND_ORDER[label],
      qualifying: false,
      matches: g.matches.sort((x, y) => (x.date < y.date ? 1 : -1)),
    });
  }

  // Qualifying carries no round code: the three rounds are run on consecutive
  // days, so ordering by date reconstructs them.
  const qualDays = [...new Set(qual.map((m) => m.date))].sort();
  for (const [day, matches] of groupBy(qual, (m) => m.date)) {
    // The earliest qualifying day is the first round.
    const idx = qualDays.indexOf(day) + 1;
    rounds.push({
      key: `Q|Q${idx}`,
      label: `Q${idx}`,
      order: 20 - idx,
      qualifying: true,
      matches: matches.sort((x, y) => (x.date < y.date ? 1 : -1)),
    });
  }

  if (!rounds.length) return;

  rounds.sort((x, y) => {
    if (x.qualifying !== y.qualifying) return x.qualifying ? 1 : -1;
    return y.order - x.order;
  });

  const count = rounds.reduce((n, r) => n + r.matches.length, 0);
  totalMatches += count;
  out[`${event.id}|${event.year}`] = {
    id: event.id,
    year: event.year,
    name: event.name,
    level: event.level,
    surface: event.surface,
    city: event.city,
    country: event.country,
    drawSize: event.drawSize,
    status: event.status,
    rounds,
  };
}

let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < targets.length) {
      const event = targets[cursor++];
      try {
        await handle(event);
      } catch (err) {
        failed += 1;
        console.warn(`  ! ${event.name} ${event.year}: ${err.message}`);
      }
      done += 1;
      if (done % 40 === 0) log('events', `${done}/${targets.length}…`);
    }
  }),
);

await writeJson('data/event-matches.json', out);

const withResults = Object.keys(out).length;
const sizes = Object.values(out).map((e) => e.rounds.reduce((n, r) => n + r.matches.length, 0));
log(
  'events',
  `Done — ${withResults}/${targets.length} events, ${totalMatches} singles matches` +
    (sizes.length ? ` (median ${sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]}/event)` : '') +
    (failed ? `, ${failed} failures` : ''),
);
