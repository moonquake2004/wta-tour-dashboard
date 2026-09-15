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


def build_h2h_pairs(ctx: Context, depth: int = pages.H2H_DEPTH) -> list[tuple[int, int]]:
    """Pairings generated as their own pages: every combination inside the top N."""
    roster = ctx.players[:depth]
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
    rival_ids = [p["id"] for p in ctx.players[:30]]
    for player in ctx.players:
        pid = player["id"]
        # Head-to-head summary against the current top 30.
        rivals = []
        for other in rival_ids:
            if other == pid:
                continue
            key = f"{min(pid, other)}-{max(pid, other)}"
            record = ctx.h2h_pairs.get(key)
            if not record:
                continue
            is_low = pid < other
            rivals.append({
                "id": other,
                "player": ctx.player(other),
                "wins": record["aw"] if is_low else record["bw"],
                "losses": record["bw"] if is_low else record["aw"],
                "meetings": record.get("n", 0),
            })
        rivals.sort(key=lambda r: (-(r["wins"] + r["losses"]), r["player"].get("rank") or 999))
        write(f"player-{pid}.html",
              pages.player_page(ctx, player, rivals, _recent_matches(data, pid)))
    log("site", f"  ✓ {len(ctx.players)} player profiles")

    # ------------------------------------------------------------ event pages
    for key, event in events.items():
        write(f'event-{event["id"]}-{event["year"]}.html', pages.event_page(ctx, event))
    log("site", f"  ✓ {len(events)} event pages")

    # ------------------------------------------------------------ head-to-head
    pairs = build_h2h_pairs(ctx)
    write("h2h.html", pages.h2h_hub(ctx, pairs))
    for a_id, b_id in pairs:
        # The index keys every pairing with the smaller id first.
        key = f"{min(a_id, b_id)}-{max(a_id, b_id)}"
        record = ctx.h2h_pairs.get(key)
        meetings = h2h_meetings.get(key, [])
        write(f"h2h-{a_id}-{b_id}.html",
              pages.h2h_pair(ctx, ctx.player(a_id), ctx.player(b_id), record, meetings))
    log("site", f"  ✓ 1 hub + {len(pairs)} pairing pages")

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
