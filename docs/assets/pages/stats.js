/**
 * Statistics — the season leaderboards.
 *
 * Every board is computed from the official per-player season records that the
 * WTA publishes, so the numbers match wtatennis.com exactly.
 */
import { bios, leaderboards, rankings } from '../data.js';
import { avatar, hbars, loading, pageHead } from '../ui.js';
import { country, esc, int, money, pct } from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(12);

let cache = null;

export async function render(host) {
  setTitle('Statistics');

  if (!cache) {
    const [boards, bio, rank] = await Promise.all([leaderboards(), bios(), rankings()]);
    cache = { boards, bio, rank };
  }
  const { boards, bio, rank } = cache;
  const season = boards.season || new Date().getUTCFullYear();
  const rankById = new Map(rank.players.map((p) => [p.id, p]));

  let active = boards.boards[0]?.key || '';

  host.innerHTML = `
  ${pageHead({
    eyebrow: `Season statistics · ${season}`,
    title: 'Leaders across every measured stroke',
    sub: `Computed from the WTA's official per-player season records. Percentages are season-long aggregates; a minimum match count keeps small samples out of the boards.`,
  })}

  <section class="sec" style="margin-top:0">
    <div class="sec-hd">
      <div><span class="eyebrow">All-time among currently ranked players</span>
        <h2>Career leaders</h2></div>
    </div>
    <div class="grid c3">
      ${careerCard('Singles titles', boards.career.titles, (p) => int(p.titles))}
      ${careerCard(
        'Career match wins',
        boards.career.careerWins,
        (p) => `${int(p.won)} <span class="dim" style="font-size:11px">(${pct(p.pct)})</span>`,
      )}
      ${careerCard('Career prize money', boards.career.prizeMoney, (p) => money(p.prize))}
    </div>
  </section>

  <section class="sec">
    <div class="sec-hd">
      <div><span class="eyebrow">${season} season</span><h2>Serve &amp; return boards</h2></div>
    </div>
    <div class="card mb4" style="margin-bottom:var(--sp-5)">
      <div class="card-bd">
        <div class="chips" data-boards>
          ${boards.boards
            .map(
              (b) =>
                `<button class="chip ${b.key === active ? 'on' : ''}" data-board="${b.key}">${esc(
                  b.label,
                )}</button>`,
            )
            .join('')}
        </div>
      </div>
    </div>
    <div data-board-body></div>
  </section>
  `;

  const body = host.querySelector('[data-board-body]');

  function show(key) {
    const board = boards.boards.find((b) => b.key === key);
    if (!board) {
      body.innerHTML = '<div class="card"><div class="card-bd">No data</div></div>';
      return;
    }
    const unit = board.unit || '';
    body.innerHTML = `
    <div class="grid c2">
      <div class="card">
        <div class="card-hd">
          <div><span class="eyebrow">Top 20</span><h3>${esc(board.label)}</h3></div>
          <span class="dim" style="font-size:11.5px">min. ${board.min} matches</span>
        </div>
        <div class="card-bd flush">
          ${board.rows
            .map((r, i) => {
              const p = rankById.get(r.id);
              const b = bio[r.id] || {};
              return `<div class="lb-row" style="grid-template-columns:24px 30px minmax(0,1fr) auto auto;gap:10px">
                <span class="lb-i">${i + 1}</span>
                ${avatar(r.id, r.name, 30)}
                <span class="lb-n">
                  <a href="#/player/${r.id}">${esc(r.name)}</a>
                  <span class="flag" style="margin-left:6px">${esc(r.country || '')}</span>
                  ${p ? `<span class="dim" style="font-size:11px;margin-left:6px">No.${p.rank}</span>` : ''}
                </span>
                <span class="lb-v">${
                  unit === '%' ? pct(r.value) : int(r.value)
                }</span>
                <span class="dim num" style="font-size:11px;min-width:52px;text-align:right">${
                  r.matches ? `${r.matches} m` : ''
                }</span>
              </div>`;
            })
            .join('')}
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-hd"><h3>How the top 10 compare</h3></div>
          <div class="card-bd">
            ${hbars(
              board.rows.slice(0, 10).map((r) => ({
                label: shortName(r.name),
                value: r.value,
                href: `#/player/${r.id}`,
              })),
              { suffix: unit, digits: unit === '%' ? 1 : 0 },
            )}
          </div>
        </div>
        <div class="card mt5">
          <div class="card-hd"><h3>Board notes</h3></div>
          <div class="card-bd">
            <p class="prose" style="font-size:13px">${esc(boardNote(board.key))}</p>
            <div class="dim mt4" style="font-size:11.5px">
              Source: WTA official player season statistics, season ${season}.
              Values are as published by the tour, aggregated across all main-tour
              events played.
            </div>
          </div>
        </div>
      </div>
    </div>
    `;
  }

  host.querySelector('[data-boards]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-board]');
    if (!btn) return;
    active = btn.dataset.board;
    host
      .querySelectorAll('[data-board]')
      .forEach((b) => b.classList.toggle('on', b === btn));
    show(active);
  });

  show(active);
}

function careerCard(title, rows, fmt) {
  return `<div class="card">
    <div class="card-hd"><h3>${esc(title)}</h3></div>
    <div class="card-bd flush">
      ${rows
        .map(
          (p, i) => `<div class="lb-row">
            <span class="lb-i">${i + 1}</span>
            <span class="lb-n"><a href="#/player/${p.id}">${esc(p.name)}</a>
              <span class="flag" style="margin-left:6px">${esc(p.country || '')}</span>
              ${p.rank ? `<span class="dim" style="font-size:11px;margin-left:6px">No.${p.rank}</span>` : ''}</span>
            <span class="lb-v">${fmt(p)}</span>
          </div>`,
        )
        .join('')}
    </div>
  </div>`;
}

function boardNote(key) {
  const notes = {
    aces: 'Total aces struck across the season. Ace counts are recorded by the official chair umpire and depend on the venue\'s line-calling technology, so they are not perfectly comparable across events.',
    doubleFaults: 'Total double faults. Shown as a leaderboard in its own right because it is one of the few statistics where a low number is the achievement.',
    firstServePct: 'Percentage of first serves that landed in. High first-serve percentages usually trade off against first-serve speed.',
    firstServeWonPct: 'Points won behind the first serve. The single best predictor of a dominant serving week.',
    secondServeWonPct: 'Points won behind the second serve. The statistic that separates the tour\'s best returners from the rest.',
    serviceGamesWonPct: 'Share of service games held. Anything above 75% is elite on the women\'s tour.',
    returnGamesWonPct: 'Share of return games converted into breaks.',
    returnPointsWonPct: 'Share of return points won.',
    breakPointsSavedPct: 'Share of break points faced that were saved.',
    breakPointsConvertedPct: 'Share of break point opportunities converted.',
    totalPointsWonPct: 'Share of all points played that were won — the cleanest single-number summary of a season.',
    servicePointsWonPct: 'Share of service points won.',
  };
  return notes[key] || 'Season aggregate published by the WTA.';
}

function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}
