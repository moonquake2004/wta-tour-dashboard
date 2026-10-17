#!/usr/bin/env python3
"""
Weekly refresh: the whole pipeline with weekly-appropriate depth.

This used to run a shorter list of its own — rankings, draws, derive, names,
site — which skipped the tournament registry, the player records and the compact
step.  A rankings-only run leaves the results feed and every profile frozen at the
last time those steps were run by hand.

Running build.py with the weekly environment keeps one step list, so the two entry
points cannot drift apart:

  WTA_PLAYER_REFRESH=1   re-read every ranked player's season records, which
                         otherwise never move once stored
  WTA_MATCHES_REFRESH=1  re-read every match log for the same reason — the season
                         W/L cross-check compares the two and fails if only one
                         of them is refreshed
  WTA_WORKERS=4          the profile refresh is the slowest step

    python3 pyscripts/refresh_rankings.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from wtalib import ROOT, log

WEEKLY_ENV = {
    "WTA_PLAYER_REFRESH": "1",
    "WTA_MATCHES_REFRESH": "1",
    "WTA_WORKERS": "4",
}


def main() -> int:
    here = Path(__file__).resolve().parent
    env = {**os.environ, **WEEKLY_ENV}
    log("refresh", "weekly refresh → build.py " + " ".join(f"{k}={v}" for k, v in WEEKLY_ENV.items()))
    code = subprocess.run([sys.executable, str(here / "build.py")], cwd=ROOT, env=env).returncode
    if code != 0:
        return code
    log("refresh", "Weekly refresh complete — rankings, results, profiles and the site are current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
