/**
 * Rankings — the full official singles ranking table plus its shape:
 * points distribution, national depth and the week's biggest movers.
 */
import { rankings } from '../data.js';
import {
  attachSort,
  countryName,
  hbars,
  lineChart,
  loading,
  movement,
  pair,
  pageHead,
  playerCell,
} from '../ui.js';
import { countryZh, playerZh } from '../i18n.js';
import { dateLabel, esc, int } from '../utils.js';
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
    eyebrow: 'PIF WTA Rankings · 官方单打排名',
    title: pair('官方单打排名', 'Official singles ranking'),
    sub: `WTA 官方发布的 <b>${esc(
      dateLabel(rank.asOf),
    )}</b> 当周榜单，共 ${int(all.length)} 位球员，名次变动与官方公布的上周排名对比。<br>
    <span style="opacity:.7;font-size:13px">As published by the WTA for the week of ${esc(
      dateLabel(rank.asOf),
    )}, with movement against the previous published week.</span>`,
    actions: `<a class="btn" href="https://www.wtatennis.com/rankings/singles" target="_blank" rel="noopener">官方来源 ↗</a>`,
  })}

  <div class="grid c3 mb4" style="margin-bottom:var(--sp-6)">
    ${statCard(pair('世界第一积分', 'Ranking points'), int(all[0].points), pair(playerZh(all[0].id), all[0].name) + ' · No.1')}
    ${statCard(pair('第十名积分', 'Points, world No.10'), int(all[9]?.points), pair(playerZh(all[9]?.id), all[9]?.name || ''))}
    ${statCard(pair('前 100 门槛积分', 'Top-100 cut-off'), int(all[99]?.points), pair(playerZh(all[99]?.id), all[99]?.name || ''))}
  </div>

  <div class="grid c2" style="margin-bottom:var(--sp-6)">
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Rankings curve · 积分曲线</span>
        <h3>${pair('前 100 名各位置积分', 'Ranking points by position, top 100')}</h3></div></div>
      <div class="card-bd">
        ${lineChart({ points: curve, height: 200, area: true, fmt: (v) => int(v) })}
        <p class="dim mt3" style="font-size:12px;margin-bottom:0">
          每个名次对应的 52 周滚动积分。世界第一与追赶者之间的差距，是巡回赛最受关注的数字。
          <span style="opacity:.7">The 52-week rolling points total available at each position.</span>
        </p>
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Average points by band · 分段均分</span>
        <h3>${pair('排名深度分布', 'Depth of the draw')}</h3></div></div>
      <div class="card-bd">
        ${hbars(bands, { suffix: '', digits: 0 })}
      </div>
    </div>
  </div>

  <div class="grid c3" style="margin-bottom:var(--sp-6)">
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Top 100 · 前一百</span><h3>${pair('国家/地区分布', 'National depth')}</h3></div></div>
      <div class="card-bd flush">
        ${countryRows
          .map(
            (r, i) => `<div class="lb-row">
              <span class="lb-i">${i + 1}</span>
              <span class="lb-n"><span class="flag">${esc(r.label)}</span>
                <span style="margin-left:7px;font-size:12.5px">${esc(countryZh(r.label))}</span></span>
              <span class="lb-v">${r.value} <span class="dim" style="font-size:10px">${pair('人', 'players')}</span></span>
            </div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Biggest climbers · 上升</span><h3>${pair('名次上升最多', 'Moving up')}</h3></div></div>
      <div class="card-bd flush">
        ${movers
          .map(
            (p) => `<div class="lb-row">
              <span class="lb-i">${p.rank}</span>
              <span class="lb-n"><a href="#/player/${p.id}">${esc(p.name)}</a></span>
              <span class="lb-v">${movement(p.move)}</span>
            </div>`,
          )
          .join('') || `<div class="empty">${pair('本周没有上升的球员', 'No upward movement this week')}</div>`}
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><div><span class="eyebrow">Biggest slides · 下降</span><h3>${pair('名次下降最多', 'Moving down')}</h3></div></div>
      <div class="card-bd flush">
        ${fallers
          .map(
            (p) => `<div class="lb-row">
              <span class="lb-i">${p.rank}</span>
              <span class="lb-n"><a href="#/player/${p.id}">${esc(p.name)}</a></span>
              <span class="lb-v">${movement(p.move)}</span>
            </div>`,
          )
          .join('') || `<div class="empty">${pair('本周没有下降的球员', 'No downward movement this week')}</div>`}
      </div>
    </div>
  </div>

  <section>
    <div class="sec-hd" style="align-items:center">
      <div><span class="eyebrow">Complete table · 完整榜单</span><h2 style="font-size:20px">${pair('单打排名', 'Singles ranking')}</h2></div>
      <div class="row wrap" style="gap:10px">
        <input type="search" data-q placeholder="${pair('按姓名筛选…', 'Filter by name…')}" aria-label="Filter players"
          style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none;width:170px">
        <select data-country aria-label="Filter by country"
          style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
          <option value="">${pair('全部国家/地区', 'All countries')}</option>
          ${countries
            .map((c) => `<option value="${esc(c)}">${esc(countryZh(c) ? `${countryZh(c)} (${c})` : c)}</option>`)
            .join('')}
        </select>
      </div>
    </div>
    <div class="card">
      <div class="tbl-wrap">
        <table class="tbl" data-table>
          <thead>
            <tr>
              <th class="l" data-key="rank" style="width:64px">${pair('排名', 'Rank')}</th>
              <th class="l" data-key="name">${pair('球员', 'Player')}</th>
              <th class="c" data-key="country">${pair('国家/地区', 'Country')}</th>
              <th data-key="move">${pair('变动', 'Move')}</th>
              <th data-key="played" data-first="desc" class="hide-sm">${pair('参赛', 'Events')}</th>
              <th data-key="points" data-first="desc">${pair('积分', 'Points')}</th>
            </tr>
          </thead>
          <tbody data-body></tbody>
        </table>
      </div>
      <div class="card-bd row between" data-foot style="border-top:1px solid var(--line-soft)">
        <span class="dim" data-count></span>
        <button class="btn" data-more>${pair('再显示 100 位', 'Show 100 more')}</button>
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
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toUpperCase().includes(q) ||
          (playerZh(p.id) || '').includes(query.trim()),
      );
    }
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
          <td class="c">${countryName(p.country)}</td>
          <td>${movement(p.move)}</td>
          <td class="hide-sm num dim">${p.played ?? '—'}</td>
          <td class="num">${int(p.points)}</td>
        </tr>`,
      )
      .join('') || `<tr><td colspan="6"><div class="empty">No players match this filter</div></td></tr>`;

    countEl.innerHTML = pair(
      `显示 ${shown.length} / ${matching.length} 位球员`,
      `Showing ${shown.length} of ${matching.length} players`,
    );
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

function statCard(labelHtml, value, subHtml) {
  return `<div class="card"><div class="card-bd">
    <div class="eyebrow">${labelHtml}</div>
    <b class="num" style="display:block;font-size:30px;font-weight:500;letter-spacing:-0.035em;margin-top:4px">${esc(
      value,
    )}</b>
    <div class="dim" style="font-size:12.5px">${subHtml}</div>
  </div></div>`;
}
