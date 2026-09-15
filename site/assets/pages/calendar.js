/**
 * Calendar — the official WTA Tour calendar with results.
 *
 * Events come from the official tournaments feed, grouped by month and
 * filterable by level, surface and season.
 */
import { tournaments } from '../data.js';
import { avatar, empty, loading, pageHead } from '../ui.js';
import {
  esc,
  int,
  levelTag,
  money,
  monthDay,
  surfaceChip,
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
    eyebrow: 'Tour calendar',
    title: 'The WTA season, event by event',
    sub: `Every main-tour event the WTA publishes — Grand Slams, WTA 1000, 500, 250 and 125 — with surface, prize money and the champion where the event has finished.`,
    actions: `<a class="btn" href="https://www.wtatennis.com/tournaments" target="_blank" rel="noopener">Source ↗</a>`,
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
            <option value="">All levels</option>
            ${levels.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}
          </select>
          <select data-surface aria-label="Filter by surface"
            style="padding:7px 11px;background:var(--panel-2);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
            <option value="">All surfaces</option>
            ${surfaces.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
          <select data-status aria-label="Filter by status"
            style="padding:7px 11px;background:var(--panel-2);border:1px solid var(--line);border-radius:3px;font-size:13px;outline:none">
            <option value="">Any status</option>
            <option value="past">Completed</option>
            <option value="upcoming">Upcoming</option>
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
      ['Events', int(all.length), `${past.length} completed`],
      ['Grand Slams', int(grand.length), grand.map((g) => g.name).join(' · ') || '—'],
      ['Countries', int(new Set(all.map((e) => e.country).filter(Boolean)).size), 'host nations'],
      ['Total prize money', prize ? money(prize) : '—', 'published totals'],
    ]
      .map(
        ([label, value, sub]) => `<div class="card"><div class="card-bd">
          <div class="eyebrow">${esc(label)}</div>
          <b class="num" style="display:block;font-size:24px;font-weight:500;letter-spacing:-0.03em;margin-top:3px">${esc(
            value,
          )}</b>
          <div class="dim" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(
            sub,
          )}</div>
        </div></div>`,
      )
      .join('');

    if (!all.length) {
      list.innerHTML = `<div class="card"><div class="card-bd">${empty(
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
            <h2 style="font-size:19px">${events.length} event${events.length > 1 ? 's' : ''}</h2></div>
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
                    <div class="e-name">${esc(e.name)}</div>
                    <div class="e-sub">
                      ${levelTag(e.level)}
                      ${surfaceChip(e.surface)}
                      <span class="dim">${esc(e.city || '')}${
                        e.country ? `, ${esc(e.country)}` : ''
                      }</span>
                      ${e.drawSize ? `<span class="dim">· ${e.drawSize} draw</span>` : ''}
                      ${e.prize ? `<span class="dim">· ${esc(money(e.prize, e.currency))}</span>` : ''}
                    </div>
                  </div>
                  <span class="e-lvl">${
                    e.status === 'past'
                      ? '<span class="tag">Completed</span>'
                      : '<span class="tag live">Upcoming</span>'
                  }</span>
                  <span class="e-champ">${
                    e.champion
                      ? `${avatar(e.champion.id, e.champion.name, 26)}
                         <a href="#/player/${e.champion.id}" style="font-size:12.5px">${esc(
                           shortName(e.champion.name),
                         )}</a>`
                      : e.status === 'past'
                        ? '<span class="dim" style="font-size:12px">—</span>'
                        : '<span class="dim" style="font-size:12px">to be decided</span>'
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
