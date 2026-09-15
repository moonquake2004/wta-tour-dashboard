/**
 * Statistics — the season leaderboards.
 *
 * Every board is computed from the official per-player season records that the
 * WTA publishes, so the numbers match wtatennis.com exactly.
 */
import { bios, leaderboards, rankings } from '../data.js';
import { avatar, countryName, hbars, loading, pair, pageHead } from '../ui.js';
import { playerZh } from '../i18n.js';
import { esc, int, money, pct } from '../utils.js';
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
    eyebrow: `Season statistics · ${season} 赛季统计`,
    title: pair('每一项技术统计的领跑者', 'Leaders across every measured stroke'),
    sub: `${season} 赛季各项技术的领跑榜，全部由 WTA 官方发布的球员赛季记录计算得出。百分比为全赛季汇总值，并设置最低场次门槛以排除小样本。<br>
    <span style="opacity:.7;font-size:13px">Computed from the WTA's official per-player season records.</span>`,
  })}

  <section class="sec" style="margin-top:0">
    <div class="sec-hd">
      <div><span class="eyebrow">All-time among currently ranked players · 生涯数据</span>
        <h2>${pair('生涯领跑榜', 'Career leaders')}</h2></div>
    </div>
    <div class="grid c3">
      ${careerCard(pair('单打冠军数', 'Singles titles'), boards.career.titles, (p) => int(p.titles))}
      ${careerCard(
        pair('生涯胜场', 'Career match wins'),
        boards.career.careerWins,
        (p) => `${int(p.won)} <span class="dim" style="font-size:11px">(${pct(p.pct)})</span>`,
      )}
      ${careerCard(pair('生涯奖金', 'Career prize money'), boards.career.prizeMoney, (p) => money(p.prize))}
    </div>
  </section>

  <section class="sec">
    <div class="sec-hd">
      <div><span class="eyebrow">${season} ${pair('赛季', 'season')}</span><h2>${pair('发球与接发排行榜', 'Serve &amp; return boards')}</h2></div>
    </div>
    <div class="card mb4" style="margin-bottom:var(--sp-5)">
      <div class="card-bd">
        <div class="chips" data-boards>
          ${boards.boards
            .map(
              (b) =>
                `<button class="chip ${b.key === active ? 'on' : ''}" data-board="${b.key}">${
                  BOARD_ZH[b.key] ? pair(BOARD_ZH[b.key], b.label) : esc(b.label)
                }</button>`,
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
          <div><span class="eyebrow">Top 20 · 前二十</span><h3>${
            BOARD_ZH[board.key] ? pair(BOARD_ZH[board.key], board.label) : esc(board.label)
          }</h3></div>
          <span class="dim" style="font-size:11.5px">${pair(`至少 ${board.min} 场`, `min. ${board.min} matches`)}</span>
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
                  <a href="#/player/${r.id}">${pair(playerZh(r.id), r.name)}</a>
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
          <div class="card-hd"><h3>${pair('前十对比', 'How the top 10 compare')}</h3></div>
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
          <div class="card-hd"><h3>${pair('榜单说明', 'Board notes')}</h3></div>
          <div class="card-bd">
            <p class="prose" style="font-size:13px">${
              BOARD_NOTE_ZH[board.key] ? pair(BOARD_NOTE_ZH[board.key], boardNote(board.key)) : esc(boardNote(board.key))
            }</p>
            <div class="dim mt4" style="font-size:11.5px">
              ${pair(
                `数据来源：WTA 官方球员赛季统计，${season} 赛季。数值为巡回赛公布值，汇总自所参加的全部主巡回赛赛事。`,
                `Source: WTA official player season statistics, season ${season}. Values are as published by the tour.`,
              )}
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

function careerCard(titleHtml, rows, fmt) {
  return `<div class="card">
    <div class="card-hd"><h3>${titleHtml}</h3></div>
    <div class="card-bd flush">
      ${rows
        .map(
          (p, i) => `<div class="lb-row">
            <span class="lb-i">${i + 1}</span>
            <span class="lb-n"><a href="#/player/${p.id}">${pair(playerZh(p.id), p.name)}</a>
              <span class="flag" style="margin-left:6px">${esc(p.country || '')}</span>
              ${p.rank ? `<span class="dim" style="font-size:11px;margin-left:6px">No.${p.rank}</span>` : ''}</span>
            <span class="lb-v">${fmt(p)}</span>
          </div>`,
        )
        .join('')}
    </div>
  </div>`;
}

/** Chinese labels for the twelve statistic boards. */
const BOARD_ZH = {
  aces: 'ACE 球',
  doubleFaults: '双误',
  firstServePct: '一发成功率',
  firstServeWonPct: '一发得分率',
  secondServeWonPct: '二发得分率',
  serviceGamesWonPct: '发球局胜率',
  returnGamesWonPct: '接发局胜率',
  returnPointsWonPct: '接发得分率',
  breakPointsSavedPct: '破发点挽救率',
  breakPointsConvertedPct: '破发点转化率',
  totalPointsWonPct: '总得分率',
  servicePointsWonPct: '发球得分率',
};

/** Chinese explanations for the boards. */
const BOARD_NOTE_ZH = {
  aces: '整个赛季发出的 ACE 球总数。ACE 由主裁与赛场线审设备记录，不同赛事的判定技术不同，因此跨赛事并不完全可比。',
  doubleFaults: '双误总数。这是一项"越低越好"的统计，因此单独成榜。',
  firstServePct: '一发落入有效区的比例。一发成功率高的球员，通常在一发球速上有所取舍。',
  firstServeWonPct: '一发得分率——判断一周发球是否具有统治力的最佳单一指标。',
  secondServeWonPct: '二发得分率。这一项最能区分巡回赛顶级接发球员与其他球员。',
  serviceGamesWonPct: '发球局保发比例。在女子巡回赛中，超过 75% 已属顶级水平。',
  returnGamesWonPct: '接发局转化为破发的比例。',
  returnPointsWonPct: '接发球得分比例。',
  breakPointsSavedPct: '面对破发点时的挽救比例。',
  breakPointsConvertedPct: '获得破发机会时的转化比例。',
  totalPointsWonPct: '全部得分的比例——衡量一个赛季最简洁的单一数字。',
  servicePointsWonPct: '发球分得分比例。',
};

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
