/**
 * Data & methodology — provenance, refresh cadence and licensing.
 */
import { loading, pageHead } from '../ui.js';
import { esc } from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(8);

export async function render(host, _params, ctx) {
  setTitle('Data');

  host.innerHTML = `
  ${pageHead({
    eyebrow: 'Methodology',
    title: 'Where every number comes from',
    sub: 'This dashboard is a read-only view of data the WTA already publishes. Nothing is modelled, estimated or imputed — if a figure is not in the official feed, it is not on this site.',
  })}

  <div class="grid c2">
    <div class="card">
      <div class="card-hd"><h3>Primary source</h3></div>
      <div class="card-bd">
        <p class="prose">All data is retrieved from the public JSON API that powers
        <b>wtatennis.com</b>, the official website of the Hologic WTA Tour:</p>
        <div class="notice mt4" style="border-left-color:var(--clay)">
          <code style="font-family:var(--font-mono);font-size:12px;word-break:break-all">https://api.wtatennis.com/tennis</code>
        </div>
        <p class="prose mt4">The same payloads the official site consumes are requested
        once per build and written to static files. No HTML scraping, no third-party
        data vendor, no manual transcription.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-hd"><h3>Endpoints used</h3></div>
      <div class="card-bd flush">
        ${endpoint('/players/ranked', 'Official singles ranking table (rank, points, movement, events played)')}
        ${endpoint('/players/{id}/detailed', 'Biography record: career W–L, titles, career-high rank, prize money')}
        ${endpoint('/players/{id}/year/{season}', 'Season serve &amp; return statistics')}
        ${endpoint('/players/{id}/ranking', 'Week-by-week singles and doubles ranking history')}
        ${endpoint('/players/{id}/matches', 'Complete singles and doubles match log')}
        ${endpoint('/players/{id}/headtohead/{opponent}', 'Career head-to-head record and every meeting')}
        ${endpoint('/tournaments', 'Tour calendar with draws, surfaces, prize money and champions')}
      </div>
    </div>
  </div>

  <section class="sec">
    <div class="sec-hd"><div><span class="eyebrow">Pipeline</span><h2>How the site is built</h2></div></div>
    <div class="grid c4">
      ${step('01', 'Fetch', 'A Node script walks the official API with a politeness gate and exponential backoff, retrying transient failures.')}
      ${step('02', 'Normalise', 'Raw payloads are trimmed to the fields this dashboard renders, with stable short keys to keep the payload small.')}
      ${step('03', 'Derive', 'Leaderboards, season W–L records and career leaders are computed only from fields the tour already publishes.')}
      ${step('04', 'Publish', 'Everything is written as static JSON next to a dependency-free front end and served from GitHub Pages.')}
    </div>
  </section>

  <section class="sec">
    <div class="grid c2">
      <div class="card">
        <div class="card-hd"><h3>Interpretation notes</h3></div>
        <div class="card-bd">
          <ul class="prose" style="padding-left:18px;margin:0">
            <li><b>Ranking weeks.</b> The WTA publishes rankings on Mondays. The date shown throughout the site is the week the current snapshot belongs to, not the day it was downloaded.</li>
            <li><b>Movement.</b> The arrow compares this week's position with the previous published week, exactly as the official table reports it.</li>
            <li><b>Match records.</b> Season W–L on player pages is counted from the official match log, excluding walkovers and byes that carry no score.</li>
            <li><b>Head-to-head.</b> Career meetings are requested live from the WTA endpoint when you open the comparison page, so they are always current.</li>
            <li><b>Aces and line calling.</b> Ace totals depend on venue technology and are not perfectly comparable between events.</li>
            <li><b>Career figures.</b> Career highs, titles and prize money are taken verbatim from the tour's own biography records, whose "last updated" date is shown on each player page.</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h3>Coverage</h3></div>
        <div class="card-bd flush">
          ${coverage('Singles ranking', 'Top 300 players, current published week')}
          ${coverage('Player biographies', 'Top 300 players')}
          ${coverage('Season statistics', 'Top 300 players, current season')}
          ${coverage('Ranking history', 'Top 300 players, trailing five years, weekly')}
          ${coverage('Match logs', 'Top 60 players, trailing four seasons')}
          ${coverage('Tour calendar', 'Current and previous season, all main-tour levels')}
          ${coverage('Head-to-head', 'Any two ranked players, live from the official endpoint')}
        </div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="grid c2">
      <div class="card">
        <div class="card-hd"><h3>Licensing &amp; attribution</h3></div>
        <div class="card-bd">
          <p class="prose">Player names, ranking data, tournament results and
          biographical text are the property of <b>WTA Tour, Inc.</b> and are used here
          for non-commercial, informational purposes with attribution. Official headshots
          are loaded directly from the WTA's own image host and are not redistributed by
          this project.</p>
          <p class="prose mt4">This site is an independent project. It is
          <b>not affiliated with, endorsed by, or sponsored by the WTA</b>. For
          authoritative information always consult
          <a href="https://www.wtatennis.com" target="_blank" rel="noopener" style="color:var(--clay-soft)">wtatennis.com</a>.</p>
          <p class="prose mt4">The dashboard's own source code is released under the MIT
          licence. The data is <b>not</b> covered by that licence.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h3>Technical</h3></div>
        <div class="card-bd flush">
          ${coverage('Front end', 'Vanilla JavaScript ES modules — no framework, no build step')}
          ${coverage('Charts', 'Hand-rolled SVG, dependency free')}
          ${coverage('Typography', 'System font stack (New York / SF Pro / SF Mono)')}
          ${coverage('Hosting', 'GitHub Pages, static files only')}
          ${coverage('Cookies', 'None. No analytics, no trackers, no third-party scripts')}
          ${coverage('Rendering', 'Fully client side; the site works offline once the JSON is cached')}
        </div>
      </div>
    </div>
  </section>
  `;
}

function endpoint(path, note) {
  return `<div style="padding:11px 20px;border-bottom:1px solid var(--line-soft)">
    <code style="font-family:var(--font-mono);font-size:12px;color:var(--clay-soft);word-break:break-all">${esc(
      path,
    )}</code>
    <div class="dim" style="font-size:12px;margin-top:3px">${note}</div>
  </div>`;
}

function coverage(label, value) {
  return `<div style="display:flex;justify-content:space-between;gap:var(--sp-4);padding:10px 20px;border-bottom:1px solid var(--line-soft)">
    <span class="dim" style="font-size:12.5px">${esc(label)}</span>
    <span style="font-size:12.5px;text-align:right">${esc(value)}</span>
  </div>`;
}

function step(n, title, body) {
  return `<div class="card"><div class="card-bd">
    <span class="num" style="font-size:24px;color:var(--clay);letter-spacing:-0.04em">${esc(n)}</span>
    <h3 style="font-size:16px;margin-top:8px">${esc(title)}</h3>
    <p class="dim" style="font-size:12.5px;margin:8px 0 0;line-height:1.6">${esc(body)}</p>
  </div></div>`;
}
