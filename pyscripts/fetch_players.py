#!/usr/bin/env python3
"""
Fetch per-player official records.

For every player in the ranking snapshot we store:
  • the official biography record (bio fields, career W/L, titles, prize money)
  • the current-season aggregate statistics (serve / return / break splits)
  • the full week-by-week ranking history

Match-by-match results are fetched separately so the repository stays a
reasonable size.
"""

from __future__ import annotations

import html
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import time

import time
import urllib.request

from wtalib import (
    SSL_CONTEXT,
    UA,
    env_int,
    fetch_player_detailed,
    fetch_player_ranking_history,
    fetch_player_season,
    log,
    read_json,
    write_json,
)

LIMIT = env_int("WTA_PLAYER_LIMIT", 300)
SEASON = env_int("WTA_SEASON", __import__("datetime").datetime.now().year)
WORKERS = env_int("WTA_WORKERS", 4)

ONLY = {int(x) for x in filter(None, __import__("os").environ.get("WTA_ONLY_IDS", "").split(","))}

# ---------------------------------------------------------------------------
# Season statistics
#
# The official season record uses PascalCase counters (`Aces`,
# `First_Serves_Won`, …) plus snake_case season percentages
# (`first_serve_won_percent`, …).  Both are kept, along with the per-tournament
# averages from `AggregateData`.
# ---------------------------------------------------------------------------

SEASON_COUNTERS = {
    "aces": "Aces",
    "doubleFaults": "Double_Faults",
    "firstServesPlayed": "First_Serves_Played",
    "firstServesWon": "First_Serves_Won",
    "secondServesPlayed": "Second_Serves_Played",
    "secondServesWon": "Second_Serves_Won",
    "serviceGamesPlayed": "Service_Games_Played",
    "breakPointsFaced": "Break_Points_Faced",
    "breakPointsLost": "Break_Points_Lost",
    "breakPointChances": "Break_Point_Chances",
    "breakPointsConverted": "Break_Points_Converted",
    "returnGamesPlayed": "Return_Games_Played",
    "firstServeReturnChances": "First_Serve_Return_Chances",
    "firstReturnWon": "First_Return_Won",
    "secondReturnChances": "Second_Return_Chances",
    "secondReturnWon": "Second_Return_Won",
    "matches": "MatchCount",
}

SEASON_PERCENTS = {
    "firstServePct": "first_serve_percent",
    "firstServeWonPct": "first_serve_won_percent",
    "secondServeWonPct": "second_serve_won_percent",
    "breakPointsSavedPct": "breakpoint_saved_percent",
    "breakPointsConvertedPct": "breakpoint_converted_percent",
    "serviceGamesWonPct": "service_games_won_percent",
    "servicePointsWonPct": "service_points_won_percent",
    "returnGamesWonPct": "return_games_won_percent",
    "returnPointsWonPct": "return_points_won_percent",
    "totalPointsWonPct": "total_points_won_percent",
    "firstReturnPct": "first_return_percent",
    "secondReturnPct": "second_return_percent",
}


def _num(value) -> float | None:
    """Round to two decimals the way the dashboard displays it."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return round(value * 100) / 100


def compact_season(stats: dict, year: int) -> dict:
    out: dict = {"year": year}
    for key, source in SEASON_COUNTERS.items():
        value = _num(stats.get(source))
        if value is not None:
            out[key] = value
    for key, source in SEASON_PERCENTS.items():
        value = _num(stats.get(source))
        if value is not None:
            out[key] = value

    aggregate = stats.get("AggregateData")
    if isinstance(aggregate, dict):
        averages: dict = {}
        for key, value in aggregate.items():
            if key == "TournamentYear" or not key.startswith("Average"):
                continue
            number = _num(value)
            if number is None:
                continue
            camel = re.sub(r"^Average", "", key)
            averages[camel[0].lower() + camel[1:]] = number
        if averages:
            out["perTournamentAvg"] = averages

    played = (out.get("firstServesPlayed"), out.get("secondServesPlayed"))
    won = (out.get("firstServesWon"), out.get("secondServesWon"))
    if all(v is not None for v in played + won):
        total = played[0] + played[1]
        if total > 0:
            out["servicePointsWon"] = won[0] + won[1]
    return out


def clean_html(value) -> str:
    """Biography fields arrive as small HTML fragments."""
    text = str(value or "")
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Player records
# ---------------------------------------------------------------------------


def ranking_history(player_id: int, attempts: int = 4) -> list:
    """
    Fetch a player's weekly ranking history.

    Under load the endpoint answers 200 with an *empty* `weeklyRankings` array
    rather than an error, so an empty result is treated as a failure and retried —
    otherwise a throttled run silently loses history for a handful of players.
    """
    for attempt in range(attempts):
        if attempt:
            time.sleep(1.5 * attempt)
        payload = fetch_player_ranking_history(player_id)
        weekly = (payload or {}).get("weeklyRankings")
        if isinstance(weekly, list) and weekly:
            rows = [
                [(w.get("rankedAt") or "")[:10], w.get("singlesRanking"), w.get("doublesRanking")]
                for w in weekly
            ]
            rows = [r for r in rows if r[0]]
            rows.sort(key=lambda r: r[0])
            return rows
    return []


def _verified_photo(url, pid: int) -> str:
    """
    Return the headshot URL only if it actually resolves.

    The API publishes an `imageurl` for every player, but a number of them — 142
    of the current top 300, mostly recent debutants — point at blobs that answer
    404.  Verifying once at fetch time keeps those out of the payload, so pages
    show the monogram fallback instead of firing requests that are guaranteed to
    fail.  The check is a HEAD request; 300 of them at a polite rate cost seconds.
    """
    if not url:
        return ""
    try:
        req = urllib.request.Request(url, method="HEAD",
                                     headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15, context=SSL_CONTEXT) as resp:
            return url if resp.status == 200 else ""
    except Exception:  # noqa: BLE001 — any failure means no usable image
        return ""


def build_bio(player: dict, bio: dict) -> dict:
    return {
        "id": player["id"],
        "name": f"{bio.get('firstname') or player['first']} {bio.get('lastname') or player['last']}".strip(),
        "country": bio.get("natlcode") or player["country"],
        "countryName": bio.get("countryname") or "",
        "birth": (bio.get("dateofbirth") or player.get("birth") or "")[:10],
        "age": bio.get("age"),
        "birthCity": bio.get("birthcity") or "",
        "residence": bio.get("residence") or "",
        "height": bio.get("height") or "",
        "hand": bio.get("playhand") or "",
        "backhand": bio.get("backhand") or "",
        "status": bio.get("status") or "",
        "proYear": bio.get("proyear"),
        "photo": _verified_photo(bio.get("imageurl"), player["id"]),
        "careerPrize": bio.get("careerprize"),
        "ytdPrize": bio.get("ytdprize"),
        "sglRank": bio.get("sglrank"),
        "sglHighRank": bio.get("sglhirank"),
        "sglHighDate": (bio.get("sglhirankdate") or "")[:10],
        "sglCareerWon": bio.get("sglcareerwon"),
        "sglCareerLost": bio.get("sglcareerlost"),
        "sglCareerTitles": bio.get("sglcareertitles"),
        "sglYtdWon": bio.get("sglytdwon"),
        "sglYtdLost": bio.get("sglytdlost"),
        "sglYtdTitles": bio.get("sglytdtitles"),
        "dblRank": bio.get("dblrank"),
        "dblHighRank": bio.get("dblhirank"),
        "dblHighDate": (bio.get("dblhirankdate") or "")[:10],
        "dblCareerWon": bio.get("dblcareerwon"),
        "dblCareerLost": bio.get("dblcareerlost"),
        "dblCareerTitles": bio.get("dblcareertitles"),
        "dblYtdWon": bio.get("dblytdwon"),
        "dblYtdLost": bio.get("dblytdlost"),
        "dblYtdTitles": bio.get("dblytdtitles"),
        "highlights": clean_html(bio.get("CareerHighlightsSingles") or bio.get("CareerHighlights")),
        "yearDetail": clean_html(bio.get("CurrentYearDetail")),
        "careerReview": clean_html(bio.get("CareerInReview")),
        "personal": clean_html(bio.get("personal")),
        "bioUpdated": (bio.get("datebioupdated") or "")[:10],
    }


def main() -> int:
    rankings = read_json("rankings-singles.json", {"players": []})
    all_players = rankings["players"][:LIMIT]
    if ONLY:
        all_players = [p for p in all_players if p["id"] in ONLY]

    # Resume: a previous run may have written most records already, and a network
    # hiccup part-way through should not mean re-fetching everything.
    existing_bios = read_json("bios.json", {}) or {}
    existing_seasons = read_json("season-stats.json", {}) or {}
    existing_histories = read_json("ranking-history.json", {}) or {}
    resume = bool(existing_bios) and not ONLY

    bios: dict = {int(k): v for k, v in existing_bios.items()} if resume else {}
    seasons: dict = {int(k): v for k, v in existing_seasons.items()} if resume else {}
    histories: dict = {int(k): v for k, v in existing_histories.items()} if resume else {}

    def complete(player: dict) -> bool:
        """A player is done once all three records exist."""
        pid = player["id"]
        return pid in bios and pid in seasons and pid in histories

    targets = [p for p in all_players if not complete(p)] if resume else all_players
    if resume and targets:
        log("players", f"Resuming — {len(all_players) - len(targets)} already stored, {len(targets)} to fetch.")
    if not targets:
        log("players", f"Nothing to fetch — all {len(all_players)} records already present.")
        write_json("data/bios.json", {str(k): v for k, v in bios.items()})
        write_json("data/season-stats.json", {str(k): v for k, v in seasons.items()})
        write_json("data/ranking-history.json", {str(k): v for k, v in histories.items()})
        return 0

    log("players", f"Fetching official records for {len(targets)} players (season {SEASON})…")
    failures = 0

    def handle(player: dict) -> None:
        nonlocal failures
        pid = player["id"]
        detailed = fetch_player_detailed(pid)
        season = fetch_player_season(pid, SEASON)

        bio = (detailed or {}).get("bio")
        if bio:
            bios[pid] = build_bio(player, bio)
        else:
            raise RuntimeError("no biography record returned")

        stats = (season or {}).get("stats")
        if stats:
            seasons[pid] = compact_season(stats, SEASON)

        rows = ranking_history(pid)
        if rows:
            histories[pid] = rows

    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(handle, p): p for p in targets}
        for future in as_completed(futures):
            player = futures[future]
            try:
                future.result()
            except Exception as err:  # noqa: BLE001
                failures += 1
                print(f"  ! {player['name']}: {err}")
            done += 1
            if done % 25 == 0:
                log("players", f"{done}/{len(targets)}…")

    write_json("data/bios.json", {str(k): v for k, v in sorted(bios.items())})
    write_json("data/season-stats.json", {str(k): v for k, v in sorted(seasons.items())})
    write_json("data/ranking-history.json", {str(k): v for k, v in sorted(histories.items())})

    log(
        "players",
        f"Done — bios {len(bios)}, stats {len(seasons)}, histories {len(histories)}, failures {failures}.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
