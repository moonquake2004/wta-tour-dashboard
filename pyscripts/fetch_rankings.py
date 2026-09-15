#!/usr/bin/env python3
"""
Fetch the official WTA singles ranking table.

Everything published here comes straight from the WTA public JSON API that powers
wtatennis.com/rankings/singles — the same numbers, no interpretation.
"""

from __future__ import annotations

from wtalib import env_int, fetch_singles_rankings, log, write_json

MAX = env_int("WTA_RANK_DEPTH", 300)


def main() -> int:
    log("rankings", f"Fetching official WTA singles rankings (depth {MAX})…")

    rows = fetch_singles_rankings(max_rows=MAX)
    if not rows:
        print("No ranking rows returned — aborting so the previous snapshot survives.")
        return 1

    as_of = rows[0].get("rankedAt")
    players = []
    for row in rows:
        player = row.get("player") or {}
        name = " ".join(str(player.get("fullName") or "").split())
        if not name:
            continue
        players.append(
            {
                "id": player.get("id"),
                "rank": row.get("ranking"),
                "name": name,
                "first": (player.get("firstName") or "").strip(),
                "last": (player.get("lastName") or "").strip(),
                "country": player.get("countryCode") or "",
                "birth": (player.get("dateOfBirth") or "")[:10],
                "points": row.get("points") or 0,
                "played": row.get("tournamentsPlayed") or 0,
                "move": row.get("movement") or 0,
            }
        )

    payload = {
        "source": "WTA Official Rankings API",
        "sourceUrl": "https://www.wtatennis.com/rankings/singles",
        "asOf": as_of,
        "generatedAt": _utc_now(),
        "depth": len(players),
        "players": players,
    }
    write_json("data/rankings-singles.json", payload)

    # A compact index used by the client-side search box.  Chinese names are
    # merged in by fetch-zh.py so a reader can search in either language.
    write_json(
        "data/players-index.json",
        [
            {"i": p["id"], "n": p["name"], "c": p["country"], "r": p["rank"], "p": p["points"]}
            for p in players
        ],
    )

    log("rankings", f"Done — {len(players)} players, rankings dated {str(as_of)[:10]}.")
    return 0


def _utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
