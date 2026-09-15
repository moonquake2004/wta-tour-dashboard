/**
 * Bilingual presentation layer (English / Simplified Chinese).
 *
 * The official WTA feed is English-only, so `data/zh.json` carries Chinese names
 * for players, tournaments, countries and tennis terminology.  Every display
 * helper here renders according to the active language mode:
 *
 *   'both' (default) — Chinese first, English underneath, so a reader of either
 *                      language can verify the entry at a glance
 *   'zh'             — Chinese only, falling back to English when unavailable
 *   'en'             — English only
 */
import { load } from './data.js';
import { esc } from './utils.js';

const MODE_KEY = 'wta-lang-mode';
export const MODES = ['both', 'zh', 'en'];

let zh = null;
let mode = readMode();

function readMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored && MODES.includes(stored)) return stored;
  } catch {
    /* storage may be unavailable */
  }
  return 'both';
}

/** Load the Chinese snapshot and localise the stored preference. */
export async function initI18n() {
  try {
    zh = await load('zh');
  } catch {
    zh = { players: {}, tournaments: {}, countries: {}, levels: {}, rounds: {}, surfaces: {} };
  }
  return zh;
}

export function hasZh() {
  return !!zh;
}

export function getMode() {
  return mode;
}

export function setMode(next) {
  if (!MODES.includes(next)) return;
  mode = next;
  try {
    localStorage.setItem(MODE_KEY, next);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const playerZh = (id) => (zh?.players?.[String(id)] || '').trim();
export const tournamentZh = (name) => (zh?.tournaments?.[name] || '').trim();
export const countryZh = (code) =>
  (zh?.countries?.[String(code || '').toUpperCase()] || '').trim();
export const levelZh = (level) => (zh?.levels?.[level] || '').trim();
export const roundZh = (round) => (zh?.rounds?.[String(round || '').toUpperCase()] || '').trim();
export const surfaceZh = (surface) =>
  (zh?.surfaces?.[String(surface || '').toUpperCase()] || '').trim();

/* ------------------------------------------------------------------ */
/* Rendering primitives                                                */
/* ------------------------------------------------------------------ */

/**
 * Render a Chinese/English pair.
 *
 * `zhText` may be empty when no translation exists; in that case the English
 * form is shown alone in every mode rather than leaving a hole.
 */
export function pair(zhText, enText, { className = 'bi', tag = 'span' } = {}) {
  const c = (zhText || '').trim();
  const e = (enText || '').trim();
  if (!c) return `<${tag} class="${className}">${esc(e)}</${tag}>`;
  if (!e) return `<${tag} class="${className}">${esc(c)}</${tag}>`;

  if (mode === 'en') return `<${tag} class="${className}">${esc(e)}</${tag}>`;
  if (mode === 'zh') return `<${tag} class="${className}">${esc(c)}</${tag}>`;

  return `<${tag} class="${className} bi-both"><span class="bi-zh">${esc(c)}</span><span class="bi-en">${esc(e)}</span></${tag}>`;
}

/** Player name pair. */
export function playerName(playerOrId, englishName, opts = {}) {
  const id = typeof playerOrId === 'object' ? playerOrId.id : playerOrId;
  const name = typeof playerOrId === 'object' ? playerOrId.name : englishName;
  return pair(playerZh(id), name, opts);
}

/** Plain-text player name for a single-language context (titles, aria). */
export function playerNameText(id, englishName) {
  if (mode === 'en') return englishName;
  return playerZh(id) || englishName;
}

/** Tournament name pair. */
export function tournamentName(englishName, opts = {}) {
  return pair(tournamentZh(englishName), englishName, { className: 'bi bi-tour', ...opts });
}

/** Tournament level pair, keeping the English code recognisable. */
export function levelName(level) {
  return pair(levelZh(level), level, { className: 'bi', tag: 'span' });
}

/** Round pair, e.g. "16 强" over "R16". */
export function roundName(round) {
  return pair(roundZh(round), round, { className: 'bi', tag: 'span' });
}

/** Surface pair. */
export function surfaceName(surface, englishLabel) {
  return pair(surfaceZh(surface), englishLabel || surface, { className: 'bi', tag: 'span' });
}

/** Country pair: Chinese name over the IOC code. */
export function countryName(code) {
  const c = String(code || '').toUpperCase();
  return pair(countryZh(c), c, { className: 'bi', tag: 'span' });
}

/* ------------------------------------------------------------------ */
/* UI strings                                                          */
/* ------------------------------------------------------------------ */

const STRINGS = {
  overview: ['总览', 'Overview'],
  rankings: ['排名', 'Rankings'],
  players: ['球员', 'Players'],
  compare: ['交手对比', 'Head-to-head'],
  calendar: ['赛程', 'Calendar'],
  stats: ['统计', 'Statistics'],
  data: ['数据', 'Data'],
  search: ['搜索球员…', 'Search player…'],
  rankingsAsOf: ['排名日期', 'Rankings'],
  worldNo1: ['世界第一', 'World No.1'],
  singles: ['单打', 'Singles'],
  points: ['积分', 'Points'],
  rank: ['排名', 'Rank'],
  player: ['球员', 'Player'],
  country: ['国家/地区', 'Country'],
  move: ['变动', 'Move'],
  played: ['参赛', 'Events'],
  age: ['年龄', 'Age'],
  titles: ['冠军', 'Titles'],
  live: ['官方数据', 'Official data'],
  language: ['语言', 'Language'],
  showBoth: ['中英对照', 'Bilingual'],
  zhOnly: ['仅中文', '中文'],
  enOnly: ['仅英文', 'English'],
};

/** Bilingual UI string.  Returns a pair of strings for the caller to render. */
export function t(key) {
  const v = STRINGS[key];
  if (!v) return key;
  return { zh: v[0], en: v[1] };
}

/** Active language for a single label, honouring the mode. */
export function label(key) {
  const v = STRINGS[key];
  if (!v) return key;
  return mode === 'en' ? v[1] : mode === 'zh' ? v[0] : v[1];
}

/** Language switch control, rendered into the header. */
export function languageSwitch() {
  const items = MODES.map(
    (m) =>
      `<button type="button" data-lang="${m}" class="${m === mode ? 'on' : ''}">${
        m === 'both' ? '中/EN' : m === 'zh' ? '中文' : 'EN'
      }</button>`,
  ).join('');
  return `<div class="langsw" data-langswitch title="${esc(
    'Language: bilingual / Chinese / English',
  )}">${items}</div>`;
}
