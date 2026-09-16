#!/usr/bin/env python3
"""
Build the data files the dashboard consumes.

Everything is derived from the official WTA snapshots in ``data/`` — no external
calls — so the site is reproducible offline.  Three files are written:

``data/dashboard.js``     the main payload plus a per-event digest
``data/events.js``        complete per-event draws, loaded on demand
``data/h2h.js``           head-to-head summary (counts) for every pairing
``data/h2h-matches.js``   the individual meetings, loaded on demand

They are plain scripts assigning a global so the published site needs no runtime
fetches for content.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from wtalib import ROOT, env_int, log, read_json
from zh_terms import has_cjk

SEASON_FALLBACK = datetime.now(timezone.utc).year
# The feed shows the season's most recent results; older matches stay reachable
# through each player's profile and each event's draw.
RESULT_LIMIT = env_int("WTA_RESULT_LIMIT", 600)
MAX_PAIR_MEETINGS = env_int("WTA_H2H_MAX", 24)


def write_global(rel_path: str, global_name: str, value, *, comment: str) -> int:
    path = ROOT / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    body = f"/* {comment} */\nwindow.{global_name}={json.dumps(value, ensure_ascii=False, separators=(',', ':'))};\n"
    path.write_text(body, encoding="utf-8")
    size = len(body.encode())
    log("gen", f"  ✓ {rel_path} ({size / 1024 / 1024:.1f} MB)")
    return size


def json_size(value) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


def main() -> int:
    log("gen", "Building the dashboard payload…")

    rankings = read_json("rankings-singles.json", {"players": [], "asOf": None, "depth": 0})
    bios = read_json("bios.json", {})
    stats = read_json("season-stats.json", {})
    history = read_json("ranking-history.json", {})
    matches = read_json("matches.json", {})
    tour = read_json("tournaments.json", {"events": []})
    boards_in = read_json("leaderboards.json", {"boards": [], "career": {}, "seasonMap": {}})
    h2h = read_json("h2h.json", {})
    h2h_names = read_json("h2h-names.json", {})
    player_index = read_json("players-index.json", [])
    zh = read_json("zh.json", {"players": {}, "tournaments": {}, "countries": {}})
    event_matches = read_json("event-matches.json", {})

    season = boards_in.get("season") or SEASON_FALLBACK
    rank_by_id = {p["id"]: p for p in rankings["players"]}

    def zh_name(pid) -> str:
        """
        Wikidata occasionally carries a "Chinese" label that is just the Latin
        name.  Such a value is worse than nothing — the UI would print the name
        twice — so anything without a CJK character is treated as missing.
        """
        raw = str((zh.get("players") or {}).get(str(pid), "")).strip()
        return raw if has_cjk(raw) else ""

    def display_name(pid):
        """Resolve a player reference to name, Chinese name, country and rank."""
        cz = zh_name(pid)
        player = rank_by_id.get(pid)
        if player:
            return {"name": player["name"], "zh": cz, "country": player["country"], "rank": player["rank"]}
        bio = bios.get(str(pid))
        if bio:
            return {"name": bio["name"], "zh": cz, "country": bio.get("country"), "rank": None}
        entry = h2h_names.get(str(pid))
        if entry:
            return {"name": entry["n"], "zh": cz, "country": entry["c"], "rank": entry.get("r")}
        return {"name": f"#{pid}", "zh": cz, "country": "", "rank": None}

    # ------------------------------------------------- season W/L from matches
    season_records: dict = {}
    for pid, rows in matches.items():
        bucket_by_year: dict = {}
        for match in rows:
            year = match.get("yr") or int(match["d"][:4])
            bucket = bucket_by_year.setdefault(
                year, {"w": 0, "l": 0, "titles": 0, "finals": 0, "surfaces": {}, "last10": []}
            )
            bucket["w" if match.get("w") else "l"] += 1
            surface = match.get("sfc") or "UNKNOWN"
            bucket["surfaces"].setdefault(surface, {"w": 0, "l": 0})
            bucket["surfaces"][surface]["w" if match.get("w") else "l"] += 1
            if match.get("r") == "F":
                bucket["finals"] += 1
                if match.get("w"):
                    bucket["titles"] += 1
        ordered = sorted(rows, key=lambda m: m["d"], reverse=True)
        for year, bucket in bucket_by_year.items():
            bucket["last10"] = [
                m.get("w") for m in ordered if (m.get("yr") or int(m["d"][:4])) == int(year)
            ][:10]
        season_records[pid] = bucket_by_year

    # ------------------------------------------------------------- champions
    champions = []
    for event in tour["events"]:
        if event.get("status") != "past" or not event.get("champion"):
            continue
        champions.append({
            "event": event["name"],
            "year": event["year"],
            "date": event.get("end") or event.get("start"),
            "level": event.get("level"),
            "surface": event.get("surface"),
            "city": event.get("city"),
            "country": event.get("country"),
            "player": {
                "id": event["champion"]["id"],
                "name": event["champion"]["name"],
                "zh": zh_name(event["champion"]["id"]),
                "country": event["champion"].get("country"),
            },
        })
    champions.sort(key=lambda c: c["date"])
    champions.reverse()

    # --------------------------------------------------------- results feed
    seen_match: set[str] = set()
    results = []
    for owner_key, rows in matches.items():
        owner = int(owner_key)
        for match in rows:
            if match.get("yr") != season:
                continue
            # A handful of feed rows omit the opponent; they cannot be rendered.
            if not match.get("oid") or not match.get("o") or match["oid"] == owner:
                continue
            a, b = (owner, match["oid"]) if owner < match["oid"] else (match["oid"], owner)
            key = f"{match['d']}|{match['t']}|{match['r']}|{a}|{b}"
            if key in seen_match:
                continue
            seen_match.add(key)

            owner_is_p1 = owner == a
            winner_id = owner if match.get("w") else match["oid"]
            results.append({
                "date": match["d"],
                "event": match["t"],
                "round": match["r"],
                "surface": match["sfc"],
                "level": match["lvl"],
                "score": match["sc"],
                "winnerId": winner_id,
                "loserId": match["oid"] if winner_id == owner else owner,
                "player1": owner if owner_is_p1 else match["oid"],
                "player2": match["oid"] if owner_is_p1 else owner,
                "rank1": (match.get("rank") if owner_is_p1 else match.get("orank")),
                "rank2": (match.get("orank") if owner_is_p1 else match.get("rank")),
            })
    results.sort(key=lambda r: r["date"])
    results.reverse()
    recent = results[:RESULT_LIMIT]

    # ---------------------------------------------------------- event results
    event_results: dict = {}
    for key, event in event_matches.items():
        rounds = []
        for rnd in event["rounds"]:
            round_matches = []
            for match in rnd["matches"]:
                a = dict(match["a"], zh=zh_name(match["a"]["id"]))
                b = dict(match["b"], zh=zh_name(match["b"]["id"]))
                round_matches.append({
                    "round": rnd["label"],
                    "qualifying": rnd["qualifying"],
                    "score": match["score"],
                    "note": match["note"],
                    "date": match["date"],
                    "court": match["court"],
                    "a": a,
                    "b": b,
                    "winner": "a" if match["winnerSide"] == "A" else "b",
                })
            rounds.append({
                "key": rnd["key"],
                "label": rnd["label"],
                "qualifying": rnd["qualifying"],
                "matches": round_matches,
            })
        event_results[key] = {
            "id": event["id"],
            "year": event["year"],
            "name": event["name"],
            "zh": (zh.get("tournaments") or {}).get(event["name"], ""),
            "level": event["level"],
            "surface": event["surface"],
            "city": event["city"],
            "country": event["country"],
            "drawSize": event["drawSize"],
            "rounds": rounds,
        }

    # A compact per-event digest stays in the main payload so the calendar can
    # show the final, the champion and the match count immediately.
    event_digest: dict = {}
    for key, event in event_results.items():
        all_matches = [m for r in event["rounds"] for m in r["matches"]]
        final = next((r for r in event["rounds"] if r["label"] == "F"), None)
        fm = final["matches"][0] if final and final["matches"] else None
        event_digest[key] = {
            "id": event["id"],
            "year": event["year"],
            "rounds": len(event["rounds"]),
            "matches": len(all_matches),
            "final": (
                {
                    "a": {"id": fm["a"]["id"], "name": fm["a"]["name"], "zh": fm["a"]["zh"]},
                    "b": {"id": fm["b"]["id"], "name": fm["b"]["name"], "zh": fm["b"]["zh"]},
                    "score": fm["score"],
                    "winner": fm["winner"],
                }
                if fm
                else None
            ),
        }

    # ------------------------------------------------------------- calendar
    calendar = []
    for event in tour["events"]:
        if event["year"] < season - 1:
            continue
        champion = event.get("champion")
        calendar.append({
            "id": event["id"],
            "name": event["name"],
            "zh": (zh.get("tournaments") or {}).get(event["name"], ""),
            "year": event["year"],
            "level": event["level"],
            "start": event["start"],
            "end": event["end"],
            "surface": event["surface"],
            "indoor": event["indoor"],
            "city": event["city"],
            "country": event["country"],
            "draw": event["drawSize"],
            "prize": event["prize"],
            "currency": event["currency"],
            "status": event["status"],
            "champion": (
                dict(champion, zh=zh_name(champion["id"])) if champion else None
            ),
        })
    # Ascending then reversed, so events sharing a start date keep feed order.
    calendar.sort(key=lambda e: e["start"])
    calendar.reverse()

    # ------------------------------------------------------- head-to-head
    h2h_roster: dict = {}

    def roster(pid: int) -> dict:
        if str(pid) not in h2h_roster:
            info = display_name(pid)
            h2h_roster[str(pid)] = {
                "id": pid,
                "name": info["name"],
                "zh": info["zh"],
                "country": info["country"],
                "rank": info["rank"],
            }
        return h2h_roster[str(pid)]

    # Seeded from the ranking table so every ranked player — the top 100 in
    # particular — is selectable even with no stored meeting; `roster()` then adds
    # anyone else who only appears in older results.
    for player in rankings["players"]:
        roster(player["id"])

    h2h_pairs: dict = {}
    h2h_meetings: dict = {}
    for key, value in h2h.items():
        a_str, b_str = key.split("-")
        roster(int(a_str))
        roster(int(b_str))

        # A meeting appears in both players' logs: de-duplicate per pair.
        seen: set[str] = set()
        meetings = []
        for meeting in value["meetings"]:
            dedup = f"{meeting['d']}|{meeting['t']}|{meeting['r']}|{meeting['sc']}"
            if dedup in seen:
                continue
            seen.add(dedup)
            if len(meetings) >= MAX_PAIR_MEETINGS:
                break
            meetings.append([
                meeting["d"], meeting["t"], meeting["lvl"], meeting["sfc"],
                meeting["r"], meeting["sc"], meeting["w"],
            ])
        h2h_pairs[key] = {"aw": value["aWins"], "bw": value["bWins"],
                          "n": value.get("n", len(value["meetings"]))}
        if meetings:
            h2h_meetings[key] = meetings

    # --------------------------------------------------------------- counts
    season_events = [e for e in calendar if e["year"] == season]
    past_events = [e for e in season_events if e["status"] == "past"]
    upcoming_events = [e for e in season_events if e["status"] != "past"]

    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "season": season,
        "rankingsAsOf": rankings.get("asOf"),
        "source": "WTA official public data API",
        "sourceUrl": "https://www.wtatennis.com/",
        "depth": rankings.get("depth"),
        "counts": {
            "rankedPlayers": len(rankings["players"]),
            "playersWithMatches": len(matches),
            "events": len(season_events),
            "completedEvents": len(past_events),
            "upcomingEvents": len(upcoming_events),
            "seasonMatches": len(results),
            "champions": sum(1 for c in champions if c["year"] == season),
            "h2hPairings": len(h2h_pairs),
            "calendarEvents": len(calendar),
            "eventResults": len(event_results),
        },
        "zh": {
            "countries": zh.get("countries") or {},
            "levels": zh.get("levels") or {},
            "rounds": zh.get("rounds") or {},
            "surfaces": zh.get("surfaces") or {},
        },
    }

    # --------------------------------------------------------------- write
    def with_zh(rows):
        return [dict(r, zh=zh_name(r["id"])) for r in (rows or [])]

    players_out = []
    for player in rankings["players"]:
        pid = player["id"]
        bio = bios.get(str(pid)) or {}
        stat = stats.get(str(pid)) or {}
        rec = (season_records.get(str(pid)) or {}).get(season)
        tail = (history.get(str(pid)) or [])[-6:]
        players_out.append({
            "id": pid,
            "name": player["name"],
            "zh": zh_name(pid),
            "country": player["country"],
            "rank": player["rank"],
            "points": player["points"],
            "move": player["move"],
            "played": player["played"],
            "birth": player["birth"],
            "age": bio.get("age"),
            "height": bio.get("height") or "",
            "hand": bio.get("hand") or "",
            "highRank": bio.get("sglHighRank"),
            "titles": bio.get("sglCareerTitles"),
            "careerWon": bio.get("sglCareerWon"),
            "careerLost": bio.get("sglCareerLost"),
            "careerPrize": bio.get("careerPrize"),
            "ytdPrize": bio.get("ytdPrize"),
            "season": (
                {"w": rec["w"], "l": rec["l"], "titles": rec["titles"],
                 "finals": rec["finals"], "last10": rec["last10"], "surfaces": rec["surfaces"]}
                if rec else None
            ),
            "serve": {
                "aces": stat.get("aces"),
                "doubleFaults": stat.get("doubleFaults"),
                "firstServePct": stat.get("firstServePct"),
                "firstServeWonPct": stat.get("firstServeWonPct"),
                "secondServeWonPct": stat.get("secondServeWonPct"),
                "serviceGamesWonPct": stat.get("serviceGamesWonPct"),
                "returnGamesWonPct": stat.get("returnGamesWonPct"),
                "breakPointsSavedPct": stat.get("breakPointsSavedPct"),
                "breakPointsConvertedPct": stat.get("breakPointsConvertedPct"),
                "totalPointsWonPct": stat.get("totalPointsWonPct"),
            },
            "photo": (bio.get("photo") or "").strip(),
            "historyTail": [[r[0], r[1]] for r in tail],
        })

    payload = {
        "meta": meta,
        "players": players_out,
        "results": [
            dict(r,
                 winner=dict({"id": r["winnerId"]}, **display_name(r["winnerId"])),
                 loser=dict({"id": r["loserId"]}, **display_name(r["loserId"])))
            for r in recent
        ],
        "champions": champions,
        "calendar": calendar,
        "eventDigest": event_digest,
        "boards": [dict(b, rows=with_zh(b["rows"])) for b in boards_in["boards"]],
        "career": {
            "titles": with_zh(boards_in["career"].get("titles")),
            "careerWins": with_zh(boards_in["career"].get("careerWins")),
            "prizeMoney": with_zh(boards_in["career"].get("prizeMoney")),
        },
        "seasonRecords": season_records,
        "tournamentZh": zh.get("tournaments") or {},
        "playerIndex": player_index,
    }

    stamp = meta["generatedAt"]
    main_size = write_global("data/dashboard.js", "WTA_DATA", payload,
                             comment=f"WTA Tour dashboard data — generated {stamp}")
    events_size = write_global("data/events.js", "WTA_EVENTS", event_results,
                               comment=f"Per-event results — generated {stamp}")
    h2h_size = write_global("data/h2h.js", "WTA_H2H", {"players": h2h_roster, "pairs": h2h_pairs},
                            comment=f"Head-to-head summary — generated {stamp}")
    h2h_matches_size = write_global("data/h2h-matches.js", "WTA_H2H_MATCHES", h2h_meetings,
                                    comment=f"Head-to-head meetings — generated {stamp}")

    log("gen", f"Done — {len(players_out)} players, {len(recent)} season matches, "
               f"{len(calendar)} calendar events, {meta['counts']['champions']} champions")
    log("gen", f"  {len(event_results)} events with results "
               f"({sum(d['matches'] for d in event_digest.values())} matches) · "
               f"{len(h2h_pairs)} H2H pairings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
