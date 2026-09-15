/**
 * Fetch the official WTA singles ranking table.
 *
 * Everything published here comes straight from the WTA public JSON API that
 * powers wtatennis.com/rankings/singles — the same numbers, no interpretation.
 */
import { fetchSinglesRankings, writeJson, log } from './lib.mjs';

const MAX = Number(process.env.WTA_RANK_DEPTH || 300);

log('rankings', `Fetching official WTA singles rankings (depth ${MAX})…`);

const rows = await fetchSinglesRankings({ max: MAX });

if (!rows.length) {
  console.error('No ranking rows returned — aborting so the previous snapshot survives.');
  process.exit(1);
}

const asOf = rows[0].rankedAt;
const players = rows
  .filter((r) => r?.player?.fullName && r.player.fullName.trim())
  .map((r) => ({
    id: r.player.id,
    rank: r.ranking,
    name: r.player.fullName.replace(/\s+/g, ' ').trim(),
    first: (r.player.firstName || '').trim(),
    last: (r.player.lastName || '').trim(),
    country: r.player.countryCode || '',
    birth: (r.player.dateOfBirth || '').slice(0, 10),
    points: r.points ?? 0,
    played: r.tournamentsPlayed ?? 0,
    move: r.movement ?? 0,
  }));

const payload = {
  source: 'WTA Official Rankings API',
  sourceUrl: 'https://www.wtatennis.com/rankings/singles',
  asOf,
  generatedAt: new Date().toISOString(),
  depth: players.length,
  players,
};

await writeJson('data/rankings-singles.json', payload);

// A compact index used by the client-side search box.
await writeJson(
  'data/players-index.json',
  players.map((p) => ({
    i: p.id,
    n: p.name,
    c: p.country,
    r: p.rank,
    p: p.points,
  })),
);

log('rankings', `Done — ${players.length} players, rankings dated ${asOf.slice(0, 10)}.`);
