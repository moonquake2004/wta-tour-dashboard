#!/usr/bin/env python3
"""
Fetch singles match results for the ranked players.

Only completed singles matches inside the season window are kept; they power the
player "recent form" panel, the results feed and the head-to-head index.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from wtalib import env_int, fetch_player_matches, log, read_json, write_json

LIMIT = env_int("WTA_MATCH_LIMIT", 300)
FROM_YEAR = env_int("WTA_MATCH_FROM", 2023)
PAGES = env_int("WTA_MATCH_PAGES", 10)
WORKERS = env_int("WTA_WORKERS", 4)

# The feed returns a player's whole career, sorted ascending, 100 rows a page,
# and ignores date filters — so the window is located by binary search.
PAGE_CAP = 40


def title_case(value: str) -> str:
    """
    Match the reference implementation's casing exactly.

    It splits on whitespace and rejoins with single spaces *without* stripping,
    so a label such as "Rome " keeps its trailing space.  Trimming here would
    make the snapshot differ from the one it replaces, so the behaviour is kept.
    """
    parts = re.split(r"\s+", str(value).lower())
    return " ".join(w[:1].upper() + w[1:] if w else w for w in parts)


def year_of(match: dict) -> int | None:
    raw = str(match.get("StartDate") or "")
    year = raw[:4]
    return int(year) if year.isdigit() and int(year) > 1900 else None


def normalise(match: dict, player_id: int) -> dict | None:
    if match.get("s_d_flag") != "S":
        return None
    date = str(match.get("StartDate") or "")[:10]
    if not date:
        return None
    year = int(date[:4]) if date[:4].isdigit() else 0
    if year < FROM_YEAR:
        return None

    # Keep only contested matches: walkovers, byes and pre-play retirements carry
    # no score and would distort W/L records.
    score = re.sub(r"\s+", " ", str(match.get("scores") or "")).strip()
    if not re.search(r"\d", score):
        return None

    p1 = _int(match.get("player_1"))
    is_p1 = p1 == player_id
    opponent = match.get("opponent") or {}

    # In this feed `winner` is the SLOT of the player who LOST the match:
    #   winner = 1 ⇒ player_1 won, winner = 2 ⇒ player_2 won.
    # Verified against well-known results (Sabalenka d. Rybakina 76 36 76 at
    # Berlin 2025 is returned with winner=1 and player_1 = Sabalenka).
    slot = _int(match.get("winner"))
    if slot not in (1, 2):
        return None
    won = (slot == 1) if is_p1 else (slot == 2)

    return {
        "d": date,
        "t": title_case(match.get("TournamentName") or ""),
        "lvl": match.get("TournamentLevel") or "",
        "sfc": match.get("Surface") or "",
        "r": match.get("round_name") or "",
        "o": opponent.get("fullName") or "",
        "oid": opponent.get("id"),
        "oc": opponent.get("countryCode") or "",
        "w": 1 if won else 0,
        "sc": score,
        "seed": _first(match.get("seed_1"), match.get("seed_2"), is_p1),
        "orank": _first(match.get("rank_2"), match.get("rank_1"), is_p1),
        "rank": _first(match.get("rank_1"), match.get("rank_2"), is_p1),
        "yr": year,
    }


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _first(a, b, prefer_a: bool):
    """Pick the value that belongs to this player given which slot they occupy."""
    return a if prefer_a else b


def main() -> int:
    rankings = read_json("rankings-singles.json", {"players": []})
    all_players = rankings["players"][:LIMIT]

    # Resume: a network hiccup part-way through should not mean re-fetching every
    # player's log.  The stored file already holds the completed ones.
    existing = read_json("matches.json", {}) or {}
    out: dict = {int(k): v for k, v in existing.items()}
    targets = [p for p in all_players if p["id"] not in out]
    if existing and targets:
        log("matches", f"Resuming — {len(out)} players already stored, {len(targets)} to fetch.")
    if not targets:
        log("matches", f"Nothing to fetch — all {len(all_players)} match logs already present.")
        return 0

    log("matches", f"Fetching singles results for {len(targets)} players (since {FROM_YEAR})…")

    def handle(player: dict) -> None:
        player_id = player["id"]
        cache: dict[int, dict] = {}

        def get_page(page: int) -> dict:
            if page > PAGE_CAP:
                return {"matches": [], "oldest": None}
            if page in cache:
                return cache[page]
            result = fetch_player_matches(player_id, {"page": page, "pageSize": 100})
            matches = (result or {}).get("matches") or []
            entry = {
                "matches": matches,
                "oldest": year_of(matches[0]) if matches else None,
            }
            cache[page] = entry
            return entry

        # Binary search for the last page that begins before the window opens.
        lo, hi, last_before = 0, PAGE_CAP, 0
        while lo <= hi:
            mid = (lo + hi) // 2
            oldest = get_page(mid)["oldest"]
            if oldest is None:
                hi = mid - 1
            elif oldest < FROM_YEAR:
                last_before = mid
                lo = mid + 1
            else:
                hi = mid - 1

        collected: list[dict] = []
        seen: set[str] = set()
        for page in range(last_before, last_before + PAGES + 1):
            matches = get_page(page)["matches"]
            if not matches:
                break
            for match in matches:
                row = normalise(match, player_id)
                if not row:
                    continue
                key = f"{row['d']}|{row['t']}|{row['r']}|{row['oid']}|{row['sc']}"
                if key in seen:
                    continue
                seen.add(key)
                collected.append(row)
            if len(matches) < 100:
                break

        # Python's reverse=True reverses equal-key items too, which would flip the
        # order of matches played on the same day.  Sorting ascending and then
        # reversing keeps ties in their original order, matching the feed.
        collected.sort(key=lambda r: r["d"])
        collected.reverse()
        if collected:
            out[player_id] = collected

    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(handle, p): p for p in targets}
        for future in as_completed(futures):
            player = futures[future]
            try:
                future.result()
            except Exception as err:  # noqa: BLE001
                print(f"  ! matches {player['name']}: {err}")
            done += 1
            if done % 20 == 0:
                log("matches", f"{done}/{len(targets)}…")

    # The dashboard keys matches by player id; JSON object keys must be strings.
    write_json("data/matches.json", {str(k): v for k, v in sorted(out.items())})
    total = sum(len(v) for v in out.values())
    log("matches", f"Done — {len(out)} players, {total} singles matches.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
