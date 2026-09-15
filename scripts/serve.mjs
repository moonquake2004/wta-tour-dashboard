#!/usr/bin/env node
/**
 * Zero-dependency static file server for local development.
 *
 *   node scripts/serve.mjs [port]     # serves docs/ (the assembled site)
 *   WTA_SERVE=site node scripts/serve.mjs
 *
 * ES modules cannot be loaded over file://, so the site must be previewed over
 * HTTP.  This server exists only for local preview; production is GitHub Pages.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { ROOT } from './lib.mjs';

const port = Number(process.argv[2] || process.env.PORT || 4173);
const source = process.env.WTA_SERVE === 'site' ? 'site' : 'docs';
const root = resolve(ROOT, source);

if (source === 'docs') {
  // `docs/` needs the data folder too; assemble it if it is missing.
  try {
    await stat(join(root, 'data'));
  } catch {
    console.error('docs/data is missing — run `node scripts/site.mjs` first.');
    process.exit(1);
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, safe);

    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info) {
      // Fall back to the entry point so deep links work in dev too.
      file = join(root, 'index.html');
      info = await stat(file);
    }

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Server error: ${err.message}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`▶ Serving ${source}/ at http://127.0.0.1:${port}/`);
});
