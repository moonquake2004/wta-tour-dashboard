/**
 * Compact the raw snapshots in place.
 *
 * Ranking history from the API goes back to 1975 for veterans, which bloats the
 * static payload without adding insight.  We keep a five-year window and
 * downsample evenly so every player yields a readable, bounded sparkline.
 * Match logs are trimmed to the most recent seasons for the same reason; the
 * full record is still one API call away and is shown on player pages.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, log } from './lib.mjs';

const HISTORY_WINDOW = Number(process.env.WTA_HISTORY_WEEKS || 261); // ~5 years
const HISTORY_POINTS = Number(process.env.WTA_HISTORY_POINTS || 110);
const MATCH_YEARS = Number(process.env.WTA_MATCH_YEARS || 4);
const SEASON = Number(process.env.WTA_SEASON || new Date().getUTCFullYear());

const read = async (f) => JSON.parse(await readFile(resolve(ROOT, f), 'utf8'));
const write = async (f, v) => {
  const body = JSON.stringify(v);
  await writeFile(resolve(ROOT, f), body, 'utf8');
  log('compact', `${f} → ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`);
};

/** Evenly sample an array down to at most `max` items, always keeping the ends. */
function sample(list, max) {
  if (list.length <= max) return list;
  const out = [];
  const step = (list.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(list[Math.round(i * step)]);
  // De-duplicate in case rounding collides.
  return out.filter((v, i) => i === 0 || v !== out[i - 1]);
}

log('compact', 'Compacting raw snapshots…');

/* ---------- ranking history ---------- */
const history = await read('data/ranking-history.json');
const trimmedHistory = {};
for (const [id, rows] of Object.entries(history)) {
  const recent = rows.slice(-HISTORY_WINDOW);
  trimmedHistory[id] = sample(recent, HISTORY_POINTS);
}
await write('data/ranking-history.json', trimmedHistory);

/* ---------- match log ---------- */
const matches = await read('data/matches.json');
const minYear = SEASON - (MATCH_YEARS - 1);
const trimmedMatches = {};
for (const [id, rows] of Object.entries(matches)) {
  const kept = rows.filter((m) => (m.yr ?? Number(m.d.slice(0, 4))) >= minYear);
  if (kept.length) trimmedMatches[id] = kept;
}
await write('data/matches.json', trimmedMatches);

log('compact', `Done — history window ${HISTORY_WINDOW}w/${HISTORY_POINTS}pts, matches since ${minYear}.`);
