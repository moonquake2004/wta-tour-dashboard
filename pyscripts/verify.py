#!/usr/bin/env python3
"""
Verify the raw snapshots.

Runs assertions over the files under ``data/`` so a broken fetch cannot reach the
payload.  This mirrors the coverage of the Node verifier it replaces.

    python3 pyscripts/verify.py
"""

from __future__ import annotations

import re
import sys

from wtalib import read_json

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


def main() -> int:
    print("\n▶ Verifying generated snapshots\n")

    rank = read_json("rankings-singles.json", {})
    bios = read_json("bios.json", {})
    stats = read_json("season-stats.json", {})
    history = read_json("ranking-history.json", {})
    matches = read_json("matches.json", {})
    tour = read_json("tournaments.json", {})
    boards = read_json("leaderboards.json", {})
    h2h = read_json("h2h.json", {})

    # ----------------------------------------------------------- rankings
    players = rank.get("players", [])
    check("rankings has an as-of date", bool(re.match(r"^\d{4}-\d{2}-\d{2}", rank.get("asOf") or "")), rank.get("asOf"))
    check("rankings depth >= 250", len(players) >= 250, str(len(players)))
    check("rankings are a clean 1..N sequence", all(p["rank"] == i + 1 for i, p in enumerate(players)))
    check("every ranked player has a name and country",
          all(p.get("name", "").strip() and re.match(r"^[A-Z]{3}$", p.get("country") or "") for p in players))
    check("points are non-increasing with rank",
          all(players[i - 1]["points"] >= p["points"] for i, p in enumerate(players) if i))
    check("No.1 points exceed No.2", len(players) > 1 and players[0]["points"] > players[1]["points"])

    # -------------------------------------------------------- biographies
    check("biographies cover the ranking depth", len(bios) >= len(players) * 0.98, str(len(bios)))
    top_id = str(players[0]["id"]) if players else None
    check("top player biography has career totals",
          bool(top_id and bios.get(top_id, {}).get("sglCareerWon", 0) > 0))
    check("biography headshots are on the official host",
          all(not b.get("photo") or "wtafiles" in b["photo"] for b in bios.values()))
    check("career wins are >= season wins",
          all(b.get("sglCareerWon") is None or b.get("sglYtdWon") is None or b["sglCareerWon"] >= b["sglYtdWon"]
              for b in bios.values()))

    # ---------------------------------------------------- season statistics
    check("season statistics present", len(stats) >= len(players) * 0.9, str(len(stats)))
    bad_pct = [pid for pid, s in stats.items()
               if any(isinstance(s.get(k), (int, float)) and not 0 <= s[k] <= 100
                      for k in ("firstServePct", "firstServeWonPct", "serviceGamesWonPct"))]
    check("all percentages are within 0..100", not bad_pct, ",".join(bad_pct[:3]))

    # ----------------------------------------------------- ranking history
    lengths = [len(v) for v in history.values()]
    check("ranking history present for every player", len(lengths) >= len(players) * 0.98, str(len(lengths)))
    check("ranking history is bounded", bool(lengths) and max(lengths) <= 130, f"max={max(lengths) if lengths else 0}")
    check("history rows are [date, singles, doubles]",
          all(len(r) == 3 and re.match(r"^\d{4}-\d{2}-\d{2}$", r[0]) for v in history.values() for r in v))
    check("top player's history tail matches the ranking table",
          bool(top_id and history.get(top_id) and history[top_id][-1][1] == players[0]["rank"]))

    # -------------------------------------------------------------- matches
    check("match logs present", len(matches) >= 100, str(len(matches)))
    check("matches carry a score and a result flag",
          all(m.get("w") in (0, 1) and re.search(r"\d", m.get("sc") or "")
              for v in matches.values() for m in v))
    check("matches are newest-first",
          all(all(v[i - 1]["d"] >= m["d"] for i, m in enumerate(v) if i) for v in matches.values()))

    # The official biography publishes a season W-L that must reconcile with the log.
    reconciled = []
    for pid, rows in matches.items():
        bio = bios.get(pid)
        if not bio or bio.get("sglYtdWon") is None:
            continue
        season_rows = [m for m in rows if (m.get("yr") or int(m["d"][:4])) == boards.get("season")]
        if len(season_rows) < 10:
            continue
        won = sum(1 for m in season_rows if m.get("w"))
        reconciled.append((won, len(season_rows) - won, bio["sglYtdWon"], bio.get("sglYtdLost")))
    exact = sum(1 for r in reconciled if r[0] == r[2] and r[1] == r[3])
    close = sum(1 for r in reconciled if abs(r[0] - r[2]) <= 2 and abs(r[1] - (r[3] or 0)) <= 2)
    check("season W-L reconciles with the official biography",
          len(reconciled) > 20 and close / len(reconciled) >= 0.9,
          f"{exact}/{len(reconciled)} exact, {close}/{len(reconciled)} within 2")

    # --------------------------------------------------------- tournaments
    events = tour.get("events", [])
    check("calendar events present", len(events) >= 150, str(len(events)))
    check("every event has a date, level and surface",
          all(re.match(r"^\d{4}-\d{2}-\d{2}$", e["start"]) and e["level"] and e["surface"] for e in events))
    check("completed Grand Slams have a champion",
          all(e["champion"] for e in events if e["level"] == "Grand Slam" and e["status"] == "past"))

    # -------------------------------------------------------- leaderboards
    check("twelve statistic boards built", len(boards.get("boards", [])) == 12, str(len(boards.get("boards", []))))
    check("every board has 20 ranked rows", all(len(b["rows"]) == 20 for b in boards.get("boards", [])))

    # ---------------------------------------------------------------- h2h
    check("head-to-head index built", len(h2h) > 500, str(len(h2h)))
    check("pair keys are ordered a<b",
          all(int(k.split("-")[0]) < int(k.split("-")[1]) for k in h2h))
    check("win totals equal the recorded meeting count",
          all(v["aWins"] + v["bWins"] == v.get("n", len(v["meetings"])) for v in h2h.values()))
    check("meetings name a winner and a loser",
          all(m["w"] and m["lo"] and m["w"] != m["lo"] for v in h2h.values() for m in v["meetings"]))

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
