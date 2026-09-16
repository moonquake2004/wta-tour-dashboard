"""
Render the dashboard as pre-built HTML.

The site is generated, not rendered in the browser: every panel, player page and
event page is a complete HTML document produced here.  Interaction is CSS-driven,
so the site works with JavaScript switched off:

  · language      three anchors at the top of <body> (#lang-both/#lang-cn/#lang-en)
                  are siblings of the content, so :target toggles .cn/.en
  · modals        #player-<id> / #event-<id>-<year> targets reveal a fixed overlay
  · tables        sorting is pre-rendered as several sections, shown by :target
  · tabs          <details> elements, which open without script

Standard library only; the only dependency is the data the pipeline produced.
"""

from __future__ import annotations

import html
import json
from datetime import datetime, timezone

from wtalib import ROOT

# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

MONTH = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
}

SURFACE_EN = {"HARD": "Hard", "CLAY": "Clay", "GRASS": "Grass", "CARPET": "Carpet"}


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def num(value) -> str:
    if value is None or value == "":
        return "—"
    try:
        return f"{int(round(float(value))):,}"
    except (TypeError, ValueError):
        return "—"


def pct(value, digits: int = 1) -> str:
    if value is None or value == "":
        return "—"
    try:
        return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError):
        return "—"


def money(value) -> str:
    if not value:
        return "—"
    return f"${value:,.0f}"


def money_short(value) -> str:
    if not value:
        return "—"
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M" if value < 10_000_000 else f"${value / 1_000_000:.0f}M"
    if value >= 1_000:
        return f"${value / 1_000:.0f}K"
    return f"${value:,.0f}"


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d")
    except ValueError:
        return None


def short_date(value, with_year: bool = False) -> str:
    d = _parse_date(value)
    if not d:
        return "—"
    text = f"{d.day} {MONTH[d.month]}"
    return f"{text} {d.year}" if with_year else text


def iso_date(value) -> str:
    d = _parse_date(value)
    return d.strftime("%Y-%m-%d") if d else "—"


def timestamp(value=None) -> str:
    d = _parse_date(value) if value else None
    if d:
        return f"{d.day} {MONTH[d.month]} {d.year}"
    now = datetime.now(timezone.utc)
    return f"{now.day} {MONTH[now.month]} {now.year}"


# ---------------------------------------------------------------------------
# Bilingual primitives
# ---------------------------------------------------------------------------


def bi(zh, en="", cls: str = "", tag: str = "span") -> str:
    """
    Render a Chinese/English pair.

    Both languages live in the document; CSS picks which is shown, so switching
    language never re-renders anything.  Identical strings collapse to one line so
    a player or country without a translation is not printed twice.
    """
    c = ("" if zh is None else str(zh)).strip()
    e = ("" if en is None else str(en)).strip()
    klass = f' class="{cls}"' if cls else ""
    if not c or c == e:
        return f"<{tag}{klass}>{esc(e or c)}</{tag}>"
    if not e:
        return f"<{tag}{klass}>{esc(c)}</{tag}>"
    return (
        f'<{tag}{klass}><span class="cn">{esc(c)}</span>'
        f'<span class="en">{esc(e)}</span></{tag}>'
    )


class Context:
    """Everything the renderers need: the payload plus the Chinese lookup."""

    def __init__(self, data: dict, events: dict, h2h: dict):
        self.data = data
        self.meta = data.get("meta", {})
        self.players = data.get("players", [])
        self.results = data.get("results", [])
        self.champions = data.get("champions", [])
        self.calendar = data.get("calendar", [])
        self.digest = data.get("eventDigest", {})
        self.boards = data.get("boards", [])
        self.career = data.get("career", {})
        self.season_records = data.get("seasonRecords", {})
        self.tournament_zh = data.get("tournamentZh", {})
        self.zh = self.meta.get("zh", {})
        self.events = events
        self.h2h = h2h
        self.season = self.meta.get("season")
        self.by_id = {p["id"]: p for p in self.players}
        self.h2h_players = h2h.get("players", {})
        self.h2h_pairs = h2h.get("pairs", {})
        self.counts = self.meta.get("counts", {})
        self.stamp = (self.meta.get("generatedAt") or "")[:19]
        # Pairing pages are generated for the top N only; filled in by build_site
        # so every renderer can tell a real link from one that would 404.
        self.pair_ids: set[int] = set()
        self.pair_roster: list[dict] = []

    def has_pair_page(self, a: int, b: int) -> bool:
        return a in self.pair_ids and b in self.pair_ids

    # -- lookups ---------------------------------------------------------
    def player(self, pid) -> dict:
        pid = int(pid)
        if pid in self.by_id:
            return self.by_id[pid]
        entry = self.h2h_players.get(str(pid))
        if entry:
            return entry
        return {"id": pid, "name": f"#{pid}", "zh": "", "country": "", "rank": None}

    def name(self, player: dict | None, cls: str = "") -> str:
        """A player's name as a bilingual pair."""
        if not player:
            return ""
        return bi(player.get("zh") or player.get("name"), player.get("name"), cls)

    def player_link(self, player: dict | None, cls: str = "") -> str:
        if not player:
            return ""
        klass = f' class="{cls}"' if cls else ""
        return f'<a href="player-{player["id"]}.html"{klass}>{self.name(player)}</a>'

    def country(self, code) -> str:
        c = str(code or "").upper()
        return bi(self.zh.get("countries", {}).get(c, ""), c)

    def level(self, level) -> str:
        if not level:
            return ""
        return bi(self.zh.get("levels", {}).get(level, ""), level)

    def round_(self, code) -> str:
        """Round label.

        The match feed abbreviates the last three rounds as Q/S, while the draw
        pages spell them QF/SF; both are shown the long way so a page reads
        consistently wherever the round came from.
        """
        c = str(code or "").upper()
        label = {"Q": "QF", "S": "SF"}.get(c, c)
        zh = self.zh.get("rounds", {}).get(c, "")
        return bi(zh, label) if zh else esc(label)

    def surface(self, surface) -> str:
        key = str(surface or "").upper()
        zh = self.zh.get("surfaces", {}).get(key, "")
        return bi(zh, SURFACE_EN.get(key, surface or "—"))

    def surface_chip(self, surface) -> str:
        key = str(surface or "").upper()
        label = SURFACE_EN.get(key, surface or "—")
        return f'<span class="sfc {esc(label.title())}"><i></i>{self.surface(surface)}</span>'

    def tournament(self, name) -> str:
        return bi(self.tournament_zh.get(name, ""), name)

    def level_tag(self, level) -> str:
        if not level:
            return ""
        text = str(level)
        cls = ""
        if "grand slam" in text.lower():
            cls = "gs"
        elif "1000" in text:
            cls = "w1000"
        elif "500" in text:
            cls = "w500"
        elif "250" in text or "125" in text:
            cls = "w250"
        elif "finals" in text.lower():
            cls = "finals"
        en = "SLAM" if text.lower() == "grand slam" else text
        return f'<span class="tag-lvl {cls}">{self.level(level) if False else bi(self.zh.get("levels", {}).get(text, ""), en)}</span>'

    def move(self, value) -> str:
        v = int(value or 0)
        if not v:
            return '<span class="move flat">—</span>'
        if v > 0:
            return f'<span class="move up">▲ +{v}</span>'
        return f'<span class="move down">▼ −{abs(v)}</span>'

    def photo(self, pid) -> str:
        return f"https://wtafiles.blob.core.windows.net/images/headshots/{pid}.jpg"

    def avatar(self, player, size: int = 34, cls: str = "") -> str:
        """
        Official headshot.

        The fallback is pure CSS — a monogram on a court-green disc behind the
        image — so a missing photo never leaves a broken icon and no inline
        JavaScript is needed across the ~1,700 generated pages.
        """
        initials = "".join(w[:1] for w in str(player.get("name") or "?").split()[:2]).upper()
        return (
            f'<span class="av" style="--av:{size}px">'
            f'<span class="av-mono" aria-hidden="true">{esc(initials)}</span>'
            f'<img class="{esc(cls)}" src="{self.photo(player["id"])}" alt="" loading="lazy" '
            f'width="{size}" height="{size}"></span>'
        )
