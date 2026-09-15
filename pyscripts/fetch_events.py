#!/usr/bin/env python3
"""
Fetch complete per-event match results.

The calendar needs the full draw, not just each player's own log: the official
tournament feed returns every match of an event — qualifying included — with
seeds, scores and the winner, which is exactly a results page.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from wtalib import env_int, fetch_event_matches, log, read_json, write_json

SEASONS_BACK = env_int("WTA_EVENT_SEASONS", 2)
WORKERS = env_int("WTA_EVENT_WORKERS", 5)
SEASON = env_int("WTA_SEASON", datetime.now(timezone.utc).year)

# ---------------------------------------------------------------------------
# Round labels
#
# The feed's `RoundID` is a per-event draw index, not a fixed vocabulary: at the
# majors 1/2/3/4 mean R128…R16, while a 28-player WTA 500 uses 1 for its first
# round.  The reliable signal is how many matches a round holds, since a knockout
# round of n matches implies n×2 entrants:
#
#   matches  1   2   4   8   16   32   64
#   round    F  SF  QF  R16 R32  R64  R128
#
# A round code is used to break ties and an explicit letter code wins outright.
# ---------------------------------------------------------------------------

CODE_ROUND = {"F": "F", "S": "SF", "Q": "QF"}
COUNT_ROUND = [
    (1, "F"),
    (2, "SF"),
    (4, "QF"),
    (8, "R16"),
    (16, "R32"),
    (32, "R64"),
    (64, "R128"),
]
ROUND_ORDER = {"R128": 30, "R64": 40, "R32": 50, "R16": 60, "QF": 70, "SF": 80, "F": 90}


def classify_round(code, match_count: int) -> tuple[str, int]:
    c = str(code if code is not None else "").strip().upper()
    if c in CODE_ROUND:
        label = CODE_ROUND[c]
        return label, ROUND_ORDER[label]
    if re.fullmatch(r"R\d+", c):
        return c, ROUND_ORDER.get(c, 35)
    for maximum, label in COUNT_ROUND:
        if match_count <= maximum:
            return label, ROUND_ORDER[label]
    return "R128", ROUND_ORDER["R128"]


# ---------------------------------------------------------------------------
# Match records
# ---------------------------------------------------------------------------


def player_of(match: dict, side: str) -> dict | None:
    pid = match.get(f"PlayerID{side}")
    first = str(match.get(f"PlayerNameFirst{side}") or "").strip()
    last = str(match.get(f"PlayerNameLast{side}") or "").strip()
    if not pid and not last:
        return None
    return {
        "id": int(pid) if pid else None,
        "name": re.sub(r"\s+", " ", f"{first} {last}").strip(),
        "country": match.get(f"PlayerCountry{side}") or "",
        "seed": match.get(f"Seed{side}") or None,
    }


def set_winner(match: dict) -> str:
    """Score-based winner: count the sets won by each side."""
    a_won = b_won = 0
    for i in range(1, 6):
        sa, sb = match.get(f"ScoreSet{i}A"), match.get(f"ScoreSet{i}B")
        if sa in ("", None) or sb in ("", None):
            continue
        try:
            na, nb = int(sa), int(sb)
        except (TypeError, ValueError):
            continue
        if na > nb:
            a_won += 1
        elif nb > na:
            b_won += 1
    if a_won > b_won:
        return "A"
    if b_won > a_won:
        return "B"
    return ""


def normalise_score(match: dict) -> str:
    """
    Render the score set by set, keeping tie-break points, so it matches the
    convention used elsewhere on the site ("6-4 7-6(3)").
    """
    sets: list[str] = []
    for i in range(1, 6):
        sa, sb = match.get(f"ScoreSet{i}A"), match.get(f"ScoreSet{i}B")
        if sa in ("", None) or sb in ("", None):
            continue
        tb = match.get(f"ScoreTbSet{i}")
        # ScoreTbSetN holds the loser's tie-break points, which is what the
        # bracket in "7-6(3)" shows.
        sets.append(f"{sa}-{sb}({tb})" if tb else f"{sa}-{sb}")
    if sets:
        return " ".join(sets)
    return re.sub(r"\s+", " ", str(match.get("ScoreString") or "").replace(",", " ")).strip()


def normalise(match: dict) -> dict | None:
    if match.get("DrawMatchType") != "S":
        return None
    a = player_of(match, "A")
    b = player_of(match, "B")
    if not a or not b:
        return None

    # 1 ⇒ A won, 2 ⇒ B won.  Anything else means the winner is not flagged in the
    # `Winner` column, so it is derived from the set scores — the score string is
    # authoritative either way, and a retirement still yields a winner.
    flag = match.get("Winner")
    try:
        flag = int(flag)
    except (TypeError, ValueError):
        flag = None
    winner_side = "A" if flag == 1 else "B" if flag == 2 else (set_winner(match) or "A")

    result_string = str(match.get("ResultString") or "")
    if re.search(r"RET", result_string, re.I):
        note = "ret."
    elif re.search(r"W/O|WALKOVER", result_string, re.I):
        note = "w/o"
    elif not match.get("ScoreString"):
        note = "w/o"
    else:
        note = ""

    return {
        "round": str(match.get("RoundID") if match.get("RoundID") is not None else "").strip().upper(),
        "qualifying": match.get("DrawLevelType") == "Q",
        "a": a,
        "b": b,
        "score": normalise_score(match),
        "winnerSide": winner_side,
        "note": note,
        "state": match.get("MatchState") or "",
        "date": str(match.get("MatchTimeStamp") or "")[:10],
        "court": ((match.get("Venue") or {}).get("name")) or "",
    }


def _newest_first(matches: list) -> list:
    """
    Newest match first, keeping same-day matches in feed order.

    ``sorted(..., reverse=True)`` would also reverse equal-key items, which flips
    matches played on the same day; sorting ascending then reversing avoids that.
    """
    ordered = sorted(matches, key=lambda m: m["date"])
    ordered.reverse()
    return ordered


def group_by(items: list, key):
    grouped: dict = {}
    for item in items:
        grouped.setdefault(key(item), []).append(item)
    return grouped


def main() -> int:
    tour = read_json("tournaments.json", {"events": []})
    targets = [e for e in tour["events"] if e["year"] >= SEASON - (SEASONS_BACK - 1) and e.get("id")]
    log("events", f"Fetching full draws for {len(targets)} events ({SEASON - SEASONS_BACK + 1}–{SEASON})…")

    out: dict = {}
    failed = 0
    total_matches = 0
    done = 0

    def handle(event: dict) -> None:
        nonlocal total_matches
        res = fetch_event_matches(event["id"], event["year"])
        raw = (res or {}).get("matches")
        if not isinstance(raw, list) or not raw:
            return

        singles = [n for n in (normalise(m) for m in raw) if n]
        main = [m for m in singles if not m["qualifying"]]
        qual = [m for m in singles if m["qualifying"]]

        rounds: list[dict] = []

        for code, matches in group_by(main, lambda m: m["round"]).items():
            label, order = classify_round(code, len(matches))
            rounds.append({"key": f"M|{label}", "label": label, "order": order,
                           "qualifying": False,
                           "matches": _newest_first(matches)})

        # Qualifying carries no round code: the rounds run on consecutive days, so
        # ordering by date reconstructs them (earliest day is the first round).
        qual_days = sorted({m["date"] for m in qual})
        for day, matches in group_by(qual, lambda m: m["date"]).items():
            index = qual_days.index(day) + 1
            rounds.append({"key": f"Q|Q{index}", "label": f"Q{index}", "order": 20 - index,
                           "qualifying": True,
                           "matches": _newest_first(matches)})

        if not rounds:
            return

        # Two rounds can hold the same number of matches when a draw is
        # incomplete; the label is shifted outwards so the printed set is distinct.
        seen_labels: set[str] = set()
        ladder = ["R128", "R64", "R32", "R16", "QF", "SF", "F"]
        for rnd in rounds:
            label = rnd["label"]
            if label in seen_labels:
                index = ladder.index(label) if label in ladder else 0
                while index > 0 and ladder[index] in seen_labels:
                    index -= 1
                label = ladder[index]
                rnd["label"] = label
                rnd["key"] = f"M|{label}"
                rnd["order"] = ROUND_ORDER[label]
            seen_labels.add(label)

        rounds.sort(key=lambda r: (r["qualifying"], -r["order"]))

        count = sum(len(r["matches"]) for r in rounds)
        total_matches += count
        out[f"{event['id']}|{event['year']}"] = {
            "id": event["id"],
            "year": event["year"],
            "name": event["name"],
            "level": event["level"],
            "surface": event["surface"],
            "city": event["city"],
            "country": event["country"],
            "drawSize": event["drawSize"],
            "status": event["status"],
            "rounds": rounds,
        }

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(handle, e): e for e in targets}
        for future in as_completed(futures):
            event = futures[future]
            try:
                future.result()
            except Exception as err:  # noqa: BLE001
                failed += 1
                print(f"  ! {event['name']} {event['year']}: {err}")
            done += 1
            if done % 40 == 0:
                log("events", f"{done}/{len(targets)}…")

    write_json("data/event-matches.json", out)

    sizes = sorted(
        sum(len(r["matches"]) for r in e["rounds"]) for e in out.values()
    )
    median = sizes[len(sizes) // 2] if sizes else 0
    log(
        "events",
        f"Done — {len(out)}/{len(targets)} events, {total_matches} singles matches "
        f"(median {median}/event)" + (f", {failed} failures" if failed else ""),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
