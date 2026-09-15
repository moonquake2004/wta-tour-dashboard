#!/usr/bin/env python3
"""
Generate the publishable site into ``docs/``.

Everything is written as complete HTML — the panels, the 300 player profiles and
the 186 event pages — so the site works with JavaScript switched off.  The only
script tag in the output is the image fallback baked into the markup itself.

    python3 pyscripts/build_site.py
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from wtalib import DATA_DIR, ROOT, log
from render import Context
import pages


def load_globals(name: str, global_name: str):
    """Read a generated data file, which is a script assigning one global."""
    path = DATA_DIR / name
    if not path.exists():
        raise SystemExit(f"missing {path} — run generate_data.py first")
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"window\.{global_name}=(.*);\s*$", text, re.S)
    if not match:
        raise SystemExit(f"cannot parse {path}")
    return json.loads(match.group(1))


def _rivals_for(ctx, pid: int, others: list[int], limit: int = 30) -> list[dict]:
    """
    Head-to-head summary for one player against a set of opponents.

    Only opponents inside the generated pairing range are returned; anything else
    would render a link to a page that does not exist.
    """
    rows = []
    for other in others:
        if ctx.pair_ids and other not in ctx.pair_ids:
            continue
        if other == pid:
            continue
        key = f"{min(pid, other)}-{max(pid, other)}"
        record = ctx.h2h_pairs.get(key)
        if not record:
            continue
        is_low = pid < other
        rows.append({
            "id": other,
            "player": ctx.player(other),
            "wins": record["aw"] if is_low else record["bw"],
            "losses": record["bw"] if is_low else record["aw"],
            "meetings": record.get("n", 0),
        })
    rows.sort(key=lambda r: (-(r["wins"] + r["losses"]), r["player"].get("rank") or 9999))
    return rows[:limit]


def build_h2h_pairs(ctx: Context, depth: int = pages.H2H_DEPTH) -> list[tuple[int, int]]:
    """Pairings generated as their own pages: every combination inside the top N."""
    roster = ctx.pair_roster or ctx.players[:depth]
    pairs = []
    for i, a in enumerate(roster):
        for b in roster[i + 1:]:
            pairs.append((a["id"], b["id"]))
    return pairs


def main() -> int:
    log("site", "Generating the static site…")

    data = load_globals("dashboard.js", "WTA_DATA")
    events = load_globals("events.js", "WTA_EVENTS")
    h2h = load_globals("h2h.js", "WTA_H2H")
    h2h_meetings = load_globals("h2h-matches.js", "WTA_H2H_MATCHES")

    ctx = Context(data, events, h2h)
    # The top N by ranking, which is the range pairing pages are generated for.
    # Declared before anything renders so no link points at a page that will not
    # exist — this is the single definition of "in range" for the whole builder.
    pair_ids = {p["id"] for p in ctx.players[:pages.H2H_DEPTH]}
    ctx.pair_ids = pair_ids
    ctx.pair_roster = [p for p in ctx.players if p["id"] in pair_ids]
    out = ROOT / "docs"
    if out.exists():
        shutil.rmtree(out)
    # Static assets (stylesheet, social card) come from site-py/assets.
    src_assets = Path(__file__).resolve().parent.parent / "site-py" / "assets"
    if not src_assets.exists():
        raise SystemExit(f"missing {src_assets}")
    shutil.copytree(src_assets, out / "assets")

    written = 0

    def write(name: str, html: str) -> None:
        nonlocal written
        (out / name).write_text(html, encoding="utf-8")
        written += 1

    # ------------------------------------------------------------ main panels
    write("index.html", pages.overview(ctx))
    write("calendar.html", pages.calendar(ctx))
    write("results.html", pages.results_page(ctx))
    write("rankings.html", pages.rankings(ctx))
    write("players.html", pages.players_page(ctx))
    write("stats.html", pages.stats_page(ctx))
    log("site", f"  ✓ 6 panels")

    # --------------------------------------------------------- player profiles
    rival_ids = [p["id"] for p in ctx.players[:30] if p["id"] in pair_ids]
    for player in ctx.players:
        pid = player["id"]
        # Head-to-head summary against the current top 30.
        rivals = _rivals_for(ctx, pid, rival_ids, limit=30)
        write(f"player-{pid}.html",
              pages.player_page(ctx, player, rivals, _recent_matches(data, pid)))
    log("site", f"  ✓ {len(ctx.players)} player profiles")

    # Every opponent named anywhere on the site also gets a page, otherwise the
    # event draws and match logs would link to files that do not exist.
    ranked_ids = {p["id"] for p in ctx.players}
    extra = 0
    for pid_str, entry in ctx.h2h_players.items():
        pid = int(pid_str)
        if pid in ranked_ids:
            continue
        rivals = _rivals_for(ctx, pid, sorted(ranked_ids), limit=60)
        write(f"player-{pid}.html", pages.player_page_light(ctx, entry, rivals))
        extra += 1
    log("site", f"  ✓ {extra} additional player pages (outside the ranking table)")

    # Qualifying-only entrants never meet a ranked player, so they are absent from
    # the head-to-head index.  Their identity is still in the draw, which is enough
    # for a page and keeps every generated link resolvable.
    draw_players: dict[int, dict] = {}
    for event in events.values():
        for rnd in event["rounds"]:
            for match in rnd["matches"]:
                for side in ("a", "b"):
                    entry = match[side]
                    draw_players.setdefault(entry["id"], {
                        "id": entry["id"],
                        "name": entry["name"],
                        "zh": entry.get("zh") or "",
                        "country": entry.get("country") or "",
                        "rank": None,
                    })
    draw_only = 0
    for pid, entry in draw_players.items():
        if pid in ranked_ids or str(pid) in ctx.h2h_players:
            continue
        write(f"player-{pid}.html", pages.player_page_light(ctx, entry, []))
        draw_only += 1
    log("site", f"  ✓ {draw_only} qualifying-only player pages")

    # ------------------------------------------------------------ event pages
    for key, event in events.items():
        write(f'event-{event["id"]}-{event["year"]}.html', pages.event_page(ctx, event))
    log("site", f"  ✓ {len(events)} event pages")

    # ------------------------------------------------------------ head-to-head
    pairs = build_h2h_pairs(ctx)
    roster = ctx.pair_roster
    write("h2h.html", pages.h2h_hub(ctx, roster))

    # Step two of the flow: one opponent picker per player inside the range.
    for player in roster:
        opponents = [o for o in roster if o["id"] != player["id"]]
        write(f'h2h-pick-{player["id"]}.html', pages.h2h_pick(ctx, player, opponents))
    for a_id, b_id in pairs:
        # Filename and index key both use the smaller id first, so a pairing has
        # exactly one URL no matter which order the players were listed in.
        low, high = min(a_id, b_id), max(a_id, b_id)
        key = f"{low}-{high}"
        record = ctx.h2h_pairs.get(key)
        meetings = h2h_meetings.get(key, [])
        write(f"h2h-{low}-{high}.html",
              pages.h2h_pair(ctx, ctx.player(a_id), ctx.player(b_id), record, meetings))
    log("site", f"  ✓ 1 hub + {len(roster)} pickers + {len(pairs)} pairing pages")

    # ------------------------------------------------------------------- SEO
    stamp = ctx.stamp.replace("-", "").replace(":", "").replace("T", "")
    (out / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n"
        "Sitemap: https://moonquake2004.github.io/wta-tour-dashboard/sitemap.xml\n",
        encoding="utf-8",
    )
    urls = ["index.html", "rankings.html", "players.html", "calendar.html",
            "results.html", "stats.html", "h2h.html"]
    sitemap = "\n".join(
        f'  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/{u}</loc></url>'
        for u in urls
    )
    (out / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{sitemap}\n</urlset>\n",
        encoding="utf-8",
    )
    # GitHub Pages serves from docs/, and Jekyll must not process it.
    (out / ".nojekyll").write_text("", encoding="utf-8")
    log("site", "  ✓ robots.txt · sitemap.xml · .nojekyll")

    total = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    log("site", f"Done — {written} pages, {total / 1024 / 1024:.1f} MB")
    return 0


def _recent_matches(data: dict, pid: int, limit: int = 40) -> list[dict]:
    """
    This player's matches from the season feed, newest first, reshaped into the
    match-log structure the profile page renders (from the player's own side).
    """
    out = []
    for row in data.get("results", []):
        if pid == row["winnerId"]:
            opponent_id, won, opponent_rank = row["loserId"], 1, row.get("rank2")
        elif pid == row["loserId"]:
            opponent_id, won, opponent_rank = row["winnerId"], 0, row.get("rank1")
        else:
            continue
        opponent = next((p for p in data["players"] if p["id"] == opponent_id), None)
        out.append({
            "d": row["date"],
            "t": row["event"],
            "r": row["round"],
            "sfc": row["surface"],
            "sc": row["score"],
            "w": won,
            "oid": opponent_id,
            "o": opponent["name"] if opponent else "",
            "oc": opponent["country"] if opponent else "",
            "orank": opponent_rank,
        })
        if len(out) >= limit:
            break
    return out


if __name__ == "__main__":
    raise SystemExit(main())
