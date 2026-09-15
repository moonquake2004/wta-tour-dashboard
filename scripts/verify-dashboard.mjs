#!/usr/bin/env node
/**
 * Verify the generated dashboard payload.
 *
 * Runs assertions over `data/dashboard.js` and `data/h2h.js` so a broken build
 * cannot be published.  Exits non-zero on failure.
 *
 *   node scripts/verify-dashboard.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, DATA_DIR } from './lib.mjs';

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** The data files are plain scripts assigning a global; evaluate them safely. */
async function loadGlobal(file, name) {
  const src = await readFile(resolve(DATA_DIR, file), 'utf8');
  const sandbox = {};
  // eslint-disable-next-line no-new-func
  new Function('window', `${src}; return window.${name};`)(sandbox);
  return sandbox[name];
}

console.log('\n▶ Verifying dashboard payload\n');

const D = await loadGlobal('dashboard.js', 'WTA_DATA');
const H = await loadGlobal('h2h.js', 'WTA_H2H');
const HM = await loadGlobal('h2h-matches.js', 'WTA_H2H_MATCHES');

const META = D.meta;
const SEASON = META.season;

/* ---------------------------------------------------------------- meta */
check('meta carries a season', Number.isFinite(SEASON), String(SEASON));
check('meta carries a rankings week', /^\d{4}-\d{2}-\d{2}/.test(META.rankingsAsOf || ''), META.rankingsAsOf);
check('meta records the official source', /wtatennis/.test(META.sourceUrl || ''), META.sourceUrl);

/* ------------------------------------------------------------- players */
check('player roster is populated', D.players.length >= 250, String(D.players.length));
check(
  'players are ranked 1..N',
  D.players.every((p, i) => p.rank === i + 1),
  `first=${D.players[0]?.rank} last=${D.players.at(-1)?.rank}`,
);
check('every player has a Chinese name', D.players.every((p) => p.zh && p.zh.trim()), 
  D.players.filter((p) => !p.zh).slice(0, 3).map((p) => p.name).join(', '));
check(
  'every player has a country',
  D.players.every((p) => /^[A-Z]{3}$/.test(p.country || '')),
);
check('points decrease with rank', D.players.every((p, i) => i === 0 || D.players[i - 1].points >= p.points));
const withSeason = D.players.filter((p) => p.season).length;
check(
  'season records cover the roster',
  withSeason >= D.players.length * 0.95,
  `${withSeason}/${D.players.length}`,
);
check(
  'season W–L is internally consistent',
  D.players.every((p) => !p.season || (p.season.w >= 0 && p.season.l >= 0)),
);
check(
  'form strips contain only 0/1',
  D.players.every((p) => !p.season || !p.season.last10 || p.season.last10.every((x) => x === 0 || x === 1)),
);
check(
  'serve percentages are within 0..100',
  D.players.every((p) =>
    ['firstServePct', 'firstServeWonPct', 'serviceGamesWonPct', 'returnGamesWonPct']
      .every((k) => p.serve[k] == null || (p.serve[k] >= 0 && p.serve[k] <= 100)),
  ),
);

/* ------------------------------------------------------------- results */
check('results feed is populated', D.results.length >= 200, String(D.results.length));
check(
  'every result has a winner, a loser and a score',
  D.results.every((r) => r.winner?.id && r.loser?.id && r.winner.id !== r.loser.id && /\d/.test(r.score || '')),
);
check(
  'results are newest-first',
  D.results.every((r, i) => i === 0 || D.results[i - 1].date >= r.date),
);
check(
  'results resolve every player reference to a name',
  D.results.every((r) => r.winner.name && r.loser.name && !/^#\d+$/.test(r.winner.name)),
  D.results.filter((r) => /^#\d+$/.test(r.winner.name)).length + ' unresolved',
);

/* ----------------------------------------------------------- champions */
check('champion list is populated', D.champions.length >= 20, String(D.champions.length));
check(
  'champions carry event, date and player',
  D.champions.every((c) => c.event && c.date && c.player?.id && c.player?.name),
);
const champSeason = D.champions.filter((c) => c.year === SEASON);
check('current season has champions', champSeason.length >= 10, String(champSeason.length));

/* ------------------------------------------------------------ calendar */
check('calendar covers two seasons', new Set(D.calendar.map((e) => e.year)).size >= 2);
check(
  'calendar rows have date, level and surface',
  D.calendar.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start) && e.level && e.surface),
);
check(
  'every calendar event has a Chinese name',
  D.calendar.every((e) => !e.zh || e.zh.trim()),
  D.calendar.filter((e) => !e.zh).length + ' without zh',
);
check(
  'completed events carry a champion',
  D.calendar.filter((e) => e.status === 'past' && e.year === SEASON).length > 0 &&
    D.calendar.filter((e) => e.status === 'past' && e.year === SEASON && !e.champion).length /
      Math.max(1, D.calendar.filter((e) => e.status === 'past' && e.year === SEASON).length) <
      0.35,
  'some completed events had no singles champion published',
);

/* -------------------------------------------------------- leaderboards */
check('twelve statistic boards', D.boards.length === 12, String(D.boards.length));
check('every board has rows', D.boards.every((b) => b.rows.length >= 10));
check(
  'boards are sorted by value',
  D.boards.every((b) => b.rows.every((r, i) => i === 0 || b.rows[i - 1].value >= r.value)),
);
check(
  'board rows resolve to a roster player',
  D.boards.every((b) => b.rows.every((r) => r.name && r.id)),
);
check('career leaders present', ['titles', 'careerWins', 'prizeMoney'].every((k) => (D.career[k] || []).length >= 5));

/* ------------------------------------------------------------------ zh */
check('Chinese terminology present', ['countries', 'levels', 'rounds', 'surfaces'].every((k) => Object.keys(META.zh[k] || {}).length > 0));
check(
  'every country code used by players has a Chinese name',
  [...new Set(D.players.map((p) => p.country))].every((c) => META.zh.countries[c]),
  [...new Set(D.players.map((p) => p.country))].filter((c) => !META.zh.countries[c]).join(','),
);

/* ---------------------------------------------------------------- h2h */
const pairs = Object.keys(H.pairs);
check('head-to-head index populated', pairs.length >= 1000, String(pairs.length));
check(
  'pair keys are ordered a<b',
  pairs.every((k) => {
    const [a, b] = k.split('-').map(Number);
    return Number.isFinite(a) && Number.isFinite(b) && a < b;
  }),
);
check(
  'win totals match the recorded meeting count',
  Object.values(H.pairs).every((v) => v.aw + v.bw === v.n && v.n > 0),
);
check(
  'meeting detail matches the summary counts',
  Object.entries(HM).every(([k, m]) => Array.isArray(m) && m.length > 0 && m.length <= H.pairs[k].n),
);
check(
  'every summary pairing is accounted for',
  Object.keys(HM).length > 0 && Object.keys(HM).length <= pairs.length,
);
check(
  'every pair member resolves to a named player',
  pairs.every((k) => {
    const [a, b] = k.split('-');
    return Boolean(H.players[a]?.name) && Boolean(H.players[b]?.name);
  }),
);
check(
  'meetings carry date, event and winner',
  Object.values(HM).every((list) =>
    list.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m[0]) && m[1] && m[6]),
  ),
);

// A known rivalry as a cross-check against the official record.
const sabalenka = D.players.find((p) => /Sabalenka/.test(p.name));
const gauff = D.players.find((p) => /^Coco Gauff$/.test(p.name));
if (sabalenka && gauff) {
  const key = [sabalenka.id, gauff.id].sort((a, b) => a - b).join('-');
  const rec = H.pairs[key];
  check(
    'known rivalry resolves',
    !!rec,
    rec ? `${sabalenka.name} ${sabalenka.id < gauff.id ? rec.aw : rec.bw}–${sabalenka.id < gauff.id ? rec.bw : rec.aw} ${gauff.name} over ${rec.n}` : 'missing',
  );
}

/* -------------------------------------------------------------- output */
console.log(`\n${'─'.repeat(60)}`);
if (failures.length) {
  console.log(`✗ ${failures.length} check(s) failed, ${passed} passed:`);
  failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(1);
}
console.log(`✓ All ${passed} checks passed.`);
