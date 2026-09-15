#!/usr/bin/env python3
"""
Build the Chinese localisation snapshot.

Sources
  • Player names  — Wikidata (WTA player id = P597), normalised to Simplified
                    Chinese via the MediaWiki variant converter.
  • Tournaments   — curated dictionary for the calendar, plus Wikidata for
                    anything the dictionary misses.
  • Countries, rounds, surfaces, levels — curated terminology.

Produces `data/zh.json`, which the site generator merges with the English
snapshots so every player, event, surface and round can be shown bilingually.
"""

from __future__ import annotations

from datetime import datetime, timezone

from wtalib import log, read_json, write_json
from zh_terms import (
    COUNTRY_ZH,
    LEVEL_ZH,
    PLAYER_ZH,
    ROUND_ZH,
    SURFACE_ZH,
    VARIANT_CACHE,
    has_cjk,
    player_zh_fallback,
    sparql,
    to_simplified,
    tournament_zh,
)


def collect_wanted(rankings, bios, matches, tournaments, h2h_names) -> dict:
    """Every player id that needs a Chinese name, mapped to its English name."""
    wanted: dict[str, str] = {}
    for player in rankings.get("players", []):
        wanted[str(player["id"])] = player["name"]
    for pid, bio in bios.items():
        wanted.setdefault(str(pid), bio.get("name", ""))
    for pid, entry in h2h_names.items():
        wanted.setdefault(str(pid), entry.get("n", ""))
    for rows in matches.values():
        for match in rows:
            if match.get("oid") and match.get("o"):
                wanted.setdefault(str(match["oid"]), match["o"])
    for event in tournaments.get("events", []):
        champion = event.get("champion")
        if champion and champion.get("id"):
            wanted.setdefault(str(champion["id"]), champion.get("name", ""))
        for pair in event.get("doublesChampions") or []:
            if pair.get("id"):
                wanted.setdefault(str(pair["id"]), pair.get("name", ""))
    return wanted


def fetch_wikidata_players() -> dict:
    """WTA-id-indexed Chinese labels from Wikidata."""
    query = """SELECT ?wtaId ?zh ?zhHans ?zhCn ?zhSg ?en WHERE {
      ?p wdt:P597 ?wtaId .
      OPTIONAL { ?p rdfs:label ?zh . FILTER(lang(?zh)="zh") }
      OPTIONAL { ?p rdfs:label ?zhHans . FILTER(lang(?zhHans)="zh-hans") }
      OPTIONAL { ?p rdfs:label ?zhCn . FILTER(lang(?zhCn)="zh-cn") }
      OPTIONAL { ?p rdfs:label ?zhSg . FILTER(lang(?zhSg)="zh-sg") }
      OPTIONAL { ?p rdfs:label ?en . FILTER(lang(?en)="en") }
    }"""
    by_id: dict[str, dict] = {}
    for row in sparql(query):
        wta_id = (row.get("wtaId") or {}).get("value")
        if not wta_id:
            continue
        label = (
            (row.get("zhHans") or {}).get("value")
            or (row.get("zhCn") or {}).get("value")
            or (row.get("zhSg") or {}).get("value")
            or (row.get("zh") or {}).get("value")
            or ""
        )
        existing = by_id.get(wta_id)
        if not existing or (not existing["zh"] and label):
            by_id[wta_id] = {"zh": label, "en": (row.get("en") or {}).get("value", "")}
    return by_id


def fetch_wikidata_tournaments(names: list[str]) -> dict:
    """Chinese labels for tournament names, queried in chunks."""
    out: dict[str, str] = {}
    chunk_size = 160
    for start in range(0, len(names), chunk_size):
        chunk = names[start:start + chunk_size]
        values = " ".join('"' + n.replace('"', "").replace("\\", "") + '"@en' for n in chunk)
        query = f"""SELECT ?name ?labelZh WHERE {{
          VALUES ?name {{ {values} }}
          ?item rdfs:label ?name .
          ?item rdfs:label ?labelZh . FILTER(lang(?labelZh)="zh")
        }}"""
        try:
            for row in sparql(query):
                name = (row.get("name") or {}).get("value")
                label = (row.get("labelZh") or {}).get("value")
                if name and label:
                    out.setdefault(name, label)
        except RuntimeError as err:
            log("zh", f"  ! tournament label batch failed: {err}")
    return out


def main() -> int:
    log("zh", "Building Chinese localisation snapshot…")

    rankings = read_json("rankings-singles.json", {"players": []})
    bios = read_json("bios.json", {})
    matches = read_json("matches.json", {})
    tournaments = read_json("tournaments.json", {"events": []})
    h2h_names = read_json("h2h-names.json", {})

    wanted = collect_wanted(rankings, bios, matches, tournaments, h2h_names)
    log("zh", f"  {len(wanted)} distinct players across rankings, biographies, match logs and champions")

    log("zh", "  Querying Wikidata for WTA ids and Chinese labels…")
    by_wta_id = {}
    try:
        by_wta_id = fetch_wikidata_players()
    except RuntimeError as err:
        log("zh", f"  ! Wikidata query failed: {err}")
    log("zh", f"  Wikidata returned {len(by_wta_id)} WTA-indexed players")

    # ---------------------------------------------------------------- names
    raw_zh: list[str] = []
    player_zh: dict[str, str] = {}
    for pid, name in wanted.items():
        entry = by_wta_id.get(pid)
        if entry and entry.get("zh"):
            raw_zh.append(entry["zh"])
            player_zh[pid] = entry["zh"]

    # ---------------------------------------------------------- tournaments
    tournament_map: dict[str, str] = {}
    unmatched_events: set[str] = set()
    for event in tournaments.get("events", []):
        curated = tournament_zh(event.get("name"), event.get("city"))
        if curated:
            tournament_map[event["name"]] = curated
        elif event.get("title"):
            unmatched_events.add(event["name"])

    match_events: set[str] = set()
    for rows in matches.values():
        for match in rows:
            if match.get("t") and match["t"] not in tournament_map:
                match_events.add(match["t"])

    log(
        "zh",
        f"  Translating {len(unmatched_events)} calendar events and {len(match_events)} match-log events…",
    )

    try:
        wd_tournaments = fetch_wikidata_tournaments(sorted(unmatched_events | match_events))
        log("zh", f"  Wikidata resolved {len(wd_tournaments)} tournament labels")
        for name, label in wd_tournaments.items():
            raw_zh.append(label)
            tournament_map[name] = label
    except RuntimeError as err:
        log("zh", f"  ! tournament lookup skipped: {err}")

    # ------------------------------------------------- simplified conversion
    unique_zh = list(dict.fromkeys(raw_zh))
    log("zh", f"  Converting {len(unique_zh)} names to Simplified Chinese…")
    converted = to_simplified(unique_zh, cache_file=VARIANT_CACHE)

    def to_hans(value: str) -> str:
        return converted.get(value, value) if value else value

    player_final: dict[str, str] = {}
    latin_only = 0
    for pid, value in player_zh.items():
        hans = to_hans(value)
        # Wikidata sometimes carries a "Chinese" label that is simply the Latin
        # name; treating that as a translation would print the name twice.
        if not has_cjk(hans):
            latin_only += 1
            continue
        player_final[pid] = hans

    tournament_final = {name: to_hans(value) for name, value in tournament_map.items()}

    # ------------------------------------------------- curated transliterations
    curated = 0
    for pid, name in wanted.items():
        if pid in player_final:
            continue
        fallback = player_zh_fallback(name)
        if fallback:
            player_final[pid] = fallback
            curated += 1

    if latin_only:
        log("zh", f'  discarded {latin_only} Latin-only "Chinese" label(s) from Wikidata')

    # ------------------------------------------------------ city-name fallback
    fallback_count = 0
    for name in unmatched_events | match_events:
        if tournament_final.get(name):
            continue
        fallback = tournament_zh(name, "")
        tournament_final[name] = fallback or ""
        if fallback:
            fallback_count += 1

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "sources": {
            "playerNames": "Wikidata (property P597 — WTA player id)",
            "simplified": "MediaWiki zh-hans variant conversion",
            "terminology": "Curated tennis terminology",
        },
        "players": player_final,
        "tournaments": tournament_final,
        "countries": COUNTRY_ZH,
        "levels": LEVEL_ZH,
        "rounds": ROUND_ZH,
        "surfaces": SURFACE_ZH,
    }
    write_json("data/zh.json", payload)

    events = sum(1 for v in tournament_final.values() if v)
    log(
        "zh",
        f"Done — {len(player_final)} player names ({curated} via curated transliteration), "
        f"{events} tournament names ({fallback_count} via city fallback), "
        f"{len(COUNTRY_ZH)} country names.",
    )

    covered = sum(1 for p in rankings["players"] if str(p["id"]) in player_final)
    log("zh", f"Ranking coverage: {covered}/{len(rankings['players'])} players have a Chinese name.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
