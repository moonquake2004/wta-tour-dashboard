/**
 * Players — a browsable directory of everyone in the ranking snapshot, with
 * career context pulled from the official biography records.
 */
import { bios, rankings, seasonStats } from '../data.js';
import { loading, pageHead, playerCell } from '../ui.js';
import { country, esc, int, pct, record, winPct } from '../utils.js';
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
    eyebrow: 'Player directory',
    title: 'Every ranked player, in one place',
    sub: `Career records, high rankings and season serve statistics for all ${int(
      all.length,
    )} players in the current singles ranking snapshot. Select a player for the full profile.`,
  })}

  <div class="grid c4" style="margin-bottom:var(--sp-6)">
    ${mini('Players listed', int(all.length), 'current ranking')}
    ${mini('Combined titles', int(totalTitles), 'career singles')}
    ${mini('Youngest', youngest ? `${youngest.age}` : '—', youngest ? esc(shortName(youngest.name)) : '')}
    ${mini('Most experienced', oldest ? `${oldest.age}` : '—', oldest ? esc(shortName(oldest.name)) : '')}
  </div>

  <div class="sec-hd" style="align-items:center">
    <div class="chips" data-presets>
      ${chip('all', 'All players', preset)}
      ${chip('young', 'Under 21', preset)}
      ${chip('titles', 'Multiple titles', preset)}
      ${chip('form', 'Best 2026 win %', preset)}
    </div>
    <div class="row wrap" style="gap:10px">
      <input type="search" data-q placeholder="Search name or country…" aria-label="Search players"
        style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none;width:210px">
      <select data-sort aria-label="Sort players"
        style="padding:7px 11px;background:var(--panel);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
        <option value="rank">Sort: Ranking</option>
        <option value="name">Sort: Name</option>
        <option value="age">Sort: Age</option>
        <option value="points">Sort: Ranking points</option>
        <option value="titles">Sort: Career titles</option>
        <option value="careerPct">Sort: Career win %</option>
      </select>
    </div>
  </div>

  <div class="card">
    <div class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th class="l" style="width:56px">Rank</th>
            <th class="l">Player</th>
            <th class="c hide-sm">Country</th>
            <th class="hide-sm">Age</th>
            <th class="hide-sm">High</th>
            <th>Titles</th>
            <th class="hide-sm">Career W–L</th>
            <th class="hide-sm">Win %</th>
            <th class="hide-sm">Aces ’26</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody data-body></tbody>
      </table>
    </div>
    <div class="card-bd row between" data-foot style="border-top:1px solid var(--line-soft)">
      <span class="dim" data-count></span>
      <button class="btn" data-more>Show 60 more</button>
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
          (p.country || '').toUpperCase().includes(q),
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
          <td class="l">${playerCell(p, { size: 32 })}</td>
          <td class="c hide-sm">${country(p.country)}</td>
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

function chip(key, label, active) {
  return `<button class="chip ${key === active ? 'on' : ''}" data-preset="${key}">${label}</button>`;
}

function mini(label, value, sub) {
  return `<div class="card"><div class="card-bd">
    <div class="eyebrow">${esc(label)}</div>
    <b class="num" style="display:block;font-size:26px;font-weight:500;letter-spacing:-0.03em;margin-top:3px">${esc(
      value,
    )}</b>
    <div class="dim" style="font-size:12px">${esc(sub)}</div>
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
