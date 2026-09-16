"""
Panel renderers.

Seven panels plus the two detail page kinds.  Everything is written as complete
HTML; the only interactive affordances that need CSS state use `:target`, which
means a link such as ``#sort-pct`` reveals a pre-rendered sorted table.
"""

from __future__ import annotations

from render import (
    Context,
    bi,
    esc,
    iso_date,
    money,
    money_short,
    num,
    pct,
    short_date,
    timestamp,
)
from templates import avatar, page_head, player_cell, shell, stat_card

# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------


def overview(ctx: Context) -> str:
    counts = ctx.counts
    no1 = ctx.players[0] if ctx.players else None
    season = ctx.season

    kpis = [
        ("排名球员", "Ranked players", num(counts.get("rankedPlayers")),
         bi("单打世界排名收录", "singles ranking depth"), "var(--gold-500)"),
        ("赛季赛事", "Season events", num(counts.get("events")),
         bi(f"{counts.get('completedEvents', 0)} 项已结束", f"{counts.get('completedEvents', 0)} completed"), "var(--grass-400)"),
        ("赛季比赛", "Season matches", num(counts.get("seasonMatches")),
         bi("已收录赛果", "results captured"), "var(--line-white)"),
        ("产生冠军", "Titles won", num(counts.get("champions")),
         bi("本赛季单打冠军", "singles champions"), "var(--gold-500)"),
        ("世界第一", "World No.1",
         (no1.get("zh") or no1.get("name")) if no1 else "—",
         bi(f"{num(no1.get('points'))} 积分", f"{num(no1.get('points'))} pts") if no1 else "",
         "var(--gold-400)"),
        ("下周开赛", "Upcoming", num(counts.get("upcomingEvents")),
         bi("未开始的赛事", "events not yet played"), "var(--grass-500)"),
    ]
        # 数值型用大号英文数字字体；文本型（如世界第一的球员名）用缩小的中文版式。
    def _value_class(value: str) -> str:
        return '' if str(value).lstrip().startswith(('#', '0', '1', '2', '3', '4', '5',
                                                     '6', '7', '8', '9', '$')) or value in ('—',) else ' text'

    kpi_html = "".join(
        f'<div class="kpi" style="--kpi-accent:{accent}">'
        f'<div class="kpi-label">{bi(zh, en)}</div>'
        f'<div class="kpi-value' + _value_class(value) + '">' + esc(value) + '</div>'
        f'<div class="kpi-sub">{sub}</div></div>'
        for zh, en, value, sub, accent in kpis
    )

    champions = [c for c in ctx.champions if c["year"] == season][:40]
    champ_html = "".join(
        f'<div class="champ-card">'
        f'<div class="champ-top">{avatar(ctx, c["player"], 32, "champ-avatar")}'
        f'<div class="champ-name"><span class="cup" aria-hidden="true">🏆</span>'
        f'{ctx.name(c["player"])}</div></div>'
        f'<div class="champ-ev">{ctx.tournament(c["event"])}</div>'
        f'<div class="champ-ev">{esc(short_date(c["date"]))} · {ctx.level_tag(c["level"])}</div>'
        f"</div>"
        for c in champions
    ) or '<div class="empty-state">' + bi("暂无冠军数据", "No champions yet") + "</div>"

    recent = ctx.results[:12]
    recent_html = "".join(
        f'<div class="rr">'
        f'<div class="rr-date">{esc(short_date(r["date"]))}<br>{esc(str(r["date"])[:4])}</div>'
        f'<div class="rr-main"><div class="rr-players">'
        f'<span class="rr-w">{ctx.name(r["winner"])}</span><span class="d">d.</span>'
        f'<span class="rr-l">{ctx.name(r["loser"])}</span></div>'
        f'<div class="rr-ev">{ctx.round_(r["round"])}<span>·</span>'
        f'{ctx.tournament(r["event"])}{ctx.surface_chip(r["surface"])}</div></div>'
        f'<div class="rr-score">{esc(r["score"])}</div></div>'
        for r in recent
    ) or '<div class="empty-state">' + bi("暂无赛果", "No results yet") + "</div>"

    top10 = "".join(
        f'<div class="mini-row" style="padding:7px 18px">'
        f'<span class="n"><span class="i" style="font-family:var(--font-en);'
        f'color:var(--ivory-mute);width:20px;display:inline-block">{i + 1}</span>'
        f'<a href="player-{p["id"]}.html" style="margin-left:8px">{ctx.name(p)}</a>'
        f'<span class="en" style="margin-left:6px">{esc(p["country"])}</span></span>'
        f'<span class="v">{num(p["points"])}</span></div>'
        for i, p in enumerate(ctx.players[:10])
    )

    boards_html = "".join(
        f'<div class="mini-board"><div class="mini-head">'
        f'{bi(BOARD_ZH.get(b["key"], ""), b["label"])}'
        f'<span>{esc("season %" if b["unit"] == "%" else "total")}</span></div>'
        + "".join(
            f'<div class="mini-row"><span class="n"><a href="player-{r["id"]}.html">'
            f'{esc(r.get("zh") or r["name"])}</a></span>'
            f'<span class="v">{pct(r["value"]) if b["unit"] == "%" else num(r["value"])}</span>'
            f'<span class="mini-bar" style="grid-column:1/-1"><i style="width:'
            f'{max(2, r["value"] / b["rows"][0]["value"] * 100):.1f}%"></i></span></div>'
            for r in b["rows"][:5]
        )
        + "</div>"
        for b in ctx.boards[:4]
    )

    career = ctx.career
    career_html = "".join(
        _career_col(cn, en, rows, fmt)
        for cn, en, rows, fmt in [
            ("单打冠军", "Singles titles", career.get("titles", [])[:8], lambda p: num(p.get("titles"))),
            ("生涯胜场", "Career match wins", career.get("careerWins", [])[:8], lambda p: num(p.get("won"))),
            ("生涯奖金", "Career prize money", career.get("prizeMoney", [])[:8], lambda p: money_short(p.get("prize"))),
        ]
    )

    body = f'''
<section class="hero">
  <div class="hero-court" aria-hidden="true"></div>
  <div class="hero-content">
    <div class="hero-eyebrow"><span class="dot-live"></span>
      <span class="cn">官方数据源</span><span class="en">OFFICIAL DATA FEED</span></div>
    <h1 class="hero-title">
      <span class="cn">{esc(season)} 赛季</span>
      <span class="en">{esc(season)} SEASON</span>
    </h1>
    <p class="hero-sub">{bi(
        "数据来源：WTA 官方公开数据接口 · 涵盖单打世界排名、赛季赛程与赛果、球员档案、发球接发统计与历史交手记录",
        "Sourced from the WTA public data API — singles rankings, calendar and results, player records, serve and return statistics, and career head-to-heads",
    )}</p>
    <div class="hero-meta">
      <span><i class="cn">更新日期</i><i class="en">Updated</i><b>{esc(timestamp(ctx.meta.get("generatedAt")))}</b></span>
      <span><i class="cn">排名周</i><i class="en">Rankings week</i><b>{esc(timestamp(ctx.meta.get("rankingsAsOf")))}</b></span>
      <span><i class="cn">收录球员</i><i class="en">Players</i><b>{num(counts.get("rankedPlayers"))}</b></span>
    </div>
  </div>
</section>

<div class="wrap">
  <h2 class="sec-title"><span class="cn">赛季概览</span><span class="en">Season At A Glance</span></h2>
  <div class="kpi-grid">{kpi_html}</div>

  <div class="two-col">
    <div class="panel">
      <div class="panel-head"><h3>{bi("冠军墙", "Champions")}</h3>
        <span class="panel-note">{bi(f"{len(champions)} 项赛事", f"{len(champions)} events")}</span></div>
      <div class="champion-wall">{champ_html}</div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>{bi("最新赛果", "Latest Results")}</h3>
        <span class="panel-note">{bi(f"最近 {len(recent)} 场", f"latest {len(recent)}")}</span></div>
      <div class="recent-list">{recent_html}</div>
    </div>
  </div>

  <div class="two-col">
    <div class="panel">
      <div class="panel-head"><h3>{bi("世界排名前十", "Top 10")}</h3>
        <a class="panel-more" href="rankings.html">{bi("完整排名", "Full ranking")} →</a></div>
      <div class="mini-boards">{top10}</div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>{bi("赛季数据领跑", "Stat Leaders")}</h3>
        <a class="panel-more" href="stats.html">{bi("全部榜单", "All boards")} →</a></div>
      <div class="mini-boards">{boards_html}</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><h3>{bi("生涯数据领跑", "Career Leaders")}</h3>
      <span class="panel-note">{bi("现役排名球员中的历史累计", "All-time among currently ranked players")}</span></div>
    <div class="career-grid">{career_html}</div>
  </div>
</div>
'''
    # The shell appends the site name, so the page title is just the view.
    return shell(ctx, title=f"{ctx.season} 赛季总览", active="index.html", body=body,
                 jsonld={
                     "@context": "https://schema.org",
                     "@type": "WebSite",
                     "name": "WTA Tour Data Dashboard",
                     "inLanguage": "zh-CN",
                     "url": "https://moonquake2004.github.io/wta-tour-dashboard/",
                 })


BOARD_ZH = {
    "aces": "ACE 球", "doubleFaults": "双误", "firstServePct": "一发成功率",
    "firstServeWonPct": "一发得分率", "secondServeWonPct": "二发得分率",
    "serviceGamesWonPct": "发球局胜率", "returnGamesWonPct": "接发局胜率",
    "returnPointsWonPct": "接发得分率", "breakPointsSavedPct": "破发点挽救率",
    "breakPointsConvertedPct": "破发点转化率", "totalPointsWonPct": "总得分率",
    "servicePointsWonPct": "发球得分率",
}


def _career_col(zh, en, rows, fmt) -> str:
    inner = "".join(
        f'<div class="career-row"><span class="i">{i + 1}</span>'
        f'<span class="n"><a href="player-{p["id"]}.html">{esc(p.get("zh") or p["name"])}</a></span>'
        f'<span class="v">{fmt(p)}</span></div>'
        for i, p in enumerate(rows)
    )
    return f'<div class="career-col"><h4>{bi(zh, en)}</h4>{inner}</div>'


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------


# Calendar filters, rendered as separate pre-built views and switched by :target.
CAL_FILTERS = [
    ("all", "全部", "All", lambda e: True),
    ("ongoing", "进行中", "Ongoing", lambda e: e["status"] in ("live", "inProgress")),
    ("past", "已完成", "Completed", lambda e: e["status"] == "past"),
    ("upcoming", "未开始", "Upcoming", lambda e: e["status"] == "future"),
]


def calendar(ctx: Context) -> str:
    """
    The tour calendar with status filters.

    Each filter is a complete, pre-rendered list grouped by month; `:target` on
    the filter anchors reveals one at a time, so no script is needed.  "All" is
    first in the document and therefore visible by default.
    """
    counts = {key: sum(1 for e in ctx.calendar if match(e)) for key, _, _, match in CAL_FILTERS}
    active_default = "all"

    chips = "".join(
        f'<a class="chip" href="#cal-anchor-{key}">{bi(zh, en)}'
        f'<span class="chip-n">{counts[key]}</span></a>'
        for key, zh, en, _ in CAL_FILTERS
    )

    views = []
    for key, zh, en, match in CAL_FILTERS:
        rows = [e for e in ctx.calendar if match(e)]
        rows.sort(key=lambda e: (e["year"], e["start"]), reverse=True)
        groups: dict[str, list[dict]] = {}
        for event in rows:
            groups.setdefault(event["start"][:7], []).append(event)
        sections = "".join(
            f'<div class="cal-month"><div class="cal-month-head">'
            f'<span class="cn">{esc(month_label(month))}</span>'
            f'<span class="en">{esc(month_label(month, english=True))}</span>'
            f'<span class="cal-month-n">{bi(f"{len(items)} 项", f"{len(items)} events")}</span></div>'
            + "".join(_calendar_row(ctx, e) for e in items)
            + "</div>"
            for month, items in groups.items()
        )
        views.append(
            f'<div class="cal-view" id="cal-{key}">{sections}'
            + ("" if rows else '<div class="empty-state">' + bi("暂无赛事", "No events") + "</div>")
            + "</div>"
        )

    # The filter anchors sit inside `.cal-scope` as siblings of the filter bar and
    # the view list, so :target can both reveal a view and mark the active chip.
    # They are absolutely positioned at the scope's top, which keeps a chip click
    # from jumping the reader back to the top of the page.
    anchors = "".join(
        f'<div id="cal-anchor-{key}" class="cal-anchor"></div>' for key, _, _, _ in CAL_FILTERS
    )

    body = f'''
<div class="wrap">
  {page_head("Tour calendar · 巡回赛赛程", "", "WTA 赛季，逐站呈现", "The WTA season, event by event",
             "可按状态筛选：全部 / 进行中 / 已完成 / 未开始。每站赛事都可点开查看完整单打赛果。",
             "Filter by status — all, ongoing, completed or upcoming. Every event links to its complete singles draw.")}
  <div class="cal-scope">
    {anchors}
    <div class="sort-bar">
      <span class="sort-label">{bi("筛选", "Filter")}</span>
      <div class="chips">{chips}</div>
    </div>
    <div class="panel"><div class="cal-views">{"".join(views)}</div></div>
  </div>
</div>
'''
    return shell(ctx, title="赛程 · Tour Calendar", active="calendar.html", body=body)


MONTH_ZH = {
    "01": "1 月", "02": "2 月", "03": "3 月", "04": "4 月", "05": "5 月", "06": "6 月",
    "07": "7 月", "08": "8 月", "09": "9 月", "10": "10 月", "11": "11 月", "12": "12 月",
}
MONTH_EN = {
    "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June",
    "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December",
}


def month_label(month: str, english: bool = False) -> str:
    """`2026-03` → `2026 年 3 月` or `March 2026`."""
    year, mon = month.split("-")
    return f"{month_en(mon)} {year}" if english else f"{year} 年 {MONTH_ZH.get(mon, mon)}"


def month_en(mon: str) -> str:
    return MONTH_EN.get(mon, mon)


def _calendar_row(ctx: Context, event: dict) -> str:
    """
    One row of the calendar.

    The row itself is a plain container: an event page link wraps only the name,
    because the champion cell holds its own link and nesting anchors is invalid
    HTML (browsers split the outer one, which broke the row layout).
    """
    key = f'{event["id"]}|{event["year"]}'
    digest = ctx.digest.get(key)
    href = f'event-{event["id"]}-{event["year"]}.html'

    if digest:
        name = (f'<a class="tl-name-link" href="{href}">{ctx.tournament(event["name"])}</a>'
                + ctx.level_tag(event["level"]))
        more = ('<a class="tl-more" href="' + href + '">'
                + bi(f'{digest["matches"]} 场赛果', f'{digest["matches"]} results') + " →</a>")
    else:
        name = ctx.tournament(event["name"]) + ctx.level_tag(event["level"])
        more = ""

    champion = event.get("champion")
    if champion:
        winner = (
            '<span class="tl-winner"><span class="cup" aria-hidden="true">🏆</span>'
            + avatar(ctx, champion, 24)
            + f'<a href="player-{champion["id"]}.html">{ctx.name(champion)}</a></span>'
        )
    elif event["status"] == "past":
        # Team events such as the United Cup have no singles champion in the feed,
        # and a dash reads better than an empty cell.
        winner = f'<span class="tl-winner dim">{bi("团体赛", "Team event")}</span>'
    else:
        winner = f'<span class="tl-winner dim">{bi("待定", "TBD")}</span>' 

    draw = f'<span>{bi(f"{event["draw"]} 签位", f"{event["draw"]} draw")}</span>' if event.get("draw") else ""
    prize = f'<span>{esc(money_short(event["prize"]))}</span>' if event.get("prize") else ""
    country = esc(ctx.zh.get("countries", {}).get(event.get("country") or "", event.get("country") or ""))

    return (
        '<div class="tl-item'
        + (" past" if event["status"] == "past" else "")
        + (" live" if event["status"] in ("live", "inProgress") else "")
        + '">' 
        '<div class="tl-date">'
        f'<span class="tl-range">{esc(short_date(event["start"]))} – {esc(short_date(event["end"]))}</span>'
        f'<span class="tl-count">{esc(event["city"])}</span></div>'
        f'<div class="tl-main"><div class="tl-name">{name}</div>'
        f'<div class="tl-meta">{ctx.surface_chip(event["surface"])}{draw}{prize}'
        f"<span>{country}</span></div></div>"
        f'<div class="tl-side">{winner}{more}</div></div>'
    )


# ---------------------------------------------------------------------------
# Head-to-head
# ---------------------------------------------------------------------------

H2H_DEPTH = 50


def _pair_options(ctx: Context, roster: list[dict], selected=None,
                  placeholder: str | None = None) -> str:
    """`<option>` 列表：snooker 式的「中文名 · 英文名（#rank）」标签。"""
    out: list[str] = []
    if placeholder is not None:
        out.append(f'<option value="" selected>{esc(placeholder)}</option>')
    for p in roster:
        zh_name = p.get("zh") or ""
        label = (f"{esc(zh_name)} · {esc(p['name'])}" if zh_name and zh_name != p["name"]
                 else esc(p["name"]))
        rank = f"（#{p['rank']}）" if p.get("rank") else ""
        sel = " selected" if selected is not None and str(p["id"]) == str(selected) else ""
        out.append(f'<option value="{esc(p["id"])}"{sel}>{label}{rank}</option>')
    return "".join(out)


def h2h_hub(ctx: Context, roster: list[dict]) -> str:
    """
    The comparison start page, in the snooker dashboard's shape: two native
    <select> controls — Player A and Player B — separated by "VS".  Picking both
    navigates to that pairing's page via a small head-script; with scripting off
    the <noscript> block carries the plain-link fallback and the two-step flow.
    """
    noscript_rows = "".join(
        f'<a class="h2h-pick-row" href="h2h-pick-{p["id"]}.html">'
        f'{avatar(ctx, p, 30)}'
        f'<span class="sn"><b>{esc(p.get("zh") or p["name"])}</b>'
        f'<span class="en">{esc(p["name"])}</span></span>'
        f'<span class="sr">#{p["rank"]} {esc(p["country"])}</span>'
        f'<span class="go" aria-hidden="true">→</span></a>'
        for p in roster
    )
    total = len(roster) * (len(roster) - 1) // 2
    body = f'''
<div class="wrap">
  {page_head("Head-to-head · 交手对比", "", "两位球员对比", "Compare two players",
             "在两侧下拉里各选一位球员，选完即进入两人的完整交手记录与数据对比。",
             "Pick player A and player B from the two selects; the record opens as soon as both are chosen.")}
  <div class="panel h2h-overflow"><div class="card-bd">
    <form class="h2h-composer" onsubmit="return h2hGo(this)">
      <div class="h2h-field">
        <span class="h2h-field-label">{bi("球员 A", "Player A")}</span>
        <select class="h2h-native" name="pa" onchange="h2hGo(this.form)">
          {_pair_options(ctx, roster, placeholder="选择球员 / Pick")}
        </select>
      </div>
      <div class="h2h-vs" aria-hidden="true">VS</div>
      <div class="h2h-field">
        <span class="h2h-field-label">{bi("球员 B", "Player B")}</span>
        <select class="h2h-native" name="pb" onchange="h2hGo(this.form)">
          {_pair_options(ctx, roster, placeholder="选择球员 / Pick")}
        </select>
      </div>
    </form>
    <noscript>
      <div class="h2h-fallback-note">{bi(
          "当前浏览器禁用了脚本，改用下列选择方式：",
          "Scripting is off, so the link-list fallback is shown instead.")}</div>
      <div class="h2h-columns">
        <div><div class="h2h-col-head">{bi("球员一（前 50）", "Player one (top 50)")}</div>
          <div class="h2h-column">{noscript_rows}</div></div>
        <div><div class="h2h-col-head">{bi("球员二（前 50）", "Player two (top 50)")}</div>
          <div class="h2h-column">{noscript_rows}</div></div>
      </div>
    </noscript>
    <p class="dim mt4" style="font-size:12px">{bi(
      f"可对比范围为当前排名前 {len(roster)} 的球员，共生成 {num(total)} 组对阵页。",
      f"Comparisons cover the current top {len(roster)}, generating {num(total)} pairing pages.")}</p>
  </div></div>
</div>
'''
    return shell(ctx, title="交手 · Head-to-head", active="h2h.html", body=body, enhance=True)


def h2h_pick(ctx: Context, player: dict, opponents: list[dict]) -> str:
    """
    The second half of the comparison, in the snooker layout: Player A's box on
    the left stays filled (and its menu can swap "A" for anyone in the roster),
    the right box opens the opponent menu.  The record appears on the pairing
    page once the opponent is chosen — the static equivalent of the snooker
    dashboard filling in below the two selects.
    """
    roster_menu = "".join(
        f'<a class="h2h-pick-row" href="h2h-pick-{p["id"]}.html">'
        f'{avatar(ctx, p, 30)}'
        f'<span class="sn"><b>{esc(p.get("zh") or p["name"])}</b>'
        f'<span class="en">{esc(p["name"])}</span></span>'
        f'<span class="sr">#{p["rank"]} {esc(p["country"])}</span>'
        f'<span class="go" aria-hidden="true">→</span></a>'
        for p in ctx.pair_roster
    )
    def opponent_row(o: dict) -> str:
        low, high = min(player["id"], o["id"]), max(player["id"], o["id"])
        o_sr = (f'#{o["rank"]} ' if o.get("rank") else "") + (o.get("country") or "")
        return (
            f'<a class="h2h-pick-row" href="h2h-{low}-{high}.html">'
            f'{avatar(ctx, o, 30)}'
            f'<span class="sn"><b>{esc(o.get("zh") or o["name"])}</b>'
            f'<span class="en">{esc(o["name"])}</span></span>'
            f'<span class="sr">{esc(o_sr)}</span>'
            f'<span class="go" aria-hidden="true">→</span></a>'
        )
    opponent_menu = "".join(opponent_row(o) for o in opponents)
    body = f'''
<div class="wrap">
  {page_head("Head-to-head · 交手对比", "", "两位球员对比", "Compare two players",
             "左侧已选出球员 A；从右侧菜单选择球员 B，即可查看两人的完整交手记录与数据对比。",
             "Player A is picked; open the menu on the right to choose player B.")}
  <div class="panel h2h-overflow"><div class="card-bd">
    <div class="h2h-composer">
      <div class="h2h-field">
        <span class="h2h-field-label">{bi("球员 A", "Player A")}</span>
        <details class="h2h-select">
          <summary>
            {avatar(ctx, player, 30)}
            <span class="sn"><b>{esc(player.get("zh") or player["name"])}</b>
              <span class="en">{esc(player["name"])}</span></span>
            <span class="sr">#{player["rank"]} {esc(player.get("country") or "")}</span>
            <span class="caret" aria-hidden="true">▾</span>
          </summary>
          <div class="h2h-menu">{roster_menu}</div>
        </details>
      </div>
      <div class="h2h-vs" aria-hidden="true">VS</div>
      <div class="h2h-field">
        <span class="h2h-field-label">{bi("球员 B", "Player B")}</span>
        <details class="h2h-select">
          <summary><span class="ph">{bi("点击选择对手", "Pick the opponent")}</span>
            <span class="caret" aria-hidden="true">▾</span></summary>
          <div class="h2h-menu">{opponent_menu}</div>
        </details>
      </div>
    </div>
  </div></div>
</div>
'''
    return shell(ctx, title=f'{player.get("zh") or player["name"]} · 交手', active="h2h.html", body=body)


def _zh_of(ctx: Context, player: dict) -> str:
    return player.get("zh") or player["name"]


def h2h_pair(ctx: Context, a: dict, b: dict, record: dict | None, meetings: list) -> str:
    """One generated pairing page."""
    aw = bw = total = 0
    if record:
        aw, bw = record.get("aw", 0), record.get("bw", 0)
        total = record.get("n", 0)
    share = (aw / (aw + bw) * 100) if (aw + bw) else 50

    rank_a = f'#{a["rank"]}' if a.get("rank") else ""
    rank_b = f'#{b["rank"]}' if b.get("rank") else ""
    cls_a = " lead" if aw > bw else " behind" if aw < bw else ""
    cls_b = " lead" if bw > aw else " behind" if bw < aw else ""
    side_a = (f'<div class="h2h-side{cls_a}">{avatar(ctx, a, 80)}{ctx.name(a)}'
              f'<span class="meta">{rank_a} {esc(a.get("country") or "")}</span></div>')
    side_b = (f'<div class="h2h-side{cls_b}">{avatar(ctx, b, 80)}{ctx.name(b)}'
              f'<span class="meta">{rank_b} {esc(b.get("country") or "")}</span></div>')

    def _meeting_row(m):
        winner = ctx.player(m[6])
        loser = ctx.player(a["id"] if m[6] == b["id"] else b["id"])
        return (
            f'<div class="h2h-row"><div class="h2h-date">{esc(short_date(m[0], True))}</div>'
            f'<div class="h2h-tour">'
            f'<span class="cn">{esc(_zh_of(ctx, winner))} 胜 {esc(_zh_of(ctx, loser))}</span>'
            f'<span class="en">{esc(winner["name"])} def. {esc(loser["name"])}</span>'
            f'<span class="meta-line">{ctx.tournament(m[1])} · {ctx.round_(m[4])} · {ctx.surface(m[3])}</span>'
            f'</div><div class="h2h-sc">{esc(m[5])}</div></div>'
        )

    meeting_rows = "".join(_meeting_row(m) for m in meetings) if meetings else ""

    compare = _compare_block(ctx, a, b)

    body = f'''
<div class="wrap">
  <div class="sec-hd" style="border-bottom:0">
    <div><span class="eyebrow">{bi("Head-to-head · 交手对比", "")}</span>
      <h2 style="font-size:clamp(22px,3vw,32px)">{ctx.name(a)} <em style="font-style:italic;color:var(--ivory-mute)">vs</em> {ctx.name(b)}</h2>
    </div>
    <a class="link" href="h2h.html">{bi("换一对球员", "Pick another pairing")} →</a>
  </div>
  <div class="panel"><div class="h2h-panel">
    <div class="h2h-summary">
      {side_a}
      <div class="h2h-score"><div class="ws">{aw} <span class="sep">–</span> {bw}</div>
        <small>{bi("交手记录", "head-to-head")}</small></div>
      {side_b}
    </div>
    <div class="h2h-bar"><i class="a" style="width:{share:.1f}%"></i><i class="b" style="width:{100 - share:.1f}%"></i></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ivory-mute);font-family:var(--font-cn)">
      <span>{esc(a.get("zh") or a["name"])} {aw} {bi("胜", "wins")}</span>
      <span>{esc(b.get("zh") or b["name"])} {bw} {bi("胜", "wins")}</span></div>
    {f'<div class="mp-sec"><h4>{bi("交手明细", "Meetings")}</h4><div class="h2h-list-head">'
     f'<span>{bi("日期", "Date")}</span><span>{bi("赛事", "Event")}</span>'
     f'<span style="text-align:right">{bi("比分", "Score")}</span></div>{meeting_rows}</div>'
     if meeting_rows else
     f'<div class="h2h-empty">{bi("这两位球员在已存比赛窗口（2023 年至今）中没有交手记录，双方仍可对比下方数据。", "These two have no meeting inside the stored window (2023 onwards); the comparison below still applies.")}</div>'}
    {compare}
  </div></div>
</div>
'''
    title = f'{a.get("zh") or a["name"]} vs {b.get("zh") or b["name"]}'
    return shell(ctx, title=f"{title} · 交手", active="h2h.html", body=body)


def _compare_block(ctx: Context, a: dict, b: dict) -> str:
    sa, sb = a.get("serve") or {}, b.get("serve") or {}
    ra, rb = a.get("season") or {}, b.get("season") or {}

    def row(zh, en, va, vb, better=None):
        fa = "—" if va in (None, "") else va
        fb = "—" if vb in (None, "") else vb
        aw = bw = ""
        if better and isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            if better == "low":
                aw, bw = (" win" if va < vb else ""), (" win" if vb < va else "")
            else:
                aw, bw = (" win" if va > vb else ""), (" win" if vb > va else "")
        return (f'<div class="cmp-row"><span class="a{aw}">{fa}</span>'
                f'<span class="k">{bi(zh, en)}</span><span class="b{bw}">{fb}</span></div>')

    record_a = f'{ra.get("w")}–{ra.get("l")}' if ra.get("w") is not None else None
    record_b = f'{rb.get("w")}–{rb.get("l")}' if rb.get("w") is not None else None

    return (
        '<div class="h2h-compare mp-sec"><h4>' + bi("数据对比", "Statistical comparison") + "</h4>"
        + row("世界排名", "Ranking", a.get("rank"), b.get("rank"), "low")
        + row("排名积分", "Points", a.get("points"), b.get("points"), "high")
        + row(f"{ctx.season} 胜负", f"{ctx.season} W–L", record_a, record_b)
        + row("生涯单打冠军", "Career titles", a.get("titles"), b.get("titles"), "high")
        + row("生涯胜场", "Career wins", a.get("careerWon"), b.get("careerWon"), "high")
        + row("ACE 球", "Aces", sa.get("aces"), sb.get("aces"), "high")
        + row("一发成功率", "First serve in", pct(sa.get("firstServePct")), pct(sb.get("firstServePct")))
        + row("发球局胜率", "Service games won", pct(sa.get("serviceGamesWonPct")), pct(sb.get("serviceGamesWonPct")))
        + row("接发局胜率", "Return games won", pct(sa.get("returnGamesWonPct")), pct(sb.get("returnGamesWonPct")))
        + row("生涯奖金", "Career prize",
              money_short(a.get("careerPrize")) if a.get("careerPrize") else None,
              money_short(b.get("careerPrize")) if b.get("careerPrize") else None)
        + "</div>"
    )


# ---------------------------------------------------------------------------
# Player detail
# ---------------------------------------------------------------------------


def _rival_row(ctx: Context, pid: int, rival: dict) -> str:
    """
    One opponent row.

    Pairing pages exist only inside the top N, so the row is a link when both
    players are covered and plain text otherwise — no generated link may 404.
    """
    other = rival["player"]
    rank_mark = (
        f'<span class="num dim r-rank">No.{other["rank"]}</span>' if other.get("rank") else ""
    )
    record = (
        f'<span class="r-rec {"lead" if rival["wins"] > rival["losses"] else "trail" if rival["wins"] < rival["losses"] else ""}">'
        f'{rival["wins"]}–{rival["losses"]}</span>'
    )
    inner = (
        f'{avatar(ctx, other, 34)}<span class="r-name">{ctx.name(other)}</span>'
        f'<span class="flag">{esc(other.get("country") or "")}</span>'
        f'{rank_mark}'
        f'{record}'
    )
    if ctx.has_pair_page(pid, other["id"]):
        return (f'<a class="rival" '
                f'href="h2h-{min(pid, other["id"])}-{max(pid, other["id"])}.html">{inner}</a>')
    return f'<span class="rival">{inner}</span>'


def player_page(ctx: Context, player: dict, h2h_rows: list, recent: list) -> str:
    """A full player profile: biography, season record, serve splits, H2H vs top 30."""
    pid = player["id"]
    serve = player.get("serve") or {}
    season = player.get("season") or {}
    records = (ctx.season_records.get(str(pid)) or {})

    years = sorted((int(y) for y in records), reverse=True)
    season_rows = "".join(
        f'<tr><td class="l num">{y}</td>'
        f'<td class="num dim">{records[str(y)]["w"] + records[str(y)]["l"]}</td>'
        f'<td class="num" style="color:var(--grass-400)">{records[str(y)]["w"]}</td>'
        f'<td class="num" style="color:#e88a94">{records[str(y)]["l"]}</td>'
        f'<td class="num">{pct(_win_pct(records[str(y)]["w"], records[str(y)]["l"]))}</td>'
        f'<td class="num">{records[str(y)]["titles"]}</td>'
        f'<td class="num dim">{records[str(y)]["finals"]}</td></tr>'
        for y in years
    )

    rival_rows = "".join(_rival_row(ctx, pid, r) for r in h2h_rows)

    def _match_row(m):
        opponent = ctx.player(m["oid"])
        rank = f'<span class="num dim" style="font-size:11px">No.{m["orank"]}</span>' if m.get("orank") else ""
        return (
            f'<div class="match"><span class="m-date">{esc(short_date(m["d"]))}</span>'
            f'<span class="m-res {"w" if m.get("w") else "l"}">{"W" if m.get("w") else "L"}</span>'
            f'<span class="m-main"><span class="m-t">'
            f'<a class="m-name" href="player-{m["oid"]}.html">{esc(opponent.get("zh") or m.get("o") or "")}</a>'
            f'<span class="flag">{esc(m.get("oc") or "")}</span>{rank}</span>'
            f'<span class="m-sub">{ctx.tournament(m["t"])} · {ctx.round_(m["r"])} · {ctx.surface(m["sfc"])}</span>'
            f'</span><span class="m-score">{esc(m["sc"])}</span></div>'
        )

    match_rows = "".join(_match_row(m) for m in recent)

    age = player.get("age")
    height = player.get("height")
    hand = player.get("hand")
    body = f'''
<div class="wrap">
  <div class="sec-hd" style="border-bottom:0">
    <div><span class="eyebrow">{esc(ctx.zh.get("countries", {}).get(player["country"], player["country"]))}
      · {bi("单打", "Singles")}</span>
      <h2 style="font-size:clamp(26px,4vw,42px);letter-spacing:-0.03em">{ctx.name(player)}</h2>
      <div class="row wrap mt3" style="gap:14px;font-size:13px;color:var(--ivory-dim)">
        <span>{bi(f"世界第 {player['rank']}", f"World No.{player['rank']}")}</span>
        <span>{num(player["points"])} {bi("积分", "pts")}</span>
        {f"<span>{age} {bi('岁', 'yrs')}</span>" if age is not None else ""}
        {f"<span>{esc(height)}</span>" if height else ""}
        {f"<span>{esc(hand)}</span>" if hand else ""}
        {f'<span>{bi("最高排名", "Career high")} No.{player["highRank"]}</span>' if player.get("highRank") else ""}
      </div>
    </div>
    <a class="link" href="rankings.html">{bi("返回排名", "Back to rankings")} →</a>
  </div>

  <div class="tiles">
    {_tile(f'{season.get("w", 0)}–{season.get("l", 0)}' if season else "—", f'{ctx.season} 胜负', f'{ctx.season} W–L')}
    {_tile(num(player.get("titles")), "生涯冠军", "Career titles")}
    {_tile(f'{player.get("careerWon")}–{player.get("careerLost")}' if player.get("careerWon") is not None else "—", "生涯胜负", "Career W–L")}
    {_tile(num(serve.get("aces")), f'{ctx.season} ACE 球', f'{ctx.season} aces')}
    {_tile(pct(serve.get("firstServePct")), "一发成功率", "First serve in")}
    {_tile(pct(serve.get("serviceGamesWonPct")), "发球局胜率", "Service games won")}
    {_tile(money_short(player.get("careerPrize")) if player.get("careerPrize") else "—", "生涯奖金", "Prize money")}
  </div>

  <div class="two-col mt5">
    <div class="panel">
      <div class="panel-head"><h3>{bi("生涯战绩", "Record by season")}</h3></div>
      <div class="table-scroll"><table class="rank-table">
        <thead><tr><th class="l">{bi("赛季", "Season")}</th><th>{bi("场次", "Matches")}</th>
        <th>{bi("胜", "W")}</th><th>{bi("负", "L")}</th><th>{bi("胜率", "Win %")}</th>
        <th>{bi("冠军", "Titles")}</th><th>{bi("决赛", "Finals")}</th></tr></thead>
        <tbody>{season_rows or f'<tr><td colspan="7">{bi("暂无赛季记录", "No season records")}</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>{bi("赛季发球与接发", "Serve & return")}</h3>
        <span class="panel-note">{esc(ctx.season)}</span></div>
      <div class="card-bd">
        {_serve_line("ACE 球", "Aces", num(serve.get("aces")))}
        {_serve_line("双误", "Double faults", num(serve.get("doubleFaults")))}
        {_serve_line("一发成功率", "First serve in", pct(serve.get("firstServePct")))}
        {_serve_line("一发得分率", "1st serve won", pct(serve.get("firstServeWonPct")))}
        {_serve_line("二发得分率", "2nd serve won", pct(serve.get("secondServeWonPct")))}
        {_serve_line("发球局胜率", "Service games won", pct(serve.get("serviceGamesWonPct")))}
        {_serve_line("接发局胜率", "Return games won", pct(serve.get("returnGamesWonPct")))}
        {_serve_line("破发点挽救率", "Break points saved", pct(serve.get("breakPointsSavedPct")))}
        {_serve_line("破发点转化率", "Break points converted", pct(serve.get("breakPointsConvertedPct")))}
        {_serve_line("总得分率", "Total points won", pct(serve.get("totalPointsWonPct")))}
      </div>
    </div>
  </div>

  {f'''<div class="panel mt5">
    <div class="panel-head"><h3>{bi("对现役前 30 的交手战绩", "Record against the current top 30")}</h3>
      <span class="panel-note">{bi("已存交手，2023 年至今", "stored meetings, 2023 onwards")}</span></div>
    <div class="card-bd flush"><div class="rivals">{rival_rows}</div></div>
  </div>''' if rival_rows else ""}

  <div class="panel mt5">
    <div class="panel-head"><h3>{bi("本赛季比赛记录", "This season's matches")}</h3>
      <span class="panel-note">{bi(f"最近 {len(recent)} 场", f"latest {len(recent)}")}</span></div>
    <div class="matches">{match_rows or '<div class="empty-state">' + bi("暂无比赛记录", "No match log stored") + "</div>"}</div>
  </div>
</div>
'''
    ld = {
        "@context": "https://schema.org",
        "@type": "Athlete",
        "name": player["name"],
        "alternateName": player.get("zh") or None,
        "nationality": player.get("country") or None,
        "birthDate": player.get("birth") or None,
        "height": ({"@type": "QuantitativeValue", "value": player["height"], "unitCode": "CMT"}
                   if player.get("height") else None),
        "sport": "Tennis",
        "jobTitle": "professional tennis player",
        "url": f'https://moonquake2004.github.io/wta-tour-dashboard/player-{pid}.html',
    }
    ld = {k: v for k, v in ld.items() if v is not None}
    return shell(ctx, title=f'{player.get("zh") or player["name"]}', active="players.html",
                  body=body, description=f'{player["name"]} — 生涯战绩、发球数据与交手记录。',
                  jsonld=ld)


def _win_pct(won, lost):
    total = (won or 0) + (lost or 0)
    return (won or 0) / total * 100 if total else None


def _tile(value, zh, en) -> str:
    return f'<div class="tile"><b>{esc(value)}</b><small>{bi(zh, en)}</small></div>'


def _serve_line(zh, en, value) -> str:
    return (f'<div class="lb-row" style="grid-template-columns:minmax(0,1fr) auto">'
            f'<span class="lb-n dim" style="font-size:12.5px">{bi(zh, en)}</span>'
            f'<span class="lb-v">{esc(value)}</span></div>')


# ---------------------------------------------------------------------------
# Event detail
# ---------------------------------------------------------------------------


def event_page(ctx: Context, event: dict) -> str:
    """One event's complete singles draw, grouped by round."""
    rounds = event["rounds"]
    champion = None
    final = next((r for r in rounds if r["label"] == "F" and not r["qualifying"]), None)
    if final and final["matches"]:
        fm = final["matches"][0]
        champion = fm["a"] if fm["winner"] == "a" else fm["b"]

    total = sum(len(r["matches"]) for r in rounds)
    round_links = "".join(
        f'<a class="seg" href="#r-{esc(r["key"].replace("|", "-"))}">'
        f'{ctx.round_(r["label"])}<span class="ev-n">{len(r["matches"])}</span></a>'
        for r in rounds
    )

    def match_row(m):
        a_win = m["winner"] == "a"
        seed_a = f'<span class="ev-seed">{m["a"]["seed"]}</span>' if m["a"].get("seed") else ""
        seed_b = f'<span class="ev-seed">{m["b"]["seed"]}</span>' if m["b"].get("seed") else ""
        score = esc(m["score"] or m["note"] or "—")
        note = f'<span class="ev-note">{esc(m["note"])}</span>' if m["note"] else ""
        return (
            f'<div class="ev-match{" q" if m["qualifying"] else ""}">'
            f'<div class="ev-side{" win" if a_win else ""}">{seed_a}'
            f'<a class="ev-nm" href="player-{m["a"]["id"]}.html">{bi(m["a"].get("zh"), m["a"]["name"])}</a>'
            f'<span class="flag">{esc(m["a"].get("country") or "")}</span></div>'
            f'<div class="ev-score">{score}{note}</div>'
            f'<div class="ev-side b{" win" if not a_win else ""}">{seed_b}'
            f'<a class="ev-nm" href="player-{m["b"]["id"]}.html">{bi(m["b"].get("zh"), m["b"]["name"])}</a>'
            f'<span class="flag">{esc(m["b"].get("country") or "")}</span></div></div>'
        )

    draw = "".join(
        f'<div class="ev-round" id="r-{esc(r["key"].replace("|", "-"))}">'
        f'<div class="ev-round-head">{ctx.round_(r["label"])}'
        f'<span class="ev-round-n">{bi(f"{len(r['matches'])} 场", f"{len(r['matches'])} matches")}'
        f'{" · " + bi("资格赛", "qualifying") if r["qualifying"] else ""}</span></div>'
        + "".join(match_row(m) for m in r["matches"])
        + "</div>"
        for r in rounds
    )

    champion_html = ""
    if champion:
        champion_html = (
            '<div class="ev-champ"><span class="cup" aria-hidden="true">🏆</span>'
            + bi("冠军", "Champion") + " "
            + f'<a href="player-{champion["id"]}.html">{ctx.name(champion)}</a></div>'
        )

    body = f'''
<div class="wrap">
  <div class="sec-hd" style="border-bottom:0">
    <div><span class="eyebrow">{[ctx.level_tag(event["level"])]} {ctx.surface_chip(event["surface"])}</span>
      <h2 style="font-size:clamp(22px,3.4vw,36px)">{ctx.tournament(event["name"])}</h2>
      <div class="row wrap mt3" style="gap:14px;font-size:12.5px;color:var(--ivory-dim)">
        <span>{esc(event["year"])}</span>
        <span>{esc(event["city"])}{f" · {esc(ctx.zh.get('countries', {}).get(event.get('country',''), event.get('country','')))}" if event.get("country") else ""}</span>
        <span>{bi(f"{event['drawSize']} 签位", f"{event['drawSize']} draw")}</span>
        {champion_html}
      </div>
    </div>
    <a class="link" href="calendar.html">{bi("返回赛程", "Back to calendar")} →</a>
  </div>
  <div class="panel"><div class="card-bd">
    <div class="ev-summary">
      <span>{bi(f"{total} 场单打", f"{total} singles matches")}</span>
      <span>{bi(f"{len(rounds)} 个轮次", f"{len(rounds)} rounds")}</span>
    </div>
    <div class="ev-rounds seg-group">{round_links}</div>
    <div class="ev-list">{draw}</div>
  </div></div>
</div>
'''
    ld = {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        "name": event["name"],
        "sport": "Tennis",
        "startDate": (event.get("start") or "") or None,
        "endDate": (event.get("end") or "") or None,
        "location": event.get("country") or None,
        "url": ('https://moonquake2004.github.io/wta-tour-dashboard/'
                f'event-{event["id"]}-{event["year"]}.html'),
    }
    ld = {k: v for k, v in ld.items() if v}
    return shell(ctx, title=f'{event["name"]} {event["year"]} · 赛果', active="calendar.html",
                  body=body, description=f'{event["name"]} {event["year"]} 完整单打赛果。',
                  jsonld=ld)


def player_page_light(ctx: Context, player: dict, h2h_rows: list) -> str:
    """
    A compact profile for a player outside the ranking table.

    Event draws and match logs reference thousands of opponents who are not in
    the current top 300.  Rather than leave those links broken, they get a page
    with what is known: identity, plus their record against anyone they have met.
    """
    rank_line = ""
    if player.get("rank"):
        rank_line = "<span>" + bi(f"世界第 {player['rank']}", f"World No.{player['rank']}") + "</span>"
    body = f'''
<div class="wrap">
  <div class="sec-hd" style="border-bottom:0">
    <div><span class="eyebrow">{esc(ctx.zh.get("countries", {}).get(player.get("country") or "", player.get("country") or ""))}
      {f"· {bi('单打', 'Singles')}" if player.get("rank") else ""}</span>
      <h2 style="font-size:clamp(24px,3.4vw,38px)">{ctx.name(player)}</h2>
      <div class="row wrap mt3" style="gap:14px;font-size:13px;color:var(--ivory-dim)">
        {rank_line}
      </div>
    </div>
    <a class="link" href="players.html">{bi("返回球员名录", "Back to players")} →</a>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>{bi("已知交手记录", "Recorded meetings")}</h3>
      <span class="panel-note">{bi("已存比赛窗口（2023 年至今）", "stored window, 2023 onwards")}</span></div>
    <div class="card-bd flush"><div class="rivals">
      {"".join(_rival_row(ctx, player["id"], r) for r in h2h_rows[:60])
       or '<div class="empty-state">' + bi("没有已存交手记录", "No recorded meetings") + "</div>"}
    </div></div>
  </div>
  <p class="dim mt4" style="font-size:12px">{bi(
    "这位球员不在当前单打排名前 300 之内，因此本站没有她的生涯档案与赛季统计。",
    "This player is outside the current top 300, so no biography or season statistics are published for her here.")}</p>
</div>
'''
    return shell(ctx, title=player.get("zh") or player["name"], active="players.html", body=body)


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------


def results_page(ctx: Context) -> str:
    """The season's results feed, newest first."""
    items = "".join(_result_row(ctx, r) for r in ctx.results)
    body = f'''
<div class="wrap">
  {page_head("Results · 比赛结果", "", "赛季比赛结果", "Season results",
             f'共 {num(len(ctx.results))} 场已收录赛果（本赛季），按日期由新到旧。',
             f'{num(len(ctx.results))} matches captured this season, newest first.')}
  <div class="panel"><div class="result-list">{items
    or '<div class="empty-state">' + bi("暂无赛果", "No results yet") + "</div>"}</div></div>
</div>
'''
    return shell(ctx, title="赛果 · Results", active="results.html", body=body)


def _result_row(ctx: Context, row: dict) -> str:
    winner = ctx.player(row["winnerId"])
    loser = ctx.player(row["loserId"])
    winner_rank = f'<span class="rank">#{winner["rank"]}</span>' if winner.get("rank") else ""
    loser_rank = f'<span class="rank">#{loser["rank"]}</span>' if loser.get("rank") else ""
    return (
        '<div class="result-row">'
        f'<div class="result-date">{esc(iso_date(row["date"]))}</div>'
        '<div class="result-main"><div class="result-players">'
        f'{avatar(ctx, winner, 26)}'
        f'<a class="w" href="player-{winner["id"]}.html">{ctx.name(winner)}</a>{winner_rank}'
        f'<span class="d">d.</span>{avatar(ctx, loser, 26)}'
        f'<a class="l" href="player-{loser["id"]}.html">{ctx.name(loser)}</a>{loser_rank}'
        "</div>"
        f'<div class="result-ev">{ctx.round_(row["round"])}<span>·</span>'
        f'{ctx.tournament(row["event"])}{ctx.surface_chip(row["surface"])}'
        f'{ctx.level_tag(row["level"])}</div></div>'
        f'<div class="result-score">{esc(row["score"])}</div></div>'
    )


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def stats_page(ctx: Context) -> str:
    """Twelve season leaderboards plus the career leaders."""
    leader_cards = "".join(_leader_card(ctx, board) for board in ctx.boards)
    career = ctx.career
    career_rows = "".join(
        f'<tr><td>{i + 1}</td>'
        f'<td class="l"><div class="tb-player">{avatar(ctx, ctx.player(p["id"]), 32)}'
        f'<span class="tb-nm">{bi(p.get("zh") or p["name"], p["name"])}</span></div></td>'
        f'<td class="c"><span class="tb-flag">{ctx.country(p.get("country"))}</span></td>'
        f'<td class="tb-num">{num(p.get("titles"))}</td></tr>'
        for i, p in enumerate(career.get("titles", []))
    )
    body = f'''
<div class="wrap">
  {page_head(f"Season statistics · {ctx.season} 赛季统计", "", "每一项技术统计的领跑者",
             "Leaders across every measured stroke",
             "全部由 WTA 官方发布的球员赛季记录计算得出，并设置最低场次门槛以排除小样本。",
             "Computed from the WTA's official per-player season records, with a minimum match count on every board.")}
  <div class="leader-grid">{leader_cards}</div>
  <div class="panel">
    <div class="panel-head"><h3>{bi("生涯领跑榜 · 单打冠军", "All-Time Leaders · Singles titles")}</h3>
      <span class="panel-note">{bi("现役排名球员中的历史累计", "All-time among currently ranked players")}</span></div>
    <div class="table-scroll"><table class="rank-table title-board">
      <thead><tr><th class="c-pos">{bi("名次", "#")}</th><th class="c-player">{bi("球员", "Player")}</th>
      <th class="c-country">{bi("国家/地区", "Country")}</th><th class="c-titles">{bi("冠军", "Titles")}</th></tr></thead>
      <tbody>{career_rows}</tbody></table></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>{bi("生涯领跑榜 · 胜场与奖金", "All-Time Leaders · Wins & prize money")}</h3></div>
    <div class="career-grid">
      {_career_col("生涯胜场", "Career match wins", career.get("careerWins", []), lambda p: num(p.get("won")))}
      {_career_col("生涯奖金", "Career prize money", career.get("prizeMoney", []), lambda p: money_short(p.get("prize")))}
    </div>
  </div>
</div>
'''
    return shell(ctx, title="数据 · Statistics", active="stats.html", body=body)


def _leader_card(ctx: Context, board: dict) -> str:
    top = board["rows"][0]["value"] if board["rows"] else 1
    rows = "".join(
        f'<div class="lb-row"><span class="i">{i + 1}</span>{avatar(ctx, ctx.player(r["id"]), 28)}'
        f'<span class="n"><b>{esc(r.get("zh") or r["name"])}</b>'
        f'<span class="en">{esc(r["name"])}</span></span>'
        f'<span class="v">{pct(r["value"]) if board["unit"] == "%" else num(r["value"])}</span>'
        f'<span class="lb-bar"><i style="width:{max(2, r["value"] / top * 100):.1f}%"></i></span></div>'
        for i, r in enumerate(board["rows"][:10])
    )
    note = BOARD_NOTES.get(board["key"], "")
    note_html = bi(note, "") if note else ""
    return (
        f'<div class="leader-card"><div class="leader-head">'
        f'<h4>{bi(BOARD_ZH.get(board["key"], ""), board["label"])}</h4>'
        f'<span class="u">{esc("season %" if board["unit"] == "%" else "total")}</span></div>'
        f'<div class="leader-body">{rows}</div>'
        + (f'<div class="card-bd dim" style="font-size:11.5px;border-top:1px solid rgba(255,255,255,.07)">{note_html}</div>' if note_html else "")
        + "</div>"
    )


# 数据榜中文名与说明
BOARD_NOTES = {
    "aces": "整个赛季发出的 ACE 球总数。ACE 由主裁与赛场线审设备记录，不同赛事的判定技术不同，跨赛事并不完全可比。",
    "doubleFaults": "双误总数。这是一项越低越好的统计，因此单独成榜。",
    "firstServePct": "一发落入有效区的比例。一发成功率高的球员，通常在一发球速上有所取舍。",
    "firstServeWonPct": "一发得分率——判断一周发球是否具有统治力的最佳单一指标。",
    "secondServeWonPct": "二发得分率。这一项最能区分巡回赛顶级接发球员与其他球员。",
    "serviceGamesWonPct": "发球局保发比例。在女子巡回赛中超过 75% 已属顶级水平。",
    "returnGamesWonPct": "接发局转化为破发的比例。",
    "returnPointsWonPct": "接发球得分比例。",
    "breakPointsSavedPct": "面对破发点时的挽救比例。",
    "breakPointsConvertedPct": "获得破发机会时的转化比例。",
    "totalPointsWonPct": "全部得分的比例——衡量一个赛季最简洁的单一数字。",
    "servicePointsWonPct": "发球分得分比例。",
}


# ---------------------------------------------------------------------------
# Rankings
# ---------------------------------------------------------------------------

RANK_SORTS = [
    ("points", "积分", "Points"),
    ("name", "姓名", "Name"),
    ("age", "年龄", "Age"),
    ("move", "变动", "Move"),
]


def rankings(ctx: Context) -> str:
    """
    The full ranking table.

    Sorting is pre-rendered: each order is a complete <table> inside a section
    revealed by `#sort-<key>`, so the order changes by URL fragment with no
    script.  A reader who ignores the links still sees ranking order.
    """
    top3 = ctx.players[:3]
    podium = "".join(
        f'<a class="podium-card g{i + 1}" href="player-{p["id"]}.html">'
        f'<span class="podium-n">No.{p["rank"]}</span>'
        f'{avatar(ctx, p, 76)}'
        f'<div class="podium-name">{ctx.name(p)}</div>'
        f'<div class="podium-pts">{num(p["points"])}</div>'
        f'<div class="podium-country">{esc(ctx.zh.get("countries", {}).get(p["country"], p["country"]))}</div></a>'
        for i, p in enumerate(top3)
    )

    def table(rows: list[dict], sort_key: str) -> str:
        body = "".join(
            f'<tr><td>{p["rank"]}</td>'
            f'<td class="l">{player_cell(ctx, p, avatar_on=(sort_key == "points"))}</td>'
            f'<td class="c"><span class="tb-flag">{ctx.country(p["country"])}</span></td>'
            f'<td>{ctx.move(p["move"])}</td>'
            f'<td class="tb-num">{p.get("age") if p.get("age") is not None else "—"}</td>'
            f'<td class="tb-num">{p.get("played") if p.get("played") is not None else "—"}</td>'
            f'<td class="tb-num">{num(p["points"])}</td></tr>'
            for p in rows
        )
        return (
            '<table class="rank-table"><thead><tr>'
            f'<th class="c-pos">{bi("名次", "#")}</th><th class="c-player">{bi("球员", "Player")}</th>'
            f'<th class="c-country">{bi("国家/地区", "Country")}</th><th class="c-move">{bi("变动", "Move")}</th>'
            f'<th class="c-age">{bi("年龄", "Age")}</th><th class="c-ev">{bi("参赛", "Events")}</th>'
            f'<th class="c-pts">{bi("积分", "Points")}</th></tr></thead>'
            f"<tbody>{body}</tbody></table>"
        )

    # The default view is emitted LAST: the other views hide it with the sibling
    # combinator, which only reaches elements that come after them.
    tables = []
    for key, zh, en in ([x for x in RANK_SORTS if x[0] != "points"]
                        + [x for x in RANK_SORTS if x[0] == "points"]):
        rows = sorted(ctx.players, key=lambda p: _rank_sort_key(p, key))
        tables.append(
            f'<div class="rank-body" id="sort-{key}"><div class="table-scroll">{table(rows, key)}</div></div>'
        )

    body = f'''
<div class="wrap">
  {page_head("PIF WTA Rankings · 官方单打排名", "", "官方单打排名", "Official singles ranking",
             f'共 {num(len(ctx.players))} 位球员，名次变动与官方公布的上周排名对比。',
             f'{num(len(ctx.players))} ranked players, with movement against the previous published week.')}
  <div class="rank-podium">{podium}</div>
  <div class="sort-bar">
    <span class="sort-label">{bi("排序", "Sort")}</span>
    <div class="seg-group sm">
      <a class="seg" href="#sort-points">{bi("积分", "Points")}</a>
      <a class="seg" href="#sort-name">{bi("姓名", "Name")}</a>
      <a class="seg" href="#sort-age">{bi("年龄", "Age")}</a>
      <a class="seg" href="#sort-move">{bi("变动", "Move")}</a>
    </div>
    <span class="dim" style="font-size:11.5px">{bi("默认按排名先后", "Default order is by ranking")}</span>
  </div>
  <div class="panel">
    <div class="rank-head"><div>
      <h3>{bi("单打世界排名", "Singles World Ranking")}</h3>
      <p class="rank-desc">{bi("排名积分与名次变动均取自 WTA 官方榜单。",
                               "Points and movement are as published by the WTA.")}</p>
    </div><div class="rank-updated">{esc(timestamp(ctx.meta.get("rankingsAsOf")))}</div></div>
    {"".join(tables)}
  </div>
</div>
'''
    return shell(ctx, title="排名 · World Rankings", active="rankings.html", body=body)


def _rank_sort_key(player: dict, key: str):
    if key == "name":
        return player["name"]
    if key == "age":
        return player.get("age") if player.get("age") is not None else 999
    if key == "move":
        return -(player.get("move") or 0)
    return -player["points"]


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------


def players_page(ctx: Context) -> str:
    """Every ranked player as a card, grouped by country."""
    counts: dict[str, int] = {}
    for p in ctx.players:
        counts[p["country"]] = counts.get(p["country"], 0) + 1
    top_countries = sorted(counts.items(), key=lambda kv: -kv[1])[:14]

    chips = f'<a class="chip" href="#all">{bi("全部球员", "All players")}</a>' + "".join(
        f'<a class="chip" href="#c-{esc(code)}">'
        f'{esc(ctx.zh.get("countries", {}).get(code, code))} {count}</a>'
        for code, count in top_countries
    )

    sections = [
        '<div class="player-grid" id="all">'
        + "".join(_player_card(ctx, p) for p in ctx.players)
        + "</div>"
    ]
    for code, _ in top_countries:
        subset = [p for p in ctx.players if p["country"] == code]
        sections.append(
            f'<div class="player-grid" id="c-{esc(code)}">'
            + "".join(_player_card(ctx, p) for p in subset)
            + "</div>"
        )

    body = f'''
<div class="wrap">
  {page_head("Player directory · 球员名录", "", "所有排名球员，一处查全", "Every ranked player, in one place",
             f'共 {num(len(ctx.players))} 位球员的生涯战绩、最高排名与赛季发球统计。',
             f'Career records, high rankings and season statistics for all {num(len(ctx.players))} ranked players.')}
  <div class="filter-bar"><div class="chips">{chips}</div></div>
  {"".join(sections)}
</div>
'''
    return shell(ctx, title="球员 · Players", active="players.html", body=body)


def _player_card(ctx: Context, player: dict) -> str:
    season = player.get("season") or {}
    serve = player.get("serve") or {}
    wins, losses = season.get("w"), season.get("l")
    total = (wins or 0) + (losses or 0)
    win_pct = (wins / total * 100) if total else None
    accent = "var(--gold-500)" if total and wins > losses else "var(--hard-600)"
    form = "".join(
        f'<i class="{"w" if w else "l"}">{"W" if w else "L"}</i>'
        for w in (season.get("last10") or [])
    )
    age = player.get("age")
    age_text = f" · {age} 岁" if age is not None else ""
    title_txt = season.get("titles") if season.get("titles") is not None else "—"
    pct_txt = f"{win_pct:.0f}%" if win_pct else "—"
    record_txt = f"{wins}–{losses}" if wins is not None else "—"
    prize = (
        f'<span>奖金 <b>{money_short(player["careerPrize"])}</b></span>'
        if player.get("careerPrize")
        else ""
    )
    country = esc(ctx.zh.get("countries", {}).get(player["country"], player["country"]))
    form_html = f'<div class="pc-form">{form}</div>' if form else ""
    return (
        f'<a class="player-card" href="player-{player["id"]}.html" style="--pc-accent:{accent}">'
        f'<div class="pc-top">{avatar(ctx, player, 54)}'
        f'<div class="pc-id"><span class="pc-rank">No.{player["rank"]} · {num(player["points"])} pts</span>'
        f'<span class="pc-name">{bi(player.get("zh") or player["name"], player["name"])}</span>'
        f'<span class="pc-country">{country}{age_text}</span></div></div>'
        f'<div class="pc-stats">'
        f'<div class="pc-stat"><b>{record_txt}</b><span>{ctx.season} W–L</span></div>'
        f'<div class="pc-stat"><b>{title_txt}</b><span>冠军 Titles</span></div>'
        f'<div class="pc-stat"><b>{pct_txt}</b><span>胜率 Win %</span></div></div>'
        f'{form_html}'
        f'<div class="pc-serve">'
        f'<span>ACE <b>{num(serve.get("aces"))}</b></span>'
        f'<span>一发 <b>{pct(serve.get("firstServePct"))}</b></span>'
        f'<span>发球局 <b>{pct(serve.get("serviceGamesWonPct"))}</b></span>'
        f'{prize}</div></a>'
    )
