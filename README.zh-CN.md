# 女子网球巡回赛 · 数据看板

**在线访问：** <https://moonquake2004.github.io/wta-tour-dashboard/>

一个独立、开源的 **中英双语** 女子职业网球（Hologic WTA 巡回赛）数据看板——
单打世界排名、赛季赛程、比赛结果、球员档案、发球接发统计、生涯数据榜与历史交手记录。

**全部用 Python 标准库实现**：无第三方依赖、无 JavaScript 框架、无构建工具。

---

## 这是什么

网站是**预渲染的，不是浏览器渲染的**：构建时由 Python 写出 1700+ 个完整 HTML 页面。
七个板块、300 个球员档案页、186 个赛事赛果页都是静态文档，
**关闭 JavaScript 后整站仍可正常使用**。

| 页面 | English | 内容 |
| --- | --- | --- |
| `index.html` | 总览 | 赛季 KPI、冠军墙、最新赛果、世界前十、数据与生涯领跑 |
| `calendar.html` | 赛程 | 全部主巡回赛赛事：级别、场地、签位、奖金、冠军 |
| `results.html` | 赛果 | 本赛季比赛结果，由新到旧 |
| `rankings.html` | 排名 | 官方单打排名、领奖台、名次变动、预渲染的多种排序 |
| `players.html` | 球员 | 全部排名球员卡片，可按国家筛选 |
| `player-<id>.html` | 球员档案 | 档案、分赛季战绩、发球数据、对前 30 的交手战绩 |
| `stats.html` | 数据 | 12 个赛季数据榜 + 生涯领跑榜 |
| `h2h.html` | 交手 | 对阵枢纽——第一步：从前 50 中选一位球员 |
| `h2h-pick-<id>.html` | 交手 | 第二步：选择该球员的对手 |
| `h2h-<a>-<b>.html` | 交手对比 | 交手记录、逐场明细、逐项数据对比 |
| `event-<id>-<year>.html` | 赛事赛果 | 该站完整单打签表，按轮次排列，含资格赛 |

**不用 JavaScript 的交互**：语言切换、预渲染排序、弹窗都用 CSS `:target` 实现。
三个锚点位于 `<body>` 顶部、与正文同级，因此
`#lang-cn:target ~ .lang-ctx .en { display: none }` 仅靠 URL 片段就能切换语言。
球员头像的兜底也是纯 CSS 图层，缺图不会出现破图图标。

---

## 数据来源

全部来自 `wtatennis.com` 背后的公开 JSON 接口：

| 接口 | 用途 |
| --- | --- |
| `GET /tennis/players/ranked` | 官方单打排名表 |
| `GET /tennis/players/{id}/detailed` | 生涯档案：胜负、冠军数、最高排名、奖金 |
| `GET /tennis/players/{id}/year/{season}` | 赛季发球与接发统计 |
| `GET /tennis/players/{id}/ranking` | 单打/双打逐周排名历史 |
| `GET /tennis/players/{id}/matches` | 完整单打比赛记录 |
| `GET /tennis/players/{id}/headtohead/{opp}` | 生涯交手记录与每一场比赛 |
| `GET /tennis/tournaments` | 赛程、签表、场地、奖金、冠军 |
| `GET /tennis/tournaments/{id}/{year}/matches` | 单站全部比赛（含资格赛） |

### 决定了架构的四个约束

1. **接口每页最多 100 行**，且比赛接口忽略日期过滤 → 管线用二分查找定位赛季所在页。
2. **接口拒绝跨域浏览器请求**（非 `wtatennis.com` 的 `Origin` 一律 `403`）→
   所有数据必须构建时算好，运行时不请求任何内容。
3. **限流时返回 `200` + 空数组**（不报错）→ 必须把空结果当失败重试，
   否则一次刷新会静默丢失十几个球员的排名历史。
4. **`urllib` 在本机偶发截断大响应** → HTTP 层改用 `http.client` 分块读取，
   仍失败则回退到 `curl`。

### 中文数据来源

官方接口只有英文，中文名称来自结构化开放数据：

| 数据 | 来源 |
| --- | --- |
| 球员中文名 | **Wikidata** 属性 **P597**（WTA 球员 ID） |
| 繁→简转换 | **MediaWiki `zh-hans` 变体转换器** |
| 赛事中文名 | 大满贯与 WTA 1000 人工词典 → Wikidata → 城市名规则 |
| 国家/轮次/场地/级别 | 人工术语表 |
| 约 8% 球员 | 按各语言译音规范人工校订的译名 |

Wikidata 里"中文标签"若只是拉丁名会被丢弃（否则会重复显示），空缺由人工译名补上。

---

## 项目结构

```
wta-dashboard/
├── pyscripts/                   Python 管线（仅标准库）
│   ├── wtalib.py                HTTP 客户端、限流闸门、TLS 探测、文件工具
│   ├── fetch_*.py               排名 / 档案 / 比赛 / 赛程 / 赛事赛果 / 交手 抓取
│   ├── zh_terms.py              中文术语表与助手
│   ├── fetch_zh.py              中文名（Wikidata + 变体转换）
│   ├── derive.py                排行榜、赛季胜负、生涯榜
│   ├── compact.py               历史降采样、体积裁剪
│   ├── generate_data.py         → data/dashboard.js / events.js / h2h*.js
│   ├── render.py                格式化与双语基元
│   ├── templates.py             页面外壳、页头页脚
│   ├── pages.py                 七个面板 + 两类详情页
│   ├── build_site.py            → docs/（1700+ 预渲染页面 + SEO 文件）
│   ├── check_links.py           链接检查（4500+ 页面，全部内部链接）
│   ├── verify.py                原始快照校验（29 项）
│   ├── verify_dashboard.py      数据载荷校验（46 项）
│   ├── compare_outputs.py       快照逐字段对比工具
│   ├── build.py                 全量构建编排
│   ├── refresh_rankings.py      每周轻量刷新
│   └── serve.py                 多线程预览服务器
├── site-py/assets/              样式表与社交分享图
├── data/                        生成的快照（提交入库）
└── docs/                        生成的站点（GitHub Pages 从此发布）
```

---

## 本地开发

需要 **Python 3.11+**，无需安装任何包。

```bash
# 重新生成数据与站点
python3 pyscripts/generate_data.py
python3 pyscripts/build_site.py

# 本地预览（多线程；单页会请求数百张头像）
python3 pyscripts/serve.py            # http://127.0.0.1:4174
```

### 刷新数据

```bash
# 每周轻量刷新：排名 → 赛果 → 派生 → 中文名 → 数据 → 站点 → 校验
python3 pyscripts/refresh_rankings.py

# 全量：排名、300 份档案、300 人比赛记录、赛程、签表（约 15 分钟）
python3 pyscripts/build.py

# 部分刷新
python3 pyscripts/build.py --skip-players --skip-matches

# 只校验
python3 pyscripts/verify.py && python3 pyscripts/verify_dashboard.py
```

每个抓取步骤都支持**断点续抓**：已有的记录不会重复请求，网络中断后重跑即可补齐。

环境变量：`WTA_RANK_DEPTH`（300）、`WTA_PLAYER_LIMIT`（300）、`WTA_MATCH_LIMIT`（300）、
`WTA_MATCH_FROM`（2023）、`WTA_RESULT_LIMIT`（1200）、`WTA_HISTORY_WEEKS`（261）、
`WTA_WORKERS`（4）、`WTA_CONCURRENCY`（5）、`WTA_GAP_MS`（90）。
抓取器刻意保持克制，请沿用默认值。

---

## 部署

通过 **GitHub Pages** 发布 `docs/` 目录：

1. `python3 pyscripts/build_site.py` 重新生成 `docs/`；
2. 提交并推送到默认分支；
3. **Settings → Pages** 选择 *Deploy from a branch*，分支 `main`、目录 `/docs`。

`.github/workflows/refresh.yml` 每周一自动刷新排名。

---

## 数据口径说明

- **排名周期**：WTA 每周一发布；站内日期是该快照所属的那一周。
- **名次变动**：与官方表中"相比上周"完全一致。
- **赛季胜负**：由官方比赛记录统计，剔除无比分的轮空/弃权。
- **`winner` 字段语义**：`winner` 是**负方**的位置编号（`1` 表示 `player_1` 获胜），已交叉验证。
- **冠军**：取自赛事接口；少数低级别已结束赛事官方尚未发布单打冠军。
- **ACE 球**：依赖各赛场线审技术，跨赛事不完全可比。

## 许可与署名

- **代码**：MIT，见 [LICENSE](LICENSE)。
- **数据**：不在 MIT 许可范围内。球员姓名、排名数据、赛事结果、档案文本
  版权归 **WTA Tour, Inc.** 所有，本站以署名方式用于非商业信息目的。
  官方头像直接从 WTA 图片服务器加载，本项目不再分发。

本站与 WTA **无隶属关系**。权威信息请以 [wtatennis.com](https://www.wtatennis.com) 为准。
