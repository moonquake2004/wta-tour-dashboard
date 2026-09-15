#!/usr/bin/env python3
"""
Fold every match log into a pairwise head-to-head index.

The official WTA API rejects cross-origin browser requests (it answers 403 to any
`Origin` that is not wtatennis.com), so the comparison view cannot call it live.
The match logs are folded into one index at build time instead, which also makes
the comparison instant.

Meetings kept per pairing are capped so one long rivalry cannot bloat the
payload; the win counts are authoritative and never truncated.
"""

from __future__ import annotations

from wtalib import env_int, log, read_json, write_json

MAX_MEETINGS = env_int("WTA_H2H_MAX", 24)


def pair_key(a: int, b: int) -> str:
    """Smaller id first, so both directions land in one bucket."""
    return f"{a}-{b}" if a < b else f"{b}-{a}"


def main() -> int:
    matches = read_json("matches.json", {})
    rankings = read_json("rankings-singles.json", {"players": []})
    bios = read_json("bios.json", {})

    log("h2h", "Folding match logs into a pairwise head-to-head index…")

    names: dict = {}
    for player in rankings["players"]:
        names[str(player["id"])] = {
            "n": player["name"],
            "c": player["country"] or "",
            "r": player["rank"],
        }
    for pid, bio in bios.items():
        if pid not in names:
            names[pid] = {"n": bio.get("name", ""), "c": bio.get("country", ""), "r": None}

    pairs: dict = {}
    meetings = 0

    for owner_key, rows in matches.items():
        owner = int(owner_key)
        for match in rows:
            opponent = match.get("oid")
            if not opponent or opponent == owner:
                continue
            opponent = int(opponent)
            key = pair_key(owner, opponent)
            bucket = pairs.get(key)
            if bucket is None:
                bucket = {"a": min(owner, opponent), "b": max(owner, opponent),
                          "aWins": 0, "bWins": 0, "meetings": []}
                pairs[key] = bucket

            winner = owner if match.get("w") else opponent
            if winner == bucket["a"]:
                bucket["aWins"] += 1
            else:
                bucket["bWins"] += 1

            bucket["meetings"].append({
                "d": match["d"],
                "t": match["t"],
                "lvl": match["lvl"],
                "sfc": match["sfc"],
                "r": match["r"],
                "sc": match["sc"],
                "w": winner,
                "lo": opponent if winner == owner else owner,
            })
            meetings += 1

            oid = str(opponent)
            if oid not in names:
                names[oid] = {"n": match.get("o") or "Unknown", "c": match.get("oc") or "", "r": None}

    out: dict = {}
    for key, bucket in pairs.items():
        bucket["meetings"].sort(key=lambda m: m["d"], reverse=True)
        bucket["n"] = len(bucket["meetings"])
        if len(bucket["meetings"]) > MAX_MEETINGS:
            bucket["meetings"] = bucket["meetings"][:MAX_MEETINGS]
        out[key] = bucket

    write_json("data/h2h.json", out)
    write_json("data/h2h-names.json", names)

    log(
        "h2h",
        f"Done — {len(out)} pairings, {meetings} meetings, {len(names)} named players.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
