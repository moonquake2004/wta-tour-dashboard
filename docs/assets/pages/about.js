/**
 * Data & methodology — provenance, refresh cadence and licensing.
 */
import { loading, pair, pageHead } from '../ui.js';
import { esc } from '../utils.js';
import { setTitle } from '../app.js';

export const skeleton = () => loading(8);

export async function render(host, _params, ctx) {
  setTitle('Data');

  host.innerHTML = `
  ${pageHead({
    eyebrow: 'Methodology · 数据方法论',
    title: pair('每一个数字的来源', 'Where every number comes from'),
    sub: `本站是 WTA 已发布数据的只读呈现。没有任何建模、估算或插补——官方接口里没有的数字，本站就不会出现。<br>
    <span style="opacity:.7;font-size:13px">A read-only view of data the WTA already publishes. If a figure is not in the official feed, it is not on this site.</span>`,
  })}

  <div class="grid c2">
    <div class="card">
      <div class="card-hd"><h3>${pair('主要数据源', 'Primary source')}</h3></div>
      <div class="card-bd">
        <p class="prose">全部数据取自 <b>wtatennis.com</b>（Hologic WTA 巡回赛官方网站）
        背后的公开 JSON 接口：<br>
        <span style="opacity:.75">All data is retrieved from the public JSON API that powers the official WTA website.</span></p>
        <div class="notice mt4" style="border-left-color:var(--clay)">
          <code style="font-family:var(--font-mono);font-size:12px;word-break:break-all">https://api.wtatennis.com/tennis</code>
        </div>
        <p class="prose mt4">官网自己调用的同一份数据，在每次构建时请求一次并写入静态文件。
        不爬取 HTML、不使用第三方数据商、不手工转录。<br>
        <span style="opacity:.75">The same payloads the official site consumes are requested once per build and written to static files.</span></p>
      </div>
    </div>

    <div class="card">
      <div class="card-hd"><h3>${pair('使用的接口', 'Endpoints used')}</h3></div>
      <div class="card-bd flush">
        ${endpoint('/players/ranked', 'Official singles ranking table (rank, points, movement, events played)')}
        ${endpoint('/players/{id}/detailed', 'Biography record: career W–L, titles, career-high rank, prize money')}
        ${endpoint('/players/{id}/year/{season}', 'Season serve &amp; return statistics')}
        ${endpoint('/players/{id}/ranking', 'Week-by-week singles and doubles ranking history')}
        ${endpoint('/players/{id}/matches', 'Complete singles and doubles match log')}
        ${endpoint('/players/{id}/headtohead/{opponent}', 'Career head-to-head record and every meeting')}
        ${endpoint('/tournaments', 'Tour calendar with draws, surfaces, prize money and champions')}
      </div>
    </div>
  </div>

  <section class="sec">
    <div class="sec-hd"><div><span class="eyebrow">Pipeline · 构建流程</span><h2>${pair('站点如何构建', 'How the site is built')}</h2></div></div>
    <div class="grid c4">
      ${step('01', pair('抓取', 'Fetch'), pair('Node 脚本以受限并发和指数退避请求官方接口，自动重试临时故障。', 'A Node script walks the official API with a politeness gate and exponential backoff.'))}
      ${step('02', pair('归一化', 'Normalise'), pair('原始数据裁剪为本看板实际渲染的字段，并使用稳定的短键控制体积。', 'Raw payloads are trimmed to the fields this dashboard renders, with stable short keys.'))}
      ${step('03', pair('派生', 'Derive'), pair('排行榜、赛季胜负与生涯领跑榜完全由巡回赛已发布的字段计算得出。', 'Leaderboards, season W–L and career leaders are computed only from published fields.'))}
      ${step('04', pair('发布', 'Publish'), pair('全部写成静态 JSON，配合零依赖前端，由 GitHub Pages 提供服务。', 'Everything is written as static JSON next to a dependency-free front end.'))}
    </div>
  </section>

  <section class="sec">
    <div class="grid c2">
      <div class="card">
        <div class="card-hd"><h3>${pair('口径说明', 'Interpretation notes')}</h3></div>
        <div class="card-bd">
          <ul class="prose" style="padding-left:18px;margin:0">
            <li><b>排名周期 / Ranking weeks.</b> WTA 每周一发布排名。站内展示的日期是该快照所属的那一周，而不是下载日期。</li>
            <li><b>名次变动 / Movement.</b> 箭头对比的是官方表中的"与上周相比"，与原表完全一致。</li>
            <li><b>比赛记录 / Match records.</b> 球员页的赛季胜负由官方比赛记录统计，剔除没有比分的轮空与弃权，因此能与官方赛季战绩对齐。</li>
            <li><b>交手记录 / Head-to-head.</b> 来自已存比赛窗口内的全部交手，由构建时预计算（WTA 接口拒绝跨域浏览器请求）。</li>
            <li><b>ACE 球 / Aces.</b> 依赖各赛场的线审技术，跨赛事不完全可比。</li>
            <li><b>生涯数据 / Career figures.</b> 最高排名、冠军数、奖金逐字取自 WTA 官方档案，球员页会显示官方"最后更新"日期。</li>
            <li><b>文字内容 / Prose.</b> 球员档案、生涯亮点与赛季回顾由 WTA 以英文发布，本站保留英文原文（已明确标注），结构与统计部分则全部中英对照。</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h3>${pair('数据覆盖', 'Coverage')}</h3></div>
        <div class="card-bd flush">
          ${coverage(pair('单打排名', 'Singles ranking'), pair('前 300 位球员，官方当周榜单', 'Top 300 players, current published week'))}
          ${coverage(pair('球员档案', 'Player biographies'), pair('前 300 位球员', 'Top 300 players'))}
          ${coverage(pair('赛季统计', 'Season statistics'), pair('前 300 位球员，当前赛季', 'Top 300 players, current season'))}
          ${coverage(pair('排名历史', 'Ranking history'), pair('前 300 位球员，近五年逐周', 'Top 300 players, trailing five years, weekly'))}
          ${coverage(pair('比赛记录', 'Match logs'), pair('前 120 位球员，2023 年至今', 'Top 120 players, 2023 onwards'))}
          ${coverage(pair('赛程日历', 'Tour calendar'), pair('本赛季与上赛季，全部主巡回赛级别', 'Current and previous season, all main-tour levels'))}
          ${coverage(pair('交手记录', 'Head-to-head'), pair('已存比赛窗口内的任意两位球员', 'Every pairing inside the stored match window'))}
          ${coverage(pair('中英文对照', 'Bilingual names'), pair('球员、赛事、国家/地区、轮次、场地全部中英对照', 'Players, tournaments, countries, rounds and surfaces in both languages'))}
        </div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-hd"><div><span class="eyebrow">Bilingual data · 中文数据</span>
      <h2>${pair('中文名称从哪里来', 'Where the Chinese names come from')}</h2></div></div>
    <div class="grid c2">
      <div class="card">
        <div class="card-hd"><h3>${pair('数据源', 'Sources')}</h3></div>
        <div class="card-bd flush">
          ${coverage(pair('球员中文名', 'Player names'), pair('Wikidata（属性 P597 = WTA 球员 ID）', 'Wikidata, property P597 (WTA player id)'))}
          ${coverage(pair('简体化', 'Simplification'), pair('MediaWiki zh-hans 变体转换', 'MediaWiki zh-hans variant conversion'))}
          ${coverage(pair('赛事中文名', 'Tournament names'), pair('大满贯/1000 赛手工校对 + Wikidata + 城市名规则', 'Curated for the majors + Wikidata + city rules'))}
          ${coverage(pair('国家/地区', 'Countries'), pair('国际奥委会代码对照表（117 个）', 'IOC code table (117 entries)'))}
          ${coverage(pair('轮次与场地', 'Rounds &amp; surfaces'), pair('网球术语表（决赛 / 16 强 / 红土…）', 'Curated tennis terminology'))}
          ${coverage(pair('少量球员译名', 'Remaining players'), pair('约 8% 的球员 Wikidata 无中文标签，采用人工校订译名', '~8% had no Wikidata label and use curated transliterations'))}
        </div>
      </div>
      <div class="card">
        <div class="card-hd"><h3>${pair('覆盖与限制', 'Coverage &amp; caveats')}</h3></div>
        <div class="card-bd">
          <p class="prose">当前快照中，<b>300 / 300</b> 位排名球员、<b>670</b> 个赛事名称（覆盖比赛记录中
          <b>100%</b> 的场次）、<b>61 / 61</b> 个国家/地区代码都有中文名称。</p>
          <p class="prose mt3" style="opacity:.8">In the current snapshot every ranked player, every
          tournament appearing in the match logs and every country code has a Chinese name.</p>
          <div class="notice mt4">
            ${pair(
              '说明：中文球员译名以 Wikidata 中文标签为准（中国网球媒体常用译名），并通过 zh-hans 变体转换为简体。若与某些媒体的惯用译名不同，属正常差异。',
              'Chinese player names follow Wikidata labels (the names Chinese tennis media use), normalised to Simplified Chinese. Minor differences from individual outlets are expected.',
            )}
          </div>
          <p class="prose mt4" style="font-size:12.5px;opacity:.75">
            ${pair(
              '赛事中文名中，250/125 级别与 ITF 赛事数量庞大且译名不统一，采用"城市名 + 公开赛"的规则化译法，并始终同时显示英文原名以便核对——完整性与可核对性优先于措辞。',
              'For the large number of 125-level and ITF events, names are rule-generated from the host city and always shown next to the official English name, so verifiability beats wording.',
            )}
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="grid c2">
      <div class="card">
        <div class="card-hd"><h3>${pair('许可与署名', 'Licensing &amp; attribution')}</h3></div>
        <div class="card-bd">
          <p class="prose">Player names, ranking data, tournament results and
          biographical text are the property of <b>WTA Tour, Inc.</b> and are used here
          for non-commercial, informational purposes with attribution. Official headshots
          are loaded directly from the WTA's own image host and are not redistributed by
          this project.</p>
          <p class="prose mt4">This site is an independent project. It is
          <b>not affiliated with, endorsed by, or sponsored by the WTA</b>. For
          authoritative information always consult
          <a href="https://www.wtatennis.com" target="_blank" rel="noopener" style="color:var(--clay-soft)">wtatennis.com</a>.</p>
          <p class="prose mt4">The dashboard's own source code is released under the MIT
          licence. The data is <b>not</b> covered by that licence.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h3>${pair('技术实现', 'Technical')}</h3></div>
        <div class="card-bd flush">
          ${coverage(pair('前端', 'Front end'), pair('原生 JavaScript ES 模块——无框架、无构建步骤', 'Vanilla JavaScript ES modules — no framework, no build step'))}
          ${coverage(pair('图表', 'Charts'), pair('手写 SVG，零依赖', 'Hand-rolled SVG, dependency free'))}
          ${coverage(pair('字体', 'Typography'), pair('系统字体栈（New York / SF Pro / SF Mono）', 'System font stack'))}
          ${coverage(pair('托管', 'Hosting'), pair('GitHub Pages，纯静态文件', 'GitHub Pages, static files only'))}
          ${coverage(pair('Cookie', 'Cookies'), pair('无。无分析、无跟踪、无第三方脚本', 'None. No analytics, no trackers'))}
          ${coverage(pair('渲染', 'Rendering'), pair('完全客户端渲染；JSON 缓存后可离线使用', 'Fully client side'))}
        </div>
      </div>
    </div>
  </section>
  `;
}

function endpoint(path, note) {
  return `<div style="padding:11px 20px;border-bottom:1px solid var(--line-soft)">
    <code style="font-family:var(--font-mono);font-size:12px;color:var(--clay-soft);word-break:break-all">${esc(
      path,
    )}</code>
    <div class="dim" style="font-size:12px;margin-top:3px">${note}</div>
  </div>`;
}

function coverage(labelHtml, valueHtml) {
  return `<div style="display:flex;justify-content:space-between;gap:var(--sp-4);padding:10px 20px;border-bottom:1px solid var(--line-soft)">
    <span class="dim" style="font-size:12.5px">${labelHtml}</span>
    <span style="font-size:12.5px;text-align:right">${valueHtml}</span>
  </div>`;
}

function step(n, titleHtml, bodyHtml) {
  return `<div class="card"><div class="card-bd">
    <span class="num" style="font-size:24px;color:var(--clay);letter-spacing:-0.04em">${esc(n)}</span>
    <h3 style="font-size:16px;margin-top:8px">${titleHtml}</h3>
    <p class="dim" style="font-size:12.5px;margin:8px 0 0;line-height:1.6">${bodyHtml}</p>
  </div></div>`;
}
