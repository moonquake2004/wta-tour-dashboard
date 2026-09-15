/**
 * Build derived aggregates from the raw official snapshots.
 *
 *  • season leaderboards (aces, double faults, service/return games won, …)
 *  • career title and match-win leaders
 *  • per-player season W/L records computed from the raw match log
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, writeJson, log } from './lib.mjs';

const read = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(ROOT, f), 'utf8'));
  } catch {
    return fallback;
  }
};

const rankings = await read('data/rankings-singles.json', { players: [], asOf: null });
const bios = await read('data/bios.json', {});
const stats = await read('data/season-stats.json', {});
const matches = await read('data/matches.json', {});

log('derive', 'Building leaderboards and season records…');

const rankById = new Map(rankings.players.map((p) => [p.id, p]));

/* ---------- leaderboards ---------- */

const BOARD_DEFS = [
  { key: 'aces', label: 'Aces', metric: 'aces', unit: '', dir: 'desc', min: 5 },
  { key: 'doubleFaults', label: 'Double faults', metric: 'doubleFaults', unit: '', dir: 'desc', min: 5 },
  { key: 'firstServePct', label: 'First serve in', metric: 'firstServePct', unit: '%', dir: 'desc', min: 10 },
  { key: 'firstServeWonPct', label: '1st serve points won', metric: 'firstServeWonPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'secondServeWonPct', label: '2nd serve points won', metric: 'secondServeWonPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'serviceGamesWonPct', label: 'Service games won', metric: 'serviceGamesWonPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'returnGamesWonPct', label: 'Return games won', metric: 'returnGamesWonPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'returnPointsWonPct', label: 'Return points won', metric: 'returnPointsWonPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'breakPointsSavedPct', label: 'Break points saved', metric: 'breakPointsSavedPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'breakPointsConvertedPct', label: 'Break points converted', metric: 'breakPointsConvertedPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'totalPointsWonPct', label: 'Total points won', metric: 'totalPointsWonPct', unit: '%', dir: 'desc', min: 10 },
  { key: 'servicePointsWonPct', label: 'Service points won', metric: 'servicePointsWonPct', unit: '%', dir: 'desc', min: 10 },
];

const leaderboards = [];
for (const def of BOARD_DEFS) {
  const rows = [];
  for (const [id, s] of Object.entries(stats)) {
    const value = s?.[def.metric];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const rank = rankById.get(Number(id));
    if (!rank) continue;
    if ((s.matches ?? 0) < def.min) continue;
    rows.push({
      id: Number(id),
      name: rank.name,
      country: rank.country,
      rank: rank.rank,
      value,
      matches: s.matches ?? null,
    });
  }
  rows.sort((a, b) => (def.dir === 'desc' ? b.value - a.value : a.value - b.value));
  leaderboards.push({ ...def, rows: rows.slice(0, 20) });
}

/* ---------- career leaders (from official bios) ---------- */

const career = Object.values(bios).filter((b) => b.sglRank != null || b.sglCareerWon != null);

const titles = career
  .filter((b) => (b.sglCareerTitles ?? 0) > 0)
  .sort((a, b) => (b.sglCareerTitles ?? 0) - (a.sglCareerTitles ?? 0))
  .slice(0, 15)
  .map((b) => ({
    id: b.id,
    name: b.name,
    country: b.country,
    titles: b.sglCareerTitles ?? 0,
    rank: rankById.get(b.id)?.rank ?? null,
  }));

const careerWins = career
  .filter((b) => (b.sglCareerWon ?? 0) > 0)
  .sort((a, b) => (b.sglCareerWon ?? 0) - (a.sglCareerWon ?? 0))
  .slice(0, 15)
  .map((b) => ({
    id: b.id,
    name: b.name,
    country: b.country,
    won: b.sglCareerWon ?? 0,
    lost: b.sglCareerLost ?? 0,
    pct: pct(b.sglCareerWon, b.sglCareerLost),
    rank: rankById.get(b.id)?.rank ?? null,
  }));

const prizeMoney = career
  .filter((b) => (b.careerPrize ?? 0) > 0)
  .sort((a, b) => (b.careerPrize ?? 0) - (a.careerPrize ?? 0))
  .slice(0, 15)
  .map((b) => ({
    id: b.id,
    name: b.name,
    country: b.country,
    prize: b.careerPrize ?? 0,
    rank: rankById.get(b.id)?.rank ?? null,
  }));

/* ---------- season W/L records from the official match log ---------- */

const season = {};
for (const [id, list] of Object.entries(matches)) {
  const byYear = {};
  for (const m of list) {
    const y = m.yr ?? Number(m.d.slice(0, 4));
    byYear[y] ??= { w: 0, l: 0, titles: 0, finals: 0, surfaces: {}, levels: {}, last10: [] };
    const b = byYear[y];
    if (m.w) b.w += 1;
    else b.l += 1;
    b.surfaces[m.sfc] ??= { w: 0, l: 0 };
    b.surfaces[m.sfc][m.w ? 'w' : 'l'] += 1;
    b.levels[m.lvl] ??= { w: 0, l: 0 };
    b.levels[m.lvl][m.w ? 'w' : 'l'] += 1;
  }
  // Titles: the player won the final of an event.
  for (const m of list) {
    const y = m.yr ?? Number(m.d.slice(0, 4));
    if (m.r === 'F' && m.w) byYear[y].titles += 1;
    if (m.r === 'F') byYear[y].finals += 1;
  }
  // Most recent 10 results, newest first.
  const sorted = [...list].sort((a, b) => (a.d < b.d ? 1 : -1));
  for (const y of Object.keys(byYear)) {
    byYear[y].last10 = sorted
      .filter((m) => (m.yr ?? Number(m.d.slice(0, 4))) === Number(y))
      .slice(0, 10)
      .map((m) => m.w);
  }
  season[id] = byYear;
}

function pct(w, l) {
  const total = (w ?? 0) + (l ?? 0);
  return total > 0 ? Math.round(((w ?? 0) / total) * 1000) / 10 : null;
}

await writeJson('data/leaderboards.json', {
  generatedAt: new Date().toISOString(),
  season: Number(process.env.WTA_SEASON || new Date().getUTCFullYear()),
  boards: leaderboards,
  career: { titles, careerWins, prizeMoney },
  seasonMap: season,
});

log('derive', `Done — ${leaderboards.length} leaderboards, ${Object.keys(season).length} season records.`);
