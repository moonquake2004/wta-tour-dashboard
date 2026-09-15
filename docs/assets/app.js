/**
 * Application shell: hash router, header/footer chrome, global search.
 *
 * Hash routing is deliberate — the site is published as static files on GitHub
 * Pages, so no server-side rewrite rules are needed and deep links survive.
 */
import { rankings, playerIndex } from './data.js';
import { footer, header, mountSearch } from './ui.js';
import { errorState, dateLabel } from './utils.js';

import * as home from './pages/home.js';
import * as rankingsPage from './pages/rankings.js';
import * as players from './pages/players.js';
import * as player from './pages/player.js';
import * as compare from './pages/compare.js';
import * as calendar from './pages/calendar.js';
import * as stats from './pages/stats.js';
import * as about from './pages/about.js';

const ROUTES = [
  { pattern: /^\/?$/, view: home },
  { pattern: /^\/rankings\/?$/, view: rankingsPage },
  { pattern: /^\/players\/?$/, view: players },
  { pattern: /^\/player\/(\d+)\/?$/, view: player, keys: ['id'] },
  { pattern: /^\/compare\/?(\d+)?\/?(\d+)?\/?$/, view: compare, keys: ['a', 'b'] },
  { pattern: /^\/calendar\/?$/, view: calendar },
  { pattern: /^\/stats\/?$/, view: stats },
  { pattern: /^\/about\/?$/, view: about },
];

const app = document.getElementById('app');

/** Shared, lazily-populated app state. */
export const state = {
  asOf: null,
  generatedAt: null,
  index: [],
};

function match(hash) {
  const route = hash.replace(/^#/, '') || '/';
  for (const r of ROUTES) {
    const m = r.pattern.exec(route);
    if (m) {
      const params = {};
      (r.keys || []).forEach((k, i) => {
        params[k] = m[i + 1] ? Number(m[i + 1]) : null;
      });
      return { view: r.view, params, route };
    }
  }
  return { view: null, params: {}, route };
}

function renderShell(route) {
  app.innerHTML = `<div data-header></div><main data-main></main><div data-footer></div>`;
  app.querySelector('[data-header]').innerHTML = header({
    route,
    asOf: state.asOf ? dateLabel(state.asOf) : '—',
  });
  app.querySelector('[data-footer]').innerHTML = footer({
    asOf: state.asOf ? dateLabel(state.asOf) : '—',
    generatedAt: state.generatedAt,
  });
  return {
    header: app.querySelector('[data-header]'),
    main: app.querySelector('[data-main]'),
    footer: app.querySelector('[data-footer]'),
  };
}

let currentToken = 0;

async function route() {
  const { view, params, route: hash } = match(location.hash);
  const token = ++currentToken;
  const { header: headerEl, main } = renderShell(hash);

  mountSearch(headerEl, state.index, (id) => {
    location.hash = `#/player/${id}`;
  });

  if (!view) {
    main.innerHTML = `<div class="page shell">${errorState(
      'Page not found',
      `No view matches ${hash || '/'}`,
    )}</div>`;
    window.scrollTo({ top: 0 });
    return;
  }

  main.innerHTML = `<div class="page shell"><div data-view>${view.skeleton?.() || ''}</div></div>`;
  const host = main.querySelector('[data-view]');

  try {
    await view.render(host, params, { token, currentToken: () => currentToken });
  } catch (err) {
    console.error(err);
    if (token === currentToken) {
      host.innerHTML = errorState(err.message || 'Unexpected error', String(err.stack || '').slice(0, 200));
    }
  }

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

window.addEventListener('hashchange', route);

/* Document title follows the active view. */
export function setTitle(text) {
  document.title = text ? `${text} · WTA Tour Dashboard` : 'WTA Tour Dashboard';
}

/** Programmatic navigation helper for views. */
export function go(hash) {
  location.hash = hash;
}

async function boot() {
  try {
    const [r, idx] = await Promise.all([rankings(), playerIndex()]);
    state.asOf = r.asOf;
    state.generatedAt = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    state.index = idx;
  } catch (err) {
    app.innerHTML = `<div class="page shell">${errorState(
      'Could not reach the data files',
      err.message,
    )}</div>`;
    return;
  }
  await route();
}

// Handle image fallbacks for missing official headshots.
window.__wtaImgFallback = (img) => {
  const initials = img.dataset.initials || '';
  const size = img.getAttribute('width') || 34;
  const span = document.createElement('span');
  span.className = img.className;
  span.style.cssText = `width:${size}px;height:${size}px;display:grid;place-items:center;background:var(--panel-hi);color:var(--text-3);font-family:var(--font-mono);font-size:${Math.max(
    9,
    size / 3,
  )}px;letter-spacing:0.02em`;
  span.textContent = initials;
  img.replaceWith(span);
};

boot();
