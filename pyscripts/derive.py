#!/usr/bin/env python3
"""
Build derived aggregates from the raw official snapshots.

  • season leaderboards (aces, double faults, service/return games won, …)
  • career title, match-win and prize-money leaders
  • per-player season W/L records computed from the raw match log

Every figure comes from a field the tour itself publishes; nothing is modelled.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from wtalib import env_int, log, read_json, write_json

SEASON = env_int("WTA_SEASON", datetime.now(timezone.utc).year)

# key, English label, which statistic, unit, minimum matches to qualify
BOARD_DEFS = [
    ("aces", "Aces", "aces", "", 5),
    ("doubleFaults", "Double faults", "doubleFaults", "", 5),
    ("firstServePct", "First serve in", "firstServePct", "%", 10),
    ("firstServeWonPct", "1st serve points won", "firstServeWonPct", "%", 10),
    ("secondServeWonPct", "2nd serve points won", "secondServeWonPct", "%", 10),
    ("serviceGamesWonPct", "Service games won", "serviceGamesWonPct", "%", 10),
    ("returnGamesWonPct", "Return games won", "returnGamesWonPct", "%", 10),
    ("returnPointsWonPct", "Return points won", "returnPointsWonPct", "%", 10),
    ("breakPointsSavedPct", "Break points saved", "breakPointsSavedPct", "%", 10),
    ("breakPointsConvertedPct", "Break points converted", "breakPointsConvertedPct", "%", 10),
    ("totalPointsWonPct", "Total points won", "totalPointsWonPct", "%", 10),
    ("servicePointsWonPct", "Service points won", "servicePointsWonPct", "%", 10),
]


def pct(won, lost):
    total = (won or 0) + (lost or 0)
    if total <= 0:
        return None
    return math.floor((won or 0) / total * 1000 + 0.5) / 10


def main() -> int:
    rankings = read_json("rankings-singles.json", {"players": [], "asOf": None})
    bios = read_json("bios.json", {})
    stats = read_json("season-stats.json", {})
    matches = read_json("matches.json", {})

    log("derive", "Building leaderboards and season records…")

    rank_by_id = {p["id"]: p for p in rankings["players"]}

    # ---------------------------------------------------------------- boards
    leaderboards = []
    for key, label, metric, unit, minimum in BOARD_DEFS:
        rows = []
        for pid, season_stats in stats.items():
            value = (season_stats or {}).get(metric)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                continue
            if not math.isfinite(value):
                continue
            player = rank_by_id.get(int(pid))
            if not player:
                continue
            if (season_stats.get("matches") or 0) < minimum:
                continue
            rows.append(
                {
                    "id": int(pid),
                    "name": player["name"],
                    "country": player["country"],
                    "rank": player["rank"],
                    "value": value,
                    "matches": season_stats.get("matches"),
                }
            )
        rows.sort(key=lambda r: r["value"], reverse=True)
        leaderboards.append(
            {"key": key, "label": label, "metric": metric, "unit": unit,
             "dir": "desc", "min": minimum, "rows": rows[:20]}
        )

    # -------------------------------------------------------- career leaders
    career = [b for b in bios.values() if b.get("sglRank") is not None or b.get("sglCareerWon") is not None]

    titles = [
        {
            "id": b["id"],
            "name": b["name"],
            "country": b.get("country"),
            "titles": b.get("sglCareerTitles") or 0,
            "rank": (rank_by_id.get(b["id"]) or {}).get("rank"),
        }
        for b in sorted(
            (b for b in career if (b.get("sglCareerTitles") or 0) > 0),
            key=lambda b: b.get("sglCareerTitles") or 0,
            reverse=True,
        )[:15]
    ]

    career_wins = [
        {
            "id": b["id"],
            "name": b["name"],
            "country": b.get("country"),
            "won": b.get("sglCareerWon") or 0,
            "lost": b.get("sglCareerLost") or 0,
            "pct": pct(b.get("sglCareerWon"), b.get("sglCareerLost")),
            "rank": (rank_by_id.get(b["id"]) or {}).get("rank"),
        }
        for b in sorted(
            (b for b in career if (b.get("sglCareerWon") or 0) > 0),
            key=lambda b: b.get("sglCareerWon") or 0,
            reverse=True,
        )[:15]
    ]

    prize_money = [
        {
            "id": b["id"],
            "name": b["name"],
            "country": b.get("country"),
            "prize": b.get("careerPrize") or 0,
            "rank": (rank_by_id.get(b["id"]) or {}).get("rank"),
        }
        for b in sorted(
            (b for b in career if (b.get("careerPrize") or 0) > 0),
            key=lambda b: b.get("careerPrize") or 0,
            reverse=True,
        )[:15]
    ]

    # ------------------------------------------- season W/L from the match log
    season_map: dict = {}
    for pid, rows in matches.items():
        by_year: dict = {}
        for match in rows:
            year = match.get("yr") or int(match["d"][:4])
            bucket = by_year.setdefault(
                year, {"w": 0, "l": 0, "titles": 0, "finals": 0, "surfaces": {}, "levels": {}, "last10": []}
            )
            bucket["w" if match.get("w") else "l"] += 1
            surface = match.get("sfc") or "UNKNOWN"
            bucket["surfaces"].setdefault(surface, {"w": 0, "l": 0})
            bucket["surfaces"][surface]["w" if match.get("w") else "l"] += 1
            level = match.get("lvl") or "?"
            bucket["levels"].setdefault(level, {"w": 0, "l": 0})
            bucket["levels"][level]["w" if match.get("w") else "l"] += 1

        # A title is a won final; a final appearance counts either way.
        for match in rows:
            year = match.get("yr") or int(match["d"][:4])
            if match.get("r") == "F":
                by_year[year]["finals"] += 1
                if match.get("w"):
                    by_year[year]["titles"] += 1

        # Most recent ten results, newest first.
        ordered = sorted(rows, key=lambda m: m["d"], reverse=True)
        for year, bucket in by_year.items():
            bucket["last10"] = [
                m.get("w")
                for m in ordered
                if (m.get("yr") or int(m["d"][:4])) == int(year)
            ][:10]

        season_map[pid] = by_year

    write_json(
        "data/leaderboards.json",
        {
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "season": SEASON,
            "boards": leaderboards,
            "career": {"titles": titles, "careerWins": career_wins, "prizeMoney": prize_money},
            "seasonMap": season_map,
        },
    )

    log("derive", f"Done — {len(leaderboards)} leaderboards, {len(season_map)} season records.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
