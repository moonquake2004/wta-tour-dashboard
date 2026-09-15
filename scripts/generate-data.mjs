#!/usr/bin/env node
/**
 * Build the single data file the dashboard consumes.
 *
 * Mirrors the shape of a results dashboard: one `window.WTA_DATA` global that a
 * static single-page site can read without any fetch, so the published site is
 * just index.html + assets + data with no runtime requests for content.
 *
 * Everything here is derived from the official WTA snapshots in data/ — no new
 * external calls, so the site stays exactly reproducible offline.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, log } from './lib.mjs';

const readJson = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(ROOT, 'data', f), 'utf8'));
  } catch {
    return fallback;
  }
};

log('gen', 'Building the dashboard data file…');

const [rank, bios, stats, history, matches, tour, boardsIn, h2h, names, index, zh] =
  await Promise.all([
    readJson('rankings-singles.json', { players: [], asOf: null }),
    readJson('bios.json', {}),
    readJson('season-stats.json', {}),
    readJson('ranking-history.json', {}),
    readJson('matches.json', {}),
    readJson('tournaments.json', { events: [] }),
    readJson('leaderboards.json', { boards: [], career: {}, seasonMap: {} }),
    readJson('h2h.json', {}),
    readJson('h2h-names.json', {}),
    readJson('players-index.json', []),
    readJson('zh.json', { players: {}, tournaments: {}, countries: {}, levels: {}, rounds: {}, surfaces: {} }),
  ]);
const eventMatches = await readJson('event-matches.json', {});

const SEASON = boardsIn.season || new Date().getUTCFullYear();
const rankById = new Map(rank.players.map((p) => [p.id, p]));

/**
 * Wikidata occasionally carries a "Chinese" label that is just the Latin name.
 * Such a value is worse than nothing: the UI would print it twice.  Anything
 * without a CJK character is treated as missing.
 */
const zhName = (id) => {
  const raw = (zh.players?.[id] || '').trim();
  return /[\u4e00-\u9fff]/.test(raw) ? raw : '';
};

/* ------------------------------------------------------------------ */
/* Season records (W–L, titles, surface splits)                        */
/* ------------------------------------------------------------------ */

const seasonRecords = {};
for (const [id, list] of Object.entries(matches)) {
  for (const m of list) {
    const y = m.yr ?? Number(m.d.slice(0, 4));
    const key = `${id}`;
    seasonRecords[key] ??= {};
    const bucket = (seasonRecords[key][y] ??= {
      w: 0,
      l: 0,
      titles: 0,
      finals: 0,
      surfaces: {},
      last10: [],
    });
    bucket[m.w ? 'w' : 'l'] += 1;
    const sfc = m.sfc || 'UNKNOWN';
    bucket.surfaces[sfc] ??= { w: 0, l: 0 };
    bucket.surfaces[sfc][m.w ? 'w' : 'l'] += 1;
    if (m.r === 'F') {
      bucket.finals += 1;
      if (m.w) bucket.titles += 1;
    }
  }
}
// newest-first form strip per player/season
for (const [id, list] of Object.entries(matches)) {
  const sorted = [...list].sort((a, b) => (a.d < b.d ? 1 : -1));
  for (const y of Object.keys(seasonRecords[id] || {})) {
    seasonRecords[id][y].last10 = sorted
      .filter((m) => (m.yr ?? Number(m.d.slice(0, 4))) === Number(y))
      .slice(0, 10)
      .map((m) => (m.w ? 1 : 0));
  }
}

/* ------------------------------------------------------------------ */
/* 2026 champions — one entry per completed event                      */
/* ------------------------------------------------------------------ */

/** A player's log is only stored for the top 120, so champions come from both
 *  the tournament feed (authoritative) and the match log (fallback). */
const champions = [];
for (const e of tour.events) {
  if (e.status !== 'past' || !e.champion) continue;
  champions.push({
    event: e.name,
    year: e.year,
    date: e.end || e.start,
    level: e.level,
    surface: e.surface,
    city: e.city,
    country: e.country,
    player: {
      id: e.champion.id,
      name: e.champion.name,
      zh: zhName(e.champion.id),
      country: e.champion.country,
    },
  });
}
champions.sort((a, b) => (a.date < b.date ? 1 : -1));

/* ------------------------------------------------------------------ */
/* Results feed — most recent completed matches                        */
/* ------------------------------------------------------------------ */

/** Deduplicate a match that appears in both players' logs. */
const seenMatch = new Set();
const results = [];
for (const [ownerId, list] of Object.entries(matches)) {
  const owner = Number(ownerId);
  for (const m of list) {
    if (m.yr !== SEASON) continue;
    // A handful of feed rows omit the opponent; they cannot be rendered.
    if (!m.oid || !m.o || m.oid === owner) continue;
    const a = owner < m.oid ? owner : m.oid;
    const b = owner < m.oid ? m.oid : owner;
    const key = `${m.d}|${m.t}|${m.r}|${a}|${b}`;
    if (seenMatch.has(key)) continue;
    seenMatch.add(key);

    const ownerIsP1 = owner === a;
    const winnerId = m.w ? owner : m.oid;
    results.push({
      date: m.d,
      event: m.t,
      round: m.r,
      surface: m.sfc,
      level: m.lvl,
      score: m.sc,
      winnerId,
      loserId: winnerId === owner ? m.oid : owner,
      player1: ownerIsP1 ? owner : m.oid,
      player2: ownerIsP1 ? m.oid : owner,
      rank1: ownerIsP1 ? m.rank ?? null : m.orank ?? null,
      rank2: ownerIsP1 ? m.orank ?? null : m.rank ?? null,
    });
  }
}
results.sort((a, b) => (a.date < b.date ? 1 : -1));

/**
 * Attach display names from the ranking table, the biography map, or the H2H
 * name index — every participant in the data must resolve to something.
 *
 * `zh` is resolved here too so that every player reference in the payload
 * carries its Chinese name. Renderers that receive a bare `{id, name}` from a
 * leaderboard or champion record would otherwise fall back to Latin text.
 */
function displayName(id) {
  const cz = zhName(id);
  const r = rankById.get(id);
  if (r) return { name: r.name, zh: cz, country: r.country, rank: r.rank };
  const b = bios[id];
  if (b) return { name: b.name, zh: cz, country: b.country, rank: null };
  const n = names[id];
  if (n) return { name: n.n, zh: cz, country: n.c, rank: n.r ?? null };
  return { name: `#${id}`, zh: cz, country: '', rank: null };
}

/* ------------------------------------------------------------------ */
/* Player cards                                                        */
/* ------------------------------------------------------------------ */

const players = rank.players.map((p) => {
  const b = bios[p.id] || {};
  const s = stats[p.id] || {};
  const rec = seasonRecords[p.id]?.[SEASON] || null;
  const h = history[p.id] || [];
  return {
    id: p.id,
    name: p.name,
    zh: zh.players?.[p.id] || '',
    country: p.country,
    rank: p.rank,
    points: p.points,
    move: p.move,
    played: p.played,
    birth: p.birth,
    age: b.age ?? null,
    height: b.height || '',
    hand: b.hand || '',
    highRank: b.sglHighRank ?? null,
    titles: b.sglCareerTitles ?? null,
    careerWon: b.sglCareerWon ?? null,
    careerLost: b.sglCareerLost ?? null,
    careerPrize: b.careerPrize ?? null,
    ytdPrize: b.ytdPrize ?? null,
    season: rec
      ? { w: rec.w, l: rec.l, titles: rec.titles, finals: rec.finals, last10: rec.last10, surfaces: rec.surfaces }
      : null,
    serve: {
      aces: s.aces ?? null,
      doubleFaults: s.doubleFaults ?? null,
      firstServePct: s.firstServePct ?? null,
      firstServeWonPct: s.firstServeWonPct ?? null,
      secondServeWonPct: s.secondServeWonPct ?? null,
      serviceGamesWonPct: s.serviceGamesWonPct ?? null,
      returnGamesWonPct: s.returnGamesWonPct ?? null,
      breakPointsSavedPct: s.breakPointsSavedPct ?? null,
      breakPointsConvertedPct: s.breakPointsConvertedPct ?? null,
      totalPointsWonPct: s.totalPointsWonPct ?? null,
    },
    historyTail: h.slice(-6).map((row) => [row[0], row[1]]),
  };
});

/* ------------------------------------------------------------------ */
/* H2H index (keyed, for the comparison panel)                         */
/* ------------------------------------------------------------------ */

/**
 * Head-to-head data is split in two.
 *
 * `h2h-summary.js` carries only the win counts for every pairing (~35k of them)
 * and loads with the page, so the record is instant for any two players.
 * `h2h-matches.js` carries the individual meetings and is injected on demand the
 * first time the panel is opened — the meeting list is the only thing that needs
 * it, and duplicating it in the initial payload tripled the page weight.
 *
 * Pairs reference the shared roster by id rather than embedding a copy of each
 * player.
 */
const h2hRoster = {};
const roster = (id) => {
  if (!h2hRoster[id]) {
    const p = displayName(id);
    h2hRoster[id] = {
      id,
      name: p.name,
      zh: zh.players?.[id] || '',
      country: p.country,
      rank: p.rank,
    };
  }
  return h2hRoster[id];
};

// Seed the roster from the whole ranking table first: the head-to-head picker
// must offer every ranked player, including the top 100, even when that player
// has no stored meeting yet. The lazy `roster()` below then adds anyone else who
// only appears in older results.
for (const p of rank.players) {
  roster(p.id);
}

const MAX_PAIR_MEETINGS = 24;
const h2hPairs = {};
const h2hMeetings = {};
for (const [key, v] of Object.entries(h2h)) {
  const [a, b] = key.split('-').map(Number);
  roster(a);
  roster(b);

  // A meeting appears in both players' logs, so de-duplicate per pair.
  const seen = new Set();
  const meetings = [];
  for (const m of v.meetings) {
    const k = `${m.d}|${m.t}|${m.r}|${m.sc}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (meetings.length >= MAX_PAIR_MEETINGS) break;
    meetings.push([m.d, m.t, m.lvl, m.sfc, m.r, m.sc, m.w]);
  }

  h2hPairs[key] = { aw: v.aWins, bw: v.bWins, n: v.n ?? v.meetings.length };
  if (meetings.length) h2hMeetings[key] = meetings;
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

/**
 * Per-event results, resolved for display.
 *
 * Every match already carries both players, the score and the winner; only the
 * Chinese names and current ranking are missing, so they are merged in here.
 */
const eventResults = {};
for (const [key, ev] of Object.entries(eventMatches)) {
  eventResults[key] = {
    id: ev.id,
    year: ev.year,
    name: ev.name,
    zh: zh.tournaments?.[ev.name] || '',
    level: ev.level,
    surface: ev.surface,
    city: ev.city,
    country: ev.country,
    drawSize: ev.drawSize,
    rounds: ev.rounds.map((r) => ({
      key: r.key,
      label: r.label,
      qualifying: r.qualifying,
      matches: r.matches.map((m) => ({
        round: r.label,
        qualifying: r.qualifying,
        score: m.score,
        note: m.note,
        date: m.date,
        court: m.court,
        a: { ...m.a, zh: zhName(m.a.id) },
        b: { ...m.b, zh: zhName(m.b.id) },
        winner: m.winnerSide === 'A' ? 'a' : 'b',
      })),
    })),
  };
}

/**
 * A compact per-event summary stays in the main payload so the calendar can show
 * the final, the champion and the match count immediately; the full draw ships
 * separately and is injected when an event is opened.
 */
const eventDigest = {};
for (const [key, ev] of Object.entries(eventResults)) {
  const all = ev.rounds.flatMap((r) => r.matches);
  const final = ev.rounds.find((r) => r.label === 'F');
  const fm = final && final.matches[0];
  eventDigest[key] = {
    id: ev.id,
    year: ev.year,
    rounds: ev.rounds.length,
    matches: all.length,
    final: fm
      ? {
          a: { id: fm.a.id, name: fm.a.name, zh: fm.a.zh },
          b: { id: fm.b.id, name: fm.b.name, zh: fm.b.zh },
          score: fm.score,
          winner: fm.winner,
        }
      : null,
  };
}

const calendar = tour.events
  .filter((e) => e.year >= SEASON - 1)
  .map((e) => ({
    id: e.id,
    name: e.name,
    zh: zh.tournaments?.[e.name] || '',
    year: e.year,
    level: e.level,
    start: e.start,
    end: e.end,
    surface: e.surface,
    indoor: e.indoor,
    city: e.city,
    country: e.country,
    draw: e.drawSize,
    prize: e.prize,
    currency: e.currency,
    status: e.status,
    champion: e.champion
      ? { ...e.champion, zh: zhName(e.champion.id) }
      : null,
  }))
  .sort((a, b) => (a.start < b.start ? 1 : -1));

/* ------------------------------------------------------------------ */
/* Headline statistics                                                 */
/* ------------------------------------------------------------------ */

const seasonEvents = calendar.filter((e) => e.year === SEASON);
const pastEvents = seasonEvents.filter((e) => e.status === 'past');
const upcomingEvents = seasonEvents.filter((e) => e.status !== 'past');
const seasonMatches = results.length;
const completedTournaments = champions.filter((c) => c.year === SEASON).length;

const meta = {
  generatedAt: new Date().toISOString(),
  season: SEASON,
  rankingsAsOf: rank.asOf,
  source: 'WTA official public data API',
  sourceUrl: 'https://www.wtatennis.com/',
  depth: rank.depth,
  counts: {
    rankedPlayers: rank.players.length,
    playersWithMatches: Object.keys(matches).length,
    events: seasonEvents.length,
    completedEvents: pastEvents.length,
    upcomingEvents: upcomingEvents.length,
    seasonMatches,
    champions: completedTournaments,
    h2hPairings: Object.keys(h2hPairs).length,
    calendarEvents: calendar.length,
  },
  zh: {
    countries: zh.countries || {},
    levels: zh.levels || {},
    rounds: zh.rounds || {},
    surfaces: zh.surfaces || {},
  },
};

/**
 * The results panel shows recent form, so the feed is capped; the full season
 * remains available through the calendar and each player's own page.
 */
const RESULT_LIMIT = Number(process.env.WTA_RESULT_LIMIT || 1200);
const recentResults = results.slice(0, RESULT_LIMIT);

/** Add the Chinese name to every row of a leaderboard or career table. */
function withZh(rows) {
  return (rows || []).map((r) => ({ ...r, zh: zhName(r.id) }));
}

const boards = (boardsIn.boards || []).map((b) => ({ ...b, rows: withZh(b.rows) }));
const career = {
  titles: withZh(boardsIn.career?.titles),
  careerWins: withZh(boardsIn.career?.careerWins),
  prizeMoney: withZh(boardsIn.career?.prizeMoney),
};

const payload = {
  meta,
  players,
  eventDigest,
  results: recentResults.map((r) => ({
    ...r,
    winner: { id: r.winnerId, ...displayName(r.winnerId), zh: zh.players?.[r.winnerId] || '' },
    loser: { id: r.loserId, ...displayName(r.loserId), zh: zh.players?.[r.loserId] || '' },
  })),
  champions,
  calendar,
  boards,
  career,
  seasonRecords,
  tournamentZh: zh.tournaments || {},
  playerIndex: index,
};

const mainJs = `/* WTA Tour dashboard data — generated ${meta.generatedAt} */\nwindow.WTA_DATA=${JSON.stringify(payload)};\n`;
await writeFile(resolve(ROOT, 'data', 'dashboard.js'), mainJs, 'utf8');

// Full per-event draws: large, and only needed when an event is opened.
const eventsJs = `/* Per-event results — generated ${meta.generatedAt} */\nwindow.WTA_EVENTS=${JSON.stringify(eventResults)};\n`;
await writeFile(resolve(ROOT, 'data', 'events.js'), eventsJs, 'utf8');

// The head-to-head index is large and only needed by one panel, so it ships
// separately and is not part of the initial payload.
const h2hSummaryJs = `/* Head-to-head summary — generated ${meta.generatedAt} */\nwindow.WTA_H2H=${JSON.stringify({ players: h2hRoster, pairs: h2hPairs })};\n`;
await writeFile(resolve(ROOT, 'data', 'h2h.js'), h2hSummaryJs, 'utf8');

const h2hMatchesJs = `/* Head-to-head meetings — generated ${meta.generatedAt} */\nwindow.WTA_H2H_MATCHES=${JSON.stringify(h2hMeetings)};\n`;
await writeFile(resolve(ROOT, 'data', 'h2h-matches.js'), h2hMatchesJs, 'utf8');

const mb = (s) => (Buffer.byteLength(s) / 1024 / 1024).toFixed(1);
log(
  'gen',
  `Done — ${players.length} players, ${recentResults.length} season matches, ` +
    `${calendar.length} calendar events, ${completedTournaments} champions`,
);
log(
  'gen',
  `  dashboard.js ${mb(mainJs)} MB · events.js ${mb(eventsJs)} MB · ` +
    `h2h.js ${mb(h2hSummaryJs)} MB · h2h-matches.js ${mb(h2hMatchesJs)} MB`,
);
log(
  'gen',
  `  ${Object.keys(eventResults).length} events with results (${Object.values(eventDigest).reduce((n, d) => n + d.matches, 0)} matches) · ` +
    `${Object.keys(h2hPairs).length} H2H pairings`,
);
