#!/usr/bin/env python3
"""
Verify the generated data payload.

Assertions run over the generated scripts so a broken build cannot be published.
This is the Python replacement for the previous Node verifier and keeps the same
coverage.

    python3 pyscripts/verify_dashboard.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from wtalib import DATA_DIR

PASSED = 0
FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED
    if ok:
        PASSED += 1
        print(f"  ✓ {name}")
    else:
        FAILURES.append(f"{name}{f' — {detail}' if detail else ''}")
        print(f"  ✗ {name}{f' — {detail}' if detail else ''}")


def load_global(name: str, global_name: str):
    path = DATA_DIR / name
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"window\.{global_name}=(.*);\s*$", text, re.S)
    if not match:
        raise SystemExit(f"cannot parse {path}")
    return json.loads(match.group(1))


def main() -> int:
    print("\n▶ Verifying the dashboard payload\n")

    d = load_global("dashboard.js", "WTA_DATA")
    events = load_global("events.js", "WTA_EVENTS")
    h2h = load_global("h2h.js", "WTA_H2H")
    h2h_matches = load_global("h2h-matches.js", "WTA_H2H_MATCHES")

    meta = d["meta"]
    season = meta["season"]
    players = d["players"]

    # ---------------------------------------------------------------- meta
    check("meta carries a season", isinstance(season, int), str(season))
    check("meta carries a rankings week", bool(re.match(r"^\d{4}-\d{2}-\d{2}", meta.get("rankingsAsOf") or "")))
    check("meta records the official source", "wtatennis" in (meta.get("sourceUrl") or ""))

    # ------------------------------------------------------------- players
    check("player roster is populated", len(players) >= 250, str(len(players)))
    check("players are ranked 1..N", all(p["rank"] == i + 1 for i, p in enumerate(players)))
    check("every player has a Chinese name", all(p.get("zh", "").strip() for p in players),
          f"{sum(1 for p in players if not p.get('zh'))} missing")
    check("every player has a country", all(re.match(r"^[A-Z]{3}$", p.get("country") or "") for p in players))
    check("points decrease with rank", all(players[i - 1]["points"] >= p["points"] for i, p in enumerate(players) if i))
    with_season = sum(1 for p in players if p.get("season"))
    check("season records cover the roster", with_season >= len(players) * 0.95, f"{with_season}/{len(players)}")
    check("form strips contain only 0/1",
          all(all(x in (0, 1) for x in (p["season"].get("last10") or [])) for p in players if p.get("season")))
    check("serve percentages are within 0..100",
          all(all(v is None or 0 <= v <= 100 for k, v in p["serve"].items() if k.endswith("Pct"))
              for p in players))

    # ------------------------------------------------------------- results
    results = d["results"]
    check("results feed is populated", len(results) >= 200, str(len(results)))
    check("every result has a winner, a loser and a score",
          all(r["winner"].get("id") and r["loser"].get("id") and r["winner"]["id"] != r["loser"]["id"]
              and re.search(r"\d", r.get("score") or "") for r in results))
    check("results are newest-first", all(results[i - 1]["date"] >= r["date"] for i, r in enumerate(results) if i))
    check("results resolve every player to a name",
          all(not re.match(r"^#\d+$", r["winner"]["name"]) for r in results))

    # ----------------------------------------------------------- champions
    champions = d["champions"]
    check("champion list is populated", len(champions) >= 20, str(len(champions)))
    check("champions carry event, date and player",
          all(c.get("event") and c.get("date") and c["player"].get("id") for c in champions))
    check("current season has champions", sum(1 for c in champions if c["year"] == season) >= 10)

    # ------------------------------------------------------------ calendar
    calendar = d["calendar"]
    check("calendar covers two seasons", len({e["year"] for e in calendar}) >= 2)
    check("calendar rows have date, level and surface",
          all(re.match(r"^\d{4}-\d{2}-\d{2}$", e["start"]) and e["level"] and e["surface"] for e in calendar))
    check("every calendar event has a Chinese name", all(e.get("zh", "").strip() for e in calendar),
          f"{sum(1 for e in calendar if not e.get('zh'))} without zh")

    # -------------------------------------------------------- leaderboards
    boards = d["boards"]
    check("twelve statistic boards", len(boards) == 12, str(len(boards)))
    check("every board has rows", all(len(b["rows"]) >= 10 for b in boards))
    check("boards are sorted by value",
          all(all(b["rows"][i - 1]["value"] >= r["value"] for i, r in enumerate(b["rows"]) if i) for b in boards))
    check("career leaders present",
          all(len(d["career"].get(k, [])) >= 5 for k in ("titles", "careerWins", "prizeMoney")))

    # ------------------------------------------------------------------ zh
    zh = meta["zh"]
    check("Chinese terminology present", all(zh.get(k) for k in ("countries", "levels", "rounds", "surfaces")))
    codes = {p["country"] for p in players}
    check("every player country has a Chinese name", all(c in zh["countries"] for c in codes),
          ",".join(sorted(c for c in codes if c not in zh["countries"])))

    # ------------------------------------------------------- event results
    keys = list(events)
    check("event results are populated", len(keys) >= 100, str(len(keys)))
    cal_keys = {f'{e["id"]}|{e["year"]}' for e in calendar}
    check("every event result maps to a calendar event", all(k in cal_keys for k in keys),
          ",".join(k for k in keys if k not in cal_keys))
    rounds = [r for k in keys for r in events[k]["rounds"]]
    matches = [m for r in rounds for m in r["matches"]]
    check("event matches total is substantial", len(matches) >= 5000, str(len(matches)))
    check("every match names both players and a winner side",
          all(m["a"]["name"] and m["b"]["name"] and m["winner"] in ("a", "b") for m in matches))
    check("no match lists the same player twice", all(m["a"]["id"] != m["b"]["id"] for m in matches))
    check("every match carries a score or a walkover note",
          all(re.search(r"\d", m.get("score") or "") or m.get("note") for m in matches))
    check("no event has more than one final round",
          all(sum(1 for r in events[k]["rounds"] if r["label"] == "F") <= 1 for k in keys))
    finals = [r for r in rounds if r["label"] == "F"]
    check("finals hold exactly one match", all(len(r["matches"]) == 1 for r in finals))
    check("most completed events have a final",
          sum(1 for k in keys if any(r["label"] == "F" for r in events[k]["rounds"])) >= len(keys) * 0.8)
    mismatched = [k for k in keys
                  if d["eventDigest"].get(k, {}).get("matches")
                  != sum(len(r["matches"]) for r in events[k]["rounds"])]
    check("calendar digest matches the full draw", not mismatched, ",".join(mismatched[:3]))

    # ---------------------------------------------------------------- h2h
    pairs = h2h["pairs"]
    check("head-to-head index populated", len(pairs) >= 1000, str(len(pairs)))
    check("pair keys are ordered a<b",
          all(int(k.split("-")[0]) < int(k.split("-")[1]) for k in pairs))
    check("win totals match the recorded meeting count",
          all(v["aw"] + v["bw"] == v["n"] and v["n"] > 0 for v in pairs.values()))
    check("meeting detail matches the summary counts",
          all(0 < len(v) <= pairs[k]["n"] for k, v in h2h_matches.items()))
    check("every pair member resolves to a named player",
          all(h2h["players"].get(k.split("-")[0], {}).get("name")
              and h2h["players"].get(k.split("-")[1], {}).get("name") for k in pairs))
    check("meetings carry date, event and winner",
          all(all(re.match(r"^\d{4}-\d{2}-\d{2}$", m[0]) and m[1] and m[6] for m in v)
              for v in h2h_matches.values()))
    top100 = players[:100]
    check("head-to-head roster covers the top 100",
          all(str(p["id"]) in h2h["players"] for p in top100),
          ",".join(p["name"] for p in top100 if str(p["id"]) not in h2h["players"]) or "complete")
    check("head-to-head roster covers the whole ranking table",
          all(str(p["id"]) in h2h["players"] for p in players),
          f"{sum(1 for p in players if str(p['id']) not in h2h['players'])} missing")

    sabalenka = next((p for p in players if "Sabalenka" in p["name"]), None)
    gauff = next((p for p in players if p["name"] == "Coco Gauff"), None)
    if sabalenka and gauff:
        key = f"{min(sabalenka['id'], gauff['id'])}-{max(sabalenka['id'], gauff['id'])}"
        record = pairs.get(key)
        check("known rivalry resolves", bool(record),
              f"{record['aw']}-{record['bw']} over {record['n']}" if record else "missing")

    # -------------------------------------------------------------- output
    print("\n" + "─" * 60)
    if FAILURES:
        print(f"✗ {len(FAILURES)} check(s) failed, {PASSED} passed:")
        for line in FAILURES:
            print(f"   • {line}")
        return 1
    print(f"✓ All {PASSED} checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
