/**
 * Player profile — the deepest page in the dashboard.
 *
 * Combines the official biography record, season serve/return statistics,
 * week-by-week ranking history and the singles match log into one view.
 */
import {
  bios,
  h2hBundle,
  leaderboards,
  matches as matchesData,
  rankings,
  rankingHistory,
  seasonStats,
} from '../data.js';
import {
  avatar,
  countryName,
  formStrip,
  lineChart,
  loading,
  pair,
  tiles,
  levelTag,
  surfaceChip,
} from '../ui.js';
import {
  countryZh,
  playerZh,
  roundName,
  surfaceName,
  surfaceZh,
  tournamentZh,
} from '../i18n.js';
import {
  backhandZh,
  dateLabel,
  esc,
  handZh,
  heightLabel,
  int,
  money,
  monthDay,
  pct,
  record,
  statusZh,
  surfaceLabel,
  winPct,
} from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(14);

export async function render(host, { id }) {
  const [rank, bio, stats, history, matches, boards] = await Promise.all([
    rankings(),
    bios(),
    seasonStats(),
    rankingHistory(),
    matchesData(),
    leaderboards(),
  ]);
  const { names: pairNames, pairs: pairIndex } = h2hBundle();

  const p = rank.players.find((x) => x.id === id);
  if (!p) {
    host.innerHTML = `<div class="empty"><b>${pair('未找到该球员', 'Player not found')}</b>
      <div>${pair(
        `当前排名快照中没有编号为 ${esc(id)} 的球员。`,
        `No player with id ${esc(id)} appears in the current ranking snapshot.`,
      )}</div>
      <div class="mt4"><a class="btn" href="#/rankings">${pair('返回排名', 'Back to rankings')}</a></div></div>`;
    return;
  }

  setTitle(p.name);

  const b = bio[id] || {};
  const s = stats[id] || {};
  const h = history[id] || [];
  const log = matches[id] || [];
  const seasonYear = boards.season || new Date().getUTCFullYear();
  const rec = boards.seasonMap?.[id]?.[seasonYear] || null;

  const points = h.map(([d, r]) => ({ x: monthDay(d), y: r })).filter((d) => d.y);
  const doubles = h.map(([d, r]) => ({ x: monthDay(d), y: r })).filter((d) => d.y);

  const winP = winPct(b.sglCareerWon, b.sglCareerLost);

  /* ---- match log groupings ---- */
  const byYear = new Map();
  for (const m of log) {
    const y = m.yr ?? Number(m.d.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) || []), m]);
  }
  const years = [...byYear.keys()].sort((a, b2) => b2 - a);
  const currentYear = years[0];
  const currentMatches = byYear.get(currentYear) || [];

  const surfaceSplits = (() => {
    const map = new Map();
    for (const m of log) {
      const sfc = m.sfc || 'UNKNOWN';
      const cur = map.get(sfc) || { w: 0, l: 0 };
      cur[m.w ? 'w' : 'l'] += 1;
      map.set(sfc, cur);
    }
    return [...map.entries()].sort((a, b2) => b2[1].w + b2[1].l - (a[1].w + a[1].l));
  })();

  const levelSplits = (() => {
    const map = new Map();
    for (const m of log) {
      const lvl = m.lvl || '—';
      const cur = map.get(lvl) || { w: 0, l: 0 };
      cur[m.w ? 'w' : 'l'] += 1;
      map.set(lvl, cur);
    }
    return [...map.entries()].sort((a, b2) => b2[1].w + b2[1].l - (a[1].w + a[1].l));
  })();

  /* ---- head-to-head record against the rest of the top 30 ---- */
  const rivals = (() => {
    if (!pairIndex) return [];
    const topIds = new Set(rank.players.slice(0, 30).map((x) => x.id));
    topIds.delete(id);
    const rows = [];
    for (const otherId of topIds) {
      const pair = pairIndex[otherId < id ? `${otherId}-${id}` : `${id}-${otherId}`];
      if (!pair) continue;
      const isA = pair.a === id;
      const wins = isA ? pair.aWins : pair.bWins;
      const losses = isA ? pair.bWins : pair.aWins;
      const meta = pairNames?.[otherId] || {};
      const opponent = rank.players.find((x) => x.id === otherId);
      rows.push({
        id: otherId,
        name: opponent?.name || meta.n || 'Unknown',
        country: opponent?.country || meta.c || '',
        rank: opponent?.rank ?? meta.r ?? null,
        wins,
        losses,
        meetings: pair.meetings,
      });
    }
    return rows.sort(
      (a, b2) =>
        b2.wins + b2.losses - (a.wins + a.losses) ||
        (a.rank ?? 999) - (b2.rank ?? 999),
    );
  })();

  /* ---- how this player compares with the tour on serve ---- */
  const comparable = Object.values(stats).filter((x) => x.matches >= 10);
  const avg = (key) => {
    const vals = comparable.map((x) => x[key]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((n, v) => n + v, 0) / vals.length : null;
  };
  const serveMetrics = [
    [pair('ACE 球', 'Aces'), 'aces', (v) => int(v), false],
    [pair('一发成功率', 'First serve in'), 'firstServePct', (v) => pct(v), true],
    [pair('一发得分率', '1st serve points won'), 'firstServeWonPct', (v) => pct(v), true],
    [pair('二发得分率', '2nd serve points won'), 'secondServeWonPct', (v) => pct(v), true],
    [pair('发球局胜率', 'Service games won'), 'serviceGamesWonPct', (v) => pct(v), true],
    [pair('破发点挽救率', 'Break points saved'), 'breakPointsSavedPct', (v) => pct(v), true],
    [pair('接发局胜率', 'Return games won'), 'returnGamesWonPct', (v) => pct(v), true],
    [pair('接发得分率', 'Return points won'), 'returnPointsWonPct', (v) => pct(v), true],
    [pair('破发点转化率', 'Break points converted'), 'breakPointsConvertedPct', (v) => pct(v), true],
    [pair('总得分率', 'Total points won'), 'totalPointsWonPct', (v) => pct(v), true],
  ];

  const rankBoard = boards.boards.find((x) => x.key === 'serviceGamesWonPct');
  const acesBoard = boards.boards.find((x) => x.key === 'aces');
  const rankInBoard = (board) =>
    board ? board.rows.findIndex((r) => r.id === id) + 1 : 0;

  host.innerHTML = `
  <div class="page-hd">
    <div class="profile-hd">
      ${avatar(id, p.name, 132, 'profile-photo')}
      <div>
        <span class="eyebrow">${esc(countryZh(p.country) || b.countryName || p.country)} · ${
          b.status ? esc(statusZh(b.status) || b.status) : pair('职业球员', 'Professional')
        }</span>
        <h1 class="profile-name">${pair(playerZh(id), p.name)}</h1>
        <div class="profile-flags">
          ${countryName(p.country)}
          <span>${pair(`世界第 ${p.rank}`, `World No.${p.rank}`)}</span>
          ${b.sglHighRank ? `<span class="dim">·</span><span class="dim">${pair('最高排名', 'Career high')} No.${b.sglHighRank}</span>` : ''}
          ${p.move ? `<span class="dim">·</span><span class="${
            p.move > 0 ? 'up' : 'down'
          }">${p.move > 0 ? '▲' : '▼'} ${Math.abs(p.move)} this week</span>` : ''}
        </div>
        <div class="row wrap mt4" style="gap:8px">
          <a class="btn primary" href="#/compare?a=${id}">${pair('对比球员', 'Compare player')}</a>
          <a class="btn" href="#/rankings">${pair('返回排名', 'Back to rankings')}</a>
        </div>
      </div>
      <div class="profile-rank-badge">
        <b>${p.rank}</b>
        <span>${pair('单打排名', 'Singles rank')}</span>
        <div class="num mt3" style="font-size:13px;color:var(--text-2)">${int(p.points)} ${pair('积分', 'pts')}</div>
      </div>
    </div>
  </div>

  <section class="sec" style="margin-top:var(--sp-6)">
    ${tiles([
      { value: rec ? record(rec.w, rec.l) : '—', label: `${seasonYear} ${pair('胜负', 'W–L')}`, sub: rec ? `${pct(winPct(rec.w, rec.l))} ${pair('胜率', 'won')}` : '' },
      { value: int(b.sglCareerTitles), label: pair('生涯冠军', 'Career titles') },
      { value: b.sglCareerWon != null ? record(b.sglCareerWon, b.sglCareerLost) : '—', label: pair('生涯胜负', 'Career W–L'), sub: winP ? `${pct(winP)} ${pair('胜率', 'won')}` : '' },
      { value: b.age ?? '—', label: pair('年龄', 'Age') },
      { value: heightLabel(b.height) || '—', label: pair('身高', 'Height') },
      { value: int(s.aces), label: `${seasonYear} ${pair('ACE 球', 'aces')}` },
    ])}
  </section>

  <section class="sec">
    <div class="tabs" data-tabs>
      <button class="on" data-tab="overview">${pair('概览', 'Overview')}</button>
      <button data-tab="results">${pair('战绩', 'Results')}</button>
      <button data-tab="stats">${pair('统计', 'Statistics')}</button>
      <button data-tab="ranking">${pair('排名历史', 'Ranking history')}</button>
      ${log.length ? `<button data-tab="log">${pair('比赛记录', 'Match log')}</button>` : ''}
    </div>

    <div data-panel="overview" class="mt5">
      <div class="grid c2">
        <div class="card">
          <div class="card-hd"><h3>${pair('球员档案', 'Biography')}</h3></div>
          <div class="card-bd">
            <dl class="dl">
              ${row(pair('出生', 'Born'), b.birth ? `${dateLabel(b.birth)}${b.birthCity ? ` · ${esc(b.birthCity)}` : ''}` : '—')}
              ${row(pair('国家/地区', 'Country'), esc(b.countryName || p.country || '—'))}
              ${row(pair('持拍', 'Plays'), esc([handZh(b.hand) || b.hand, backhandZh(b.backhand) || (b.backhand && b.backhand !== 'N/A' ? `${b.backhand} backhand` : '')].filter(Boolean).join(' · ') || '—'))}
              ${row(pair('身高', 'Height'), esc(heightLabel(b.height) || '—'))}
              ${row(pair('最高排名', 'Career high'), b.sglHighRank ? `No.${b.sglHighRank}${b.sglHighDate ? ` · ${dateLabel(b.sglHighDate)}` : ''}` : '—')}
              ${row(pair('排名积分', 'Ranking points'), `${int(p.points)} <span class="dim" style="font-size:11.5px">${pair('截至', 'as of')} ${dateLabel(rank.asOf)}</span>`)}
              ${row(pair('双打排名', 'Doubles rank'), b.dblRank ? `No.${b.dblRank}` : '—')}
              ${row(pair('生涯奖金', 'Career prize money'), b.careerPrize ? money(b.careerPrize) : '—')}
              ${row(pair(`${seasonYear} 赛季奖金`, `${seasonYear} prize money`), b.ytdPrize ? money(b.ytdPrize) : '—')}
            </dl>
            ${
              b.personal
                ? `<div class="mt5"><div class="eyebrow mb3" style="margin-bottom:8px">${pair('个人简介', 'Personal')}</div>
                   <div class="prose" lang="en">${esc(b.personal)}</div></div>`
                : ''
            }
            <div class="dim mt5" style="font-size:11.5px">
              ${pair('WTA 官方档案最后更新：', 'Biography record updated by the WTA: ')}${
                b.bioUpdated ? dateLabel(b.bioUpdated) : '—'
              }。<br>
              ${pair(
                '档案与赛况文字由 WTA 以英文发布，此处保留原文。',
                'Biographical and season prose is published by the WTA in English and is reproduced in its original language.',
              )}
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card-hd"><h3>${pair('近期战绩', 'Recent form')}</h3>
              <span class="dim" style="font-size:11.5px">${pair('最新在前', 'newest first')}</span></div>
            <div class="card-bd">
              ${formStrip(rec?.last10 || currentMatches.slice(0, 10).map((m) => m.w), 10)}
              ${
                rec
                  ? `<div class="mt4 row" style="gap:var(--sp-5);flex-wrap:wrap">
                      <div><div class="eyebrow">${pair('赛季', 'Season')}</div><b class="num" style="font-size:17px">${record(rec.w, rec.l)}</b></div>
                      <div><div class="eyebrow">${pair('冠军', 'Titles')}</div><b class="num" style="font-size:17px">${rec.titles}</b></div>
                      <div><div class="eyebrow">${pair('决赛', 'Finals')}</div><b class="num" style="font-size:17px">${rec.finals}</b></div>
                    </div>`
                  : ''
              }
            </div>
          </div>

          ${
            b.highlights
              ? `<div class="card mt5">
                  <div class="card-hd"><h3>${pair('生涯亮点', 'Career highlights')}</h3>
                    <span class="dim" style="font-size:11.5px">${pair('WTA 英文原文', 'WTA original text')}</span></div>
                  <div class="card-bd"><div class="prose" lang="en" style="max-height:320px;overflow-y:auto">${esc(
                    b.highlights,
                  )}</div></div>
                </div>`
              : ''
          }

          ${
            b.yearDetail
              ? `<div class="card mt5">
                  <div class="card-hd"><h3>${pair(`${seasonYear} 赛季回顾`, `${seasonYear} in review`)}</h3>
                    <span class="dim" style="font-size:11.5px">${pair('WTA 英文原文', 'WTA original text')}</span></div>
                  <div class="card-bd"><div class="prose" lang="en">${esc(b.yearDetail)}</div></div>
                </div>`
              : ''
          }
        </div>
      </div>

      ${
        rivals.length
          ? `<div class="card mt5">
              <div class="card-hd">
                <div><span class="eyebrow">Head-to-head · 交手</span>
                  <h3>${pair('对现役前 30 的战绩', 'Record against the current top 30')}</h3></div>
                <span class="dim" style="font-size:11.5px">${pair('已存交手，2023 年至今', 'stored meetings, 2023–present')}</span>
              </div>
              <div class="card-bd flush">
                <div class="rivals">
                  ${rivals
                    .map(
                      (r) => `<a class="rival" href="#/compare/${id}/${r.id}">
                        ${avatar(r.id, r.name, 34)}
                        <span class="r-name">${pair(playerZh(r.id), r.name)}</span>
                        <span class="flag">${esc(r.country || '')}</span>
                        <span class="num dim r-rank">${r.rank ? `No.${r.rank}` : ''}</span>
                        <span class="r-rec ${r.wins > r.losses ? 'lead' : r.wins < r.losses ? 'trail' : ''}">
                          ${r.wins}–${r.losses}
                        </span>
                      </a>`,
                    )
                    .join('')}
                </div>
              </div>
            </div>`
          : ''
      }
    </div>

    <div data-panel="results" class="mt5" hidden>
      <div class="grid c2">
        <div class="card">
          <div class="card-hd"><h3>${pair('按场地分类战绩', 'Record by surface')}</h3><span class="dim" style="font-size:11.5px">${pair('2023 年至今', 'since 2023')}</span></div>
          <div class="card-bd flush">
            ${
              surfaceSplits.length
                ? surfaceSplits
                    .map(
                      ([sfc, r]) => `<div class="lb-row" style="grid-template-columns:minmax(0,1fr) auto auto;gap:var(--sp-4)">
                        <span class="lb-n">${surfaceChip(sfc)}</span>
                        <span class="num dim" style="font-size:12.5px">${record(r.w, r.l)}</span>
                        <span class="lb-v">${pct(winPct(r.w, r.l))}</span>
                      </div>`,
                    )
                    .join('')
                : `<div class="empty">${pair('未存储该球员的比赛记录', 'No match log stored for this player')}</div>`
            }
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h3>${pair('按赛事级别分类战绩', 'Record by tournament level')}</h3><span class="dim" style="font-size:11.5px">${pair('2023 年至今', 'since 2023')}</span></div>
          <div class="card-bd flush">
            ${
              levelSplits.length
                ? levelSplits
                    .map(
                      ([lvl, r]) => `<div class="lb-row" style="grid-template-columns:minmax(0,1fr) auto auto;gap:var(--sp-4)">
                        <span class="lb-n">${levelTag(lvl) || esc(lvl)}</span>
                        <span class="num dim" style="font-size:12.5px">${record(r.w, r.l)}</span>
                        <span class="lb-v">${pct(winPct(r.w, r.l))}</span>
                      </div>`,
                    )
                    .join('')
                : `<div class="empty">${pair('未存储该球员的比赛记录', 'No match log stored for this player')}</div>`
            }
          </div>
        </div>
      </div>

      ${
        years.length
          ? `<div class="card mt5">
              <div class="card-hd"><h3>${pair('各赛季汇总', 'Season summaries')}</h3></div>
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead><tr>
                    <th class="l">${pair('赛季', 'Season')}</th><th>${pair('场次', 'Matches')}</th><th>${pair('胜', 'W')}</th><th>${pair('负', 'L')}</th>
                    <th>${pair('胜率', 'Win %')}</th><th>${pair('冠军', 'Titles')}</th><th>${pair('决赛', 'Finals')}</th>
                    <th class="l hide-sm">${pair('最佳场地', 'Best surface')}</th>
                  </tr></thead>
                  <tbody>
                    ${years
                      .map((y) => {
                        const list = byYear.get(y);
                        const w = list.filter((m) => m.w).length;
                        const l = list.length - w;
                        const surfaces = {};
                        for (const m of list) {
                          surfaces[m.sfc] = (surfaces[m.sfc] || 0) + (m.w ? 1 : 0);
                        }
                        const best = Object.entries(surfaces).sort((a, b2) => b2[1] - a[1])[0];
                        return `<tr>
                          <td class="l num">${y}</td>
                          <td class="num dim">${list.length}</td>
                          <td class="num" style="color:var(--grass-soft)">${w}</td>
                          <td class="num" style="color:#e08079">${l}</td>
                          <td class="num">${pct(winPct(w, l))}</td>
                          <td class="num">${list.filter((m) => m.r === 'F' && m.w).length}</td>
                          <td class="num dim">${list.filter((m) => m.r === 'F').length}</td>
                          <td class="l hide-sm">${best ? surfaceChip(best[0]) : '—'}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>`
          : ''
      }
    </div>

    <div data-panel="stats" class="mt5" hidden>
      ${
        Object.keys(s).length
          ? `<div class="grid c2">
              <div class="card">
                <div class="card-hd"><div><span class="eyebrow">${seasonYear} ${pair('赛季', 'season')}</span>
                  <h3>${pair('发球与接发特征', 'Serve &amp; return profile')}</h3></div>
                  <span class="dim" style="font-size:11.5px">${pair('WTA 官方赛季记录', 'official WTA season record')}</span></div>
                <div class="card-bd flush">
                  ${serveMetrics
                    .map(([label, key, fmt, isPct]) => {
                      const v = s[key];
                      const tourAvg = avg(key);
                      return `<div class="lb-row" style="grid-template-columns:minmax(0,150px) minmax(0,1fr) auto;gap:var(--sp-4)">
                        <span class="lb-n dim" style="font-size:12.5px">${label}</span>
                        <span class="lb-bar" style="margin:0"><i style="width:${
                          isPct && v != null ? Math.min(100, v) : v != null ? Math.min(100, (v / Math.max(1, avg(key) * 1.6)) * 100) : 0
                        }%"></i></span>
                        <span class="lb-v">${v == null ? '—' : fmt(v)}
                          ${tourAvg != null ? `<span class="dim" style="font-size:10px;font-weight:400"> / ${fmt(tourAvg)}</span>` : ''}
                        </span>
                      </div>`;
                    })
                    .join('')}
                  <div class="card-bd dim" style="font-size:11.5px;border-top:1px solid var(--line-soft)">
                    ${pair(
                      '斜杠后的数字是前 300 名球员在该项统计上的平均值，可一眼看出这位球员相对整体的位置。',
                      'The figure after the slash is the top-300 average, so you can see where this player sits relative to the field.',
                    )}
                  </div>
                </div>
              </div>

              <div>
                ${
                  rankBoard
                    ? `<div class="card">
                        <div class="card-hd"><h3>${pair('在巡回赛中的位置', 'Where she ranks on tour')}</h3></div>
                        <div class="card-bd">
                          <div class="tiles">
                            ${tileMini(
                              rankInBoard(rankBoard) || '—',
                              pair('发球局胜率', 'Service games won'),
                              rankBoard.rows[0]?.value != null
                                ? `${pair('榜首', 'Leader')}: ${playerZh(rankBoard.rows[0].id) || rankBoard.rows[0].name} ${pct(rankBoard.rows[0].value)}`
                                : '',
                            )}
                            ${tileMini(
                              rankInBoard(acesBoard) || '—',
                              pair('ACE 球', 'Aces'),
                              acesBoard?.rows[0]
                                ? `${pair('榜首', 'Leader')}: ${playerZh(acesBoard.rows[0].id) || acesBoard.rows[0].name} ${int(acesBoard.rows[0].value)}`
                                : '',
                            )}
                          </div>
                          <div class="dim mt4" style="font-size:11.5px">
                            ${pair(
                              `在 ${comparable.length} 位本赛季至少出战 10 场的排名球员中的名次。`,
                              `Season-to-date rank among the ${comparable.length} ranked players with at least 10 matches.`,
                            )}
                          </div>
                        </div>
                      </div>`
                    : ''
                }

                ${
                  s.perTournamentAvg
                    ? `<div class="card mt5">
                        <div class="card-hd"><h3>${pair('单项赛事平均值', 'Per-tournament averages')}</h3></div>
                        <div class="card-bd flush">
                          ${Object.entries(s.perTournamentAvg)
                            .slice(0, 10)
                            .map(
                              ([k, v]) => `<div class="lb-row">
                                <span class="lb-i"></span>
                                <span class="lb-n dim" style="font-size:12.5px">${esc(
                                  labelise(k),
                                )}</span>
                                <span class="lb-v">${v}</span>
                              </div>`,
                            )
                            .join('')}
                        </div>
                      </div>`
                    : ''
                }
              </div>
            </div>`
          : `<div class="card"><div class="card-bd"><div class="empty">
              <b>${pair('暂无赛季统计', 'No season statistics published')}</b>
              <div>${pair(
                `WTA 尚未发布这位球员的 ${seasonYear} 赛季统计记录。`,
                `The WTA does not publish a ${seasonYear} statistics record for this player yet.`,
              )}</div>
            </div></div></div>`
      }
    </div>

    <div data-panel="ranking" class="mt5" hidden>
      <div class="grid c2">
        <div class="card">
          <div class="card-hd"><div><span class="eyebrow">Career · 生涯</span><h3>${pair('单打排名历史', 'Singles ranking history')}</h3></div>
            <span class="dim" style="font-size:11.5px">${pair('近五年', 'last 5 years')}</span></div>
          <div class="card-bd">
            ${lineChart({
              points,
              invert: true,
              color: 'var(--clay)',
              height: 220,
              fmt: (v) => `#${Math.round(v)}`,
            })}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><div><span class="eyebrow">Career · 生涯</span><h3>${pair('双打排名历史', 'Doubles ranking history')}</h3></div></div>
          <div class="card-bd">
            ${lineChart({
              points: doubles,
              invert: true,
              color: 'var(--hard)',
              height: 220,
              fmt: (v) => `#${Math.round(v)}`,
            })}
          </div>
        </div>
      </div>
      <div class="card mt5">
        <div class="card-hd"><h3>${pair('排名里程碑', 'Ranking milestones')}</h3></div>
        <div class="card-bd">
          <dl class="dl">
            ${row(pair('单打最高排名', 'Highest singles rank'), b.sglHighRank ? `No.${b.sglHighRank} · ${dateLabel(b.sglHighDate)}` : '—')}
            ${row(pair('双打最高排名', 'Highest doubles rank'), b.dblHighRank ? `No.${b.dblHighRank} · ${dateLabel(b.dblHighDate)}` : '—')}
            ${row(pair('数据中的周数', 'Weeks in the data set'), int(h.length))}
            ${row(pair('当前单打排名', 'Current singles rank'), `No.${p.rank}`)}
            ${row(pair('当前双打排名', 'Current doubles rank'), b.dblRank ? `No.${b.dblRank}` : '—')}
          </dl>
        </div>
      </div>
    </div>

    ${
      log.length
        ? `<div data-panel="log" class="mt5" hidden>
            <div class="card">
              <div class="card-hd">
                <h3>${pair('单打比赛记录', 'Singles match log')}</h3>
                <div class="chips" data-years>
                  ${years
                    .map(
                      (y, i) =>
                        `<button class="chip ${i === 0 ? 'on' : ''}" data-year="${y}">${y}</button>`,
                    )
                    .join('')}
                </div>
              </div>
              <div class="matches" data-matchlist></div>
            </div>
          </div>`
        : ''
    }
  </section>
  `;

  /* ---------- tabs ---------- */
  const tabs = host.querySelector('[data-tabs]');
  tabs?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    tabs.querySelectorAll('button').forEach((b2) => b2.classList.toggle('on', b2 === btn));
    host.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== btn.dataset.tab;
    });
  });

  /* ---------- match log ---------- */
  const list = host.querySelector('[data-matchlist]');
  if (list) {
    const paintMatches = (year) => {
      const rows = (byYear.get(Number(year)) || []).slice(0, 120);
      list.innerHTML =
        rows
          .map(
            (m) => `<div class="match">
              <span class="m-date">${esc(monthDay(m.d))}</span>
              <span class="m-res ${m.w ? 'w' : 'l'}">${m.w ? 'W' : 'L'}</span>
              <span class="m-main">
                <span class="m-t">
                  <span class="m-name">${pair(playerZh(m.oid), m.o || '—')}</span>
                  ${m.oc ? countryName(m.oc) : ''}
                  ${m.orank ? `<span class="num dim" style="font-size:11px">No.${m.orank}</span>` : ''}
                </span>
                <span class="m-sub">${pair(tournamentZhL(m.t), m.t)} · ${roundName(m.r)} · ${surfaceName(m.sfc, surfaceLabel(m.sfc))}</span>
              </span>
              <span class="m-score">${esc(m.sc)}</span>
            </div>`,
          )
          .join('') || `<div class="empty">${pair('该赛季没有比赛记录', 'No matches logged for this season')}</div>`;
    };
    paintMatches(currentYear);
    host.querySelector('[data-years]')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-year]');
      if (!btn) return;
      host
        .querySelectorAll('[data-year]')
        .forEach((b2) => b2.classList.toggle('on', b2 === btn));
      paintMatches(btn.dataset.year);
    });
  }
}

function tournamentZhL(name) {
  return tournamentZh(name);
}

function row(labelHtml, value) {
  return `<dt>${labelHtml}</dt><dd>${value}</dd>`;
}

function tileMini(value, labelHtml, sub) {
  return `<div class="tile"><b>${esc(value)}</b><small>${labelHtml}</small>${
    sub ? `<div class="sub">${esc(sub)}</div>` : ''
  }</div>`;
}

function labelise(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}
