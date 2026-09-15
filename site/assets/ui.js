/**
 * Presentational building blocks: chrome, charts and interactive widgets.
 */
import {
  avatar,
  esc,
  int,
  movement,
  pct,
  record,
  skeleton,
  surfaceLabel,
  titleCase,
} from './utils.js';
import {
  countryName,
  label,
  languageSwitch,
  levelName,
  levelZh,
  pair,
  playerName,
  playerZh as zhName,
  roundName,
  surfaceName,
} from './i18n.js';

/* ==========================================================================
   Chrome
   ========================================================================== */

export const NAV = [
  { href: '#/', label: 'Overview', zh: '总览' },
  { href: '#/rankings', label: 'Rankings', zh: '排名' },
  { href: '#/players', label: 'Players', zh: '球员' },
  { href: '#/compare', label: 'Head-to-head', zh: '交手对比' },
  { href: '#/calendar', label: 'Calendar', zh: '赛程' },
  { href: '#/stats', label: 'Statistics', zh: '统计' },
  { href: '#/about', label: 'Data', zh: '数据' },
];

export function header({ route, asOf }) {
  const nav = NAV.map((n) =>
    `<a href="${n.href}" class="${isActive(n.href, route) ? 'on' : ''}">${pair(
      n.zh,
      n.label,
    )}</a>`,
  ).join('');

  return `<header class="hdr"><div class="shell hdr-in">
    <a class="brand" href="#/">
      <span class="brand-mark"><span>W</span></span>
      <span class="brand-txt"><b>WTA Tour</b><i>数据看板 · Dashboard</i></span>
    </a>
    <nav class="nav">${nav}</nav>
    <div class="search" data-search>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
      </svg>
      <input type="search" placeholder="${esc(label('search'))}" aria-label="${esc(label('search'))}"
        autocomplete="off" spellcheck="false" data-search-input>
      <div class="suggest" data-search-suggest hidden></div>
    </div>
    ${languageSwitch()}
    <div class="hdr-meta">
      <span class="asof">${pair('排名日期', 'Rankings')} <b>${esc(asOf || '—')}</b></span>
    </div>
  </div></header>`;
}

function isActive(href, route) {
  if (href === '#/') return route === '/' || route === '';
  return route.startsWith(href.slice(1));
}

export function footer({ asOf, generatedAt }) {
  return `<footer class="ftr"><div class="shell">
    <div class="ftr-grid">
      <div>
        <div class="brand" style="margin-bottom:12px">
          <span class="brand-mark"><span>W</span></span>
        </div>
        <p style="margin:0;max-width:42ch;line-height:1.65">
          An independent, open-source dashboard for the Hologic WTA Tour.
          Rankings, player records, results and the tour calendar are pulled
          directly from the official WTA data API and rebuilt as static files.
        </p>
      </div>
      <div>
        <h4>${pair('浏览', 'Explore')}</h4>
        <ul>
          <li><a href="#/rankings">${pair('单打排名', 'Singles rankings')}</a></li>
          <li><a href="#/players">${pair('球员档案', 'Player profiles')}</a></li>
          <li><a href="#/compare">${pair('交手对比', 'Head-to-head')}</a></li>
          <li><a href="#/calendar">${pair('巡回赛赛程', 'Tour calendar')}</a></li>
        </ul>
      </div>
      <div>
        <h4>${pair('官方来源', 'Official sources')}</h4>
        <ul>
          <li><a href="https://www.wtatennis.com/rankings/singles" target="_blank" rel="noopener">WTA rankings ↗</a></li>
          <li><a href="https://www.wtatennis.com/tournaments" target="_blank" rel="noopener">WTA calendar ↗</a></li>
          <li><a href="https://www.wtatennis.com/players" target="_blank" rel="noopener">WTA players ↗</a></li>
          <li><a href="https://www.itftennis.com/" target="_blank" rel="noopener">ITF ↗</a></li>
        </ul>
      </div>
      <div>
        <h4>${pair('数据快照', 'Snapshot')}</h4>
        <ul>
          <li>${pair('排名截至', 'Rankings as of')} <span class="num">${esc(asOf || '—')}</span></li>
          <li>${pair('重建时间', 'Rebuilt')} <span class="num">${esc(generatedAt || '—')}</span></li>
          <li><a href="#/about">${pair('方法论与授权', 'Methodology &amp; licensing')}</a></li>
          <li><a href="https://github.com/moonquake2004" target="_blank" rel="noopener">GitHub ↗</a></li>
        </ul>
      </div>
    </div>
    <div class="ftr-btm">
      <span>${pair(
        '本站与 WTA 无隶属关系。球员数据版权归 WTA Tour, Inc. 所有。',
        'Not affiliated with or endorsed by the WTA. Player data © WTA Tour, Inc.',
      )}</span>
      <span>${pair('静态站点 · 无跟踪 · 无 Cookie', 'Static site · no tracking · no cookies')}</span>
    </div>
  </div></footer>`;
}

/** A page header block with eyebrow, title, subtitle and optional actions. */
export function pageHead({ eyebrow, title, sub, actions = '' }) {
  return `<div class="sec-hd" style="border-bottom:0;margin-bottom:var(--sp-5);align-items:flex-end">
    <div>
      ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
      <h2 style="font-size:clamp(26px,3.6vw,38px);letter-spacing:-0.03em">${title}</h2>
      ${sub ? `<p class="muted" style="margin:10px 0 0;max-width:70ch">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="row wrap">${actions}</div>` : ''}
  </div>`;
}

/* ==========================================================================
   Small fragments
   ========================================================================== */

/** Surface dot + bilingual label. */
export function surfaceChip(surface) {
  const key = titleCase(surfaceLabel(surface));
  return `<span class="sfc ${esc(key)}"><i></i>${surfaceName(
    surface,
    surfaceLabel(surface),
  )}</span>`;
}

/**
 * Tournament level tag, e.g. "大满贯 / SLAM" or "WTA 500 赛 / WTA 500".
 * Lives here rather than in utils.js because it needs the i18n lookups, and
 * utils.js cannot import them without creating a cycle.
 */
export function levelTag(level) {
  if (!level) return '';
  const l = String(level);
  let cls = '';
  if (/grand slam/i.test(l)) cls = 'gs';
  else if (/1000/i.test(l)) cls = 'w1000';
  else if (/500/i.test(l)) cls = 'w500';
  else if (/250|125/i.test(l)) cls = 'w250';

  const en = l.replace(/^Grand Slam$/i, 'SLAM');
  const zh = levelZh(l);
  return `<span class="tag ${cls}">${zh ? pair(zh, en) : esc(en)}</span>`;
}

export function playerCell(p, { size = 34, showRank = false, meta = true } = {}) {
  return `<div class="p-cell">
    ${avatar(p.id, p.name, size)}
    <div style="min-width:0">
      <a class="p-name" href="#/player/${p.id}">${playerName(p)}</a>
      <div class="row" style="gap:7px;margin-top:2px">
        ${meta ? countryName(p.country) : ''}
        ${
          showRank && p.rank
            ? `<span class="num dim" style="font-size:11px">No.${p.rank}</span>`
            : ''
        }
      </div>
    </div>
  </div>`;
}

export function formStrip(results, limit = 10) {
  if (!results?.length) return '<span class="dim">No recent matches</span>';
  return `<div class="form">${results
    .slice(0, limit)
    .map((w) => `<i class="${w ? 'w' : 'l'}">${w ? 'W' : 'L'}</i>`)
    .join('')}</div>`;
}

/**
 * `label` (and `sub`) may be either plain text or pre-rendered bilingual markup
 * from `pair()`.  Plain text is escaped; markup is inserted as-is so the
 * Chinese/English stack renders instead of leaking tags.
 */
export function tile(value, label, sub = '') {
  return `<div class="tile"><b>${value}</b><small>${rich(label)}</small>${
    sub ? `<div class="sub">${rich(sub)}</div>` : ''
  }</div>`;
}

/** Escape plain text, pass already-rendered markup through untouched. */
function rich(value) {
  const v = String(value ?? '');
  return v.includes('<span') || v.includes('<b') || v.includes('<a ') ? v : esc(v);
}

export function tiles(items) {
  return `<div class="tiles">${items
    .map((t) => tile(t.value, t.label, t.sub || ''))
    .join('')}</div>`;
}

export function statLine(label, value) {
  return `<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line-soft)">
    <span class="dim" style="font-size:12.5px">${esc(label)}</span>
    <span class="num" style="font-size:13px">${value}</span>
  </div>`;
}

export function empty(title, sub = '') {
  return `<div class="empty"><b>${esc(title)}</b>${sub ? `<div>${esc(sub)}</div>` : ''}</div>`;
}

export function loading(rows = 8) {
  return `<div class="card"><div class="card-bd">${skeleton(rows)}</div></div>`;
}

/* ==========================================================================
   Charts (dependency-free SVG)
   ========================================================================== */

/**
 * Line chart with an optional inverted axis (rank 1 at the top).
 *
 * @param {object} o
 * @param {{x:string,y:number}[]} o.points
 * @param {boolean} [o.invert]      lower values are better (rankings)
 * @param {boolean} [o.area]
 * @param {string}  [o.color]
 * @param {number}  [o.height]
 * @param {number}  [o.ticks]
 * @param {(v:number)=>string} [o.fmt]
 */
export function lineChart({
  points,
  invert = false,
  area = true,
  color = 'var(--clay)',
  height = 190,
  ticks = 4,
  fmt = (v) => int(v),
  highlightLast = true,
}) {
  const data = (points || []).filter((p) => Number.isFinite(p.y));
  if (data.length < 2) {
    return `<div class="empty" style="padding:var(--sp-6) 0">Not enough history to plot</div>`;
  }

  const W = 760;
  const H = height;
  const padL = 42;
  const padR = 14;
  const padT = 14;
  const padB = 26;

  const xs = data.map((_, i) => i);
  const ys = data.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  // Breathing room so the extremes never touch the frame.
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  if (invert) {
    lo = Math.max(1, Math.floor(lo));
    hi = Math.ceil(hi);
  }

  const px = (i) => padL + (i / Math.max(1, xs.length - 1)) * (W - padL - padR);
  const py = (v) => {
    const t = (v - lo) / (hi - lo);
    return invert
      ? padT + t * (H - padT - padB)
      : H - padB - t * (H - padT - padB);
  };

  const path = data.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const areaPath = `${path} L${px(data.length - 1).toFixed(1)},${H - padB} L${px(0).toFixed(1)},${H - padB} Z`;

  const gridVals = [];
  for (let i = 0; i <= ticks; i += 1) gridVals.push(lo + ((hi - lo) * i) / ticks);

  const grid = gridVals
    .map((v) => {
      const y = py(v);
      return `<line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>
        <text x="${padL - 8}" y="${(y + 3.2).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`;
    })
    .join('');

  // x labels: first, middle, last
  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const xLabels = [...new Set(labelIdx)]
    .map((i) => {
      const x = px(i);
      const anchor = i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle';
      return `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(data[i].x)}</text>`;
    })
    .join('');

  const gid = `g${Math.random().toString(36).slice(2, 8)}`;
  const last = data[data.length - 1];
  const lastDot = highlightLast
    ? `<circle class="dot-hi" cx="${px(data.length - 1).toFixed(1)}" cy="${py(last.y).toFixed(1)}" r="3.6"/>
       <text x="${(px(data.length - 1) - 6).toFixed(1)}" y="${(py(last.y) - 9).toFixed(1)}"
         text-anchor="end" style="fill:var(--text);font-size:10.5px">${esc(fmt(last.y))}</text>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Trend chart">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <line class="axis" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>
    ${area ? `<path d="${areaPath}" fill="url(#${gid})"/>` : ''}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    ${lastDot}
    ${xLabels}
  </svg>`;
}

/**
 * Horizontal comparison bars, used for serve/return splits and leaderboards.
 * @param {{label:string,value:number,note?:string,href?:string}[]} rows
 */
export function hbars(rows, { max = null, color = null, digits = 1, suffix = '%' } = {}) {
  if (!rows?.length) return '<div class="dim">No data</div>';
  const maxValue = Math.max(...rows.map((r) => r.value));
  const top = max ?? (maxValue || 1);
  return `<div class="hbars">${rows
    .map((r) => {
      const w = Math.max(1.5, (r.value / top) * 100);
      const label = r.href
        ? `<a class="hbar-l" href="${r.href}">${esc(r.label)}</a>`
        : `<span class="hbar-l">${esc(r.label)}</span>`;
      return `<div class="hbar">
        ${label}
        <span class="hbar-t"><i style="width:${w.toFixed(2)}%${
          color ? `;background:${color}` : ''
        }"></i></span>
        <span class="hbar-v">${r.value.toFixed(digits)}${suffix}${
          r.note ? ` <span class="dim" style="font-size:10px">${esc(r.note)}</span>` : ''
        }</span>
      </div>`;
    })
    .join('')}</div>`;
}

/* ==========================================================================
   Search combobox
   ========================================================================== */

/**
 * Wire the header search box against the player index.
 * @param {HTMLElement} root   element containing [data-search]
 * @param {{i:number,n:string,c:string,r:number}[]} index
 * @param {(id:number)=>void} onPick
 */
export function mountSearch(root, index, onPick) {
  const wrap = root.querySelector('[data-search]');
  if (!wrap) return;
  const input = wrap.querySelector('[data-search-input]');
  const box = wrap.querySelector('[data-search-suggest]');

  const norm = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  // Index both the English and Chinese names so a reader can type either.
  const entries = index.map((p) => ({
    ...p,
    key: norm(p.n),
    zh: zhName(p.i),
  }));

  let results = [];
  let cursor = -1;

  function render() {
    if (!results.length) {
      box.innerHTML = `<div class="s-empty">${pair('未找到球员', 'No player found')}</div>`;
      box.hidden = false;
      return;
    }
    box.innerHTML = results
      .map(
        (p, i) => `<button type="button" data-pick="${p.i}" class="${i === cursor ? 'sel' : ''}">
          ${avatar(p.i, p.n, 28)}
          <span class="s-name">${pair(p.zh, p.n)}</span>
          <span class="flag">${esc(p.c || '')}</span>
          <span class="s-rank">${p.r ? `#${p.r}` : ''}</span>
        </button>`,
      )
      .join('');
    box.hidden = false;
  }

  function search(q) {
    const key = norm(q).trim();
    if (key.length < 2) {
      results = [];
      cursor = -1;
      box.hidden = true;
      return;
    }
    const starts = [];
    const contains = [];
    for (const p of entries) {
      const zhHit = p.zh && p.zh.includes(q.trim());
      if (p.key.startsWith(key)) starts.push(p);
      else if (p.key.includes(key) || zhHit) contains.push(p);
      if (starts.length >= 12) break;
    }
    results = [...starts, ...contains].slice(0, 12);
    cursor = results.length ? 0 : -1;
    render();
  }

  input.addEventListener('input', () => search(input.value));
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) search(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, results.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[cursor];
      if (pick) commit(pick.i);
    } else if (e.key === 'Escape') {
      box.hidden = true;
      input.blur();
    }
  });

  box.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-pick]');
    if (btn) {
      e.preventDefault();
      commit(Number(btn.dataset.pick));
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) box.hidden = true;
  });

  function commit(id) {
    box.hidden = true;
    input.value = '';
    input.blur();
    onPick(id);
  }

  // "/" focuses search from anywhere, the way data tools behave.
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input && !/input|textarea/i.test(document.activeElement?.tagName || '')) {
      e.preventDefault();
      input.focus();
    }
  });
}

/* ==========================================================================
   Sortable table
   ========================================================================== */

/**
 * Attach click-to-sort behaviour to a table.
 * @param {HTMLTableElement} table
 * @param {(key:string, dir:1|-1)=>void} onSort
 */
export function attachSort(table, onSort) {
  table.querySelectorAll('th[data-key]').forEach((th) => {
    th.classList.add('sortable');
    // `data-first="desc"` makes the biggest number land on top on the first
    // click, which is what a reader expects from Points or Titles columns.
    const first = th.dataset.first === 'desc' ? -1 : 1;

    th.addEventListener('click', () => {
      const key = th.dataset.key;
      const dir = th.dataset.dir ? (th.dataset.dir === 'asc' ? -1 : 1) : first;
      table.querySelectorAll('th[data-key]').forEach((o) => {
        delete o.dataset.dir;
        o.classList.remove('sorted');
        const a = o.querySelector('.arrow');
        if (a) a.remove();
      });
      // `dir` is the numeric multiplier applied to the comparison: 1 ascending,
      // -1 descending.  The stored attribute and the arrow both describe that.
      th.dataset.dir = dir === 1 ? 'asc' : 'desc';
      th.classList.add('sorted');
      th.insertAdjacentHTML(
        'beforeend',
        `<span class="arrow">${dir === 1 ? '▲' : '▼'}</span>`,
      );
      onSort(key, dir);
    });
  });
}

export {
  avatar,
  countryName,
  levelName,
  movement,
  pair,
  pct,
  playerName,
  record,
  roundName,
  surfaceName,
};
