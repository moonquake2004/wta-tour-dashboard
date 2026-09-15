/**
 * Fetch singles match results for the tour's headline players.
 *
 * Only completed singles matches from the requested season window are kept;
 * they power the player "recent form" panel, the head-to-head analyser and the
 * season W/L aggregates shown on the dashboard.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, fetchPlayerMatches, writeJson, log } from './lib.mjs';

const LIMIT = Number(process.env.WTA_MATCH_LIMIT || 300);
const FROM_YEAR = Number(process.env.WTA_MATCH_FROM || 2023);
const PAGES = Number(process.env.WTA_MATCH_PAGES || 10);

const rankings = JSON.parse(
  await readFile(resolve(ROOT, 'data/rankings-singles.json'), 'utf8'),
);
const targets = rankings.players.slice(0, LIMIT);

log('matches', `Fetching singles results for ${targets.length} players (since ${FROM_YEAR})…`);

const out = {};
let done = 0;

function normalise(m, playerId) {
  if (m.s_d_flag !== 'S') return null;
  const date = (m.StartDate || '').slice(0, 10);
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  if (year < FROM_YEAR) return null;

  // Keep only genuinely contested matches: walkovers, retirements before a
  // ball was struck and byes carry no score and would distort W/L records.
  const score = String(m.scores || '').replace(/\s+/g, ' ').trim();
  if (!/\d/.test(score)) return null;

  const p1 = Number(m.player_1);
  const isP1 = p1 === playerId;
  const opp = m.opponent || {};
  const winnerSlot = Number(m.winner);
  if (winnerSlot !== 1 && winnerSlot !== 2) return null;

  // In this feed `winner` is the SLOT of the player who LOST the match:
  //   `winner = 1` ⇒ player_1 won,  `winner = 2` ⇒ player_2 won.
  // Verified against well-known results (e.g. Sabalenka d. Rybakina 76 36 76
  // at Berlin 2025 is returned with winner=1 and player_1 = Sabalenka).
  const won = isP1 ? winnerSlot === 1 : winnerSlot === 2;

  const oppId = Number(m.player_2) || opp.id || null;

  return {
    d: date,
    t: titleCase(m.TournamentName || ''),
    lvl: m.TournamentLevel || '',
    sfc: m.Surface || '',
    r: m.round_name || '',
    o: opp.fullName || '',
    oid: opp.id || null,
    oc: opp.countryCode || '',
    w: won ? 1 : 0,
    sc: score,
    seed: isP1 ? m.seed_1 ?? null : m.seed_2 ?? null,
    orank: isP1 ? m.rank_2 ?? null : m.rank_1 ?? null,
    rank: isP1 ? m.rank_1 ?? null : m.rank_2 ?? null,
    yr: year,
  };
}

function titleCase(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

async function handle(player) {
  // The official endpoint returns a player's complete match log in ascending
  // date order with 100 records per page and no working date filter.  We walk
  // only as far as needed to find the first page inside the window, then read
  // forward.  Page contents are cached per player so no page is fetched twice.
  const PAGE_CAP = 40;
  const cache = new Map();

  const getPage = async (page) => {
    if (page > PAGE_CAP) return { matches: [], oldest: null };
    if (cache.has(page)) return cache.get(page);
    const res = await fetchPlayerMatches(player.id, { page, pageSize: 100 });
    const matches = Array.isArray(res?.matches) ? res.matches : [];
    const entry = matches.length
      ? { matches, oldest: yearOf(matches[0]) }
      : { matches: [], oldest: null };
    cache.set(page, entry);
    return entry;
  };

  // Binary search for the last page that begins before the window opens.
  let lo = 0;
  let hi = PAGE_CAP;
  let lastBefore = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { oldest } = await getPage(mid);
    if (oldest === null) {
      hi = mid - 1;
    } else if (oldest < FROM_YEAR) {
      lastBefore = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // `lastBefore` is the last page that still contains pre-window records, so
  // the window starts somewhere on that page or the next one.  Read forward
  // from there, de-duplicating by (date, tournament, round, opponent).
  // Read forward until the log is exhausted (or the page cap is reached).
  // `PAGES` is only a safety ceiling: stopping early silently dropped matches
  // for players with long seasons and broke season W–L reconciliation.
  const collected = [];
  const seen = new Set();
  for (let page = lastBefore; page <= lastBefore + PAGES; page += 1) {
    const { matches } = await getPage(page);
    if (!matches.length) break;
    for (const m of matches) {
      const n = normalise(m, player.id);
      if (!n) continue;
      const key = `${n.d}|${n.t}|${n.r}|${n.oid}|${n.sc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(n);
    }
    if (matches.length < 100) break;
  }

  collected.sort((a, b) => (a.d < b.d ? 1 : -1));
  if (collected.length) out[player.id] = collected;

  done += 1;
  if (done % 20 === 0) log('matches', `${done}/${targets.length}…`);
}

/**
 * Matches arrive sorted by `StartDate`; the raw record's most useful field for
 * ordering is the ISO date itself, so prefer it over any result timestamp.
 */
function sortKey(m) {
  return String(m?.StartDate || m?.tourn_year || '');
}

function yearOf(m) {
  const raw = String(m?.StartDate || '');
  const y = Number(raw.slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

const WORKERS = Number(process.env.WTA_WORKERS || 4);
let cursor = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (cursor < targets.length) {
      const player = targets[cursor++];
      try {
        await handle(player);
      } catch (err) {
        console.warn(`  ! matches ${player.name}: ${err.message}`);
      }
    }
  }),
);

await writeJson('data/matches.json', out);
const total = Object.values(out).reduce((n, list) => n + list.length, 0);

log('matches', `Done — ${Object.keys(out).length} players, ${total} singles matches.`);
