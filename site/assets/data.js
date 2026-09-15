/**
 * Data access layer.
 *
 * Every snapshot is produced by `scripts/build.mjs` from the official WTA API
 * and served as static JSON next to the site.  Files are fetched lazily and
 * memoised, so a page only pays for the data it actually renders.
 */

const CACHE = new Map();

/** Bumped on every build so GitHub Pages / browsers never serve stale snapshots. */
export const BUILD_ID = window.__WTA_BUILD__ || String(Date.now());

export async function load(name) {
  if (CACHE.has(name)) return CACHE.get(name);
  const promise = (async () => {
    const url = `../data/${name}.json?v=${BUILD_ID}`;
    const res = await fetch(url, { cache: 'default' });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return res.json();
  })();
  CACHE.set(name, promise);
  try {
    return await promise;
  } catch (err) {
    CACHE.delete(name);
    throw err;
  }
}

/* ---------- well-known snapshots ---------- */

export const rankings = () => load('rankings-singles');
export const playerIndex = () => load('players-index');
export const bios = () => load('bios');
export const seasonStats = () => load('season-stats');
export const rankingHistory = () => load('ranking-history');
export const matches = () => load('matches');
export const tournaments = () => load('tournaments');
export const leaderboards = () => load('leaderboards');

/**
 * Pre-computed head-to-head index.
 *
 * The official API refuses cross-origin browser requests, so every pairing the
 * tour has played inside the match-log window is folded into a single payload at
 * build time.  It is published as `assets/h2h-data.js` (a classic script that
 * assigns `window.__WTA_H2H__`) rather than JSON: at this size a script parses
 * far faster than a second round trip plus `JSON.parse`.
 *
 * `names` also resolves players who only ever appear as an opponent.
 */
export function h2hBundle() {
  return window.__WTA_H2H__ || { names: {}, pairs: {} };
}

/** Look up one pairing, tolerant of argument order. */
export function h2hPair(pairs, a, b) {
  if (!pairs) return null;
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  return pairs[key] || null;
}

/* ---------- derived helpers ---------- */

/** Parse "2026-08-31T00:00:00Z" or "2026-08-31" into a Date (UTC). */
export function parseDate(value) {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value, { long = false } = {}) {
  const d = parseDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Official head-to-head record for any two players, straight from the WTA API. */
export async function headToHead(a, b) {
  const url = `https://api.wtatennis.com/tennis/players/${a}/headtohead/${b}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`H2H request failed (HTTP ${res.status})`);
  return res.json();
}
