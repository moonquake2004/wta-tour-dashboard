/**
 * Formatting + small DOM helpers shared by every view.
 */

export const el = (sel, root = document) => root.querySelector(sel);
export const els = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape untrusted text before it goes into an HTML template. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Thousands-separated integer. */
export function int(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** One-decimal percentage, e.g. 62.9%. */
export function pct(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

/** Currency in a compact, readable form. */
export function money(n, currency = 'USD') {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 2 : 0,
  }).format(n);
}

/** Full currency with no abbreviation. */
export function moneyFull(n, currency = 'USD') {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Win percentage from W/L counts. */
export function winPct(w, l) {
  const total = (w || 0) + (l || 0);
  if (!total) return null;
  return ((w || 0) / total) * 100;
}

/** "40–8" with an en dash, tabular-friendly. */
export function record(w, l) {
  if (w == null && l == null) return '—';
  return `${w ?? 0}–${l ?? 0}`;
}

/** Height string → metres, e.g. 5' 11" (1.82m) → 1.82 m. */
export function heightLabel(raw) {
  if (!raw) return null;
  const m = /\(([\d.]+)\s*m\)/.exec(raw);
  if (m) return `${m[1]} m`;
  return raw;
}

/** Turn "2026-08-31T00:00:00Z" into "31 Aug 2026". */
export function dateLabel(value) {
  if (!value) return '—';
  const d = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function monthDay(value) {
  if (!value) return '';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Signed rank movement: +3 / −2 / —. */
export function movement(n) {
  const v = Number(n);
  if (!v) return '<span class="move flat">—</span>';
  const cls = v > 0 ? 'up' : 'down';
  const sign = v > 0 ? '+' : '−';
  const arrow = v > 0 ? '▲' : '▼';
  return `<span class="move ${cls}">${arrow}${sign}${Math.abs(v)}</span>`;
}

/** Short country label; falls back to the raw code. */
export function country(code) {
  if (!code) return '—';
  return `<span class="flag">${esc(code)}</span>`;
}

/** Level → tag class. */
export function levelTag(level) {
  if (!level) return '';
  const l = String(level);
  let cls = '';
  if (/grand slam/i.test(l)) cls = 'gs';
  else if (/1000/i.test(l)) cls = 'w1000';
  else if (/500/i.test(l)) cls = 'w500';
  else if (/250|125/i.test(l)) cls = 'w250';
  const short = l
    .replace(/^WTA\s*/i, '')
    .replace(/^Grand Slam$/i, 'SLAM');
  return `<span class="tag ${cls}">${esc(short || l)}</span>`;
}

const SURFACE_LABEL = {
  HARD: 'Hard',
  CLAY: 'Clay',
  GRASS: 'Grass',
  CARPET: 'Carpet',
};

export function surfaceLabel(raw) {
  if (!raw) return '—';
  const key = String(raw).toUpperCase();
  return SURFACE_LABEL[key] || titleCase(raw);
}

export function surfaceChip(raw) {
  const label = surfaceLabel(raw);
  const key = titleCase(label);
  return `<span class="sfc ${esc(key)}"><i></i>${esc(label)}</span>`;
}

export function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Official headshot URL for a player id. */
export function photo(id) {
  return `https://wtafiles.blob.core.windows.net/images/headshots/${id}.jpg`;
}

/**
 * Player headshot with a graceful monogram fallback: official headshots are
 * not published for every ranked player, and the broken-image state is ugly.
 */
export function avatar(id, name, size = 34, extraClass = '') {
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
  return `<img class="avatar ${extraClass}" src="${photo(id)}" alt="" loading="lazy"
    width="${size}" height="${size}" style="width:${size}px;height:${size}px"
    data-initials="${esc(initials)}"
    onerror="window.__wtaImgFallback&&window.__wtaImgFallback(this)">`;
}

/** Delegated click helper: `on('click', '[data-go]', fn)` scoped to the page. */
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}

/** Blinking-free skeleton block. */
export function skeleton(rows = 6, height = 34) {
  return `<div style="display:flex;flex-direction:column;gap:8px">${Array.from(
    { length: rows },
    () => `<div class="skeleton" style="height:${height}px"></div>`,
  ).join('')}</div>`;
}

/** Render an error state rather than throwing into the void. */
export function errorState(message, detail = '') {
  return `<div class="empty"><b>Could not load this data</b>
    <div>${esc(message)}</div>
    ${detail ? `<div class="dim mt3" style="font-size:12px">${esc(detail)}</div>` : ''}
    <div class="mt4"><button class="btn" onclick="location.reload()">Retry</button></div>
  </div>`;
}
