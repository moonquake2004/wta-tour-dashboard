# WTA Tour Data Dashboard · 女子网球巡回赛数据看板

**Live:** <https://moonquake2004.github.io/wta-tour-dashboard/>

An independent, open-source, **bilingual (English / 简体中文)** results dashboard for
the **Hologic WTA Tour** — singles world rankings, the season calendar, match
results, player records, serve and return statistics, career leaders and
head-to-head records.

Every number is read from the **official WTA public data feed** that powers
`wtatennis.com`. Nothing is modelled, estimated or scraped from HTML.

---

## What the site is

A single self-contained page with seven tab panels, in the style of a
broadcast results dashboard:

| Panel | 中文 | Contents |
| --- | --- | --- |
| Overview | 总览 | Season KPIs, champion wall, latest results, top 10, stat leaders, career leaders |
| Calendar | 赛程 | Every main-tour event with level, surface, draw, prize money and champion — **click any event for its complete singles results** |
| Results | 赛果 | Season match results with round, event and surface filters |
| Rankings | 排名 | The official singles ranking with podium, movement and ranking trajectories |
| Players | 球员 | Player cards with season W–L, form, titles and serve splits |
| Statistics | 数据 | Twelve season leaderboards, career leaders, level and surface splits |
| Head-to-head | 交手 | Any two players: career record, every meeting, side-by-side comparison |

- **Bilingual by default.** Every player, event, country, round and surface is
  shown in Chinese and English at once; a three-way switch (`中/EN · 中文 · EN`)
  collapses to one language and the choice persists locally. The switch is pure
  CSS (`html[data-lang]`), so changing language re-renders nothing.
- **Palette drawn from the majors.** The colour scheme was built from the official
  brand colours of the four Grand Slams, read from each tournament's own website:

  | Tournament | Official colours found |
  | --- | --- |
  | Wimbledon | deep green `#00552b` / `#00331a`, purple `#540082`, green-gold `#816c3c` |
  | Australian Open | navy `#1e2886`, deep blue `#003a5d`, bright blue `#0092d3` |
  | Roland Garros | terracotta `#cc4e0e` / `#e38045`, deep green `#00503c` / `#033629` |
  | US Open | blue `#2478cc` / `#00288c`, gold `#ffd400` |

  The dashboard is built on the Wimbledon court green with cream text, and gold is
  reserved strictly for honours — match winners, champions, the top three, and the
  Grand Slam level tag. A 🏆 marker appears **only on actual champions** (the
  champion wall, calendar winners, and the event-results header), never beside a
  single match winner, whose name is simply set in gold. The three surface colours
  are used only to identify a surface.
  Typography pairs Noto Serif SC for Chinese display with Oswald / Barlow Condensed
  for Latin and numerals. All sampled text meets WCAG AA (6.6:1 to 14.9:1).
- **Player detail modal** — click any player anywhere for season records by year,
  serve splits, career highs and prize money.
- **Event results modal** — click any event on the calendar for its complete
  singles draw by round, qualifying included, with seeds, countries, scores,
  tie-breaks and retirement notes. Read from the official per-event match feed
  (`tournaments/{id}/{year}/matches`).
- **No runtime requests for content.** The payload is loaded as a plain script
  global, so the published site is `index.html` + two assets + two data files.

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

### Two constraints that shaped the architecture

1. **The API caps a page at 100 rows**, so ranking depth and match logs are
   fetched page by page. The match feed ignores date filters, so the pipeline
   binary-searches the pages to find each season's window.
2. **The API rejects cross-origin browser requests** — it answers `HTTP 403` to
   any `Origin` that is not `wtatennis.com`. The site therefore cannot call it at
   runtime; everything, including head-to-head records, is pre-computed at build
   time and shipped as static data.

### Chinese localisation sources

The official feed is English-only, so Chinese names come from open structured
sources rather than guesswork:

| Dataset | Source |
| --- | --- |
| Player names | **Wikidata**, joined on property **P597** (the WTA player id) |
| Traditional → Simplified | **MediaWiki `zh-hans` variant converter** |
| Tournament names | Curated dictionary for the majors and WTA 1000 events, then Wikidata, then a host-city rule |
| Countries | Curated IOC-code table |
| Rounds, surfaces, levels | Curated tennis terminology |
| ~8% of players | Curated transliterations following each source language's conventions |

---

## Project layout

```
wta-dashboard/
├── scripts/                     Node data pipeline (no dependencies)
│   ├── lib.mjs                  API client, politeness gate, retry, file helpers
│   ├── build.mjs                full refresh: fetch → derive → generate → assemble → verify
│   ├── refresh-rankings.mjs     light weekly refresh
│   ├── fetch-rankings.mjs       official singles ranking table + search index
│   ├── fetch-players.mjs        biographies, season statistics, ranking history
│   ├── fetch-matches.mjs        singles match logs (binary page search by season)
│   ├── fetch-tournaments.mjs    tour calendar with champions
│   ├── fetch-h2h.mjs            folds match logs into a pairwise head-to-head index
│   ├── fetch-zh.mjs             Chinese names from Wikidata + variant conversion
│   ├── zh-terms.mjs             terminology tables, SPARQL and conversion helpers
│   ├── derive.mjs               leaderboards, season W–L, career leaders
│   ├── compact.mjs              downsamples history, trims payloads
│   ├── generate-data.mjs        → data/dashboard.js + data/h2h.js
│   ├── build-site.mjs           → docs/ (publishable site + SEO files)
│   ├── verify.mjs               raw snapshot integrity (36 assertions)
│   ├── verify-dashboard.mjs     dashboard payload integrity (37 assertions)
│   └── serve.mjs                zero-dependency preview server
├── site-v2/                     front end (single page, no build step)
│   ├── index.html               7 tab panels, bilingual markup
│   └── assets/
│       ├── css/style.css        court-material design system
│       ├── js/app.js            rendering, tabs, bilingual switch, modal, H2H
│       └── og-cover.png         social share card
├── data/                        generated snapshots (committed)
└── docs/                        generated publishable site (served by Pages)
```

---

## Local development

Requires **Node.js 20+**. No npm dependencies.

```bash
# regenerate the dashboard payload and assemble the site
node scripts/generate-data.mjs
node scripts/build-site.mjs

# preview (defaults to docs/)
node scripts/serve.mjs            # http://127.0.0.1:4173
```

### Refreshing data

```bash
# light weekly refresh: rankings → derived → Chinese names → payload → site → verify
node scripts/refresh-rankings.mjs

# everything: rankings, 300 biographies, 300 match logs, calendar, H2H (~15 min)
node scripts/build.mjs

# partial
node scripts/build.mjs --skip-players --skip-matches
WTA_MATCH_LIMIT=120 WTA_WORKERS=6 node scripts/build.mjs
```

Useful environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `WTA_RANK_DEPTH` | `300` | Ranked players to store |
| `WTA_PLAYER_LIMIT` | `300` | Player records to fetch |
| `WTA_MATCH_LIMIT` | `300` | Players given a stored match log |
| `WTA_MATCH_FROM` | `2023` | Earliest season in the match log |
| `WTA_RESULT_LIMIT` | `1200` | Matches kept in the results feed |
| `WTA_HISTORY_WEEKS` | `261` | Ranking-history window (weeks) |
| `WTA_WORKERS` | `4` | Concurrent player fetches |
| `WTA_CONCURRENCY` | `5` | Concurrent HTTP requests |
| `WTA_GAP_MS` | `90` | Minimum spacing between requests |

The fetcher is deliberately polite: bounded concurrency, a request-spacing gate
and exponential backoff. Please keep the defaults modest.

---

## Deploying

Published with **GitHub Pages** from the `docs/` folder:

1. `node scripts/build-site.mjs` assembles `docs/`.
2. Commit and push to the default branch.
3. **Settings → Pages** → *Deploy from a branch* → `main` / `/docs`.

`.github/workflows/refresh.yml` refreshes the rankings every Monday, when the
WTA publishes its new list.

Navigation uses hash routes (`#rankings`, `#h2h`, …) so deep links work on
static hosting with no server configuration.

---

## Interpretation notes

- **Ranking weeks.** The WTA publishes rankings on Mondays. The date shown is the
  week the snapshot belongs to, not the day it was downloaded.
- **Movement.** The arrow compares this week's position with the previous
  published week, exactly as the official table reports it.
- **Season W–L.** Counted from the official match log, excluding walkovers and
  byes that carry no score, so it reconciles with the tour's own season records.
- **`winner` semantics.** In the match feed, `winner` is the slot of the player
  who **lost** (`1` ⇒ player_1 won). Verified against well-known results.
- **Champions.** Taken from the tournament feed. A few lower-tier completed
  events have no singles champion published yet; those rows show `—`.
- **Aces.** Ace totals depend on each venue's line-calling technology and are not
  perfectly comparable between events.
- **Biographies.** Career highs, titles and prize money come verbatim from the
  tour's biography records, whose "last updated" date is shown per player.

## Licence and attribution

- **Code:** MIT — see [LICENSE](LICENSE).
- **Data:** not covered by the MIT licence. Player names, ranking data,
  tournament results and biographical text are © **WTA Tour, Inc.**, used here
  for non-commercial informational purposes with attribution. Official headshots
  load directly from the WTA's image host and are not redistributed.

This project is **not affiliated with the WTA**. For authoritative information
always consult [wtatennis.com](https://www.wtatennis.com).
