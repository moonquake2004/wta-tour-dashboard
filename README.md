# WTA Tour Dashboard

**Live:** <https://moonquake2004.github.io/wta-tour-dashboard/>

An independent, open-source data dashboard for the **Hologic WTA Tour**.

Rankings, player profiles, career records, head-to-heads, the tour calendar and
season statistics — every figure read from the **official WTA data feed** and
rebuilt into a fast, dependency-free static site.

> **Data snapshot:** rankings of **31 August 2026** · 300 ranked players · 300 player
> biographies · 222 calendar events across 2025–2026.
> Not affiliated with, endorsed by or sponsored by the WTA.

---

## Why this exists

The official WTA site publishes excellent data, but it is built for browsing
news, not for interrogating numbers. This project takes the same public JSON API
that powers `wtatennis.com`, normalises it, and presents it as a data tool:

- a complete, sortable, filterable ranking table with week-on-week movement;
- player pages that combine career biography, season serve/return splits,
  five years of ranking history and a full match log;
- a head-to-head analyser covering every stored meeting between two players;
- a tour calendar with surfaces, prize money and champions;
- twelve season leaderboards computed only from figures the tour itself publishes.

Nothing is modelled, estimated or scraped from HTML. If a number is not in the
official feed, it is not on the site.

---

## Data sources

Everything comes from the public JSON API behind `wtatennis.com`:

| Endpoint | Used for |
| --- | --- |
| `GET /tennis/players/ranked` | Official singles ranking table (`type=rankSingles`) |
| `GET /tennis/players/{id}/detailed` | Biography: career W–L, titles, career high, prize money |
| `GET /tennis/players/{id}/year/{season}` | Season serve &amp; return statistics |
| `GET /tennis/players/{id}/ranking` | Week-by-week singles/doubles ranking history |
| `GET /tennis/players/{id}/matches` | Complete singles and doubles match log |
| `GET /tennis/players/{id}/headtohead/{opp}` | Career head-to-head and every meeting |
| `GET /tennis/tournaments` | Tour calendar, draws, surfaces, prize money, champions |

### Two constraints that shaped the architecture

1. **The API caps a page at 100 rows.** Ranking depth is fetched page by page.
2. **The API rejects cross-origin browser requests.** It answers `HTTP 403` to
   any `Origin` header that is not `wtatennis.com`, so the site *cannot* call it
   from the browser. Everything, including head-to-head records, is therefore
   pre-computed at build time and shipped as static JSON.

---

## Project layout

```
wta-dashboard/
├── scripts/                 Node data pipeline (no dependencies)
│   ├── lib.mjs              API client, politeness gate, retry, file helpers
│   ├── build.mjs            full refresh: rankings → players → matches → … → derive
│   ├── refresh-rankings.mjs fast weekly refresh (rankings + derived only)
│   ├── fetch-rankings.mjs   official singles ranking table + search index
│   ├── fetch-players.mjs    biographies, season statistics, ranking history
│   ├── fetch-matches.mjs    singles match logs (binary page search by season)
│   ├── fetch-tournaments.mjs  tour calendar with champions
│   ├── fetch-h2h.mjs        folds match logs into a pairwise head-to-head index
│   ├── derive.mjs           leaderboards, season W–L, career leaders
│   ├── compact.mjs          downsamples history and trims logs
│   ├── site.mjs             assembles the publishable site into docs/
│   └── serve.mjs            zero-dependency preview server
├── site/                    front end (vanilla ES modules, no build step)
│   ├── index.html
│   └── assets/
│       ├── app.css          design system + components
│       ├── app.js           hash router and shell
│       ├── data.js          lazy JSON loading with memoisation
│       ├── ui.js            charts (hand-rolled SVG), chrome, search, tables
│       ├── utils.js         formatting, escaping, DOM helpers
│       └── pages/           home, rankings, players, player, compare, calendar, stats, about
├── data/                    generated JSON snapshots (committed)
└── docs/                    generated publishable site (served by GitHub Pages)
```

---

## Local development

Requires **Node.js 20+**. There are no npm dependencies.

```bash
# 1. assemble the publishable site from site/ + data/
node scripts/site.mjs

# 2. preview it (ES modules need HTTP, not file://)
node scripts/serve.mjs            # http://127.0.0.1:4173
```

To work on the front end without copying data around, serve `site/` instead —
it reads `../data` directly:

```bash
WTA_SERVE=site node scripts/serve.mjs
```

### Refreshing the data

```bash
# rankings only — two API calls plus derived aggregates (~30 s)
node scripts/refresh-rankings.mjs

# everything: rankings, 300 biographies, match logs, calendar, H2H (~12 min)
node scripts/build.mjs

# partial runs
node scripts/build.mjs --skip-players --skip-matches
WTA_MATCH_LIMIT=60 WTA_WORKERS=6 node scripts/build.mjs
```

Useful environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `WTA_RANK_DEPTH` | `300` | How many ranked players to store |
| `WTA_PLAYER_LIMIT` | `300` | How many player records to fetch |
| `WTA_MATCH_LIMIT` | `120` | How many players get a stored match log |
| `WTA_MATCH_FROM` | `2023` | Earliest season in the stored match log |
| `WTA_HISTORY_WEEKS` | `261` | Ranking-history window (weeks) |
| `WTA_WORKERS` | `4` | Concurrent player fetches |
| `WTA_CONCURRENCY` | `5` | Concurrent HTTP requests |
| `WTA_GAP_MS` | `90` | Minimum spacing between requests |

The fetcher is deliberately polite: bounded concurrency, a request-spacing gate
and exponential backoff. Please keep the defaults modest.

---

## Deploying

The site is published with **GitHub Pages** from the `docs/` folder:

1. `node scripts/site.mjs` assembles `docs/`.
2. Commit and push to the default branch.
3. In **Settings → Pages**, set *Source* to `Deploy from a branch` and choose
   `main` / `/docs`.

A scheduled workflow (`.github/workflows/refresh.yml`) refreshes the rankings
every Monday, when the WTA publishes its new list.

### Why a hash router?

The front end is a single HTML entry point with `#/route` URLs. GitHub Pages
serves static files only, so hash routing gives working deep links, zero server
configuration and no 404 handling. A `404.html` bounce is included for the
unlikely case of a path-style URL.

---

## Interpretation notes

- **Ranking weeks.** The WTA publishes rankings on Mondays. The date shown across
  the site is the week the snapshot belongs to, not the day it was downloaded.
- **Movement.** The arrow compares this week's position with the previous
  published week, exactly as the official table reports it.
- **Season W–L.** Counted from the official match log, excluding walkovers and
  byes that carry no score, so it reconciles with the tour's own season records
  (for example Sabalenka's 40–8 in 2026).
- **`winner` semantics.** In the match feed, `winner` is the slot of the player
  who **lost** (`1` ⇒ player_1 won). This is verified against well-known results.
- **Aces.** Ace totals depend on each venue's line-calling technology and are not
  perfectly comparable between events.
- **Biographies.** Career highs, titles and prize money come verbatim from the
  tour's biography records; each player page shows the WTA's own "last updated"
  date.

## Coverage

| Dataset | Depth |
| --- | --- |
| Singles ranking | Top 300 |
| Biographies | Top 300 |
| Season statistics | Top 300 (where published) |
| Ranking history | Top 300, trailing five years, weekly |
| Match logs | Top 120, 2023 onwards |
| Head-to-head | Every pairing inside the stored match window |
| Tour calendar | 2025 and 2026, all main-tour levels |

## Licence and attribution

- **Code:** MIT — see [LICENSE](LICENSE).
- **Data:** not covered by the MIT licence. Player names, ranking data,
  tournament results and biographical text are © **WTA Tour, Inc.**, used here
  for non-commercial informational purposes with attribution. Official headshots
  load directly from the WTA's image host and are not redistributed.

This project is **not affiliated with the WTA**. For authoritative information
always consult [wtatennis.com](https://www.wtatennis.com).
