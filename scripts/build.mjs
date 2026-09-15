#!/usr/bin/env node
/**
 * One-shot data build: refresh every snapshot from the official WTA API and
 * regenerate the derived aggregates.
 *
 * Usage:
 *   node scripts/build.mjs             # full refresh
 *   WTA_RANK_DEPTH=100 node scripts/build.mjs
 *   node scripts/build.mjs --skip-tournaments
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const skip = (name) => args.has(`--skip-${name}`);

const STEPS = [
  { name: 'rankings', file: 'fetch-rankings.mjs' },
  { name: 'players', file: 'fetch-players.mjs', skip: skip('players') },
  { name: 'matches', file: 'fetch-matches.mjs', skip: skip('matches') },
  { name: 'tournaments', file: 'fetch-tournaments.mjs', skip: skip('tournaments') },
  { name: 'h2h', file: 'fetch-h2h.mjs' },
  { name: 'derive', file: 'derive.mjs' },
  { name: 'compact', file: 'compact.mjs' },
].filter((s) => !s.skip);

const started = Date.now();

for (const step of STEPS) {
  console.log(`\n${'─'.repeat(64)}\n▶ ${step.file}\n${'─'.repeat(64)}`);
  const code = await new Promise((res) =>
    spawn(process.execPath, [resolve(ROOT, 'scripts', step.file)], {
      stdio: 'inherit',
      cwd: ROOT,
      env: process.env,
    }).on('close', res),
  );
  if (code !== 0) {
    console.error(`\n✗ ${step.file} exited with code ${code} — stopping.`);
    process.exit(code ?? 1);
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${'─'.repeat(64)}\n✓ Data build complete in ${secs}s\n${'─'.repeat(64)}`);
