/* ==========================================================================
   女子网球巡回赛 · 数据看板 — 应用逻辑
   --------------------------------------------------------------------------
   双语机制：所有文案成对渲染为 <span class="cn"> … <span class="en">，
   由 html[data-lang] 用 CSS 控制显隐，切换语言无需重新渲染。
   ========================================================================== */
(function () {
  'use strict';

  var D = window.WTA_DATA || { meta: {}, players: [], results: [], champions: [], calendar: [], boards: [], career: {}, seasonRecords: {} };
  var H = window.WTA_H2H || { players: {}, pairs: {} };
  /**
   * Individual meetings ship separately and are injected the first time the
   * head-to-head panel needs them: they are 3.4 MB, and the win/loss record for
   * any pairing is already in the summary payload.
   */
  var h2hMeetingsPromise = null;
  function loadH2HMeetings() {
    if (window.WTA_H2H_MATCHES) return Promise.resolve(window.WTA_H2H_MATCHES);
    if (h2hMeetingsPromise) return h2hMeetingsPromise;
    h2hMeetingsPromise = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'data/h2h-matches.js';
      s.onload = function () { resolve(window.WTA_H2H_MATCHES || {}); };
      s.onerror = function () { resolve({}); };
      document.head.appendChild(s);
    });
    return h2hMeetingsPromise;
  }
  var META = D.meta || {};
  var SEASON = META.season || new Date().getFullYear();

  /* ---------------------------------------------------------- 工具 */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function int(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }
  function pct(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(d == null ? 1 : d) + '%';
  }
  function money(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function moneyShort(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function shortDate(iso, withYear) {
    if (!iso) return '—';
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '—';
    var s = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return withYear ? s + ' ' + d.getUTCFullYear() : s;
  }
  function isoDate(iso) {
    if (!iso) return '—';
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '—';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }
  function age(birth) {
    if (!birth) return null;
    var d = new Date(String(birth).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d.getTime())) return null;
    var now = new Date(), a = now.getUTCFullYear() - d.getUTCFullYear();
    var m = now.getUTCMonth() - d.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a -= 1;
    return a;
  }
  function photo(id) { return 'https://wtafiles.blob.core.windows.net/images/headshots/' + id + '.jpg'; }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  }
  /** Headshot with a monogram fallback — official photos do not exist for everyone. */
  function av(id, name, size, cls) {
    var s = size || 34;
    return '<img class="' + (cls || '') + '" src="' + photo(id) + '" alt="" loading="lazy" ' +
      'width="' + s + '" height="' + s + '" style="width:' + s + 'px;height:' + s + 'px" ' +
      'data-ini="' + esc(initials(name)) + '" onerror="WTA.imgFallback(this)">';
  }

  /** 中英双语对 */
  function bi(cn, en, cls) {
    var c = String(cn == null ? '' : cn).trim();
    var e = String(en == null ? '' : en).trim();
    if (!c) return '<span class="' + (cls || '') + '">' + esc(e) + '</span>';
    if (!e) return '<span class="' + (cls || '') + '">' + esc(c) + '</span>';
    return '<span class="' + (cls || '') + '"><span class="cn">' + esc(c) + '</span>' +
      '<span class="en">' + esc(e) + '</span></span>';
  }

  /* ------------------------------------------------- 中文词表 */
  var ZH = META.zh || {};
  function countryZh(code) { return (ZH.countries || {})[String(code || '').toUpperCase()] || ''; }
  function levelZh(level) { return (ZH.levels || {})[String(level || '')] || ''; }
  function roundZh(r) { return (ZH.rounds || {})[String(r || '').toUpperCase()] || ''; }
  function surfaceZh(s) { return (ZH.surfaces || {})[String(s || '').toUpperCase()] || ''; }
  function tourZh(name) { return (D.tournamentZh || {})[name] || ''; }

  /** 数据榜中文名（英文名由数据管线提供） */
  var BOARD_ZH = {
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
    servicePointsWonPct: '发球得分率'
  };
  function boardZh(b) { return BOARD_ZH[b.key] || b.labelZh || ''; }

  var SURFACE_EN = { HARD: 'Hard', CLAY: 'Clay', GRASS: 'Grass', CARPET: 'Carpet' };
  function surfaceLabel(s) { return SURFACE_EN[String(s || '').toUpperCase()] || s || '—'; }
  function surfaceTag(s) {
    var k = String(s || '').toUpperCase();
    var key = k.charAt(0) + k.slice(1).toLowerCase();
    return '<span class="sfc ' + key + '"><i></i>' +
      bi(surfaceZh(s) || surfaceLabel(s), surfaceLabel(s)) + '</span>';
  }
  function levelTag(level) {
    if (!level) return '';
    var l = String(level), cls = '';
    if (/grand slam/i.test(l)) cls = 'gs';
    else if (/1000/i.test(l)) cls = 'w1000';
    else if (/500/i.test(l)) cls = 'w500';
    else if (/250|125/i.test(l)) cls = 'w250';
    else if (/finals/i.test(l)) cls = 'finals';
    var en = l.replace(/^Grand Slam$/i, 'SLAM');
    return '<span class="tag-lvl ' + cls + '">' + bi(levelZh(l) || l, en) + '</span>';
  }
  function roundTag(r) {
    if (!r) return '';
    var zh = roundZh(r);
    return zh ? bi(zh, r) : esc(r);
  }
  function moveTag(m) {
    var v = Number(m) || 0;
    if (!v) return '<span class="move flat">—</span>';
    var up = v > 0;
    return '<span class="move ' + (up ? 'up' : 'down') + '">' + (up ? '▲ +' : '▼ −') +
      Math.abs(v) + '</span>';
  }
  function playerZhOf(p) { return (p && p.zh) || ''; }

  /** 球员名（中文主行 + 英文副行） */
  function playerNm(p, cls) {
    if (!p) return '';
    return bi(playerZhOf(p) || p.name || '', p.name || '', cls);
  }
  function playerLink(p, cls) {
    if (!p) return '';
    return '<a href="javascript:void(0)" data-player="' + p.id + '" class="' + (cls || '') + '">' +
      playerNm(p) + '</a>';
  }
  function countryCell(code) {
    var c = String(code || '').toUpperCase();
    return '<span class="tb-flag">' + bi(countryZh(c) || c, c) + '</span>';
  }

  /* ------------------------------------------------- 迷你走势图 */
  function sparkline(rows, w, h) {
    var pts = (rows || []).filter(function (r) { return r && r[1]; });
    if (pts.length < 2) return '<span class="dim">—</span>';
    w = w || 62; h = h || 20;
    var ys = pts.map(function (r) { return r[1]; });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (lo === hi) { lo -= 1; hi += 1; }
    var step = w / (pts.length - 1);
    var path = pts.map(function (r, i) {
      var x = i * step, y = ((r[1] - lo) / (hi - lo)) * (h - 4) + 2;
      return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
      '" aria-hidden="true"><path d="' + path + '" fill="none" stroke="var(--ball-400)" ' +
      'stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  /* ------------------------------------------------- 数据索引 */
  var byId = {};
  D.players.forEach(function (p) { byId[p.id] = p; });
  function miniPlayer(id) {
    if (byId[id]) return byId[id];
    if (H.players && H.players[id]) {
      var h = H.players[id];
      return { id: id, name: h.name, zh: h.zh, country: h.country, rank: h.rank };
    }
    return { id: id, name: '#' + id, zh: '', country: '', rank: null };
  }
  /** Enrich a lightweight result reference into a displayable player. */
  function enrich(ref) {
    var p = miniPlayer(ref.id);
    return { id: ref.id, name: ref.name || p.name, zh: ref.zh || p.zh, country: ref.country || p.country, rank: ref.rank != null ? ref.rank : p.rank };
  }

  /* ==========================================================================
     总览
     ========================================================================== */
  function renderOverview() {
    var c = META.counts || {};
    $('#heroUpdated').textContent = shortDate(META.generatedAt, true);
    $('#heroRankWeek').textContent = shortDate(META.rankingsAsOf, true);
    $('#heroPlayers').textContent = int(c.rankedPlayers);
    $('#heroTitleCn').textContent = SEASON + ' 赛季';
    $('#heroTitleEn').textContent = SEASON + ' SEASON';

    var no1 = D.players[0];
    var kpis = [
      { cn: '排名球员', en: 'Ranked players', v: int(c.rankedPlayers), sub: bi('单打世界排名收录', 'singles ranking depth'), accent: 'var(--ball-500)' },
      { cn: '赛季赛事', en: 'Season events', v: int(c.events), sub: bi(c.completedEvents + ' 项已结束', c.completedEvents + ' completed'), accent: 'var(--clay-500)' },
      { cn: '赛季比赛', en: 'Season matches', v: int(c.seasonMatches), sub: bi('已收录赛果', 'results captured'), accent: 'var(--grass-400)' },
      { cn: '产生冠军', en: 'Titles won', v: int(c.champions), sub: bi('本赛季单打冠军', 'singles champions'), accent: 'var(--hard-500)' },
      { cn: '世界第一', en: 'World No.1', v: no1 ? playerZhOf(no1) || no1.name : '—', sub: no1 ? bi(int(no1.points) + ' 积分', int(no1.points) + ' pts') : '', accent: 'var(--ball-500)', small: true },
      { cn: '下周开赛', en: 'Upcoming', v: int(c.upcomingEvents), sub: bi('未开始的赛事', 'events not yet played'), accent: 'var(--clay-400)' }
    ];
    $('#kpiGrid').innerHTML = kpis.map(function (k) {
      return '<div class="kpi" style="--kpi-accent:' + k.accent + '">' +
        '<div class="kpi-label">' + bi(k.cn, k.en) + '</div>' +
        '<div class="kpi-value"' + (k.small ? ' style="font-size:22px;font-family:var(--font-cn)"' : '') + '>' + esc(k.v) + '</div>' +
        '<div class="kpi-sub">' + k.sub + '</div></div>';
    }).join('');

    /* 冠军墙 */
    var champs = D.champions.filter(function (x) { return x.year === SEASON; });
    $('#champCount').innerHTML = bi(champs.length + ' 项赛事', champs.length + ' events');
    $('#championWall').innerHTML = champs.slice(0, 40).map(function (ch) {
      var p = enrich(ch.player);
      return '<div class="champ-card" data-player="' + p.id + '">' +
        '<div class="champ-top">' + av(p.id, p.name, 32, 'champ-avatar') +
        '<div class="champ-name">' + bi(playerZhOf(p) || p.name, p.name) + '</div></div>' +
        '<div class="champ-ev">' + bi(tourZh(ch.event) || ch.event, ch.event) + '</div>' +
        '<div class="champ-ev">' + esc(shortDate(ch.date)) + ' · ' + levelTag(ch.level) + '</div></div>';
    }).join('') || emptyState('暂无冠军数据', 'No champions yet');

    /* 最新赛果 */
    var recent = D.results.slice(0, 12);
    $('#recentCount').innerHTML = bi('最近 ' + recent.length + ' 场', 'latest ' + recent.length);
    $('#recentList').innerHTML = recent.map(function (r) {
      var w = enrich(r.winner), l = enrich(r.loser);
      return '<div class="rr">' +
        '<div class="rr-date">' + esc(shortDate(r.date)) + '<br>' + esc(String(r.date).slice(0, 4)) + '</div>' +
        '<div class="rr-main">' +
          '<div class="rr-players"><span class="rr-w">' + playerNm(w) + '</span>' +
          '<span class="d">d.</span><span class="rr-l">' + playerNm(l) + '</span></div>' +
          '<div class="rr-ev">' + roundTag(r.round) + '<span>·</span>' +
          bi(tourZh(r.event) || r.event, r.event) + surfaceTag(r.surface) + '</div>' +
        '</div>' +
        '<div class="rr-score">' + esc(r.score) + '</div></div>';
    }).join('') || emptyState('暂无赛果', 'No results yet');

    /* 前十 */
    $('#topTen').innerHTML = miniTable(D.players.slice(0, 10), 'points');

    /* 赛季领跑 */
    $('#miniBoards').innerHTML = D.boards.slice(0, 4).map(function (b) {
      var max = b.rows.length ? b.rows[0].value : 1;
      return '<div class="mini-board"><div class="mini-head">' +
        bi(boardZh(b), b.label) +
        '<span>' + esc(b.unit === '%' ? 'season %' : 'total') + '</span></div>' +
        b.rows.slice(0, 5).map(function (r) {
          var p = miniPlayer(r.id);
          return '<div class="mini-row"><span class="n">' +
            '<a href="javascript:void(0)" data-player="' + r.id + '">' +
            esc(playerZhOf(p) || r.name) + '</a></span>' +
            '<span class="v">' + (b.unit === '%' ? pct(r.value) : int(r.value)) + '</span>' +
            '<span class="mini-bar" style="grid-column:1/-1"><i style="width:' +
            Math.max(2, (r.value / max) * 100).toFixed(1) + '%"></i></span></div>';
        }).join('') + '</div>';
    }).join('');

    /* 生涯榜 */
    var career = D.career || {};
    $('#careerGrid').innerHTML = [
      careerCol('单打冠军', 'Singles titles', (career.titles || []).slice(0, 8), function (p) { return int(p.titles); }),
      careerCol('生涯胜场', 'Career match wins', (career.careerWins || []).slice(0, 8), function (p) { return int(p.won); }),
      careerCol('生涯奖金', 'Career prize money', (career.prizeMoney || []).slice(0, 8), function (p) { return moneyShort(p.prize); })
    ].join('');
  }

  function careerCol(cn, en, rows, fmt) {
    return '<div class="career-col"><h4>' + bi(cn, en) + '</h4>' +
      rows.map(function (p, i) {
        return '<div class="career-row"><span class="i">' + (i + 1) + '</span>' +
          '<span class="n"><a href="javascript:void(0)" data-player="' + p.id + '">' +
          esc(p.zh || p.name) + '</a></span>' +
          '<span class="v">' + fmt(p) + '</span></div>';
      }).join('') + '</div>';
  }

  function miniTable(rows, metric) {
    return '<div class="mini-boards">' + rows.map(function (p, i) {
      return '<div class="mini-row" style="padding:7px 18px">' +
        '<span class="n"><span class="i" style="font-family:var(--font-en);color:var(--ivory-mute);width:20px;display:inline-block">' +
        (i + 1) + '</span>' +
        '<a href="javascript:void(0)" data-player="' + p.id + '" style="margin-left:8px">' +
        esc(playerZhOf(p) || p.name) + '</a>' +
        '<span class="en" style="margin-left:6px">' + esc(p.country || '') + '</span></span>' +
        '<span class="v">' + int(p[metric]) + '</span></div>';
    }).join('') + '</div>';
  }

  function emptyState(cn, en) {
    return '<div class="empty-state">' + bi(cn, en) + '</div>';
  }

  /* ==========================================================================
     赛程
     ========================================================================== */
  var calState = { year: SEASON, level: '', status: '' };

  function renderSchedule() {
    var years = [];
    D.calendar.forEach(function (e) { if (years.indexOf(e.year) < 0) years.push(e.year); });
    years.sort(function (a, b) { return b - a; });

    var levels = ['Grand Slam', 'WTA Finals', 'WTA 1000', 'WTA 500', 'WTA 250', 'WTA 125'];
    $('#calYear').innerHTML = years.map(function (y) {
      return segBtn('data-y="' + y + '"', y, y === calState.year);
    }).join('');
    $('#calLevel').innerHTML = segBtn('data-lv=""', '全部级别', 'All levels', !calState.level) +
      levels.filter(function (l) { return D.calendar.some(function (e) { return e.level === l; }); })
        .map(function (l) {
          var short = l.replace(/^WTA\s*/, '').replace(/^Grand Slam$/, 'SLAM');
          return segBtn('data-lv="' + esc(l) + '"', levelZh(l) || l, short, calState.level === l);
        }).join('');
    $('#calStatus').innerHTML =
      segBtn('data-st=""', '全部状态', 'All', !calState.status) +
      segBtn('data-st="past"', '已结束', 'Completed', calState.status === 'past') +
      segBtn('data-st="upcoming"', '未开始', 'Upcoming', calState.status === 'upcoming');

    var rows = D.calendar.filter(function (e) {
      if (e.year !== calState.year) return false;
      if (calState.level && e.level !== calState.level) return false;
      if (calState.status === 'past' && e.status !== 'past') return false;
      if (calState.status === 'upcoming' && e.status === 'past') return false;
      return true;
    }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });

    $('#calTitle').innerHTML = bi(calState.year + ' 赛季赛程', calState.year + ' Season Calendar');
    $('#calCount').innerHTML = bi(rows.length + ' 项赛事', rows.length + ' events');

    $('#calTimeline').innerHTML = rows.map(function (e) {
      var prog = progressFor(e);
      var champ = e.champion ? enrich(e.champion) : null;
      return '<div class="tl-item ' + (e.status === 'past' ? 'past' : '') + '">' +
        '<div class="tl-date"><span class="tl-range">' + esc(shortDate(e.start)) + ' – ' + esc(shortDate(e.end) || '…') + '</span>' +
        '<span class="tl-count">' + esc(e.city || '') + '</span></div>' +
        '<div class="tl-main">' +
          '<div class="tl-name">' + bi(tourZh(e.name) || e.name, e.name) + levelTag(e.level) + '</div>' +
          '<div class="tl-meta">' + surfaceTag(e.surface) +
            (e.draw ? '<span>' + bi(e.draw + ' 签位', e.draw + ' draw') + '</span>' : '') +
            (e.prize ? '<span>' + esc(moneyShort(e.prize)) + '</span>' : '') +
            (e.country ? '<span>' + esc(countryZh(e.country) || e.country) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="tl-side">' +
          (champ
            ? '<span class="tl-winner">' + av(champ.id, champ.name, 24) +
              '<a href="javascript:void(0)" data-player="' + champ.id + '">' +
              esc(playerZhOf(champ) || champ.name) + '</a></span>'
            : '<span class="tl-winner" style="color:var(--ivory-mute)">' +
              bi(e.status === 'past' ? '—' : '待定', e.status === 'past' ? '—' : 'TBD') + '</span>') +
          (prog != null ? '<span class="tl-progress"><i style="width:' + prog + '%"></i></span>' : '') +
        '</div></div>';
    }).join('') || emptyState('没有符合条件的赛事', 'No events match these filters');

    var past = rows.filter(function (e) { return e.status === 'past'; }).length;
    var prize = rows.reduce(function (a, e) { return a + (e.prize || 0); }, 0);
    var countries = {};
    rows.forEach(function (e) { if (e.country) countries[e.country] = 1; });
    var slams = rows.filter(function (e) { return /grand slam/i.test(e.level); }).length;
    $('#calStats').innerHTML = [
      ['赛事数量', 'Events', int(rows.length), past + ' 已结束 / completed'],
      ['大满贯', 'Grand Slams', int(slams), '四项大满贯 / four majors'],
      ['举办国家', 'Countries', int(Object.keys(countries).length), 'host nations'],
      ['奖金总额', 'Total prize', prize ? moneyShort(prize) : '—', 'published totals']
    ].map(function (s) {
      return '<div class="s"><b>' + esc(s[2]) + '</b><span>' + bi(s[0], s[1]) + '</span>' +
        '<span style="font-size:10px;opacity:.75">' + esc(s[3]) + '</span></div>';
    }).join('');
  }

  /** Rough progress through a completed event, or null if not started. */
  function progressFor(e) {
    var today = new Date();
    var s = new Date(e.start + 'T00:00:00Z'), t = new Date(e.end + 'T00:00:00Z');
    if (isNaN(s) || isNaN(t)) return null;
    if (today < s) return 0;
    if (today > t) return 100;
    return Math.round(((today - s) / (t - s)) * 100);
  }

  function segBtn(attrs, cn, en, active) {
    return '<button class="seg' + (active ? ' active' : '') + '" ' + attrs + '>' +
      (en == null ? esc(cn) : bi(cn, en)) + '</button>';
  }

  /* ==========================================================================
     赛果
     ========================================================================== */
  var resState = { round: '', surface: '', q: '', limit: 40 };

  function renderResults() {
    var rounds = ['F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128'];
    var present = rounds.filter(function (r) {
      return D.results.some(function (x) { return x.round === r; });
    });
    $('#resRound').innerHTML = segBtn('data-r=""', '全部轮次', 'All rounds', !resState.round) +
      present.map(function (r) {
        return segBtn('data-r="' + r + '"', roundZh(r) || r, r, resState.round === r);
      }).join('');
    var surfaces = ['HARD', 'CLAY', 'GRASS'];
    $('#resSurface').innerHTML = segBtn('data-s=""', '全部场地', 'All', !resState.surface) +
      surfaces.filter(function (s) { return D.results.some(function (x) { return x.surface === s; }); })
        .map(function (s) {
          return segBtn('data-s="' + s + '"', surfaceZh(s), surfaceLabel(s), resState.surface === s);
        }).join('');
    paintResults();
  }

  function paintResults() {
    var q = resState.q.trim().toLowerCase();
    var rows = D.results.filter(function (r) {
      if (resState.round && r.round !== resState.round) return false;
      if (resState.surface && r.surface !== resState.surface) return false;
      if (q) {
        var hay = [
          r.winner.name, r.loser.name, playerZhOf(r.winner), playerZhOf(r.loser),
          r.event, tourZh(r.event), r.winner.country, r.loser.country
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    $('#resCount').innerHTML = bi(rows.length + ' 场', rows.length + ' matches');
    var shown = rows.slice(0, resState.limit);
    $('#resList').innerHTML = shown.map(function (r) {
      var w = enrich(r.winner), l = enrich(r.loser);
      return '<div class="result-row">' +
        '<div class="result-date">' + esc(isoDate(r.date)) + '</div>' +
        '<div class="result-main">' +
          '<div class="result-players">' + av(w.id, w.name, 26) +
            '<span class="w">' + playerNm(w) + '</span>' +
            (w.rank ? '<span class="rank">#' + w.rank + '</span>' : '') +
            '<span class="d">d.</span>' + av(l.id, l.name, 26) +
            '<span class="l">' + playerNm(l) + '</span>' +
            (l.rank ? '<span class="rank">#' + l.rank + '</span>' : '') +
          '</div>' +
          '<div class="result-ev">' + roundTag(r.round) + '<span>·</span>' +
            bi(tourZh(r.event) || r.event, r.event) + surfaceTag(r.surface) + levelTag(r.level) +
          '</div>' +
        '</div>' +
        '<div class="result-score">' + esc(r.score) + '</div></div>';
    }).join('') || emptyState('没有符合条件的比赛', 'No matches match these filters');
    $('#resMore').hidden = rows.length <= shown.length;
  }

  /* ==========================================================================
     排名
     ========================================================================== */
  var rankState = { q: '', mode: 'points', limit: 100 };

  function renderRankings() {
    var top3 = D.players.slice(0, 3);
    $('#rankPodium').innerHTML = top3.map(function (p, i) {
      return '<div class="podium-card g' + (i + 1) + '" data-player="' + p.id + '">' +
        '<span class="podium-n">No.' + p.rank + '</span>' +
        av(p.id, p.name, 76) +
        '<div class="podium-name">' + bi(playerZhOf(p) || p.name, p.name) + '</div>' +
        '<div class="podium-pts">' + int(p.points) + '</div>' +
        '<div class="podium-country">' + esc(countryZh(p.country) || p.country) + '</div></div>';
    }).join('');
    $('#rankDesc').innerHTML = bi(
      '排名积分与名次变动均取自 WTA 官方榜单；走势列为最近数月排名变化。',
      'Points and movement are as published by the WTA; the trajectory column shows recent weeks.'
    );
    $('#rankUpdated').textContent = shortDate(META.rankingsAsOf, true);
    paintRanks();
  }

  function paintRanks() {
    var q = rankState.q.trim().toLowerCase();
    var rows = D.players.filter(function (p) {
      if (!q) return true;
      return (p.name + ' ' + (p.zh || '') + ' ' + p.country + ' ' +
        (countryZh(p.country) || '')).toLowerCase().indexOf(q) >= 0;
    });
    var shown = rows.slice(0, rankState.limit);
    $('#rankBody').innerHTML = shown.map(function (p) {
      return '<tr class="clickable" data-player="' + p.id + '">' +
        '<td>' + p.rank + '</td>' +
        '<td class="l"><div class="tb-player">' + av(p.id, p.name, 34) +
          '<span class="tb-nm">' + bi(playerZhOf(p) || p.name, p.name) + '</span></div></td>' +
        '<td class="c">' + countryCell(p.country) + '</td>' +
        '<td>' + moveTag(p.move) + '</td>' +
        '<td class="tb-num">' + (p.age != null ? p.age : (age(p.birth) || '—')) + '</td>' +
        '<td class="tb-num">' + (p.played != null ? p.played : '—') + '</td>' +
        '<td class="tb-num">' + (rankState.mode === 'weeks'
          ? sparkline(p.historyTail)
          : int(p.points)) + '</td></tr>';
    }).join('') || '<tr><td colspan="7">' + emptyState('没有符合条件的球员', 'No players match this filter') + '</td></tr>';
    $('#rankMore').hidden = rows.length <= shown.length;
  }

  /* ==========================================================================
     球员
     ========================================================================== */
  var playerState = { q: '', country: '', sort: 'rank', limit: 36 };

  function renderPlayers() {
    var counts = {};
    D.players.forEach(function (p) { counts[p.country] = (counts[p.country] || 0) + 1; });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12);
    $('#countryFilter').innerHTML = segBtn('data-c=""', '全部', 'All', !playerState.country) +
      top.map(function (c) {
        return segBtn('data-c="' + esc(c) + '"', countryZh(c) || c, c, playerState.country === c);
      }).join('');
    paintPlayers();
  }

  function paintPlayers() {
    var q = playerState.q.trim().toLowerCase();
    var rows = D.players.filter(function (p) {
      if (playerState.country && p.country !== playerState.country) return false;
      if (!q) return true;
      return (p.name + ' ' + (p.zh || '') + ' ' + p.country + ' ' +
        (countryZh(p.country) || '')).toLowerCase().indexOf(q) >= 0;
    });
    var sort = playerState.sort;
    rows = rows.slice().sort(function (a, b) {
      if (sort === 'rank') return (a.rank || 9999) - (b.rank || 9999);
      if (sort === 'wins') return ((b.season && b.season.w) || 0) - ((a.season && a.season.w) || 0);
      if (sort === 'pct') return winPct(b) - winPct(a);
      if (sort === 'titles') return (b.titles || 0) - (a.titles || 0);
      if (sort === 'aces') return ((b.serve && b.serve.aces) || 0) - ((a.serve && a.serve.aces) || 0);
      if (sort === 'prize') return (b.careerPrize || 0) - (a.careerPrize || 0);
      return 0;
    });
    var shown = rows.slice(0, playerState.limit);
    $('#playerEmpty').hidden = rows.length > 0;
    $('#playerGrid').innerHTML = shown.map(function (p) {
      var s = p.season || {};
      var serve = p.serve || {};
      var accent = s.w != null && s.l != null && s.w > s.l ? 'var(--grass-500)' : 'var(--clay-500)';
      return '<div class="player-card" data-player="' + p.id + '" style="--pc-accent:' + accent + '">' +
        '<div class="pc-top">' + av(p.id, p.name, 54) +
          '<div class="pc-id">' +
            '<span class="pc-rank">No.' + p.rank + ' · ' + int(p.points) + ' pts</span>' +
            '<span class="pc-name">' + bi(playerZhOf(p) || p.name, p.name) + '</span>' +
            '<span class="pc-country">' + esc(countryZh(p.country) || p.country) +
              (p.age != null ? ' · ' + p.age + ' ' + '岁' : '') + '</span>' +
          '</div></div>' +
        '<div class="pc-stats">' +
          '<div class="pc-stat"><b>' + (s.w != null ? s.w + '–' + s.l : '—') + '</b>' +
            '<span>' + SEASON + ' W–L</span></div>' +
          '<div class="pc-stat"><b>' + (s.titles != null ? s.titles : '—') + '</b>' +
            '<span>冠军 Titles</span></div>' +
          '<div class="pc-stat"><b>' + (winPct(p) ? winPct(p).toFixed(0) + '%' : '—') + '</b>' +
            '<span>胜率 Win %</span></div>' +
        '</div>' +
        (s.last10 && s.last10.length ? '<div class="pc-form">' + s.last10.map(function (w) {
          return '<i class="' + (w ? 'w' : 'l') + '">' + (w ? 'W' : 'L') + '</i>';
        }).join('') + '</div>' : '') +
        '<div class="pc-serve">' +
          '<span>ACE <b>' + int(serve.aces) + '</b></span>' +
          '<span>一发 <b>' + pct(serve.firstServePct) + '</b></span>' +
          '<span>发球局 <b>' + pct(serve.serviceGamesWonPct) + '</b></span>' +
          (p.careerPrize ? '<span>' + bi('奖金', 'prize') + ' <b>' + moneyShort(p.careerPrize) + '</b></span>' : '') +
        '</div></div>';
    }).join('');
    $('#playerMore').hidden = rows.length <= shown.length;
  }

  function winPct(p) {
    var s = p.season;
    if (!s || s.w == null || s.w + s.l === 0) return 0;
    return (s.w / (s.w + s.l)) * 100;
  }

  /* ==========================================================================
     数据中心
     ========================================================================== */
  var careerMetric = 'titles';

  function renderStats() {
    $('#leaderGrid').innerHTML = D.boards.map(function (b) {
      var max = b.rows.length ? b.rows[0].value : 1;
      return '<div class="leader-card"><div class="leader-head">' +
        '<h4>' + bi(boardZh(b), b.label) + '</h4>' +
        '<span class="u">' + esc(b.unit === '%' ? 'season %' : 'total') + '</span></div>' +
        '<div class="leader-body">' + b.rows.slice(0, 10).map(function (r, i) {
          var p = miniPlayer(r.id);
          return '<div class="lb-row">' +
            '<span class="i">' + (i + 1) + '</span>' + av(r.id, p.name, 28) +
            '<span class="n"><b>' + esc(playerZhOf(p) || r.name) + '</b>' +
              '<span class="en">' + esc(r.name) + '</span></span>' +
            '<span class="v">' + (b.unit === '%' ? pct(r.value) : int(r.value)) + '</span>' +
            '<span class="lb-bar"><i style="width:' + Math.max(2, (r.value / max) * 100).toFixed(1) + '%"></i></span>' +
            '</div>';
        }).join('') + '</div></div>';
    }).join('');

    paintCareer();
    paintSplits();
  }

  function paintCareer() {
    var career = D.career || {};
    var map = {
      titles: { rows: career.titles || [], cn: '单打冠军', en: 'Titles', key: 'titles', fmt: int },
      careerWins: { rows: career.careerWins || [], cn: '生涯胜场', en: 'Wins', key: 'won', fmt: int },
      prizeMoney: { rows: career.prizeMoney || [], cn: '生涯奖金', en: 'Prize money', key: 'prize', fmt: money }
    };
    var m = map[careerMetric];
    $('#careerValueHead').innerHTML = bi(m.cn, m.en);
    $('#careerBody').innerHTML = m.rows.map(function (p, i) {
      return '<tr class="clickable" data-player="' + p.id + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="l"><div class="tb-player">' + av(p.id, p.name, 32) +
          '<span class="tb-nm">' + bi(p.zh || '', p.name) + '</span></div></td>' +
        '<td class="c">' + countryCell(p.country) + '</td>' +
        '<td class="tb-num">' + m.fmt(p[m.key]) + '</td></tr>';
    }).join('');
  }

  function paintSplits() {
    var levels = {}, surfaces = {};
    D.calendar.filter(function (e) { return e.year === SEASON; }).forEach(function (e) {
      levels[e.level] = (levels[e.level] || 0) + 1;
      if (e.surface) surfaces[e.surface] = (surfaces[e.surface] || 0) + 1;
    });
    var levelMax = Math.max.apply(null, Object.keys(levels).map(function (k) { return levels[k]; }).concat([1]));
    var sfcMax = Math.max.apply(null, Object.keys(surfaces).map(function (k) { return surfaces[k]; }).concat([1]));
    var sfcColor = { HARD: 'var(--hard-500)', CLAY: 'var(--clay-500)', GRASS: 'var(--grass-400)', CARPET: 'var(--ivory-mute)' };

    $('#levelSplit').innerHTML = '<h4 style="font-family:var(--font-cn);font-size:13.5px;margin-bottom:10px">' +
      bi('按赛事级别', 'By level') + '</h4>' +
      Object.keys(levels).sort(function (a, b) { return levels[b] - levels[a]; }).map(function (l) {
        return '<div class="split-row"><span>' + esc(levelZh(l) || l) + '</span>' +
          '<span class="v" style="font-family:var(--font-en)">' + levels[l] + '</span>' +
          '<span class="split-bar" style="grid-column:1/-1"><i style="width:' +
          ((levels[l] / levelMax) * 100).toFixed(1) + '%;background:linear-gradient(90deg,var(--clay-500),var(--ball-500))"></i></span></div>';
      }).join('');

    $('#surfaceSplit').innerHTML = '<h4 style="font-family:var(--font-cn);font-size:13.5px;margin-bottom:10px">' +
      bi('按场地类型', 'By surface') + '</h4>' +
      Object.keys(surfaces).sort(function (a, b) { return surfaces[b] - surfaces[a]; }).map(function (s) {
        return '<div class="split-row"><span>' + esc(surfaceZh(s) || surfaceLabel(s)) + '</span>' +
          '<span class="v" style="font-family:var(--font-en)">' + surfaces[s] + '</span>' +
          '<span class="split-bar" style="grid-column:1/-1"><i style="width:' +
          ((surfaces[s] / sfcMax) * 100).toFixed(1) + '%;background:' + (sfcColor[s] || 'var(--ball-500)') + '"></i></span></div>';
      }).join('');
  }

  /* ==========================================================================
     交手
     ========================================================================== */
  var h2hSel = { a: null, b: null };

  function renderH2H() {
    var roster = Object.keys(H.players).map(function (id) { return H.players[id]; });
    // Default to two well-known players so the panel is never empty.
    var top = D.players.slice(0, 2);
    if (!h2hSel.a && top[0]) h2hSel.a = top[0].id;
    if (!h2hSel.b && top[1]) h2hSel.b = top[1].id;
    bindH2HPicker('A', $('#h2hA'), $('#h2hSuggestA'), roster, function (id) { h2hSel.a = id; paintH2HAsync(); });
    bindH2HPicker('B', $('#h2hB'), $('#h2hSuggestB'), roster, function (id) { h2hSel.b = id; paintH2HAsync(); });
    syncH2HInputs();
    // Render the record only; the meeting payload loads when the panel is opened
    // (see syncH2HMeetings), so the initial page load stays light.
    paintH2H();
  }

  var rosterIndex = null;
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function bindH2HPicker(side, input, box, roster, onPick) {
    if (!rosterIndex) {
      rosterIndex = roster.map(function (p) {
        return { id: p.id, name: p.name, zh: p.zh, country: p.country, rank: p.rank, key: norm(p.name), zkey: norm(p.zh) };
      });
    }
    input.addEventListener('input', function () {
      var q = norm(input.value).trim();
      if (q.length < 1) { box.hidden = true; return; }
      var hits = rosterIndex.filter(function (p) {
        return p.key.indexOf(q) >= 0 || (p.zkey && p.zkey.indexOf(q) >= 0);
      }).sort(function (x, y) {
        var xs = x.key.indexOf(q) === 0 ? 0 : 1, ys = y.key.indexOf(q) === 0 ? 0 : 1;
        if (xs !== ys) return xs - ys;
        return (x.rank || 9999) - (y.rank || 9999);
      }).slice(0, 20);
      box.innerHTML = hits.length ? hits.map(function (p) {
        return '<button type="button" data-pick="' + p.id + '">' + av(p.id, p.name, 26) +
          '<span class="sn"><b>' + esc(p.zh || p.name) + '</b>' +
          '<span class="en">' + esc(p.name) + '</span></span>' +
          '<span class="sr">' + (p.rank ? '#' + p.rank : '') + ' ' + esc(p.country || '') + '</span></button>';
      }).join('') : '<div style="padding:12px;text-align:center;color:var(--ivory-mute);font-size:12.5px">' +
        bi('未找到球员', 'No player found') + '</div>';
      box.hidden = false;
    });
    box.addEventListener('mousedown', function (e) {
      var btn = e.target.closest('[data-pick]');
      if (!btn) return;
      e.preventDefault();
      input.value = '';
      box.hidden = true;
      onPick(Number(btn.dataset.pick));
    });
    document.addEventListener('click', function (e) {
      if (!box.parentNode.contains(e.target)) box.hidden = true;
    });
  }

  function syncH2HInputs() {
    if (h2hSel.a) $('#h2hA').value = (H.players[h2hSel.a] || {}).name || '';
    if (h2hSel.b) $('#h2hB').value = (H.players[h2hSel.b] || {}).name || '';
  }

  function paintH2H() {
    var out = $('#h2hResult');
    if (!h2hSel.a || !h2hSel.b) { out.innerHTML = ''; return; }
    if (h2hSel.a === h2hSel.b) {
      out.innerHTML = emptyState('请选择两位不同的球员', 'Pick two different players');
      return;
    }
    var key = h2hSel.a < h2hSel.b ? h2hSel.a + '-' + h2hSel.b : h2hSel.b + '-' + h2hSel.a;
    var rec = H.pairs[key];
    var A = D.players.filter(function (p) { return p.id === h2hSel.a; })[0] || miniPlayer(h2hSel.a);
    var B = D.players.filter(function (p) { return p.id === h2hSel.b; })[0] || miniPlayer(h2hSel.b);

    var aw = 0, bw = 0, total = 0, meetings = [];
    if (rec) {
      var aIsLow = h2hSel.a < h2hSel.b;
      aw = aIsLow ? rec.aw : rec.bw;
      bw = aIsLow ? rec.bw : rec.aw;
      total = rec.n;
    }
    if (window.WTA_H2H_MATCHES) {
      meetings = (window.WTA_H2H_MATCHES[key] || []).map(function (m) {
        return { d: m[0], t: m[1], lvl: m[2], sfc: m[3], r: m[4], sc: m[5], w: m[6] };
      });
    }
    var share = aw + bw > 0 ? (aw / (aw + bw)) * 100 : 50;

    var head = '<div class="h2h-summary">' +
      '<div class="h2h-side ' + (aw > bw ? 'lead' : aw < bw ? 'behind' : '') + '">' +
        av(A.id, A.name, 80) + bi(playerZhOf(A) || A.name, A.name) +
        '<span class="meta">' + (A.rank ? 'No.' + A.rank : '') + ' ' + esc(A.country || '') + '</span></div>' +
      '<div class="h2h-score"><div class="ws">' + aw + ' <span class="sep">–</span> ' + bw + '</div>' +
        '<small>' + bi('交手记录', 'head-to-head') + '</small></div>' +
      '<div class="h2h-side ' + (bw > aw ? 'lead' : bw < aw ? 'behind' : '') + '">' +
        av(B.id, B.name, 80) + bi(playerZhOf(B) || B.name, B.name) +
        '<span class="meta">' + (B.rank ? 'No.' + B.rank : '') + ' ' + esc(B.country || '') + '</span></div>' +
      '</div>' +
      '<div class="h2h-bar"><i class="a" style="width:' + share.toFixed(1) + '%"></i>' +
      '<i class="b" style="width:' + (100 - share).toFixed(1) + '%"></i></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ivory-mute);font-family:var(--font-cn)">' +
      '<span>' + esc(playerZhOf(A) || A.name) + ' ' + aw + ' ' + bi('胜', 'wins') + '</span>' +
      '<span>' + esc(playerZhOf(B) || B.name) + ' ' + bw + ' ' + bi('胜', 'wins') + '</span></div>';

    var list;
    if (meetings.length) {
      list = '<div class="mp-sec"><h4>' + bi('交手明细', 'Meetings') +
        '<span style="font-size:11px;color:var(--ivory-mute);font-weight:400">' +
        (total > meetings.length ? bi('显示最近 ' + meetings.length + ' / ' + total + ' 场', 'latest ' + meetings.length + ' of ' + total)
          : bi('全部 ' + total + ' 场', 'all ' + total)) + '</span></h4>' +
        '<div class="h2h-list-head"><span>' + bi('日期', 'Date') + '</span><span>' + bi('赛事', 'Event') +
        '</span><span style="text-align:right">' + bi('比分', 'Score') + '</span></div>' +
        meetings.map(function (m) {
          var winnerId = m.w;
          var winner = winnerId === A.id ? A : B;
          var loser = winnerId === A.id ? B : A;
          return '<div class="h2h-row">' +
            '<div class="h2h-date">' + esc(shortDate(m.d, true)) + '</div>' +
            '<div class="h2h-tour"><span class="cn">' + esc(playerZhOf(winner) || winner.name) + ' def. ' +
              esc(playerZhOf(loser) || loser.name) + '</span>' +
              '<span class="en">' + esc(winner.name) + '</span>' +
              '<span style="font-size:10.5px;color:var(--ivory-mute)">' +
              esc(tourZh(m.t) || m.t) + ' · ' + esc(roundZh(m.r) || m.r) + ' · ' +
              esc(surfaceZh(m.sfc) || surfaceLabel(m.sfc)) + '</span></div>' +
            '<div class="h2h-sc">' + esc(m.sc) + '</div></div>';
        }).join('') + '</div>';
    } else {
      list = '<div class="h2h-empty">' + bi(
        '已存比赛窗口（2023 年至今）中没有这两位球员的交手记录。',
        'No meetings between these two appear in the stored window (2023 onwards).'
      ) + '</div>';
    }

    out.innerHTML = '<div class="h2h-panel">' + head + list + compareBlock(A, B) + '</div>';
  }

  /** Paint the record, then upgrade the meeting list when its payload arrives. */
  function paintH2HAsync() {
    paintH2H();
    if (window.WTA_H2H_MATCHES) return;
    loadH2HMeetings().then(function () {
      var panel = document.getElementById('h2h');
      if (panel && panel.classList.contains('active')) paintH2H();
    });
  }

  /** Called whenever the head-to-head panel becomes visible. */
  function syncH2HMeetings() {
    if (window.WTA_H2H_MATCHES) return;
    var placeholder = document.querySelector('.h2h-panel');
    if (placeholder && !document.querySelector('.h2h-row') && !document.querySelector('.h2h-empty')) return;
    loadH2HMeetings().then(function () {
      var panel = document.getElementById('h2h');
      if (panel && panel.classList.contains('active')) paintH2H();
    });
  }

  /** Side-by-side season and career comparison. */
  function compareBlock(A, B) {
    function row(cn, en, va, vb, better) {
      var fa = va == null ? '—' : va, fb = vb == null ? '—' : vb;
      var aw = '', bw = '';
      if (typeof va === 'number' && typeof vb === 'number' && better) {
        if (better === 'high') { aw = va > vb ? ' win' : ''; bw = vb > va ? ' win' : ''; }
        else { aw = va < vb ? ' win' : ''; bw = vb < va ? ' win' : ''; }
      }
      return '<div class="cmp-row"><span class="a' + aw + '">' + fa + '</span>' +
        '<span class="k">' + bi(cn, en) + '</span>' +
        '<span class="b' + bw + '">' + fb + '</span></div>';
    }
    var sa = A.serve || {}, sb = B.serve || {}, ra = A.season || {}, rb = B.season || {};
    return '<div class="h2h-compare mp-sec"><h4>' + bi('数据对比', 'Statistical comparison') + '</h4>' +
      row('世界排名', 'Ranking', A.rank, B.rank, 'low') +
      row('排名积分', 'Points', A.points, B.points, 'high') +
      row(SEASON + ' 胜负', SEASON + ' W–L', (ra.w != null ? ra.w + '–' + ra.l : null), (rb.w != null ? rb.w + '–' + rb.l : null)) +
      row('生涯单打冠军', 'Career titles', A.titles, B.titles, 'high') +
      row('生涯胜场', 'Career wins', A.careerWon, B.careerWon, 'high') +
      row('ACE 球', 'Aces', sa.aces, sb.aces, 'high') +
      row('一发成功率', 'First serve in', sa.firstServePct != null ? pct(sa.firstServePct) : null, sb.firstServePct != null ? pct(sb.firstServePct) : null) +
      row('发球局胜率', 'Service games won', sa.serviceGamesWonPct != null ? pct(sa.serviceGamesWonPct) : null, sb.serviceGamesWonPct != null ? pct(sb.serviceGamesWonPct) : null) +
      row('接发局胜率', 'Return games won', sa.returnGamesWonPct != null ? pct(sa.returnGamesWonPct) : null, sb.returnGamesWonPct != null ? pct(sb.returnGamesWonPct) : null) +
      row('生涯奖金', 'Career prize', A.careerPrize ? moneyShort(A.careerPrize) : null, B.careerPrize ? moneyShort(B.careerPrize) : null) +
      '</div>';
  }

  /* ==========================================================================
     球员弹窗
     ========================================================================== */
  function openPlayer(id) {
    var p = byId[id] || miniPlayer(id);
    var serve = p.serve || {}, s = p.season || {};
    var rec = (D.seasonRecords || {})[id] || {};
    var years = Object.keys(rec).sort(function (a, b) { return b - a; });

    var html = '<div class="mp-head">' + av(p.id, p.name, 88) +
      '<div class="mp-id"><h3>' + bi(playerZhOf(p) || p.name, p.name) + '</h3>' +
        '<div class="mp-meta">' +
          '<span>' + esc(countryZh(p.country) || p.country || '') + '</span>' +
          (p.rank ? '<span>' + bi('世界第 ' + p.rank, 'No.' + p.rank) + '</span>' : '') +
          (p.age != null ? '<span>' + p.age + ' ' + bi('岁', 'yrs') + '</span>' : '') +
          (p.height ? '<span>' + esc(p.height) + '</span>' : '') +
          (p.hand ? '<span>' + esc(p.hand) + '</span>' : '') +
        '</div></div></div>' +
      '<div class="mp-tiles">' +
        mpTile(int(p.points), '排名积分', 'Points') +
        mpTile(s.w != null ? s.w + '–' + s.l : '—', SEASON + ' 胜负', SEASON + ' W–L') +
        mpTile(s.titles != null ? s.titles : '—', '赛季冠军', 'Season titles') +
        mpTile(p.titles != null ? p.titles : '—', '生涯冠军', 'Career titles') +
        mpTile(p.highRank ? 'No.' + p.highRank : '—', '最高排名', 'Career high') +
        mpTile(p.careerPrize ? moneyShort(p.careerPrize) : '—', '生涯奖金', 'Prize money') +
      '</div>' +
      '<div class="mp-grid2">' +
        '<div class="mp-sec"><h4>' + bi('赛季发球数据', 'Season serve data') + '</h4>' +
          mpLine('ACE 球', 'Aces', int(serve.aces)) +
          mpLine('双误', 'Double faults', int(serve.doubleFaults)) +
          mpLine('一发成功率', 'First serve in', pct(serve.firstServePct)) +
          mpLine('一发得分率', '1st serve won', pct(serve.firstServeWonPct)) +
          mpLine('二发得分率', '2nd serve won', pct(serve.secondServeWonPct)) +
          mpLine('发球局胜率', 'Service games won', pct(serve.serviceGamesWonPct)) +
          mpLine('接发局胜率', 'Return games won', pct(serve.returnGamesWonPct)) +
          mpLine('破发点挽救率', 'Break points saved', pct(serve.breakPointsSavedPct)) +
        '</div>' +
        '<div class="mp-sec"><h4>' + bi('分赛季战绩', 'Record by season') + '</h4>' +
          (years.length ? years.map(function (y) {
            var r = rec[y];
            return '<div class="mp-line"><span>' + y + '</span><b>' + r.w + '–' + r.l +
              (r.titles ? ' · ' + r.titles + ' ' + bi('冠', 'titles') : '') + '</b></div>';
          }).join('') : mpLine('赛季战绩', 'Season record', s.w != null ? s.w + '–' + s.l : '—')) +
          (s.last10 && s.last10.length ? '<div class="mp-sec"><h4>' + bi('近期战绩', 'Recent form') + '</h4>' +
            '<div class="pc-form">' + s.last10.map(function (w) {
              return '<i class="' + (w ? 'w' : 'l') + '">' + (w ? 'W' : 'L') + '</i>';
            }).join('') + '</div></div>' : '') +
        '</div>' +
      '</div>';

    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function mpTile(v, cn, en) {
    return '<div class="mp-tile"><b>' + esc(v) + '</b><span>' + bi(cn, en) + '</span></div>';
  }
  function mpLine(cn, en, v) {
    return '<div class="mp-line"><span>' + bi(cn, en) + '</span><b>' + esc(v) + '</b></div>';
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
  }

  /* ==========================================================================
     语言 / 导航 / 事件
     ========================================================================== */
  var LANGS = ['both', 'cn', 'en'];
  function setLang(l) {
    if (LANGS.indexOf(l) < 0) l = 'both';
    document.documentElement.setAttribute('data-lang', l);
    try { localStorage.setItem('wta-lang', l); } catch (e) { /* 隐私模式 */ }
    $$('#langSwitch .lang-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.l === l);
    });
  }
  function initLang() {
    var saved = 'both';
    try { saved = localStorage.getItem('wta-lang') || 'both'; } catch (e) { /* noop */ }
    setLang(saved);
    $('#langSwitch').addEventListener('click', function (e) {
      var b = e.target.closest('.lang-btn');
      if (b) setLang(b.dataset.l);
    });
  }

  function switchTab(name) {
    var target = document.getElementById(name);
    if (!target) name = 'overview';
    $$('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === name); });
    $$('.nav-link').forEach(function (a) { a.classList.toggle('active', a.dataset.tab === name); });
    $('#mainNav').classList.remove('open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
    if (history.replaceState) history.replaceState(null, '', '#' + name);
  }

  function initNav() {
    $('#mainNav').addEventListener('click', function (e) {
      var a = e.target.closest('.nav-link');
      if (!a) return;
      e.preventDefault();
      switchTab(a.dataset.tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (a.dataset.tab === 'h2h') syncH2HMeetings();
    });
    $('#navToggle').addEventListener('click', function () {
      var nav = $('#mainNav');
      nav.classList.toggle('open');
      $('#navToggle').setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains('nav-link')) return;
      e.preventDefault();
      switchTab(a.getAttribute('href').slice(1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // 打开弹窗（球员卡 / 表格行 / 冠军墙共用）
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-player]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      openPlayer(Number(t.dataset.player));
    });
    $('#modal').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        var box = $('.tab-panel.active .search-box input');
        if (box) box.focus();
      }
    });
    window.addEventListener('hashchange', function () {
      var name = location.hash.replace('#', '') || 'overview';
      switchTab(name);
      if (name === 'h2h') syncH2HMeetings();
    });
  }

  function initSegments() {
    // 赛程
    $('#schedule').addEventListener('click', function (e) {
      var b = e.target.closest('.seg');
      if (!b) return;
      if (b.dataset.y != null) calState.year = Number(b.dataset.y);
      if (b.dataset.lv != null) calState.level = b.dataset.lv;
      if (b.dataset.st != null) calState.status = b.dataset.st;
      renderSchedule();
    });
    // 赛果
    $('#results').addEventListener('click', function (e) {
      var b = e.target.closest('.seg');
      if (!b) return;
      if (b.dataset.r != null) resState.round = b.dataset.r;
      if (b.dataset.s != null) resState.surface = b.dataset.s;
      resState.limit = 40;
      renderResults();
    });
    var resTimer;
    $('#resSearch').addEventListener('input', function (e) {
      clearTimeout(resTimer);
      var v = e.target.value;
      resTimer = setTimeout(function () { resState.q = v; resState.limit = 40; paintResults(); }, 140);
    });
    $('#resMore').addEventListener('click', function () { resState.limit += 40; paintResults(); });

    // 排名
    $('#rankings').addEventListener('click', function (e) {
      var b = e.target.closest('.seg');
      if (!b || !b.dataset.m) return;
      rankState.mode = b.dataset.m;
      $$('#rankMetric .seg').forEach(function (x) { x.classList.toggle('active', x === b); });
      paintRanks();
    });
    var rankTimer;
    $('#rankSearch').addEventListener('input', function (e) {
      clearTimeout(rankTimer);
      var v = e.target.value;
      rankTimer = setTimeout(function () { rankState.q = v; rankState.limit = 100; paintRanks(); }, 140);
    });
    $('#rankMore').addEventListener('click', function () { rankState.limit += 100; paintRanks(); });

    // 球员
    $('#players').addEventListener('click', function (e) {
      var b = e.target.closest('.seg');
      if (!b) return;
      if (b.dataset.c != null) playerState.country = b.dataset.c;
      if (b.dataset.s != null) playerState.sort = b.dataset.s;
      playerState.limit = 36;
      renderPlayers();
    });
    var pTimer;
    $('#playerSearch').addEventListener('input', function (e) {
      clearTimeout(pTimer);
      var v = e.target.value;
      pTimer = setTimeout(function () { playerState.q = v; playerState.limit = 36; paintPlayers(); }, 140);
    });
    $('#playerMore').addEventListener('click', function () { playerState.limit += 36; paintPlayers(); });

    // 生涯榜
    $('#careerSort').addEventListener('click', function (e) {
      var b = e.target.closest('.seg');
      if (!b) return;
      careerMetric = b.dataset.s;
      $$('#careerSort .seg').forEach(function (x) { x.classList.toggle('active', x === b); });
      paintCareer();
    });
  }

  function renderFooter() {
    var c = META.counts || {};
    $('#footerStats').innerHTML = [
      ['排名球员', 'Players', int(c.rankedPlayers)],
      ['赛季赛事', 'Events', int(c.events)],
      ['赛季比赛', 'Matches', int(c.seasonMatches)],
      ['交手配对', 'H2H pairs', int(c.h2hPairings)],
      ['收录赛事', 'Calendar', int(c.calendarEvents)]
    ].map(function (s) {
      return '<div class="f"><b>' + esc(s[2]) + '</b><span>' + bi(s[0], s[1]) + '</span></div>';
    }).join('');
    $('#footUpdated').textContent = shortDate(META.generatedAt, true);
    $('#seasonValue').textContent = String(SEASON);
  }

  /* ----------------------------------------------------- 启动 */
  window.WTA = {
    imgFallback: function (img) {
      var ini = img.getAttribute('data-ini') || '';
      var size = parseInt(img.getAttribute('width'), 10) || 34;
      var span = document.createElement('span');
      span.className = img.className;
      span.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
        'display:grid;place-items:center;flex:0 0 auto;background:var(--court-600);' +
        'color:var(--ivory-mute);font-family:var(--font-en);font-size:' +
        Math.max(9, Math.round(size / 3)) + 'px';
      span.textContent = ini;
      img.replaceWith(span);
    }
  };

  function boot() {
    if (!D.players.length) {
      $('#loader').innerHTML = '<p style="font-family:var(--font-cn);color:#e08a7a">' +
        '数据载入失败 / Failed to load data</p>';
      return;
    }
    initLang();
    initNav();
    initSegments();
    renderFooter();
    renderOverview();
    renderSchedule();
    renderResults();
    renderRankings();
    renderPlayers();
    renderStats();
    renderH2H();
    $('#loader').hidden = true;
    $('#main').hidden = false;
    var initial = (location.hash || '#overview').replace('#', '');
    switchTab(initial);
    if (initial === 'h2h') syncH2HMeetings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
