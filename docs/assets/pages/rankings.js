/**
 * Rankings — the full official singles ranking table plus its shape:
 * points distribution, national depth and the week's biggest movers.
 */
import { rankings } from '../data.js';
import {
  attachSort,
  hbars,
  lineChart,
  loading,
  movement,
  pageHead,
  playerCell,
} from '../ui.js';
import { country, dateLabel, esc, int } from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(12);

let cache = null;

export async function render(host) {
  setTitle('Rankings');
  const rank = cache || (cache = await rankings());
  const all = rank.players;

  let query = '';
  let countryFilter = '';
  let sortKey = 'rank';
  let sortDir = 1;
  let limit = 100;

  const countries = [...new Set(all.map((p) => p.country).filter(Boolean))].sort();

  const byCountry = new Map();
  for (const p of all.slice(0, 100)) {
    byCountry.set(p.country, (byCountry.get(p.country) || 0) + 1);
  }
  const countryRows = [...byCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([c, n]) => ({ label: c, value: n }));

  const movers = all
    .filter((p) => p.rank <= 150 && p.move > 0)
    .sort((a, b) => b.move - a.move)
    .slice(0, 6);

  const fallers = all
    .filter((p) => p.rank <= 150 && p.move < 0)
    .sort((a, b) => a.move - b.move)
    .slice(0, 6);

  // Points by rank band — shows how steeply the tour cliffs off.
  const bands = [
    { label: 'No.1', from: 1, to: 1 },
    { label: '2–5', from: 2, to: 5 },
    { label: '6–10', from: 6, to: 10 },
    { label: '11–20', from: 11, to: 20 },
    { label: '21–50', from: 21, to: 50 },
    { label: '51–100', from: 51, to: 100 },
    { label: '101–200', from: 101, to: 200 },
    { label: '201+', from: 201, to: 9999 },
  ]
    .map((b) => {
      const rows = all.filter((p) => p.rank >= b.from && p.rank <= b.to);
      if (!rows.length) return null;
      const avg = rows.reduce((n, p) => n + p.points, 0) / rows.length;
      return { label: b.label, value: Math.round(avg), note: `${rows.length}p` };
    })
    .filter(Boolean);

  // Top-100 points curve, the classic "how far ahead is No.1" chart.
  const curve = all
    .slice(0, 100)
    .map((p) => ({ x: String(p.rank), y: p.points }));

  host.innerHTML = `
  ${pageHead({
    eyebrow: 'PIF WTA Rankings · Singles',
    title: 'Official singles ranking',
    sub: `As published by the WTA for the week of <b>${esc(
      dateLabel(rank.asOf),
    )}</b>. ${int(all.length)} ranked players, with movement against the previous published week.`,
    actions: `<a class="btn" href="https://www.wtatennis.com/rankings/singles" target="_blank" rel="noopener">Source ↗</a>`,
  })}

  <div class="grid c3 mb4" style="margin-bottom:var(--sp-6)">
    ${statCard('Ranking points', int(all[0].points), `${esc(all[0].name)} · No.1`)}
    ${statCard('Points, world No.10', int(all[9]?.points), `${esc(all[9]?.name || '')}`)}
    ${statCard('Top-100 cut-off', int(all[99]?.points), `${esc(all[99]?.name || '')}`)}
  </div>

  <div class="grid c2" style="margin-bottom:var(--sp-6)">
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Rankings curve</span>
        <h3>Ranking points by position, top 100</h3></div></div>
      <div class="card-bd">
        ${lineChart({ points: curve, height: 200, area: true, fmt: (v) => int(v) })}
        <p class="dim mt3" style="font-size:12px;margin-bottom:0">
          The 52-week rolling points total available at each position. The gap
          between No.1 and the chasing pack is the tour's most-watched number.
        </p>
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Average points by band</span>
        <h3>Depth of the draw</h3></div></div>
      <div class="card-bd">
        ${hbars(bands, { suffix: '', digits: 0 })}
      </div>
    </div>
  </div>

  <div class="grid c3" style="margin-bottom:var(--sp-6)">
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Top 100</span><h3>National depth</h3></div></div>
      <div class="card-bd flush">
        ${countryRows
          .map(
            (r, i) => `<div class="lb-row">
              <span class="lb-i">${i + 1}</span>
              <span class="lb-n"><span class="flag">${esc(r.label)}</span></span>
              <span class="lb-v">${r.value} <span class="dim" style="font-size:10px">players</span></span>
            </div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Biggest climbers</span><h3>Moving up</h3></div></div>
      <div class="card-bd flush">
        ${movers
          .map(
            (p) => `<div class="lb-row">
              <span class="lb-i">${p.rank}</span>
              <span class="lb-n"><a href="#/player/${p.id}">${esc(p.name)}</a></span>
              <span class="lb-v">${movement(p.move)}</span>
            </div>`,
          )
          .join('') || '<div class="empty">No upward movement this week</div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Biggest slides</span><h3>Moving down</h3></div></div>
      <div class="card-bd flush">
        ${fallers
          .map(
            (p) => `<div class="lb-row">
              <span class="lb-i">${p.rank}</span>
              <span class="lb-n"><a href="#/player/${p.id}">${esc(p.name)}</a></span>
              <span class="lb-v">${movement(p.move)}</span>
            </div>`,
          )
          .join('') || '<div class="empty">No downward movement this week</div>'}
      </div>
    </div>
  </div>

  <section>
    <div class="sec-hd" style="align-items:center">
      <div><span class="eyebrow">Complete table</span><h2 style="font-size:20px">Singles ranking</h2></div>
      <div class="row wrap" style="gap:10px">
        <input type="search" data-q placeholder="Filter by name…" aria-label="Filter players"
          style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none;width:170px">
        <select data-country aria-label="Filter by country"
          style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
          <option value="">All countries</option>
          ${countries.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card">
      <div class="tbl-wrap">
        <table class="tbl" data-table>
          <thead>
            <tr>
              <th class="l" data-key="rank" style="width:60px">Rank</th>
              <th class="l" data-key="name">Player</th>
              <th class="c" data-key="country">Country</th>
              <th data-key="move">Move</th>
              <th data-key="played" data-first="desc" class="hide-sm">Events</th>
              <th data-key="points" data-first="desc">Points</th>
            </tr>
          </thead>
          <tbody data-body></tbody>
        </table>
      </div>
      <div class="card-bd row between" data-foot style="border-top:1px solid var(--line-soft)">
        <span class="dim" data-count></span>
        <button class="btn" data-more>Show 100 more</button>
      </div>
    </div>
  </section>
  `;

  const table = host.querySelector('[data-table]');
  const body = host.querySelector('[data-body]');
  const foot = host.querySelector('[data-foot]');
  const moreBtn = host.querySelector('[data-more]');
  const countEl = host.querySelector('[data-count]');

  /** Column definitions: how to read a value, and which way "first click" goes. */
  const COLUMNS = {
    rank: { get: (p) => p.rank, type: 'number', natural: 1 },
    name: { get: (p) => p.name, type: 'string', natural: 1 },
    country: { get: (p) => p.country || '', type: 'string', natural: 1 },
    move: { get: (p) => p.move ?? 0, type: 'number', natural: -1 },
    played: { get: (p) => p.played ?? 0, type: 'number', natural: -1 },
    points: { get: (p) => p.points ?? 0, type: 'number', natural: -1 },
  };

  function filtered() {
    const q = query.trim().toUpperCase();
    let rows = all;
    if (q) rows = rows.filter((p) => p.name.toUpperCase().includes(q));
    if (countryFilter) rows = rows.filter((p) => p.country === countryFilter);

    const col = COLUMNS[sortKey] || COLUMNS.rank;
    const dir = sortDir;
    return [...rows].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      const cmp =
        col.type === 'string'
          ? String(av).localeCompare(String(bv), 'en')
          : Number(av) - Number(bv);
      return cmp * dir;
    });
  }

  function paint() {
    const matching = filtered();
    const shown = matching.slice(0, limit);
    body.innerHTML = shown
      .map(
        (p) => `<tr class="clickable ${p.rank <= 3 ? 'top3' : ''}" data-href="#/player/${p.id}">
          <td class="l rank-cell ${p.rank <= 3 ? 'top' : ''}">${p.rank}</td>
          <td class="l">${playerCell(p, { size: 32 })}</td>
          <td class="c">${country(p.country)}</td>
          <td>${movement(p.move)}</td>
          <td class="hide-sm num dim">${p.played ?? '—'}</td>
          <td class="num">${int(p.points)}</td>
        </tr>`,
      )
      .join('') || `<tr><td colspan="6"><div class="empty">No players match this filter</div></td></tr>`;

    countEl.textContent = `Showing ${shown.length} of ${matching.length} players`;
    moreBtn.style.display = matching.length > shown.length ? '' : 'none';

    body.querySelectorAll('tr[data-href]').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        location.hash = tr.dataset.href;
      });
    });
  }

  let timer;
  host.querySelector('[data-q]').addEventListener('input', (e) => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => {
      query = v;
      limit = 100;
      paint();
    }, 130);
  });

  host.querySelector('[data-country]').addEventListener('change', (e) => {
    countryFilter = e.target.value;
    limit = 100;
    paint();
  });

  moreBtn.addEventListener('click', () => {
    limit += 100;
    paint();
  });

  // The arrow shown in the header must reflect the direction actually applied.
  table.querySelectorAll('th[data-key]').forEach((th) => {
    th.dataset.first = (COLUMNS[th.dataset.key]?.natural ?? 1) === -1 ? 'desc' : 'asc';
  });

  attachSort(table, (key, dir) => {
    sortKey = key;
    sortDir = dir;
    paint();
  });

  paint();
}

function statCard(label, value, sub) {
  return `<div class="card"><div class="card-bd">
    <div class="eyebrow">${esc(label)}</div>
    <b class="num" style="display:block;font-size:30px;font-weight:500;letter-spacing:-0.035em;margin-top:4px">${esc(
      value,
    )}</b>
    <div class="dim" style="font-size:12.5px">${esc(sub)}</div>
  </div></div>`;
}
