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
import { avatar, formStrip, loading, pageHead } from '../ui.js';
import {
  country,
  esc,
  int,
  levelTag,
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
    eyebrow: 'Head-to-head',
    title: 'Compare two players',
    sub: 'Career meetings, shared tournaments and a like-for-like statistical comparison. Head-to-head records are read live from the official WTA endpoint.',
  })}

  <div class="card mb4" style="margin-bottom:var(--sp-6)">
    <div class="card-bd">
      <div class="cmp-pickers" style="max-width:820px;margin:0 auto">
        <div class="picker" data-picker="a">
          <label class="eyebrow" style="display:block;margin-bottom:6px">Player one</label>
          <input type="text" data-input placeholder="Search player…" autocomplete="off"
            value="${esc(pa?.name || '')}">
          <div class="suggest" data-suggest hidden></div>
        </div>
        <div class="vs">vs</div>
        <div class="picker" data-picker="b">
          <label class="eyebrow" style="display:block;margin-bottom:6px">Player two</label>
          <input type="text" data-input placeholder="Search player…" autocomplete="off"
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
                <span class="s-name">${esc(p.n)}</span>
                <span class="flag">${esc(p.c || '')}</span>
                <span class="s-rank">#${p.r}</span>
              </button>`,
            )
            .join('')
        : '<div class="s-empty">No player found</div>';
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
      <b>Select two players</b><div>Search for a player in each field above.</div>
    </div></div></div>`;
    return;
  }

  result.innerHTML = `<div class="card"><div class="card-bd">${loading(5)}</div></div>`;

  /* ---------- head-to-head (pre-computed at build time) ---------- */
  const pair = h2hPair(pairIndex, pa.id, pb.id);
  const isAFirst = pair ? pair.a === pa.id : true;
  const paWins = pair ? (isAFirst ? pair.aWins : pair.bWins) : null;
  const pbWins = pair ? (isAFirst ? pair.bWins : pair.aWins) : null;
  const nameOf = (id, fallback) => pairNames?.[id]?.n || fallback || 'Unknown';

  const h2h = pair
    ? {
        paWins,
        pbWins,
        totalMeetings: pair.n ?? pair.meetings.length,
        meetings: pair.meetings.map((m) => ({
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

  const metric = (label, key, fmt, higherBetter = true) => {
    const va = sa[key];
    const vb = sb[key];
    if (va == null && vb == null) return '';
    const aWins = higherBetter ? va > vb : va < vb;
    const bWins = higherBetter ? vb > va : vb < va;
    return `<tr>
      <td class="a ${aWins ? 'win' : 'lose'}">${fmt(va)}</td>
      <td class="k">${esc(label)}</td>
      <td class="b ${bWins ? 'win' : 'lose'}">${fmt(vb)}</td>
    </tr>`;
  };

  const careerMetric = (label, key, fmt, higherBetter = true) => {
    const va = ba[key];
    const vb = bb[key];
    if (va == null && vb == null) return '';
    const aWins = higherBetter ? va > vb : va < vb;
    const bWins = higherBetter ? vb > va : vb < va;
    return `<tr>
      <td class="a ${aWins ? 'win' : 'lose'}">${fmt(va)}</td>
      <td class="k">${esc(label)}</td>
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
          <b><a href="#/player/${pa.id}">${esc(pa.name)}</a></b>
          <div class="row" style="gap:7px">${country(pa.country)}<span class="dim" style="font-size:12px">No.${pa.rank}</span></div>
        </div>
        <div>
          <div class="cmp-record">${h2h ? `${safest(h2h.paWins)}–${safest(h2h.pbWins)}` : '—'}</div>
          <div class="eyebrow" style="margin-top:4px">Career meetings</div>
        </div>
        <div class="cmp-side">
          ${avatar(pb.id, pb.name, 84)}
          <b><a href="#/player/${pb.id}">${esc(pb.name)}</a></b>
          <div class="row" style="gap:7px">${country(pb.country)}<span class="dim" style="font-size:12px">No.${pb.rank}</span></div>
        </div>
      </div>
      ${
        h2h && total
          ? `<div class="cmp-bar"><i class="a" style="width:${shareA}%"></i><i class="b" style="width:${
              100 - shareA
            }%"></i></div>
             <div class="row between" style="font-size:11.5px;color:var(--text-3)">
               <span>${esc(shortName(pa.name))} ${h2h.paWins} wins</span>
               <span>${esc(shortName(pb.name))} ${h2h.pbWins} wins</span>
             </div>`
          : `<div class="notice mt4">${
              covered
                ? 'No completed meeting between these two appears in the stored match window (2023 onwards), so the career head-to-head is not shown.'
                : 'Head-to-head data is not available in this snapshot.'
            } Side-by-side statistics below are still available.</div>`
      }
    </div>
  </div>

  <div class="grid c2 mt5">
    <div class="card">
      <div class="card-hd">
        <div><span class="eyebrow">Official WTA record</span><h3>Meetings</h3></div>
        ${
          h2h && h2h.totalMeetings > h2h.meetings.length
            ? `<span class="dim" style="font-size:11.5px">showing the latest ${h2h.meetings.length} of ${h2h.totalMeetings}</span>`
            : h2h
              ? `<span class="dim" style="font-size:11.5px">all ${h2h.totalMeetings} meetings</span>`
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
            : `<div class="empty">No stored meetings between these players</div>`
        }
      </div>
    </div>

    <div>
      <div class="card">
        <div class="card-hd"><div><span class="eyebrow">Current season</span><h3>Serve &amp; return</h3></div></div>
        <div class="card-bd flush">
          <table class="cmp-rows">
            ${metric('Aces', 'aces', (v) => (v == null ? '—' : int(v)))}
            ${metric('Double faults', 'doubleFaults', (v) => (v == null ? '—' : int(v)), false)}
            ${metric('First serve in', 'firstServePct', (v) => pct(v))}
            ${metric('1st serve points won', 'firstServeWonPct', (v) => pct(v))}
            ${metric('2nd serve points won', 'secondServeWonPct', (v) => pct(v))}
            ${metric('Service games won', 'serviceGamesWonPct', (v) => pct(v))}
            ${metric('Break points saved', 'breakPointsSavedPct', (v) => pct(v))}
            ${metric('Return games won', 'returnGamesWonPct', (v) => pct(v))}
            ${metric('Return points won', 'returnPointsWonPct', (v) => pct(v))}
            ${metric('Break points converted', 'breakPointsConvertedPct', (v) => pct(v))}
            ${metric('Total points won', 'totalPointsWonPct', (v) => pct(v))}
          </table>
        </div>
      </div>

      <div class="card mt5">
        <div class="card-hd"><div><span class="eyebrow">Career</span><h3>Record &amp; achievements</h3></div></div>
        <div class="card-bd flush">
          <table class="cmp-rows">
            ${careerMetric('Career high rank', 'sglHighRank', (v) => (v == null ? '—' : `No.${v}`), false)}
            ${careerMetric('Career singles titles', 'sglCareerTitles', (v) => (v == null ? '—' : int(v)))}
            ${careerMetric('Career match wins', 'sglCareerWon', (v) => (v == null ? '—' : int(v)))}
            <tr>
              <td class="a ${pctOr(ba.sglCareerWon, ba.sglCareerLost) > pctOr(bb.sglCareerWon, bb.sglCareerLost) ? 'win' : 'lose'}">${
                pct(winPct(ba.sglCareerWon, ba.sglCareerLost))
              }</td>
              <td class="k">Career win rate</td>
              <td class="b ${pctOr(bb.sglCareerWon, bb.sglCareerLost) > pctOr(ba.sglCareerWon, ba.sglCareerLost) ? 'win' : 'lose'}">${
                pct(winPct(bb.sglCareerWon, bb.sglCareerLost))
              }</td>
            </tr>
            ${careerMetric('Doubles titles', 'dblCareerTitles', (v) => (v == null ? '—' : int(v)))}
            ${careerMetric('Age', 'age', (v) => (v == null ? '—' : v), false)}
            <tr>
              <td class="a">${ba.careerPrize ? esc(money(ba.careerPrize)) : '—'}</td>
              <td class="k">Career prize money</td>
              <td class="b">${bb.careerPrize ? esc(money(bb.careerPrize)) : '—'}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="grid c2 mt5">
    <div class="card">
      <div class="card-hd"><h3>${esc(shortName(pa.name))} · recent form</h3></div>
      <div class="card-bd">
        ${formStrip(recA.last10, 10)}
        <div class="mt4 tiles">
          <div class="tile"><b>${record(recA.w, recA.l)}</b><small>${esc(String(recA.year))} W–L</small></div>
          <div class="tile"><b>${pct(winPct(recA.w, recA.l))}</b><small>Win rate</small></div>
          <div class="tile"><b>${recA.titles}</b><small>Titles</small></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-hd"><h3>${esc(shortName(pb.name))} · recent form</h3></div>
      <div class="card-bd">
        ${formStrip(recB.last10, 10)}
        <div class="mt4 tiles">
          <div class="tile"><b>${record(recB.w, recB.l)}</b><small>${esc(String(recB.year))} W–L</small></div>
          <div class="tile"><b>${pct(winPct(recB.w, recB.l))}</b><small>Win rate</small></div>
          <div class="tile"><b>${recB.titles}</b><small>Titles</small></div>
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
