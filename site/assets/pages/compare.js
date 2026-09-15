/**
 * Head-to-head — pick any two ranked players and compare them.
 *
 * The career head-to-head record and every stored meeting come from the
 * pre-computed index (the official API blocks cross-origin browser requests);
 * the side-by-side metrics come from the stored biography and season snapshots.
 */
import {
  bios,
  h2hBundle,
  h2hPair,
  matches as matchesData,
  playerIndex,
  rankings,
  seasonStats,
} from '../data.js';
import { avatar, countryName, formStrip, levelTag, loading, pair, pageHead, playerName } from '../ui.js';
import { countryZh, playerZh, surfaceZh, tournamentZh } from '../i18n.js';
import {
  country,
  esc,
  int,
  money,
  monthDay,
  pct,
  record,
  surfaceLabel,
  winPct,
} from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(10);

export async function render(host, { a, b }) {
  const [rank, bio, stats, log, index] = await Promise.all([
    rankings(),
    bios(),
    seasonStats(),
    matchesData(),
    playerIndex(),
  ]);
  const { names: pairNames, pairs: pairIndex } = h2hBundle();

  setTitle('Head-to-head');

  const find = (id) => rank.players.find((p) => p.id === id) || null;
  let pa = a ? find(a) : null;
  let pb = b ? find(b) : null;
  if (!pa && !pb) {
    // Sensible default: the two most recent Grand Slam finalists in the log.
    pa = rank.players[0];
    pb = rank.players[1];
  } else if (!pb) {
    pb = rank.players.find((p) => p.id !== pa.id) || null;
  }

  host.innerHTML = `
  ${pageHead({
    eyebrow: 'Head-to-head · 交手对比',
    title: pair('两位球员对比', 'Compare two players'),
    sub: `生涯交手记录、共同参赛的赛事，以及逐项数据的正面对比。交手记录来自 WTA 官方数据源。<br>
    <span style="opacity:.7;font-size:13px">Career meetings, shared tournaments and a like-for-like statistical comparison.</span>`,
  })}

  <div class="card mb4" style="margin-bottom:var(--sp-6)">
    <div class="card-bd">
      <div class="cmp-pickers" style="max-width:820px;margin:0 auto">
        <div class="picker" data-picker="a">
          <label class="eyebrow" style="display:block;margin-bottom:6px">${pair('球员一', 'Player one')}</label>
          <input type="text" data-input placeholder="${pair('搜索球员…', 'Search player…')}" autocomplete="off"
            value="${esc(pa?.name || '')}">
          <div class="suggest" data-suggest hidden></div>
        </div>
        <div class="vs">vs</div>
        <div class="picker" data-picker="b">
          <label class="eyebrow" style="display:block;margin-bottom:6px">${pair('球员二', 'Player two')}</label>
          <input type="text" data-input placeholder="${pair('搜索球员…', 'Search player…')}" autocomplete="off"
            value="${esc(pb?.name || '')}">
          <div class="suggest" data-suggest hidden></div>
        </div>
      </div>
    </div>
  </div>

  <div data-result></div>
  `;

  // Search pickers
  host.querySelectorAll('[data-picker]').forEach((picker) => {
    const input = picker.querySelector('[data-input]');
    const box = picker.querySelector('[data-suggest]');
    const norm = (s) =>
      String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const entries = index.map((p) => ({ ...p, key: norm(p.n) }));

    input.addEventListener('input', () => {
      const q = norm(input.value).trim();
      if (q.length < 2) {
        box.hidden = true;
        return;
      }
      const rows = entries
        .filter((p) => p.key.includes(q))
        .sort((x, y) => (x.key.startsWith(q) ? -1 : 1) - (y.key.startsWith(q) ? -1 : 1))
        .slice(0, 10);
      box.innerHTML = rows.length
        ? rows
            .map(
              (p) => `<button type="button" data-pick="${p.i}">
                ${avatar(p.i, p.n, 26)}
                <span class="s-name">${pair(playerZh(p.i), p.n)}</span>
                <span class="flag">${esc(p.c || '')}</span>
                <span class="s-rank">#${p.r}</span>
              </button>`,
            )
            .join('')
        : `<div class="s-empty">${pair('未找到球员', 'No player found')}</div>`;
      box.hidden = false;
    });

    box.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (!btn) return;
      e.preventDefault();
      const id = Number(btn.dataset.pick);
      const side = picker.dataset.picker;
      const other = side === 'a' ? pb?.id : pa?.id;
      if (id === other) return;
      location.hash = side === 'a' ? `#/compare/${id}/${pb?.id ?? ''}` : `#/compare/${pa?.id ?? ''}/${id}`;
    });

    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target)) box.hidden = true;
    });
  });

  const result = host.querySelector('[data-result]');
  if (!pa || !pb) {
    result.innerHTML = `<div class="card"><div class="card-bd"><div class="empty">
      <b>${pair('请选择两位球员', 'Select two players')}</b>
      <div>${pair('在上方两个输入框中搜索球员。', 'Search for a player in each field above.')}</div>
    </div></div></div>`;
    return;
  }

  result.innerHTML = `<div class="card"><div class="card-bd">${loading(5)}</div></div>`;

  /* ---------- head-to-head (pre-computed at build time) ---------- */
  const record_ = h2hPair(pairIndex, pa.id, pb.id);
  const isAFirst = record_ ? record_.a === pa.id : true;
  const paWins = record_ ? (isAFirst ? record_.aWins : record_.bWins) : null;
  const pbWins = record_ ? (isAFirst ? record_.bWins : record_.aWins) : null;
  const nameOf = (id, fallback) => pairNames?.[id]?.n || fallback || 'Unknown';

  const h2h = record_
    ? {
        paWins,
        pbWins,
        totalMeetings: record_.n ?? record_.meetings.length,
        meetings: record_.meetings.map((m) => ({
          date: m.d,
          tournament: m.t,
          level: m.lvl,
          surface: m.sfc,
          round: m.r,
          score: m.sc,
          winnerId: m.w,
          loserId: m.lo,
          winnerName: nameOf(m.w, m.w === pa.id ? pa.name : pb.name),
          loserName: nameOf(m.lo, m.lo === pa.id ? pa.name : pb.name),
        })),
      }
    : null;

  const covered = pairIndex && Object.keys(pairIndex).length > 0;

  /* ---------- stored comparison ---------- */
  const ba = bio[pa.id] || {};
  const bb = bio[pb.id] || {};
  const sa = stats[pa.id] || {};
  const sb = stats[pb.id] || {};
  const recA = boardsLike(log[pa.id] || []);
  const recB = boardsLike(log[pb.id] || []);

  const total = h2h && h2h.paWins != null ? (h2h.paWins || 0) + (h2h.pbWins || 0) : 0;
  const shareA = total ? ((h2h.paWins || 0) / total) * 100 : 50;

  const metric = (labelHtml, key, fmt, higherBetter = true) => {
    const va = sa[key];
    const vb = sb[key];
    if (va == null && vb == null) return '';
    const aWins = higherBetter ? va > vb : va < vb;
    const bWins = higherBetter ? vb > va : vb < va;
    return `<tr>
      <td class="a ${aWins ? 'win' : 'lose'}">${fmt(va)}</td>
      <td class="k">${labelHtml}</td>
      <td class="b ${bWins ? 'win' : 'lose'}">${fmt(vb)}</td>
    </tr>`;
  };

  const careerMetric = (labelHtml, key, fmt, higherBetter = true) => {
    const va = ba[key];
    const vb = bb[key];
    if (va == null && vb == null) return '';
    const aWins = higherBetter ? va > vb : va < vb;
    const bWins = higherBetter ? vb > va : vb < va;
    return `<tr>
      <td class="a ${aWins ? 'win' : 'lose'}">${fmt(va)}</td>
      <td class="k">${labelHtml}</td>
      <td class="b ${bWins ? 'win' : 'lose'}">${fmt(vb)}</td>
    </tr>`;
  };

  const safest = (v) => (v == null ? '—' : v);

  result.innerHTML = `
  <div class="card">
    <div class="card-bd">
      <div class="cmp-hd">
        <div class="cmp-side">
          ${avatar(pa.id, pa.name, 84)}
          <b><a href="#/player/${pa.id}">${playerName(pa)}</a></b>
          <div class="row" style="gap:7px">${countryName(pa.country)}<span class="dim" style="font-size:12px">No.${pa.rank}</span></div>
        </div>
        <div>
          <div class="cmp-record">${h2h ? `${safest(h2h.paWins)}–${safest(h2h.pbWins)}` : '—'}</div>
          <div class="eyebrow" style="margin-top:4px">${pair('生涯交手', 'Career meetings')}</div>
        </div>
        <div class="cmp-side">
          ${avatar(pb.id, pb.name, 84)}
          <b><a href="#/player/${pb.id}">${playerName(pb)}</a></b>
          <div class="row" style="gap:7px">${countryName(pb.country)}<span class="dim" style="font-size:12px">No.${pb.rank}</span></div>
        </div>
      </div>
      ${
        h2h && total
          ? `<div class="cmp-bar"><i class="a" style="width:${shareA}%"></i><i class="b" style="width:${
              100 - shareA
            }%"></i></div>
             <div class="row between" style="font-size:11.5px;color:var(--text-3)">
               <span>${pair(playerZh(pa.id), shortName(pa.name))} ${h2h.paWins} ${pair('胜', 'wins')}</span>
               <span>${pair(playerZh(pb.id), shortName(pb.name))} ${h2h.pbWins} ${pair('胜', 'wins')}</span>
             </div>`
          : `<div class="notice mt4">${
              covered
                ? pair(
                    '已存比赛窗口（2023 年至今）中没有这两位球员的交手记录，因此不显示生涯交手战绩。',
                    'No completed meeting between these two appears in the stored match window (2023 onwards).',
                  )
                : pair('本快照中没有交手数据。', 'Head-to-head data is not available in this snapshot.')
            } ${pair('下方的逐项对比数据仍然可用。', 'Side-by-side statistics below are still available.')}</div>`
      }
    </div>
  </div>

  <div class="grid c2 mt5">
    <div class="card">
      <div class="card-hd">
        <div><span class="eyebrow">Official WTA record · 官方交手</span><h3>${pair('交手记录', 'Meetings')}</h3></div>
        ${
          h2h && h2h.totalMeetings > h2h.meetings.length
            ? `<span class="dim" style="font-size:11.5px">${pair(
                `显示最近 ${h2h.meetings.length} / ${h2h.totalMeetings} 场`,
                `showing the latest ${h2h.meetings.length} of ${h2h.totalMeetings}`,
              )}</span>`
            : h2h
              ? `<span class="dim" style="font-size:11.5px">${pair(`全部 ${h2h.totalMeetings} 场`, `all ${h2h.totalMeetings} meetings`)}</span>`
              : ''
        }
      </div>
      <div class="card-bd flush">
        ${
          h2h && h2h.meetings.length
            ? h2h.meetings
                .map((m) => {
                  return `<div class="match" style="grid-template-columns:56px minmax(0,1fr) auto">
                    <span class="m-date">${esc(monthDay(m.date))}<br><span class="dim">${esc(
                      m.date.slice(0, 4),
                    )}</span></span>
                    <span class="m-main">
                      <span class="m-t">
                        <span class="m-name">${esc(shortName(m.winnerName))}</span>
                        <span class="dim">d.</span>
                        <span class="m-name" style="font-weight:400;color:var(--text-2)">${esc(
                          shortName(m.loserName),
                        )}</span>
                        ${levelTag(m.level)}
                      </span>
                      <span class="m-sub">${esc(m.tournament)} · ${esc(m.round)} · ${esc(
                        surfaceLabel(m.surface),
                      )}</span>
                    </span>
                    <span class="m-score">${esc(m.score)}</span>
                  </div>`;
                })
                .join('')
            : `<div class="empty">${pair('没有已存的交手记录', 'No stored meetings between these players')}</div>`
        }
      </div>
    </div>

    <div>
      <div class="card">
        <div class="card-hd"><div><span class="eyebrow">Current season · 当前赛季</span><h3>${pair('发球与接发', 'Serve &amp; return')}</h3></div></div>
        <div class="card-bd flush">
          <table class="cmp-rows">
            ${metric(pair('ACE 球', 'Aces'), 'aces', (v) => (v == null ? '—' : int(v)))}
            ${metric(pair('双误', 'Double faults'), 'doubleFaults', (v) => (v == null ? '—' : int(v)), false)}
            ${metric(pair('一发成功率', 'First serve in'), 'firstServePct', (v) => pct(v))}
            ${metric(pair('一发得分率', '1st serve points won'), 'firstServeWonPct', (v) => pct(v))}
            ${metric(pair('二发得分率', '2nd serve points won'), 'secondServeWonPct', (v) => pct(v))}
            ${metric(pair('发球局胜率', 'Service games won'), 'serviceGamesWonPct', (v) => pct(v))}
            ${metric(pair('破发点挽救率', 'Break points saved'), 'breakPointsSavedPct', (v) => pct(v))}
            ${metric(pair('接发局胜率', 'Return games won'), 'returnGamesWonPct', (v) => pct(v))}
            ${metric(pair('接发得分率', 'Return points won'), 'returnPointsWonPct', (v) => pct(v))}
            ${metric(pair('破发点转化率', 'Break points converted'), 'breakPointsConvertedPct', (v) => pct(v))}
            ${metric(pair('总得分率', 'Total points won'), 'totalPointsWonPct', (v) => pct(v))}
          </table>
        </div>
      </div>

      <div class="card mt5">
        <div class="card-hd"><div><span class="eyebrow">Career · 生涯</span><h3>${pair('战绩与荣誉', 'Record &amp; achievements')}</h3></div></div>
        <div class="card-bd flush">
          <table class="cmp-rows">
            ${careerMetric(pair('最高排名', 'Career high rank'), 'sglHighRank', (v) => (v == null ? '—' : `No.${v}`), false)}
            ${careerMetric(pair('单打冠军数', 'Career singles titles'), 'sglCareerTitles', (v) => (v == null ? '—' : int(v)))}
            ${careerMetric(pair('生涯胜场', 'Career match wins'), 'sglCareerWon', (v) => (v == null ? '—' : int(v)))}
            <tr>
              <td class="a ${pctOr(ba.sglCareerWon, ba.sglCareerLost) > pctOr(bb.sglCareerWon, bb.sglCareerLost) ? 'win' : 'lose'}">${
                pct(winPct(ba.sglCareerWon, ba.sglCareerLost))
              }</td>
              <td class="k">${pair('生涯胜率', 'Career win rate')}</td>
              <td class="b ${pctOr(bb.sglCareerWon, bb.sglCareerLost) > pctOr(ba.sglCareerWon, ba.sglCareerLost) ? 'win' : 'lose'}">${
                pct(winPct(bb.sglCareerWon, bb.sglCareerLost))
              }</td>
            </tr>
            ${careerMetric(pair('双打冠军数', 'Doubles titles'), 'dblCareerTitles', (v) => (v == null ? '—' : int(v)))}
            ${careerMetric(pair('年龄', 'Age'), 'age', (v) => (v == null ? '—' : v), false)}
            <tr>
              <td class="a">${ba.careerPrize ? esc(money(ba.careerPrize)) : '—'}</td>
              <td class="k">${pair('生涯奖金', 'Career prize money')}</td>
              <td class="b">${bb.careerPrize ? esc(money(bb.careerPrize)) : '—'}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="grid c2 mt5">
    <div class="card">
      <div class="card-hd"><h3>${pair(playerZh(pa.id), shortName(pa.name))} · ${pair('近期战绩', 'recent form')}</h3></div>
      <div class="card-bd">
        ${formStrip(recA.last10, 10)}
        <div class="mt4 tiles">
          <div class="tile"><b>${record(recA.w, recA.l)}</b><small>${esc(String(recA.year))} ${pair('胜负', 'W–L')}</small></div>
          <div class="tile"><b>${pct(winPct(recA.w, recA.l))}</b><small>${pair('胜率', 'Win rate')}</small></div>
          <div class="tile"><b>${recA.titles}</b><small>${pair('冠军', 'Titles')}</small></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><h3>${pair(playerZh(pb.id), shortName(pb.name))} · ${pair('近期战绩', 'recent form')}</h3></div>
      <div class="card-bd">
        ${formStrip(recB.last10, 10)}
        <div class="mt4 tiles">
          <div class="tile"><b>${record(recB.w, recB.l)}</b><small>${esc(String(recB.year))} ${pair('胜负', 'W–L')}</small></div>
          <div class="tile"><b>${pct(winPct(recB.w, recB.l))}</b><small>${pair('胜率', 'Win rate')}</small></div>
          <div class="tile"><b>${recB.titles}</b><small>${pair('冠军', 'Titles')}</small></div>
        </div>
      </div>
    </div>
  </div>
  `;
}

function boardsLike(list) {
  const year = list.length
    ? Math.max(...list.map((m) => m.yr ?? Number(m.d.slice(0, 4))))
    : new Date().getUTCFullYear();
  const rows = list.filter((m) => (m.yr ?? Number(m.d.slice(0, 4))) === year);
  return {
    year,
    w: rows.filter((m) => m.w).length,
    l: rows.filter((m) => !m.w).length,
    titles: rows.filter((m) => m.r === 'F' && m.w).length,
    last10: rows.sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 10).map((m) => m.w),
  };
}

function pctOr(w, l) {
  const t = (w || 0) + (l || 0);
  return t ? (w || 0) / t : 0;
}

function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}
