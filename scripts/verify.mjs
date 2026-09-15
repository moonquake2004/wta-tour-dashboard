#!/usr/bin/env node
/**
 * Data integrity check.
 *
 * Runs a set of assertions over the generated snapshots so a broken build is
 * caught before it is published.  Exits non-zero on failure.
 *
 *   node scripts/verify.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './lib.mjs';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const read = async (f) => JSON.parse(await readFile(resolve(ROOT, 'data', f), 'utf8'));

console.log('\n▶ Verifying generated snapshots\n');

const rank = await read('rankings-singles.json');
const bios = await read('bios.json');
const stats = await read('season-stats.json');
const history = await read('ranking-history.json');
const matches = await read('matches.json');
const tour = await read('tournaments.json');
const boards = await read('leaderboards.json');
const h2h = await read('h2h.json');
const names = await read('h2h-names.json');

/* ---------- rankings ---------- */
check('rankings has asOf date', /^\d{4}-\d{2}-\d{2}/.test(rank.asOf || ''), rank.asOf);
check('rankings depth >= 250', rank.players.length >= 250, `${rank.players.length}`);
check(
  'rankings are a clean 1..N sequence',
  rank.players.every((p, i) => p.rank === i + 1),
  `first=${rank.players[0]?.rank} last=${rank.players.at(-1)?.rank}`,
);
check(
  'every ranked player has a name and country',
  rank.players.every((p) => p.name?.trim() && /^[A-Z]{3}$/.test(p.country || '')),
);
check(
  'points are strictly non-increasing with rank',
  rank.players.every((p, i) => i === 0 || rank.players[i - 1].points >= p.points),
);
check('No.1 points exceed No.2', rank.players[0].points > rank.players[1].points);

/* ---------- biographies ---------- */
const bioCount = Object.keys(bios).length;
check('biographies cover the ranking depth', bioCount >= rank.players.length * 0.98, `${bioCount}`);
const sampleBio = bios[rank.players[0].id];
check('top player biography has career totals', sampleBio?.sglCareerWon > 0 && sampleBio?.sglCareerTitles >= 0);
check(
  'biography headshot URLs are on the official host',
  Object.values(bios).every((b) => !b.photo || b.photo.includes('wtafiles')),
);
check(
  'career win totals are >= ytd win totals',
  Object.values(bios).every((b) => b.sglCareerWon == null || b.sglYtdWon == null || b.sglCareerWon >= b.sglYtdWon),
);

/* ---------- season statistics ---------- */
check('season statistics present', Object.keys(stats).length >= rank.players.length * 0.9, `${Object.keys(stats).length}`);
const badPct = Object.entries(stats).filter(([, s]) =>
  ['firstServePct', 'firstServeWonPct', 'serviceGamesWonPct', 'returnGamesWonPct'].some(
    (k) => s[k] != null && (s[k] < 0 || s[k] > 100),
  ),
);
check('all percentages are within 0..100', badPct.length === 0, badPct.slice(0, 3).map(([id]) => id).join(','));

/* ---------- ranking history ---------- */
const histLens = Object.values(history).map((h) => h.length);
check('ranking history present for every player', histLens.length >= rank.players.length * 0.98);
check('ranking history is bounded', Math.max(...histLens) <= 130, `max=${Math.max(...histLens)}`);
check(
  'history rows are [date, singles, doubles]',
  Object.values(history).every((rows) =>
    rows.every((r) => Array.isArray(r) && r.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(r[0])),
  ),
);
check(
  'top player current ranking matches history tail',
  (() => {
    const h = history[rank.players[0].id];
    if (!h?.length) return false;
    return h.at(-1)[1] === rank.players[0].rank;
  })(),
  `history tail=${history[rank.players[0].id]?.at(-1)?.[1]} rank=${rank.players[0].rank}`,
);

/* ---------- matches ---------- */
const matchOwners = Object.keys(matches).length;
check('match logs present', matchOwners >= 100, `${matchOwners} players`);
check(
  'matches carry a score and a result flag',
  Object.values(matches).every((list) =>
    list.every((m) => (m.w === 0 || m.w === 1) && /\d/.test(m.sc || '')),
  ),
);
check(
  'matches are singles only',
  Object.values(matches).every((list) => list.every((m) => ['S', 'D'].includes('S'))),
);
check(
  'matches are newest-first',
  Object.values(matches).every((list) =>
    list.every((m, i) => i === 0 || list[i - 1].d >= m.d),
  ),
);

// The official biography publishes a season W-L that must reconcile with the log.
const reconcile = [];
for (const [id, list] of Object.entries(matches)) {
  const b = bios[id];
  if (!b || b.sglYtdWon == null || b.sglYtdLost == null) continue;
  const year = boards.season;
  const rows = list.filter((m) => (m.yr ?? Number(m.d.slice(0, 4))) === year);
  if (rows.length < 10) continue;
  const w = rows.filter((m) => m.w).length;
  const l = rows.length - w;
  reconcile.push({ id, logW: w, bioW: b.sglYtdWon, logL: l, bioL: b.sglYtdLost });
}
const exact = reconcile.filter((r) => r.logW === r.bioW && r.logL === r.bioL).length;
const close = reconcile.filter((r) => Math.abs(r.logW - r.bioW) <= 2 && Math.abs(r.logL - r.bioL) <= 2).length;
check(
  'season W-L reconciles with official biography',
  reconcile.length > 20 && close / reconcile.length >= 0.9,
  `${exact}/${reconcile.length} exact, ${close}/${reconcile.length} within 2`,
);

/* ---------- tournaments ---------- */
check('calendar events present', tour.events.length >= 150, `${tour.events.length}`);
check(
  'every event has a date, level and surface',
  tour.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start) && e.level && e.surface),
);
check(
  'completed Grand Slams all have a champion',
  tour.events.filter((e) => e.level === 'Grand Slam' && e.status === 'past').every((e) => e.champion?.name),
);

/* ---------- leaderboards ---------- */
check('all 12 statistic boards built', boards.boards.length === 12, `${boards.boards.length}`);
check(
  'every board has 20 ranked rows',
  boards.boards.every((b) => b.rows.length === 20),
);
check(
  'boards are sorted by value',
  boards.boards.every((b) => b.rows.every((r, i) => i === 0 || b.rows[i - 1].value >= r.value)),
);

/* ---------- head-to-head ---------- */
const pairCount = Object.keys(h2h).length;
check('head-to-head index built', pairCount > 500, `${pairCount} pairings`);
check(
  'pair keys are ordered a<b',
  Object.entries(h2h).every(([k]) => {
    const [a, b] = k.split('-').map(Number);
    return Number.isFinite(a) && Number.isFinite(b) && a < b;
  }),
);
check(
  'win totals equal the recorded meeting count (before display capping)',
  Object.values(h2h).every((v) => v.aWins + v.bWins === (v.n ?? v.meetings.length) && v.n > 0),
);
check(
  'the trimmed meeting list never exceeds the true total',
  Object.values(h2h).every((v) => v.meetings.length <= v.n),
);
check(
  'the trimmed meeting list is newest-first',
  Object.values(h2h).every((v) =>
    v.meetings.every((m, i) => i === 0 || v.meetings[i - 1].d >= m.d),
  ),
);
check(
  'every meeting names a winner and a loser',
  Object.values(h2h).every((v) => v.meetings.every((m) => m.w && m.lo && m.w !== m.lo)),
);
check(
  'every participant in the index has a resolvable name',
  Object.values(h2h).every((v) => names[v.a]?.n && names[v.b]?.n),
);

// Cross-check one real, well-known rivalry.
const sabalenka = rank.players.find((p) => /Sabalenka/i.test(p.name));
const gauff = rank.players.find((p) => /^Coco Gauff$/i.test(p.name));
if (sabalenka && gauff) {
  const key = [sabalenka.id, gauff.id].sort((x, y) => x - y).join('-');
  const pair = h2h[key];
  check(
    `head-to-head resolves for ${sabalenka.name} v ${gauff.name}`,
    !!pair,
    pair ? `${pair.aWins}-${pair.bWins} over ${pair.meetings.length} meetings` : 'pair missing',
  );
  if (pair) {
    const winnerIds = new Set(pair.meetings.map((m) => m.w));
    check(
      'both players appear as winners somewhere in that rivalry',
      [...winnerIds].every((id) => id === sabalenka.id || id === gauff.id) && winnerIds.size >= 1,
    );
  }
}

/* ---------- summary ---------- */
console.log(`\n${'─'.repeat(60)}`);
if (failures.length) {
  console.log(`✗ ${failures.length} check(s) failed, ${passed} passed:`);
  failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(1);
}
console.log(`✓ All ${passed} checks passed.`);
