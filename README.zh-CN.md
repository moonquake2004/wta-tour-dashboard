# 女子网球巡回赛 · 数据看板

**在线访问：** <https://moonquake2004.github.io/wta-tour-dashboard/>

一个独立、开源的 **中英双语** 女子职业网球（Hologic WTA 巡回赛）成绩看板——
单打世界排名、赛季赛程、比赛结果、球员档案、发球接发统计、生涯数据榜与历史交手记录。

所有数字都直接取自驱动 `wtatennis.com` 的 **WTA 官方公开数据接口**，
没有任何估算、建模或 HTML 爬取。

---

## 网站内容

单页 7 个标签面板，形式参照转播级成绩看板：

| 面板 | English | 内容 |
| --- | --- | --- |
| 总览 | Overview | 赛季 KPI、冠军墙、最新赛果、世界前十、数据领跑、生涯榜 |
| 赛程 | Calendar | 全部主巡回赛赛事：级别、场地、签位、奖金、冠军 |
| 赛果 | Results | 赛季比赛结果，可按轮次、赛事、场地筛选 |
| 排名 | Rankings | 官方单打排名，含领奖台、名次变动与排名走势 |
| 球员 | Players | 球员卡片：赛季胜负、近期战绩、冠军数、发球数据 |
| 数据 | Statistics | 12 个赛季数据榜、生涯榜、级别与场地分布 |
| 交手 | Head-to-head | 任意两位球员：交手记录、逐场明细、数据对比 |

- **默认中英对照**：所有球员、赛事、国家/地区、轮次、场地都同时显示中英文；
  页头三档切换（`中/EN · 中文 · EN`）可收敛为单一语言，选择本地保存。
- **球员详情弹窗**：页面任意位置点击球员，查看分赛季战绩、发球数据、最高排名与奖金。
- **运行时不请求内容数据**：数据以脚本全局变量载入，因此发布产物只有
  `index.html` + 两个静态资源 + 两个数据文件。

---

## 数据来源

全部来自 `wtatennis.com` 背后的公开 JSON 接口：

| 接口 | 用途 |
| --- | --- |
| `GET /tennis/players/ranked` | 官方单打排名表（`type=rankSingles`） |
| `GET /tennis/players/{id}/detailed` | 生涯档案：胜负、冠军数、最高排名、奖金 |
| `GET /tennis/players/{id}/year/{season}` | 赛季发球与接发统计 |
| `GET /tennis/players/{id}/ranking` | 单打/双打逐周排名历史 |
| `GET /tennis/players/{id}/matches` | 完整单打比赛记录 |
| `GET /tennis/players/{id}/headtohead/{opp}` | 生涯交手记录与每一场比赛 |
| `GET /tennis/tournaments` | 赛程、签表、场地、奖金、冠军 |

### 两个决定架构的约束

1. **接口每页最多 100 行**，排名与比赛记录必须翻页获取；比赛接口还会忽略日期过滤，
   因此管线用二分查找定位每个赛季所在页。
2. **接口拒绝跨域浏览器请求**：只要 `Origin` 不是 `wtatennis.com` 一律返回 `HTTP 403`。
   所以网站不能在运行时调用它——包括交手记录在内的全部数据都在构建时预计算成静态文件。

### 中文数据来源

官方接口只有英文，中文名称来自结构化开放数据，而不是猜测：

| 数据 | 来源 |
| --- | --- |
| 球员中文名 | **Wikidata** 属性 **P597**（WTA 球员 ID） |
| 繁→简转换 | **MediaWiki `zh-hans` 变体转换器** |
| 赛事中文名 | 大满贯与 WTA 1000 人工词典 → Wikidata → 城市名规则 |
| 国家/地区 | 国际奥委会代码对照表 |
| 轮次 / 场地 / 级别 | 网球术语表 |
| 约 8% 球员 | 按各语言译音规范人工校订的译名 |

---

## 项目结构

```
wta-dashboard/
├── scripts/                     Node 数据管线（零依赖）
│   ├── lib.mjs                  接口客户端、限流闸门、重试、文件工具
│   ├── build.mjs                全量构建：抓取 → 派生 → 生成 → 组装 → 校验
│   ├── refresh-rankings.mjs     每周轻量刷新
│   ├── fetch-*.mjs              排名 / 档案 / 比赛 / 赛程 / 交手 抓取
│   ├── fetch-zh.mjs             中文名（Wikidata + 变体转换）
│   ├── zh-terms.mjs             术语表、SPARQL 与转换助手
│   ├── derive.mjs               排行榜、赛季胜负、生涯榜
│   ├── compact.mjs              历史降采样、体积裁剪
│   ├── generate-data.mjs        → data/dashboard.js + data/h2h.js
│   ├── build-site.mjs           → docs/（可发布站点 + SEO 文件）
│   ├── verify.mjs               原始快照校验（36 项）
│   ├── verify-dashboard.mjs     看板数据校验（37 项）
│   └── serve.mjs                零依赖预览服务器
├── site-v2/                     前端（单页，无构建步骤）
│   ├── index.html               7 个标签面板，双语标注
│   └── assets/css + assets/js   球场质感设计系统 + 应用逻辑
├── data/                        生成的快照（提交入库）
└── docs/                        生成的发布站点（Pages 从此目录发布）
```

---

## 本地开发

需要 **Node.js 20+**，无 npm 依赖。

```bash
# 重新生成看板数据并组装站点
node scripts/generate-data.mjs
node scripts/build-site.mjs

# 本地预览（默认服务 docs/）
node scripts/serve.mjs            # http://127.0.0.1:4173
```

### 刷新数据

```bash
# 轻量刷新：排名 → 派生 → 中文名 → 数据 → 站点 → 校验
node scripts/refresh-rankings.mjs

# 全量：排名、300 份档案、300 人比赛记录、赛程、交手（约 15 分钟）
node scripts/build.mjs

# 部分刷新
node scripts/build.mjs --skip-players --skip-matches
```

常用环境变量：`WTA_RANK_DEPTH`（默认 300）、`WTA_MATCH_LIMIT`（默认 300）、
`WTA_RESULT_LIMIT`（默认 1200）、`WTA_WORKERS`、`WTA_CONCURRENCY`、`WTA_GAP_MS`。
抓取器刻意保持克制：并发受限、请求间隔下限、指数退避重试，请沿用默认值。

---

## 部署

通过 **GitHub Pages** 发布 `docs/` 目录：

1. `node scripts/build-site.mjs` 生成 `docs/`；
2. 提交并推送到默认分支；
3. 在 **Settings → Pages** 选择 *Deploy from a branch*，分支 `main`、目录 `/docs`。

`.github/workflows/refresh.yml` 会在每周一（WTA 发布新榜单时）自动刷新。
导航使用 hash 路由（`#rankings`、`#h2h` …），静态托管下深链可直接使用。

---

## 数据口径说明

- **排名周期**：WTA 每周一发布排名；站内日期是该快照所属的那一周。
- **名次变动**：与官方表中"相比上周"完全一致。
- **赛季胜负**：由官方比赛记录统计，剔除无比分的轮空/弃权，可与官方赛季战绩对齐。
- **`winner` 字段语义**：比赛数据里 `winner` 是**负方**的位置编号（`1` 表示 `player_1` 获胜），
  已用公开赛果交叉验证。
- **冠军**：取自赛事接口；少数低级别已结束赛事官方尚未发布单打冠军，显示为 `—`。
- **ACE 球**：依赖各赛场线审技术，跨赛事不完全可比。
- **球员档案**：最高排名、冠军数、奖金逐字取自 WTA 档案，并显示官方"最后更新"日期。

## 许可与署名

- **代码**：MIT，见 [LICENSE](LICENSE)。
- **数据**：不在 MIT 许可范围内。球员姓名、排名数据、赛事结果、档案文本
  版权归 **WTA Tour, Inc.** 所有，本站以署名方式用于非商业信息目的。
  官方头像直接从 WTA 图片服务器加载，本项目不再分发。

本站与 WTA **无隶属关系**。权威信息请始终以 [wtatennis.com](https://www.wtatennis.com) 为准。
