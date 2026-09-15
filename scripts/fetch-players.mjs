/**
 * Fetch per-player official records.
 *
 * For every player in the ranking snapshot we store:
 *   • the official biography record (bio fields, career W/L, titles, prize money)
 *   • the current-season aggregate statistics (serve / return / break splits)
 *   • the full week-by-week ranking history
 *
 * Match-by-match results are fetched separately for the tour's headline players
 * so the repository stays a reasonable size; see fetch-matches.mjs.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ROOT,
  writeJson,
  log,
  fetchPlayerDetailed,
  fetchPlayerSeason,
  fetchPlayerRankingHistory,
} from './lib.mjs';

const LIMIT = Number(process.env.WTA_PLAYER_LIMIT || 300);
const SEASON = Number(process.env.WTA_SEASON || new Date().getUTCFullYear());
const ONLY = process.env.WTA_ONLY_IDS
  ? new Set(process.env.WTA_ONLY_IDS.split(',').map((s) => Number(s.trim())))
  : null;

const rankings = JSON.parse(
  await readFile(resolve(ROOT, 'data/rankings-singles.json'), 'utf8'),
);

let targets = rankings.players.slice(0, LIMIT);
if (ONLY) targets = targets.filter((p) => ONLY.has(p.id));

log('players', `Fetching official records for ${targets.length} players (season ${SEASON})…`);

const bios = {};
const seasons = {};
const histories = {};

let done = 0;
let failed = 0;

async function handle(player) {
  const [detailed, season, history] = await Promise.all([
    fetchPlayerDetailed(player.id).catch(() => null),
    fetchPlayerSeason(player.id, SEASON).catch(() => null),
    fetchPlayerRankingHistory(player.id).catch(() => null),
  ]);

  if (detailed?.bio) {
    const b = detailed.bio;
    bios[player.id] = {
      id: player.id,
      name: `${b.firstname || player.first} ${b.lastname || player.last}`.trim(),
      country: b.natlcode || player.country,
      countryName: b.countryname || '',
      birth: (b.dateofbirth || player.birth || '').slice(0, 10),
      age: b.age ?? null,
      birthCity: b.birthcity || '',
      residence: b.residence || '',
      height: b.height || '',
      hand: b.playhand || '',
      backhand: b.backhand || '',
      status: b.status || '',
      proYear: b.proyear || null,
      photo: b.imageurl || '',
      careerPrize: b.careerprize ?? null,
      ytdPrize: b.ytdprize ?? null,
      // singles
      sglRank: b.sglrank ?? null,
      sglHighRank: b.sglhirank ?? null,
      sglHighDate: (b.sglhirankdate || '').slice(0, 10),
      sglCareerWon: b.sglcareerwon ?? null,
      sglCareerLost: b.sglcareerlost ?? null,
      sglCareerTitles: b.sglcareertitles ?? null,
      sglYtdWon: b.sglytdwon ?? null,
      sglYtdLost: b.sglytdlost ?? null,
      sglYtdTitles: b.sglytdtitles ?? null,
      // doubles
      dblRank: b.dblrank ?? null,
      dblHighRank: b.dblhirank ?? null,
      dblHighDate: (b.dblhirankdate || '').slice(0, 10),
      dblCareerWon: b.dblcareerwon ?? null,
      dblCareerLost: b.dblcareerlost ?? null,
      dblCareerTitles: b.dblcareertitles ?? null,
      dblYtdWon: b.dblytdwon ?? null,
      dblYtdLost: b.dblytdlost ?? null,
      dblYtdTitles: b.dblytdtitles ?? null,
      // prose
      highlights: cleanHtml(b.CareerHighlightsSingles || b.CareerHighlights || ''),
      yearDetail: cleanHtml(b.CurrentYearDetail || ''),
      careerReview: cleanHtml(b.CareerInReview || ''),
      personal: cleanHtml(b.personal || ''),
      bioUpdated: (b.datebioupdated || '').slice(0, 10),
    };
  } else {
    failed += 1;
  }

  if (season?.stats) {
    seasons[player.id] = compactSeason(season.stats, SEASON);
  }

  if (Array.isArray(history?.weeklyRankings) && history.weeklyRankings.length) {
    histories[player.id] = history.weeklyRankings
      .map((w) => [
        (w.rankedAt || '').slice(0, 10),
        w.singlesRanking ?? null,
        w.doublesRanking ?? null,
      ])
      .filter((row) => row[0])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  done += 1;
  if (done % 25 === 0) log('players', `${done}/${targets.length}…`);
}

/**
 * Keep only the statistics the dashboard surfaces, with readable keys.
 *
 * The official season record uses PascalCase counters (`Aces`,
 * `First_Serves_Won`, …) plus snake_case season percentages
 * (`first_serve_won_percent`, …).  We keep both, and additionally expose the
 * per-tournament averages from `AggregateData`.
 */
const SEASON_COUNTERS = {
  aces: 'Aces',
  doubleFaults: 'Double_Faults',
  firstServesPlayed: 'First_Serves_Played',
  firstServesWon: 'First_Serves_Won',
  secondServesPlayed: 'Second_Serves_Played',
  secondServesWon: 'Second_Serves_Won',
  serviceGamesPlayed: 'Service_Games_Played',
  breakPointsFaced: 'Break_Points_Faced',
  breakPointsLost: 'Break_Points_Lost',
  breakPointChances: 'Break_Point_Chances',
  breakPointsConverted: 'Break_Points_Converted',
  returnGamesPlayed: 'Return_Games_Played',
  firstServeReturnChances: 'First_Serve_Return_Chances',
  firstReturnWon: 'First_Return_Won',
  secondReturnChances: 'Second_Return_Chances',
  secondReturnWon: 'Second_Return_Won',
  matches: 'MatchCount',
};

const SEASON_PERCENTS = {
  firstServePct: 'first_serve_percent',
  firstServeWonPct: 'first_serve_won_percent',
  secondServeWonPct: 'second_serve_won_percent',
  breakPointsSavedPct: 'breakpoint_saved_percent',
  breakPointsConvertedPct: 'breakpoint_converted_percent',
  serviceGamesWonPct: 'service_games_won_percent',
  servicePointsWonPct: 'service_points_won_percent',
  returnGamesWonPct: 'return_games_won_percent',
  returnPointsWonPct: 'return_points_won_percent',
  totalPointsWonPct: 'total_points_won_percent',
  firstReturnPct: 'first_return_percent',
  secondReturnPct: 'second_return_percent',
};

function compactSeason(stats, year) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const out = { year };

  for (const [key, src] of Object.entries(SEASON_COUNTERS)) {
    const v = num(stats[src]);
    if (v !== null) out[key] = v;
  }
  for (const [key, src] of Object.entries(SEASON_PERCENTS)) {
    const v = num(stats[src]);
    if (v !== null) out[key] = v;
  }

  // Per-tournament averages as published by the WTA.
  const agg = stats.AggregateData;
  if (agg && typeof agg === 'object') {
    const avg = {};
    for (const [k, v] of Object.entries(agg)) {
      if (k === 'TournamentYear' || !/^Average/.test(k)) continue;
      const n = num(v);
      if (n === null) continue;
      avg[k.replace(/^Average/, '').replace(/^./, (c) => c.toLowerCase())] = n;
    }
    if (Object.keys(avg).length) out.perTournamentAvg = avg;
  }

  // Derived: service & return points actually won.
  if (out.firstServesWon != null && out.secondServesWon != null && out.firstServesPlayed != null && out.secondServesPlayed != null) {
    const total = out.firstServesPlayed + out.secondServesPlayed;
    if (total > 0) out.servicePointsWon = out.firstServesWon + out.secondServesWon;
  }

  return out;
}

function cleanHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Bounded concurrency on top of the built-in politeness gate.
const WORKERS = Number(process.env.WTA_WORKERS || 4);
let cursor = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (cursor < targets.length) {
      const player = targets[cursor++];
      try {
        await handle(player);
      } catch (err) {
        failed += 1;
        console.warn(`  ! ${player.name}: ${err.message}`);
      }
    }
  }),
);

await writeJson('data/bios.json', bios);
await writeJson('data/season-stats.json', seasons);
await writeJson('data/ranking-history.json', histories);

log('players', `Done — bios ${Object.keys(bios).length}, stats ${Object.keys(seasons).length}, histories ${Object.keys(histories).length}, failures ${failed}.`);
