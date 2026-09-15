#!/usr/bin/env python3
"""
Fetch the official WTA Tour calendar for the active seasons.

The tournament feed carries the full draw metadata plus the champion of each
completed event, which is what the calendar view renders.
"""

from __future__ import annotations

import re

from datetime import datetime, timezone

from wtalib import env_int, fetch_tournaments, log, write_json

YEAR = env_int("WTA_SEASON", datetime.now(timezone.utc).year)
PREV = YEAR - 1

# Main-tour levels only: ITF World Tennis Tour events are out of scope.
TOUR_LEVELS = {
    "Grand Slam",
    "WTA Finals",
    "WTA 1000",
    "WTA 500",
    "WTA 250",
    "WTA 125",
    "United Cup",
    "Billie Jean King Cup",
}

LEVEL_ORDER = [
    "Grand Slam",
    "WTA Finals",
    "WTA 1000",
    "WTA 500",
    "WTA 250",
    "WTA 125",
    "ITF",
    "United Cup",
    "Billie Jean King Cup",
]


def title_case(value: str) -> str:
    """
    Match the reference implementation's casing exactly.

    It splits on whitespace and rejoins with single spaces *without* stripping,
    so a label such as "Rome " keeps its trailing space.  Trimming here would
    make the snapshot differ from the one it replaces, so the behaviour is kept.
    """
    parts = re.split(r"\s+", str(value).lower())
    return " ".join(w[:1].upper() + w[1:] if w else w for w in parts)


def collect(year: int) -> list[dict]:
    out: list[dict] = []
    for page in range(12):
        res = fetch_tournaments(
            {"page": page, "pageSize": 100, "from": f"{year}-01-01", "to": f"{year}-12-31"}
        )
        content = (res or {}).get("content")
        if not isinstance(content, list) or not content:
            break
        out.extend(
            t
            for t in content
            if (t.get("level") or (t.get("tournamentGroup") or {}).get("level")) in TOUR_LEVELS
        )
        if len(content) < 100:
            break
    return out


def normalise(tournament: dict) -> dict:
    group = tournament.get("tournamentGroup") or {}
    winners = tournament.get("winners") or []
    winner = winners[0] if winners else None
    singles = ((winner or {}).get("singles") or {}).get("player")
    doubles = (winner or {}).get("doubles")
    doubles = doubles if isinstance(doubles, list) else []

    return {
        "id": group.get("id"),
        "name": title_case(group.get("name") or tournament.get("title") or ""),
        "title": tournament.get("title") or "",
        "year": tournament.get("year"),
        "level": tournament.get("level") or group.get("level") or "",
        "start": str(tournament.get("startDate") or "")[:10],
        "end": str(tournament.get("endDate") or "")[:10],
        "surface": tournament.get("surface") or "",
        "indoor": tournament.get("inOutdoor") == "I",
        "city": title_case(tournament.get("city") or ""),
        "country": tournament.get("country") or "",
        "drawSize": tournament.get("singlesDrawSize") or 0,
        "prize": tournament.get("prizeMoney") or 0,
        "currency": tournament.get("prizeMoneyCurrency") or "USD",
        "status": tournament.get("status") or "",
        "champion": (
            {
                "id": singles.get("id"),
                "name": singles.get("fullName"),
                "country": singles.get("countryCode") or "",
            }
            if singles
            else None
        ),
        "doublesChampions": [
            {"id": p.get("id"), "name": p.get("fullName"), "country": p.get("countryCode") or ""}
            for p in ((d or {}).get("player") for d in doubles)
            if p
        ],
    }


def main() -> int:
    log("tournaments", f"Fetching WTA Tour calendar for {PREV}–{YEAR}…")

    all_events: list[dict] = []
    for year in (PREV, YEAR):
        rows = collect(year)
        log("tournaments", f"{year}: {len(rows)} events")
        all_events.extend(rows)

    # De-duplicate on (group id, year, start date): multi-week events legitimately
    # appear once per week of play in the feed.
    seen: dict[str, dict] = {}
    for t in all_events:
        key = f"{(t.get('tournamentGroup') or {}).get('id')}|{t.get('year')}|{str(t.get('startDate') or '')[:10]}"
        seen.setdefault(key, t)

    events = [normalise(t) for t in seen.values()]
    events = [e for e in events if e["id"] and e["start"]]
    # Ascending then reversed: reverse=True would also reverse same-day events,
    # changing their order relative to the snapshot it replaces.
    events.sort(key=lambda e: e["start"])
    events.reverse()

    write_json(
        "data/tournaments.json",
        {
            "source": "WTA Official Tournaments API",
            "sourceUrl": "https://www.wtatennis.com/tournaments",
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "levels": LEVEL_ORDER,
            "seasons": [PREV, YEAR],
            "events": events,
        },
    )

    by_level: dict[str, int] = {}
    for event in events:
        by_level[event["level"]] = by_level.get(event["level"], 0) + 1
    log("tournaments", f"Done — {len(events)} events {by_level}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
