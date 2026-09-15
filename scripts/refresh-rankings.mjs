#!/usr/bin/env node
/**
 * Fast refresh: rankings only.
 *
 * Rankings are published weekly, so a light refresh needs just two API calls
 * plus the derived aggregates.  Everything else (biographies, match logs,
 * calendar) changes slowly and is handled by the full build.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT } from './lib.mjs';

const STEPS = ['fetch-rankings.mjs', 'derive.mjs'];

for (const file of STEPS) {
  console.log(`\n▶ ${file}`);
  const code = await new Promise((res) =>
    spawn(process.execPath, [resolve(ROOT, 'scripts', file)], {
      stdio: 'inherit',
      cwd: ROOT,
      env: process.env,
    }).on('close', res),
  );
  if (code !== 0) process.exit(code ?? 1);
}

console.log('\n✓ Rankings refreshed.');
