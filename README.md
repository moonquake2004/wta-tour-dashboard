# WTA Tour Data Dashboard · 女子网球巡回赛数据看板

**Live:** <https://moonquake2004.github.io/wta-tour-dashboard/>

An independent, open-source, **bilingual (English / 简体中文)** data dashboard for
the **Hologic WTA Tour** — singles world rankings, the season calendar, match
results, player profiles, serve and return statistics, career leaders and
head-to-head records.

Built entirely with the **Python standard library** — no third-party packages, no
JavaScript framework, no build tooling.

---

## What it is

The site is **pre-rendered, not client-rendered**: Python writes 1,700+ complete
HTML pages at build time. Every panel, all 300 player profiles and all 186 event
pages are static documents, and the site works with **JavaScript switched off**.

| Page | 中文 | Contents |
| --- | --- | --- |
| `index.html` | 总览 | Season KPIs, champion wall, latest results, top 10, stat and career leaders |
| `calendar.html` | 赛程 | Every main-tour event, grouped by month, with level, surface, draw, prize money and champion — filterable by status (all / ongoing / completed / upcoming) |
| `results.html` | 赛果 | The season's match results, newest first |
| `rankings.html` | 排名 | Official singles ranking, podium, movement, pre-rendered sort orders |
| `players.html` | 球员 | Every ranked player as a card, grouped by country |
| `player-<id>.html` | 球员档案 | Biography, record by season, serve splits, head-to-head vs the top 30 |
| `stats.html` | 数据 | Twelve season leaderboards plus career leaders |
| `h2h.html` | 交手 | Pairing hub — step one, pick a player from the top 50 |
| `h2h-pick-<id>.html` | 交手 | Step two — pick that player's opponent |
| `h2h-<a>-<b>.html` | 交手对比 | Career record, every meeting, side-by-side comparison |
| `event-<id>-<year>.html` | 赛事赛果 | The complete singles draw, round by round, qualifying included |

**Interaction without JavaScript.** Language switching, the calendar's status
filters, the pre-rendered sort orders and modal-style reveals are all driven by
CSS `:target` — each filter is a complete pre-built list, so switching status
never re-renders anything. Three anchors sit
at the top of `<body>` and are siblings of the page content, so
`#lang-cn:target ~ .lang-ctx .en { display: none }` swaps the language by URL
fragment alone. Player headshot fallbacks are pure CSS layers, so a missing photo
never shows a broken icon.

---

## Data sources

All content comes from the public JSON API behind `wtatennis.com`:

| Endpoint | Used for |
| --- | --- |
| `GET /tennis/players/ranked` | Official singles ranking table (`type=rankSingles`) |
| `GET /tennis/players/{id}/detailed` | Biography: career W–L, titles, career high, prize money |
| `GET /tennis/players/{id}/year/{season}` | Season serve and return statistics |
| `GET /tennis/players/{id}/ranking` | Week-by-week singles and doubles ranking history |
| `GET /tennis/players/{id}/matches` | Complete singles match log |
| `GET /tennis/players/{id}/headtohead/{opp}` | Career head-to-head and every meeting |
| `GET /tennis/tournaments` | Tour calendar, draws, surfaces, prize money, champions |
| `GET /tennis/tournaments/{id}/{year}/matches` | Every match of one event, qualifying included |

### Constraints that shaped the design

1. **The API caps a page at 100 rows** and the match feed ignores date filters, so
   the pipeline binary-searches pages to find each season's window.
2. **The API rejects cross-origin browser requests** (`HTTP 403` for any `Origin`
   that is not `wtatennis.com`), so nothing can be fetched at runtime. Everything,
   including head-to-head records, is computed at build time.
3. **Throttling returns `200` with an empty array** rather than an error, so an
   empty result is treated as a failure and retried — otherwise a refresh silently
   loses history for a dozen players.
4. **Large responses are occasionally truncated** by `urllib` on macOS. The HTTP
   layer reads in chunks over `http.client` and falls back to `curl` if the Python
   stack keeps failing.

### Chinese localisation

The feed is English-only, so Chinese names come from open structured sources:

| Dataset | Source |
| --- | --- |
| Player names | **Wikidata**, joined on property **P597** (the WTA player id) |
| Traditional → Simplified | **MediaWiki `zh-hans` variant converter** |
| Tournament names | Curated dictionary for the majors and WTA 1000 events, then Wikidata, then a host-city rule |
| Countries, rounds, surfaces, levels | Curated terminology tables |
| ~8% of players | Curated transliterations following each source language's conventions |

A Wikidata label that is simply the Latin name is discarded rather than shown
twice, and the gaps are filled from the transliteration list.

---

## Project layout

```
wta-dashboard/
├── pyscripts/                   Python pipeline (standard library only)
│   ├── wtalib.py                HTTP client, politeness gate, TLS discovery, file helpers
│   ├── fetch_rankings.py        official singles ranking table + search index
│   ├── fetch_players.py         biographies, season statistics, ranking history
│   ├── fetch_matches.py         singles match logs (binary page search by season)
│   ├── fetch_tournaments.py     tour calendar with champions
│   ├── fetch_events.py          complete per-event draws with round inference
│   ├── fetch_h2h.py             folds match logs into a pairwise index
│   ├── zh_terms.py              Chinese terminology tables and helpers
│   ├── fetch_zh.py              Chinese names from Wikidata + variant conversion
│   ├── derive.py                leaderboards, season W–L, career leaders
│   ├── compact.py               downsamples history, trims payloads
│   ├── generate_data.py         → data/dashboard.js, events.js, h2h*.js
│   ├── render.py                formatting and bilingual primitives
│   ├── templates.py             document shell, header, footer
│   ├── pages.py                 the seven panels and the two detail page kinds
│   ├── build_site.py            → docs/ (1,700+ pre-rendered pages + SEO files)
│   ├── check_links.py           verifies every internal link resolves (4,500+ pages)
│   ├── verify.py                raw snapshot integrity (29 assertions)
│   ├── verify_dashboard.py      payload integrity (46 assertions)
│   ├── compare_outputs.py       field-by-field snapshot comparison tool
│   ├── build.py                 full refresh orchestrator
│   ├── refresh_rankings.py      light weekly refresh
│   └── serve.py                 threaded preview server
├── site-py/assets/              stylesheet and social card
├── data/                        generated snapshots (committed)
└── docs/                        generated site (served by GitHub Pages)
```

---

## Local development

Requires **Python 3.11+**. No packages to install.

```bash
# regenerate the payload and the site
python3 pyscripts/generate_data.py
python3 pyscripts/build_site.py

# preview (threaded; a page requests hundreds of headshots)
python3 pyscripts/serve.py            # http://127.0.0.1:4174
```

### Refreshing data

```bash
# light weekly refresh: rankings → events → derived → names → payload → site → verify
python3 pyscripts/refresh_rankings.py

# everything: rankings, 300 biographies, 300 match logs, calendar, draws (~15 min)
python3 pyscripts/build.py

# partial
python3 pyscripts/build.py --skip-players --skip-matches

# verify only
python3 pyscripts/verify.py && python3 pyscripts/verify_dashboard.py
```

Every fetch step supports **resuming**: records already stored are not re-fetched,
so a run interrupted by a network hiccup can simply be repeated.

Environment variables: `WTA_RANK_DEPTH` (300), `WTA_PLAYER_LIMIT` (300),
`WTA_MATCH_LIMIT` (300), `WTA_MATCH_FROM` (2023), `WTA_RESULT_LIMIT` (1200),
`WTA_HISTORY_WEEKS` (261), `WTA_WORKERS` (4), `WTA_CONCURRENCY` (5),
`WTA_GAP_MS` (90).

The fetcher is deliberately polite: bounded concurrency, a request-spacing gate
and exponential backoff. Please keep the defaults modest.

---

## Deploying

Published with **GitHub Pages** from the `docs/` folder:

1. `python3 pyscripts/build_site.py` regenerates `docs/`.
2. Commit and push to the default branch.
3. **Settings → Pages** → *Deploy from a branch* → `main` / `/docs`.

`.github/workflows/refresh.yml` refreshes the rankings every Monday, when the WTA
publishes its new list.

---

## Interpretation notes

- **Ranking weeks.** The WTA publishes rankings on Mondays; the date shown is the
  week the snapshot belongs to, not the day it was downloaded.
- **Movement.** The arrow compares this week with the previous published week,
  exactly as the official table reports it.
- **Season W–L.** Counted from the official match log, excluding walkovers and
  byes that carry no score, so it reconciles with the tour's own season records.
- **`winner` semantics.** In the match feed `winner` is the slot of the player who
  **lost** (`1` ⇒ player_1 won). Verified against well-known results.
- **Champions.** Taken from the tournament feed; a few lower-tier completed events
  have no singles champion published yet.
- **Aces.** Ace totals depend on each venue's line-calling technology and are not
  perfectly comparable between events.

## Licence and attribution

- **Code:** MIT — see [LICENSE](LICENSE).
- **Data:** not covered by the MIT licence. Player names, ranking data, tournament
  results and biographical text are © **WTA Tour, Inc.**, used here for
  non-commercial informational purposes with attribution. Official headshots load
  directly from the WTA's image host and are not redistributed.

This project is **not affiliated with the WTA**. For authoritative information
always consult [wtatennis.com](https://www.wtatennis.com).
