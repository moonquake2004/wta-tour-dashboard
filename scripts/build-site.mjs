#!/usr/bin/env node
/**
 * Assemble the publishable dashboard.
 *
 * The site is a single self-contained index.html plus two static assets and the
 * generated data files — no runtime fetches, no build step for the browser.
 *
 *   node scripts/build-site.mjs          # → docs/
 */
import { cp, mkdir, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, DATA_DIR } from './lib.mjs';

const SRC = resolve(ROOT, 'site-v2');
const OUT = resolve(ROOT, 'docs');

console.log('▶ Assembling dashboard into docs/');

if (!existsSync(resolve(SRC, 'index.html'))) {
  console.error('✗ site-v2/index.html is missing');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1. Static shell
await cp(SRC, OUT, { recursive: true });
console.log('  ✓ site-v2/ → docs/');

// 2. Generated data (dashboard.js + h2h.js are the only files the page loads)
await mkdir(resolve(OUT, 'data'), { recursive: true });
const wanted = ['dashboard.js', 'h2h.js', 'h2h-matches.js'];
for (const f of wanted) {
  if (!existsSync(resolve(DATA_DIR, f))) {
    console.error(`✗ data/${f} is missing — run scripts/generate-data.mjs first`);
    process.exit(1);
  }
  await cp(resolve(DATA_DIR, f), resolve(OUT, 'data', f));
}
console.log(`  ✓ data/ → docs/data/ (${wanted.join(', ')})`);

// 3. Cache-busting stamp, matching the reference project's ?v= convention
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
let html = await readFile(resolve(OUT, 'index.html'), 'utf8');
html = html
  .replace('assets/css/style.css', `assets/css/style.css?v=${stamp}`)
  .replace('assets/js/app.js', `assets/js/app.js?v=${stamp}`)
  .replace('data/dashboard.js', `data/dashboard.js?v=${stamp}`)
  .replace('data/h2h.js', `data/h2h.js?v=${stamp}`);
await writeFile(resolve(OUT, 'index.html'), html, 'utf8');
console.log(`  ✓ cache-busting stamp ${stamp}`);

// 4. SEO companions
await writeFile(
  resolve(OUT, 'robots.txt'),
  'User-agent: *\nAllow: /\nSitemap: https://moonquake2004.github.io/wta-tour-dashboard/sitemap.xml\n',
  'utf8',
);
await writeFile(
  resolve(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/#rankings</loc><priority>0.8</priority></url>
  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/#players</loc><priority>0.8</priority></url>
  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/#schedule</loc><priority>0.7</priority></url>
  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/#results</loc><priority>0.7</priority></url>
  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/#stats</loc><priority>0.6</priority></url>
  <url><loc>https://moonquake2004.github.io/wta-tour-dashboard/#h2h</loc><priority>0.6</priority></url>
</urlset>
`,
  'utf8',
);
// Jekyll must not process the generated data directory.
await writeFile(resolve(OUT, '.nojekyll'), '', 'utf8');
console.log('  ✓ robots.txt · sitemap.xml · .nojekyll');

console.log('✓ Dashboard assembled.');
