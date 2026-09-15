#!/usr/bin/env node
/**
 * Assemble the publishable site into `docs/`.
 *
 * GitHub Pages serves the `docs/` folder of the default branch, so everything
 * the browser needs — HTML, CSS, ES modules and the JSON snapshots — is copied
 * there.  Source files stay in `site/` and `scripts/`.
 */
import { cp, mkdir, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, DATA_DIR } from './lib.mjs';

const SITE = resolve(ROOT, 'site');
const OUT = resolve(ROOT, 'docs');

console.log('▶ Assembling publishable site into docs/');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1. Copy the static front end, preserving the assets/ layout.
await cp(SITE, OUT, { recursive: true });
console.log('  ✓ site/ → docs/');

// 2. Copy the data snapshots next to the site, under docs/data.
await mkdir(resolve(OUT, 'data'), { recursive: true });
// `h2h.json` is kept in the repository for transparency and for anyone
// consuming the snapshots directly, but the browser reads the bundled
// `assets/h2h-data.js` instead — no point shipping the same 3.6 MB twice.
const SITE_EXCLUDED = new Set(['h2h.json']);
const dataFiles = (await readdir(DATA_DIR)).filter(
  (f) => f.endsWith('.json') && !SITE_EXCLUDED.has(f),
);
for (const f of dataFiles) {
  await cp(resolve(DATA_DIR, f), resolve(OUT, 'data', f));
}
console.log(`  ✓ data/ → docs/data/ (${dataFiles.length} files)`);

// 3. Stamp the build id so cache busting is automatic on every deploy.
const meta = {
  buildId: new Date().toISOString(),
  rankingsAsOf: null,
};
try {
  const rank = JSON.parse(await readFile(resolve(DATA_DIR, 'rankings-singles.json'), 'utf8'));
  meta.rankingsAsOf = rank.asOf;
  meta.playersRanked = rank.depth;
} catch {
  /* the build id alone is enough */
}
await writeFile(resolve(OUT, 'build.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

const stamp = `/* generated ${meta.buildId} */\nwindow.__WTA_BUILD__ = ${JSON.stringify(
  meta.buildId,
)};\n`;
await writeFile(resolve(OUT, 'assets', 'build.js'), stamp, 'utf8');
console.log('  ✓ build stamp written');

// 4. A tiny 404 page that bounces deep links back into the hash router.
const notFound = `<!doctype html><meta charset="utf-8">
<script>location.replace('/' + location.pathname.split('/').slice(1, 2).join('/') + '/#/' + location.pathname.split('/').slice(2).join('/'));</script>`;
await writeFile(resolve(OUT, '404.html'), notFound, 'utf8');

if (!existsSync(resolve(OUT, 'index.html'))) {
  console.error('✗ docs/index.html missing — copy failed');
  process.exit(1);
}

console.log('✓ Site assembled.');
