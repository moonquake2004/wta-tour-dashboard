/**
 * Overview — the front page.
 *
 * Composes the current No.1 feature, a live slice of the ranking table, the
 * latest completed events and this season's statistical leaders.
 */
import {
  bios,
  leaderboards,
  rankings,
  seasonStats,
  tournaments,
} from '../data.js';
import {
  avatar,
  countryName,
  empty,
  formStrip,
  hbars,
  loading,
  movement,
  pair,
  playerCell,
  playerName,
  levelTag,
  surfaceChip,
} from '../ui.js';
import { countryZh, levelZh, playerZh, tournamentZh } from '../i18n.js';
import {
  dateLabel,
  esc,
  int,
  money,
  monthDay,
  pct,
  record,
} from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(10);

export async function render(host) {
  setTitle('Overview');

  const [rank, bio, stats, boards, tour] = await Promise.all([
    rankings(),
    bios(),
    seasonStats(),
    leaderboards(),
    tournaments(),
  ]);

  const top = rank.players.slice(0, 10);
  const no1 = rank.players[0];
  const no1Bio = bio[no1.id] || {};
  const no1Stats = stats[no1.id] || {};
  const seasonYear = boards.season || new Date().getUTCFullYear();
  const no1Season = boards.seasonMap?.[no1.id]?.[seasonYear] || {};

  const leaders = boards.boards.slice(0, 4);

  // Most recent completed main-tour events.
  const done = tour.events
    .filter((e) => e.status === 'past' && e.year >= 2025)
    .sort((a, b) => (a.start < b.start ? 1 : -1))
    .slice(0, 7);

  const upNext = tour.events
    .filter((e) => e.status !== 'past')
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .slice(0, 3);

  // Tournament count for the hero stats.
  const mainTour = tour.events.filter((e) =>
    ['Grand Slam', 'WTA 1000', 'WTA 500', 'WTA 250', 'WTA Finals'].includes(e.level),
  );

  const heroStats = [
    { v: int(rank.depth), l: pair('排名球员', 'Players ranked') },
    { v: int(mainTour.length), l: pair('主巡回赛赛事', 'Main-tour events') },
    { v: int(boards.boards.length), l: pair('统计类别', 'Stat categories') },
    { v: rank.asOf ? dateLabel(rank.asOf) : '—', l: pair('排名日期', 'Rankings as of') },
  ];

  host.innerHTML = `
  <section class="hero">
    <div>
      <span class="eyebrow">Hologic WTA Tour · 官方数据源 / Official data feed</span>
      <h1 class="hero-title">女子网球，<br><em>用数据说话。</em></h1>
      <p class="hero-sub" style="font-size:15px">
        本站的每一个排名积分、赛季战绩、交手记录和赛事结果，都直接取自 <b>WTA 官方公开数据接口</b>，
        重建为一个快速、纯静态的数据看板。没有估算，没有编辑加工——就是巡回赛自己发布的那些数字，
        只是换成了真正方便查询的形式。
      </p>
      <p class="hero-sub" style="margin-top:10px;font-size:13px;opacity:.75">
        Every ranking number, season record, head-to-head and tournament result is read
        straight from the WTA's own public data feed and rebuilt as a fast, static
        dashboard. No editorialising, no estimates.
      </p>
      <div class="hero-stats">
        ${heroStats
          .map((s) => `<div class="hero-stat"><b>${esc(s.v)}</b><span>${s.l}</span></div>`)
          .join('')}
      </div>
    </div>

    <div class="no1">
      <div class="no1-top">
        ${avatar(no1.id, no1.name, 88, 'no1-photo')}
        <span class="no1-rank">1</span>
        <div style="min-width:0">
          <span class="eyebrow" style="color:var(--clay-soft)">世界第一 · World No.1 · 单打</span>
          <h3 class="no1-name"><a href="#/player/${no1.id}">${playerName(no1)}</a></h3>
          <div class="no1-meta">
            ${countryName(no1.country)}<span>${esc(no1Bio.countryName || '')}</span>
            <span>·</span><span>${esc(no1Bio.age ? `${no1Bio.age} yrs` : '')}</span>
          </div>
        </div>
      </div>
      <div class="no1-grid">
        <div><b>${int(no1.points)}</b><span>${pair('排名积分', 'Ranking pts')}</span></div>
        <div><b>${record(no1Season.w, no1Season.l)}</b><span>${esc(String(seasonYear))} ${pair('胜负', 'W–L')}</span></div>
        <div><b>${int(no1Bio.sglCareerTitles)}</b><span>${pair('生涯冠军', 'Career titles')}</span></div>
      </div>
      <div class="mt4">
        <div class="eyebrow mb3" style="margin-bottom:8px">${pair('近期战绩', 'Recent form')}</div>
        ${formStrip(no1Season.last10)}
      </div>
      ${
        no1Stats.serviceGamesWonPct || no1Stats.returnGamesWonPct
          ? `<div class="mt4 row" style="gap:var(--sp-5);flex-wrap:wrap">
              <div><div class="eyebrow">${pair('发球局胜率', 'Service games won')}</div><b class="num" style="font-size:17px">${pct(no1Stats.serviceGamesWonPct)}</b></div>
              <div><div class="eyebrow">${pair('接发局胜率', 'Return games won')}</div><b class="num" style="font-size:17px">${pct(no1Stats.returnGamesWonPct)}</b></div>
              <div><div class="eyebrow">${pair('ACE 球', 'Aces')}</div><b class="num" style="font-size:17px">${int(no1Stats.aces)}</b></div>
            </div>`
          : ''
      }
    </div>
  </section>

  <section class="sec">
    <div class="sec-hd">
      <div>
        <span class="eyebrow">PIF WTA Rankings · 官方排名</span>
        <h2>${pair('单打前十', 'Singles top 10')}</h2>
      </div>
      <a class="link" href="#/rankings">${pair('完整排名表 →', 'Full ranking table →')}</a>
    </div>
    <div class="card">
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="l" style="width:60px">${pair('排名', 'Rank')}</th>
              <th class="l">${pair('球员', 'Player')}</th>
              <th>${pair('变动', 'Move')}</th>
              <th class="hide-sm">${pair('年龄', 'Age')}</th>
              <th class="hide-sm">${pair('参赛', 'Events')}</th>
              <th>${pair('积分', 'Points')}</th>
            </tr>
          </thead>
          <tbody>
            ${top
              .map((p) => {
                const b = bio[p.id] || {};
                const age = b.age ?? ageFrom(p.birth);
                return `<tr class="clickable ${p.rank <= 3 ? 'top3' : ''}" data-href="#/player/${p.id}">
                  <td class="l rank-cell ${p.rank <= 3 ? 'top' : ''}">${p.rank}</td>
                  <td class="l">${playerCell(p)}</td>
                  <td>${movement(p.move)}</td>
                  <td class="hide-sm num dim">${age ?? '—'}</td>
                  <td class="hide-sm num dim">${p.played ?? '—'}</td>
                  <td class="num">${int(p.points)}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  ${
    upNext.length
      ? `<section class="sec">
          <div class="sec-hd">
            <div><span class="eyebrow">On the calendar · 赛程</span><h2>${pair('即将开赛', 'Coming up')}</h2></div>
            <a class="link" href="#/calendar">${pair('巡回赛赛程 →', 'Tour calendar →')}</a>
          </div>
          <div class="grid c3">
            ${upNext
              .map(
                (e) => `<div class="card"><div class="card-bd">
                  <div class="row between" style="align-items:flex-start">
                    <div>${levelTag(e.level)}</div>
                    <span class="eyebrow">${esc(monthDay(e.start))}</span>
                  </div>
                  <h3 style="font-size:19px;margin-top:10px">${pair(tournamentZh(e.name), e.name)}</h3>
                  <div class="muted mt2" style="font-size:12.5px">${esc(e.city || '')}${
                    e.country ? `, ${esc(e.country)}` : ''
                  }</div>
                  <div class="mt3 row" style="gap:var(--sp-4)">
                    ${surfaceChip(e.surface)}
                    <span class="dim" style="font-size:12px">${e.drawSize ? `${e.drawSize} ${pair('签位', 'draw')}` : ''}</span>
                  </div>
                </div></div>`,
              )
              .join('')}
          </div>
        </section>`
      : ''
  }

  <section class="sec">
    <div class="grid c2">
      <div class="card">
        <div class="card-hd">
          <div><span class="eyebrow">Results · 赛果</span><h3>${pair('最新结束的赛事', 'Latest completed events')}</h3></div>
          <a class="link" href="#/calendar">${pair('全部 →', 'All →')}</a>
        </div>
        <div class="card-bd flush">
          <div class="events">
            ${
              done.length
                ? done
                    .map(
                      (e) => `<div class="event" style="grid-template-columns:80px minmax(0,1fr) auto">
                        <span class="e-date">${esc(monthDay(e.start))}<br>${esc(
                          String(e.year),
                        )}</span>
                        <div style="min-width:0">
                          <div class="e-name">${pair(tournamentZh(e.name), e.name)}</div>
                          <div class="e-sub">${levelTag(e.level)} ${surfaceChip(e.surface)}
                            <span class="dim">${esc(e.city || '')}</span></div>
                        </div>
                        <div class="e-champ">
                          ${
                            e.champion
                              ? `${avatar(e.champion.id, e.champion.name, 26)}<a href="#/player/${
                                  e.champion.id
                                }" style="font-size:12.5px">${esc(shortName(e.champion.name))}</a>`
                              : '<span class="dim" style="font-size:12px">—</span>'
                          }
                        </div>
                      </div>`,
                    )
                    .join('')
                : empty('No completed events yet')
            }
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd">
          <div><span class="eyebrow">${esc(String(seasonYear))} ${pair('赛季', 'season')}</span><h3>${pair('统计领跑榜', 'Statistical leaders')}</h3></div>
          <a class="link" href="#/stats">${pair('全部榜单 →', 'All boards →')}</a>
        </div>
        <div class="card-bd">
          ${
            leaders.length
              ? leaders
                  .map(
                    (b, i) => `<div class="${i ? 'mt5' : ''}">
                      <div class="row between mb3" style="margin-bottom:10px">
                        <span class="eyebrow">${esc(b.label)}</span>
                        <span class="dim" style="font-size:11px">${
                          b.unit === '%' ? pair('赛季百分比', 'season %') : pair('赛季累计', 'season total')
                        }</span>
                      </div>
                      ${hbars(
                        b.rows.slice(0, 5).map((r) => ({
                          label: r.name,
                          value: r.value,
                          href: `#/player/${r.id}`,
                        })),
                        { suffix: b.unit || '', digits: b.unit === '%' ? 1 : 0 },
                      )}
                    </div>`,
                  )
                  .join('')
              : empty('No statistics available')
          }
        </div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-hd">
      <div><span class="eyebrow">All-time among ranked players · 生涯数据</span><h2>${pair('生涯领跑榜', 'Career leaders')}</h2></div>
      <a class="link" href="#/stats">${pair('更多 →', 'More →')}</a>
    </div>
    <div class="grid c3">
      ${careerCard(pair('单打冠军数', 'Singles titles'), boards.career.titles, (p) => `${int(p.titles)}`)}
      ${careerCard(pair('生涯胜场', 'Career match wins'), boards.career.careerWins, (p) => `${int(p.won)}`)}
      ${careerCard(pair('生涯奖金', 'Career prize money'), boards.career.prizeMoney, (p) => money(p.prize), 'prize')}
    </div>
  </section>
  `;

  // Whole-row navigation for the ranking table.
  host.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.hash = tr.dataset.href;
    });
  });
}

function careerCard(title, rows, fmt, kind = '') {
  return `<div class="card">
    <div class="card-hd"><h3>${title}</h3></div>
    <div class="card-bd flush">
      ${rows
        .slice(0, 8)
        .map(
          (p, i) => `<div class="lb-row">
            <span class="lb-i">${i + 1}</span>
            <span class="lb-n"><a href="#/player/${p.id}">${playerName({ id: p.id, name: shortName(p.name) })}</a>
              <span class="flag" style="margin-left:6px">${esc(p.country || '')}</span></span>
            <span class="lb-v">${fmt(p)}</span>
          </div>`,
        )
        .join('')}
    </div>
  </div>`;
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
