/**
 * Build the Chinese localisation snapshot.
 *
 * Sources
 *   • Player names  — Wikidata (WTA player id = P597), normalised to Simplified
 *                     Chinese via the MediaWiki variant converter.
 *   • Tournaments   — curated dictionary for the calendar, plus Wikidata for
 *                     anything the dictionary misses.
 *   • Countries, rounds, surfaces, levels — curated terminology.
 *
 * Produces `data/zh.json`, which the front end merges with the English snapshots
 * so every player, event, surface and round can be shown bilingually.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, log } from './lib.mjs';
import {
  sparql,
  toSimplified,
  writeJsonFile,
  countryZh,
  tournamentZh,
  LEVEL_ZH,
  ROUND_ZH,
  SURFACE_ZH,
  COUNTRY_ZH,
  VARIANT_CACHE,
  PLAYER_ZH,
  playerZhFallback,
} from './zh-terms.mjs';

const read = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(ROOT, f), 'utf8'));
  } catch {
    return fallback;
  }
};

log('zh', 'Building Chinese localisation snapshot…');

const rankings = await read('data/rankings-singles.json', { players: [] });
const bios = await read('data/bios.json', {});
const matches = await read('data/matches.json', {});
const tournaments = await read('data/tournaments.json', { events: [] });
const h2hNames = await read('data/h2h-names.json', {});

/* ------------------------------------------------------------------ */
/* 1. Every player id we need a Chinese name for                       */
/* ------------------------------------------------------------------ */

const wanted = new Map(); // wtaId(string) -> english name
for (const p of rankings.players) wanted.set(String(p.id), p.name);
for (const [id, b] of Object.entries(bios)) if (!wanted.has(String(id))) wanted.set(String(id), b.name);
for (const [id, n] of Object.entries(h2hNames)) if (!wanted.has(String(id))) wanted.set(String(id), n.n);
for (const list of Object.values(matches)) {
  for (const m of list) if (m.oid && m.o) wanted.set(String(m.oid), m.o);
}
for (const e of tournaments.events) {
  if (e.champion?.id) wanted.set(String(e.champion.id), e.champion.name);
  for (const d of e.doublesChampions || []) if (d.id) wanted.set(String(d.id), d.name);
}

log('zh', `  ${wanted.size} distinct players across rankings, biographies, match logs and champions`);

/* ------------------------------------------------------------------ */
/* 2. Wikidata lookup by WTA id                                        */
/* ------------------------------------------------------------------ */

log('zh', '  Querying Wikidata for WTA ids and Chinese labels…');
let rows = [];
try {
  rows = await sparql(`SELECT ?wtaId ?zh ?zhHans ?zhCn ?zhSg ?en WHERE {
    ?p wdt:P597 ?wtaId .
    OPTIONAL { ?p rdfs:label ?zh . FILTER(lang(?zh)="zh") }
    OPTIONAL { ?p rdfs:label ?zhHans . FILTER(lang(?zhHans)="zh-hans") }
    OPTIONAL { ?p rdfs:label ?zhCn . FILTER(lang(?zhCn)="zh-cn") }
    OPTIONAL { ?p rdfs:label ?zhSg . FILTER(lang(?zhSg)="zh-sg") }
    OPTIONAL { ?p rdfs:label ?en . FILTER(lang(?en)="en") }
  }`);
} catch (err) {
  log('zh', `  ! Wikidata query failed: ${err.message}`);
}

const byWtaId = new Map();
for (const r of rows) {
  const id = r.wtaId?.value;
  if (!id) continue;
  const label =
    r.zhHans?.value || r.zhCn?.value || r.zhSg?.value || r.zh?.value || '';
  const existing = byWtaId.get(id);
  // Prefer an entry that actually carries a Chinese label.
  if (!existing || (!existing.zh && label)) {
    byWtaId.set(id, { zh: label, en: r.en?.value || '' });
  }
}

log('zh', `  Wikidata returned ${byWtaId.size} WTA-indexed players`);

/* ------------------------------------------------------------------ */
/* 3. Normalise everything to Simplified Chinese                       */
/* ------------------------------------------------------------------ */

const rawZh = [];
const playerZh = {};

for (const [id, name] of wanted) {
  const wd = byWtaId.get(id);
  if (wd?.zh) {
    rawZh.push(wd.zh);
    playerZh[id] = wd.zh; // converted below
  }
}

// Tournament names: curated dictionary first, Wikidata/city fallback after.
const tournamentZhMap = {};
const eventNamesRaw = new Set();
for (const e of tournaments.events) {
  const curated = tournamentZh(e.name, e.city);
  if (curated) {
    tournamentZhMap[e.name] = curated;
  } else if (e.title) {
    eventNamesRaw.add(e.name);
  }
}

// Match-log event names (ITF and lower-tier events are frequent here).
const matchEventNames = new Set();
for (const list of Object.values(matches)) {
  for (const m of list) {
    if (!tournamentZhMap[m.t]) matchEventNames.add(m.t);
  }
}

log('zh', `  Translating ${eventNamesRaw.size} calendar events and ${matchEventNames.size} match-log events…`);

// Ask Wikidata for Chinese labels of tennis tournaments matching these names.
async function wikidataTournaments(names) {
  const list = [...names];
  const out = new Map();
  const CHUNK = 160;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list
      .slice(i, i + CHUNK)
      .map((n) => `"${n.replace(/["\\]/g, '')}"@en`)
      .join(' ');
    try {
      const rows = await sparql(`SELECT ?name ?labelZh WHERE {
        VALUES ?name { ${chunk} }
        ?item rdfs:label ?name .
        ?item rdfs:label ?labelZh . FILTER(lang(?labelZh)="zh")
      }`);
      for (const r of rows) {
        const n = r.name?.value;
        const z = r.labelZh?.value;
        if (n && z && !out.has(n)) out.set(n, z);
      }
    } catch (err) {
      log('zh', `  ! tournament label batch failed: ${err.message}`);
    }
  }
  return out;
}

try {
  const wdTournaments = await wikidataTournaments([...eventNamesRaw, ...matchEventNames]);
  log('zh', `  Wikidata resolved ${wdTournaments.size} tournament labels`);
  for (const [name, label] of wdTournaments) {
    rawZh.push(label);
    tournamentZhMap[name] = label;
  }
} catch (err) {
  log('zh', `  ! tournament lookup skipped: ${err.message}`);
}

/* ------------------------------------------------------------------ */
/* 4. Convert everything to Simplified Chinese in batches              */
/* ------------------------------------------------------------------ */

const uniqueZh = [...new Set(rawZh)];
log('zh', `  Converting ${uniqueZh.length} names to Simplified Chinese…`);
const converted = await toSimplified(uniqueZh, { cacheFile: VARIANT_CACHE });

const toHans = (s) => (s && converted.has(s) ? converted.get(s) : s);

const playerZhFinal = {};
for (const [id, z] of Object.entries(playerZh)) playerZhFinal[id] = toHans(z);

// Fill the gaps from the curated transliteration list.
let curatedFilled = 0;
for (const [id, name] of wanted) {
  if (playerZhFinal[id]) continue;
  const fb = playerZhFallback(name);
  if (fb) {
    playerZhFinal[id] = fb;
    curatedFilled += 1;
  }
}
for (const [name, z] of Object.entries(tournamentZhMap)) tournamentZhMap[name] = toHans(z);

/* ------------------------------------------------------------------ */
/* 5. Fill tournament gaps with a curated city-based fallback          */
/* ------------------------------------------------------------------ */

let fallbackCount = 0;
for (const name of new Set([...eventNamesRaw, ...matchEventNames])) {
  if (tournamentZhMap[name]) continue;
  const fb = tournamentZh(name, '');
  tournamentZhMap[name] = fb || '';
  if (fb) fallbackCount += 1;
}

/* ------------------------------------------------------------------ */
/* 6. Snapshot                                                            */
/* ------------------------------------------------------------------ */

const events = Object.values(tournamentZhMap).filter(Boolean).length;

const payload = {
  generatedAt: new Date().toISOString(),
  sources: {
    playerNames: 'Wikidata (property P597 — WTA player id)',
    simplified: 'MediaWiki zh-hans variant conversion',
    terminology: 'Curated tennis terminology',
  },
  players: playerZhFinal,
  tournaments: tournamentZhMap,
  countries: COUNTRY_ZH,
  levels: LEVEL_ZH,
  rounds: ROUND_ZH,
  surfaces: SURFACE_ZH,
};

await writeJsonFile('data/zh.json', payload);

log(
  'zh',
  `Done — ${Object.keys(playerZhFinal).length} player names (${curatedFilled} via curated transliteration), ` +
    `${events} tournament names (${fallbackCount} via city fallback), ${Object.keys(COUNTRY_ZH).length} country names.`,
);

// Report coverage against the current ranking snapshot so gaps are visible.
const ranked = rankings.players;
const covered = ranked.filter((p) => playerZhFinal[String(p.id)]).length;
log('zh', `Ranking coverage: ${covered}/${ranked.length} players have a Chinese name.`);
const missing = ranked.filter((p) => !playerZhFinal[String(p.id)]).slice(0, 12);
if (missing.length) {
  log('zh', `  no Chinese name: ${missing.map((p) => `${p.rank} ${p.name}`).join(', ')}${missing.length === 12 ? ' …' : ''}`);
}
