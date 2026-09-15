#!/usr/bin/env python3
"""
Compact the raw snapshots in place.

Ranking history from the API goes back decades for veterans, which bloats the
static payload without adding insight.  A five-year window is kept and sampled
evenly so every player yields a readable, bounded sparkline.  Match logs are
trimmed to the most recent seasons for the same reason; the full record is one
API call away.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone

from wtalib import DATA_DIR, env_int, log, read_json, write_json

HISTORY_WINDOW = env_int("WTA_HISTORY_WEEKS", 261)  # ~5 years
HISTORY_POINTS = env_int("WTA_HISTORY_POINTS", 110)
MATCH_YEARS = env_int("WTA_MATCH_YEARS", 4)
SEASON = env_int("WTA_SEASON", datetime.now(timezone.utc).year)


def js_round(value: float) -> int:
    """Round half away from zero, matching JavaScript's Math.round."""
    return math.floor(value + 0.5) if value >= 0 else math.ceil(value - 0.5)


def sample(items: list, maximum: int) -> list:
    """Evenly sample down to at most `maximum` items, always keeping the ends."""
    if len(items) <= maximum:
        return items
    step = (len(items) - 1) / (maximum - 1)
    out = [items[js_round(i * step)] for i in range(maximum)]
    # Rounding can collide; drop consecutive duplicates.
    deduped = [v for i, v in enumerate(out) if i == 0 or v != out[i - 1]]
    return deduped


def report(rel_path: str, value) -> None:
    path = DATA_DIR.parent / rel_path
    body = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    path.write_text(body + "\n", encoding="utf-8")
    log("compact", f"{rel_path} → {len(body.encode()) / 1024:.0f} KB")


def main() -> int:
    log("compact", "Compacting raw snapshots…")

    history = read_json("ranking-history.json", {}) or {}
    trimmed_history = {
        pid: sample(rows[-HISTORY_WINDOW:], HISTORY_POINTS) for pid, rows in history.items()
    }
    report("data/ranking-history.json", trimmed_history)

    matches = read_json("matches.json", {}) or {}
    min_year = SEASON - (MATCH_YEARS - 1)
    trimmed_matches = {}
    for pid, rows in matches.items():
        kept = [m for m in rows if (m.get("yr") or int(m["d"][:4])) >= min_year]
        if kept:
            trimmed_matches[pid] = kept
    report("data/matches.json", trimmed_matches)

    log(
        "compact",
        f"Done — history window {HISTORY_WINDOW}w/{HISTORY_POINTS}pts, matches since {min_year}.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
