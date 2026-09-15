/**
 * Pre-compute every head-to-head record.
 *
 * The official WTA API rejects cross-origin browser requests (it answers 403 to
 * any `Origin` that is not wtatennis.com), so the comparison page cannot call it
 * live.  Instead we fold the stored match logs into a single pairwise index at
 * build time, which also makes the comparison instant.
 *
 * Output
 *   data/h2h.json      { "<a>-<b>": { aWins, bWins, meetings: [...] } }
 *   data/h2h-names.json{ "<id>": { n: name, c: country } }  — everyone who
 *                       appears as an opponent, so names always resolve.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, writeJson, log } from './lib.mjs';

/**
 * Meetings kept per pairing.  Long rivalries are capped so a single pair cannot
 * bloat the payload; the most recent meetings are the ones that matter.
 */
const MAX_MEETINGS = Number(process.env.WTA_H2H_MAX || 24);

const read = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(ROOT, f), 'utf8'));
  } catch {
    return fallback;
  }
};

const matches = await read('data/matches.json', {});
const rankings = await read('data/rankings-singles.json', { players: [] });
const bios = await read('data/bios.json', {});

log('h2h', 'Folding match logs into a pairwise head-to-head index…');

const rankById = new Map(rankings.players.map((p) => [p.id, p]));
const names = {};

for (const [id, p] of rankById) {
  names[id] = { n: p.name, c: p.country || '', r: p.rank };
}
for (const [id, b] of Object.entries(bios)) {
  if (!names[id]) names[id] = { n: b.name, c: b.country || '', r: null };
}

/** key is always "smallerId-largerId" so both directions land in one bucket. */
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const pairs = new Map();
let meetings = 0;

for (const [ownerId, list] of Object.entries(matches)) {
  const owner = Number(ownerId);
  for (const m of list) {
    const opp = Number(m.oid);
    if (!opp || opp === owner) continue;
    const key = pairKey(owner, opp);
    let bucket = pairs.get(key);
    if (!bucket) {
      bucket = { a: Math.min(owner, opp), b: Math.max(owner, opp), aWins: 0, bWins: 0, meetings: [] };
      pairs.set(key, bucket);
    }
    const winnerId = m.w ? owner : opp;
    const winnerIsA = winnerId === bucket.a;
    if (winnerIsA) bucket.aWins += 1;
    else bucket.bWins += 1;

    // Keep the meeting with short keys: this file can carry thousands of
    // records and is loaded by the comparison page.
    bucket.meetings.push({
      d: m.d,
      t: m.t,
      lvl: m.lvl,
      sfc: m.sfc,
      r: m.r,
      sc: m.sc,
      w: winnerId, // winner id, so either side can render it
      lo: winnerId === owner ? opp : owner,
    });
    meetings += 1;

    if (!names[opp]) names[opp] = { n: m.o || 'Unknown', c: m.oc || '', r: null };
  }
}

// Newest meeting first inside each pair.  The win counts are authoritative and
// are never truncated; only the displayed meeting list is capped, and the true
// total is kept in `n` so the UI can say how many are not shown.
const out = {};
for (const [key, bucket] of pairs) {
  bucket.meetings.sort((x, y) => (x.d < y.d ? 1 : -1));
  bucket.n = bucket.meetings.length;
  if (bucket.meetings.length > MAX_MEETINGS) {
    bucket.meetings = bucket.meetings.slice(0, MAX_MEETINGS);
  }
  out[key] = bucket;
}

// Kept for transparency and for anyone consuming the snapshots directly; the
// dashboard itself reads the bundled script below.
await writeJson('data/h2h.json', out);
await writeJson('data/h2h-names.json', names);
log(
  'h2h',
  `Done — ${Object.keys(out).length} pairings, ${meetings} meetings, ${Object.keys(names).length} named players.`,
);
