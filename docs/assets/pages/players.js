/**
 * Players — a browsable directory of everyone in the ranking snapshot, with
 * career context pulled from the official biography records.
 */
import { bios, rankings, seasonStats } from '../data.js';
import { countryName, loading, pair, pageHead, playerCell } from '../ui.js';
import { countryZh, playerZh } from '../i18n.js';
import { esc, int, pct, record, winPct } from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(10);

let cache = null;

export async function render(host) {
  setTitle('Players');

  if (!cache) {
    const [rank, bio, stats] = await Promise.all([rankings(), bios(), seasonStats()]);
    cache = rank.players.map((p) => {
      const b = bio[p.id] || {};
      const s = stats[p.id] || {};
      return {
        ...p,
        age: b.age ?? ageFrom(p.birth),
        titles: b.sglCareerTitles ?? null,
        careerWon: b.sglCareerWon ?? null,
        careerLost: b.sglCareerLost ?? null,
        careerPct: winPct(b.sglCareerWon, b.sglCareerLost),
        highRank: b.sglHighRank ?? null,
        height: b.height || '',
        hand: b.hand || '',
        aces: s.aces ?? null,
        matches: s.matches ?? null,
      };
    });
  }

  const all = cache;
  let query = '';
  let sortKey = 'rank';
  let sortDir = 1;
  let preset = 'all';
  let limit = 60;

  const totalTitles = all.reduce((n, p) => n + (p.titles || 0), 0);
  const youngest = [...all].filter((p) => p.age).sort((a, b) => a.age - b.age)[0];
  const oldest = [...all].filter((p) => p.age).sort((a, b) => b.age - a.age)[0];

  host.innerHTML = `
  ${pageHead({
    eyebrow: 'Player directory · 球员名录',
    title: pair('所有排名球员，一处查全', 'Every ranked player, in one place'),
    sub: `当前单打排名快照中全部 ${int(
      all.length,
    )} 位球员的生涯战绩、最高排名与赛季发球统计。点击任意球员查看完整档案。<br>
    <span style="opacity:.7;font-size:13px">Career records, high rankings and season statistics for every ranked player — select one for the full profile.</span>`,
  })}

  <div class="grid c4" style="margin-bottom:var(--sp-6)">
    ${mini(pair('收录球员', 'Players listed'), int(all.length), pair('当前排名', 'current ranking'))}
    ${mini(pair('冠军总数', 'Combined titles'), int(totalTitles), pair('生涯单打', 'career singles'))}
    ${mini(pair('最年轻', 'Youngest'), youngest ? `${youngest.age}` : '—', youngest ? pair(playerZh(youngest.id), shortName(youngest.name)) : '')}
    ${mini(pair('最资深', 'Most experienced'), oldest ? `${oldest.age}` : '—', oldest ? pair(playerZh(oldest.id), shortName(oldest.name)) : '')}
  </div>

  <div class="sec-hd" style="align-items:center">
    <div class="chips" data-presets>
      ${chip('all', pair('全部球员', 'All players'), preset)}
      ${chip('young', pair('21 岁以下', 'Under 21'), preset)}
      ${chip('titles', pair('多个冠军', 'Multiple titles'), preset)}
      ${chip('form', pair('2026 胜率最高', 'Best 2026 win %'), preset)}
    </div>
    <div class="row wrap" style="gap:10px">
      <input type="search" data-q placeholder="${pair('搜索姓名或国家…', 'Search name or country…')}" aria-label="Search players"
        style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none;width:210px">
      <select data-sort aria-label="Sort players"
        style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
        <option value="rank">${pair('排序：排名', 'Sort: Ranking')}</option>
        <option value="name">${pair('排序：姓名', 'Sort: Name')}</option>
        <option value="age">${pair('排序：年龄', 'Sort: Age')}</option>
        <option value="points">${pair('排序：积分', 'Sort: Ranking points')}</option>
        <option value="titles">${pair('排序：冠军数', 'Sort: Career titles')}</option>
        <option value="careerPct">${pair('排序：胜率', 'Sort: Career win %')}</option>
      </select>
    </div>
  </div>

  <div class="card">
    <div class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th class="l" style="width:64px">${pair('排名', 'Rank')}</th>
            <th class="l">${pair('球员', 'Player')}</th>
            <th class="c hide-sm">${pair('国家/地区', 'Country')}</th>
            <th class="hide-sm">${pair('年龄', 'Age')}</th>
            <th class="hide-sm">${pair('最高', 'High')}</th>
            <th>${pair('冠军', 'Titles')}</th>
            <th class="hide-sm">${pair('生涯胜负', 'Career W–L')}</th>
            <th class="hide-sm">${pair('胜率', 'Win %')}</th>
            <th class="hide-sm">${pair('ACE', 'Aces ’26')}</th>
            <th>${pair('积分', 'Points')}</th>
          </tr>
        </thead>
        <tbody data-body></tbody>
      </table>
    </div>
    <div class="card-bd row between" data-foot style="border-top:1px solid var(--line-soft)">
      <span class="dim" data-count></span>
      <button class="btn" data-more>${pair('再显示 60 位', 'Show 60 more')}</button>
    </div>
  </div>
  `;

  const body = host.querySelector('[data-body]');
  const countEl = host.querySelector('[data-count]');
  const moreBtn = host.querySelector('[data-more]');

  function filtered() {
    const q = query.trim().toUpperCase();
    let rows = all;
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toUpperCase().includes(q) ||
          (p.country || '').toUpperCase().includes(q) ||
          (countryZh(p.country) || '').includes(query.trim()) ||
          (playerZh(p.id) || '').includes(query.trim()),
      );
    }
    if (preset === 'young') rows = rows.filter((p) => p.age && p.age < 21);
    if (preset === 'titles') rows = rows.filter((p) => (p.titles || 0) >= 2);
    if (preset === 'form') {
      rows = rows
        .filter((p) => p.matches && p.matches >= 10)
        .sort((a, b) => b.points - a.points)
        .slice(0, 50);
    }

    const dir = sortDir;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === 'rank' || sortKey === 'age' || sortKey === 'points') {
        return ((av ?? 1e9) - (bv ?? 1e9)) * dir;
      }
      if (sortKey === 'name') return String(av).localeCompare(String(bv)) * dir;
      return ((bv ?? -1) - (av ?? -1)) * (dir === 1 ? 1 : -1);
    });
  }

  function paint() {
    const matching = filtered();
    const shown = matching.slice(0, limit);
    body.innerHTML = shown
      .map(
        (p) => `<tr class="clickable ${p.rank <= 3 ? 'top3' : ''}" data-href="#/player/${p.id}">
          <td class="l rank-cell ${p.rank <= 3 ? 'top' : ''}">${p.rank}</td>
          <td class="l">${playerCell(p, { size: 32, meta: false })}</td>
          <td class="c hide-sm"><span class="flag">${esc(p.country || '')}</span>
            <span class="dim" style="font-size:12px;margin-left:5px">${esc(countryZh(p.country))}</span></td>
          <td class="hide-sm num dim">${p.age ?? '—'}</td>
          <td class="hide-sm num dim">${p.highRank ? `No.${p.highRank}` : '—'}</td>
          <td class="num">${p.titles ?? '—'}</td>
          <td class="hide-sm num dim">${p.careerWon != null ? record(p.careerWon, p.careerLost) : '—'}</td>
          <td class="hide-sm num">${p.careerPct != null ? pct(p.careerPct) : '—'}</td>
          <td class="hide-sm num dim">${p.aces ?? '—'}</td>
          <td class="num">${int(p.points)}</td>
        </tr>`,
      )
      .join('') || `<tr><td colspan="10"><div class="empty">No players match this filter</div></td></tr>`;

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
      limit = 60;
      paint();
    }, 130);
  });

  host.querySelector('[data-sort]').addEventListener('change', (e) => {
    sortKey = e.target.value;
    sortDir = 1;
    paint();
  });

  host.querySelector('[data-presets]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    preset = btn.dataset.preset;
    limit = 60;
    host.querySelectorAll('[data-preset]').forEach((b) =>
      b.classList.toggle('on', b === btn),
    );
    paint();
  });

  moreBtn.addEventListener('click', () => {
    limit += 60;
    paint();
  });

  paint();
}

function chip(key, labelHtml, active) {
  return `<button class="chip ${key === active ? 'on' : ''}" data-preset="${key}">${labelHtml}</button>`;
}

function mini(labelHtml, value, subHtml) {
  return `<div class="card"><div class="card-bd">
    <div class="eyebrow">${labelHtml}</div>
    <b class="num" style="display:block;font-size:26px;font-weight:500;letter-spacing:-0.03em;margin-top:3px">${esc(
      value,
    )}</b>
    <div class="dim" style="font-size:12px">${subHtml}</div>
  </div></div>`;
}

function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function ageFrom(birth) {
  if (!birth) return null;
  const d = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}
