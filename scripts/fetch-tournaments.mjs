/**
 * Fetch the official WTA Tour calendar for the active seasons.
 *
 * The tournament feed carries the full draw metadata plus the champion of each
 * completed event, which is what the calendar view renders.
 */
import { fetchTournaments, fetchTournament, writeJson, log } from './lib.mjs';

const YEAR = Number(process.env.WTA_SEASON || new Date().getUTCFullYear());
const PREV = YEAR - 1;

log('tournaments', `Fetching WTA Tour calendar for ${PREV}–${YEAR}…`);

function range(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Main-tour levels only: ITF World Tennis Tour events are out of scope. */
const TOUR_LEVELS = new Set([
  'Grand Slam',
  'WTA Finals',
  'WTA 1000',
  'WTA 500',
  'WTA 250',
  'WTA 125',
  'United Cup',
  'Billie Jean King Cup',
]);

async function collect(year) {
  const out = [];
  for (let page = 0; page < 12; page += 1) {
    const res = await fetchTournaments({
      page,
      pageSize: 100,
      ...range(year),
    });
    const content = res?.content;
    if (!Array.isArray(content) || content.length === 0) break;
    out.push(...content.filter((t) => TOUR_LEVELS.has(t?.level || t?.tournamentGroup?.level)));
    if (content.length < 100) break;
  }
  return out;
}

const LEVEL_ORDER = [
  'Grand Slam',
  'WTA Finals',
  'WTA 1000',
  'WTA 500',
  'WTA 250',
  'WTA 125',
  'ITF',
  'United Cup',
  'Billie Jean King Cup',
];

function normalise(t) {
  const group = t.tournamentGroup || {};
  const winner = t.winners?.[0];
  const singles = winner?.singles?.player;
  const doubles = Array.isArray(winner?.doubles) ? winner.doubles : [];
  return {
    id: group.id ?? null,
    name: titleCase(group.name || t.title || ''),
    title: t.title || '',
    year: t.year,
    level: t.level || group.level || '',
    start: (t.startDate || '').slice(0, 10),
    end: (t.endDate || '').slice(0, 10),
    surface: t.surface || '',
    indoor: t.inOutdoor === 'I',
    city: titleCase(t.city || ''),
    country: t.country || '',
    drawSize: t.singlesDrawSize || 0,
    prize: t.prizeMoney || 0,
    currency: t.prizeMoneyCurrency || 'USD',
    status: t.status || '',
    champion: singles
      ? { id: singles.id, name: singles.fullName, country: singles.countryCode || '' }
      : null,
    doublesChampions: doubles
      .map((d) => d?.player)
      .filter(Boolean)
      .map((p) => ({ id: p.id, name: p.fullName, country: p.countryCode || '' })),
  };
}

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const all = [];
for (const year of [PREV, YEAR]) {
  const rows = await collect(year);
  log('tournaments', `${year}: ${rows.length} events`);
  all.push(...rows);
}

// De-duplicate on (group id, year, start date): multi-week events legitimately
// appear once per week of play in the feed.
const seen = new Map();
for (const t of all) {
  // `all` holds raw feed records here, so read the nested group id.
  const key = `${t?.tournamentGroup?.id}|${t?.year}|${(t?.startDate || '').slice(0, 10)}`;
  if (!seen.has(key)) seen.set(key, t);
}

const events = [...seen.values()]
  .map(normalise)
  .filter((t) => t.id && t.start) // keep only real, dated events
  .sort((a, b) => (a.start < b.start ? 1 : -1));

const payload = {
  source: 'WTA Official Tournaments API',
  sourceUrl: 'https://www.wtatennis.com/tournaments',
  generatedAt: new Date().toISOString(),
  levels: LEVEL_ORDER,
  seasons: [PREV, YEAR],
  events,
};

await writeJson('data/tournaments.json', payload);

const byLevel = {};
for (const e of events) byLevel[e.level] = (byLevel[e.level] || 0) + 1;
log('tournaments', `Done — ${events.length} events ${JSON.stringify(byLevel)}`);
