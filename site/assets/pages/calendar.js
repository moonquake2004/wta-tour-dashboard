/**
 * Calendar — the official WTA Tour calendar with results.
 *
 * Events come from the official tournaments feed, grouped by month and
 * filterable by level, surface and season.
 */
import { tournaments } from '../data.js';
import { avatar, empty, levelTag, loading, pair, pageHead, surfaceChip } from '../ui.js';
import { countryZh, playerZh, tournamentZh } from '../i18n.js';
import {
  esc,
  int,
  money,
  monthDay,
} from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(12);

let cache = null;

export async function render(host) {
  setTitle('Calendar');

  const tour = cache || (cache = await tournaments());

  const seasons = [...new Set(tour.events.map((e) => e.year))].sort((a, b) => b - a);
  const levels = [
    'Grand Slam',
    'WTA Finals',
    'WTA 1000',
    'WTA 500',
    'WTA 250',
    'WTA 125',
  ].filter((l) => tour.events.some((e) => e.level === l));
  const surfaces = [...new Set(tour.events.map((e) => e.surface).filter(Boolean))];

  let year = seasons[0];
  let level = '';
  let surface = '';
  let status = '';

  const monthName = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

  host.innerHTML = `
  ${pageHead({
    eyebrow: 'Tour calendar · 巡回赛赛程',
    title: pair('WTA 赛季，逐站呈现', 'The WTA season, event by event'),
    sub: `WTA 官方发布的全部主巡回赛赛事——大满贯、WTA 1000 / 500 / 250 / 125——含场地类型、奖金，以及已结束赛事的冠军。<br>
    <span style="opacity:.7;font-size:13px">Every main-tour event the WTA publishes, with surface, prize money and the champion where the event has finished.</span>`,
    actions: `<a class="btn" href="https://www.wtatennis.com/tournaments" target="_blank" rel="noopener">官方来源 ↗</a>`,
  })}

  <div class="card mb4" style="margin-bottom:var(--sp-6)">
    <div class="card-bd">
      <div class="row wrap between" style="gap:var(--sp-4)">
        <div class="chips" data-years>
          ${seasons
            .map(
              (y) =>
                `<button class="chip ${y === year ? 'on' : ''}" data-year="${y}">${y}</button>`,
            )
            .join('')}
        </div>
        <div class="row wrap" style="gap:8px">
          <select data-level aria-label="Filter by level"
            style="padding:7px 11px;background:var(--panel-2);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
            <option value="">${pair('全部级别', 'All levels')}</option>
            ${levels.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}
          </select>
          <select data-surface aria-label="Filter by surface"
            style="padding:7px 11px;background:var(--panel-2);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
            <option value="">${pair('全部场地', 'All surfaces')}</option>
            ${surfaces.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
          <select data-status aria-label="Filter by status"
            style="padding:7px 11px;background:var(--panel-2);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
            <option value="">${pair('全部状态', 'Any status')}</option>
            <option value="past">${pair('已结束', 'Completed')}</option>
            <option value="upcoming">${pair('未开始', 'Upcoming')}</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <div data-summary class="grid c4" style="margin-bottom:var(--sp-5)"></div>
  <div data-list></div>
  `;

  const summary = host.querySelector('[data-summary]');
  const list = host.querySelector('[data-list]');

  function rows() {
    return tour.events
      .filter((e) => e.year === year)
      .filter((e) => !level || e.level === level)
      .filter((e) => !surface || (e.surface || '').toUpperCase() === surface.toUpperCase())
      .filter((e) =>
        !status ? true : status === 'past' ? e.status === 'past' : e.status !== 'past',
      )
      .sort((a, b) => (a.start < b.start ? -1 : 1));
  }

  function paint() {
    const all = rows();
    const past = all.filter((e) => e.status === 'past');
    const grand = all.filter((e) => e.level === 'Grand Slam');
    const prize = all.reduce((n, e) => n + (e.prize || 0), 0);

    summary.innerHTML = [
      [pair('赛事数量', 'Events'), int(all.length), pair(`${past.length} 项已结束`, `${past.length} completed`)],
      [pair('大满贯', 'Grand Slams'), int(grand.length), grand.map((g) => tournamentZh(g.name) || g.name).join(' · ') || '—'],
      [pair('举办国家/地区', 'Countries'), int(new Set(all.map((e) => e.country).filter(Boolean)).size), pair('东道主', 'host nations')],
      [pair('奖金总额', 'Total prize money'), prize ? money(prize) : '—', pair('官方公布数据', 'published totals')],
    ]
      .map(
        ([label, value, sub]) => `<div class="card"><div class="card-bd">
          <div class="eyebrow">${label}</div>
          <b class="num" style="display:block;font-size:24px;font-weight:500;letter-spacing:-0.03em;margin-top:3px">${esc(
            value,
          )}</b>
          <div class="dim" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sub}</div>
        </div></div>`,
      )
      .join('');

    if (!all.length) {
      list.innerHTML = `<div class="card"><div class="card-bd">${empty(
        '没有符合筛选条件的赛事',
        'No events match these filters',
      )}</div></div>`;
      return;
    }

    const groups = new Map();
    for (const e of all) {
      const key = e.start.slice(0, 7);
      groups.set(key, [...(groups.get(key) || []), e]);
    }

    list.innerHTML = [...groups.entries()]
      .map(
        ([key, events]) => `
      <section class="sec" style="margin-top:var(--sp-6)">
        <div class="sec-hd">
          <div><span class="eyebrow">${esc(monthName(events[0].start))}</span>
            <h2 style="font-size:19px">${pair(`${events.length} 项赛事`, `${events.length} event${events.length > 1 ? 's' : ''}`)}</h2></div>
        </div>
        <div class="card">
          <div class="events">
            ${events
              .map(
                (e) => `<div class="event">
                  <span class="e-date">${esc(monthDay(e.start))}<br><span class="dim">${esc(
                    shortDate(e.end),
                  )}</span></span>
                  <div style="min-width:0">
                    <div class="e-name">${pair(tournamentZh(e.name), e.name)}</div>
                    <div class="e-sub">
                      ${levelTag(e.level)}
                      ${surfaceChip(e.surface)}
                      <span class="dim">${esc(e.city || '')}${
                        e.country ? ` · ${esc(countryZh(e.country) || e.country)}` : ''
                      }</span>
                      ${e.drawSize ? `<span class="dim">· ${e.drawSize} ${pair('签位', 'draw')}</span>` : ''}
                      ${e.prize ? `<span class="dim">· ${esc(money(e.prize, e.currency))}</span>` : ''}
                    </div>
                  </div>
                  <span class="e-lvl">${
                    e.status === 'past'
                      ? `<span class="tag">${pair('已结束', 'Completed')}</span>`
                      : `<span class="tag live">${pair('未开始', 'Upcoming')}</span>`
                  }</span>
                  <span class="e-champ">${
                    e.champion
                      ? `${avatar(e.champion.id, e.champion.name, 26)}
                         <a href="#/player/${e.champion.id}" style="font-size:12.5px">${pair(
                           playerZh(e.champion.id),
                           shortName(e.champion.name),
                         )}</a>`
                      : e.status === 'past'
                        ? '<span class="dim" style="font-size:12px">—</span>'
                        : `<span class="dim" style="font-size:12px">${pair('待定', 'to be decided')}</span>`
                  }</span>
                </div>`,
              )
              .join('')}
          </div>
        </div>
      </section>`,
      )
      .join('');
  }

  host.querySelector('[data-years]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-year]');
    if (!btn) return;
    year = Number(btn.dataset.year);
    host
      .querySelectorAll('[data-year]')
      .forEach((b) => b.classList.toggle('on', b === btn));
    paint();
  });
  host.querySelector('[data-level]').addEventListener('change', (e) => {
    level = e.target.value;
    paint();
  });
  host.querySelector('[data-surface]').addEventListener('change', (e) => {
    surface = e.target.value;
    paint();
  });
  host.querySelector('[data-status]').addEventListener('change', (e) => {
    status = e.target.value;
    paint();
  });

  paint();
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}
