#!/usr/bin/env node
// Destructive verification: provisions a synthetic project under ~/.claude/projects/,
// invokes DELETE /api/projects/:id from a real browser context (so Origin is sent),
// and asserts (a) HTTP 200 + projectDirRemoved=true, (b) jsonl + dir gone, (c) the
// project disappears from /api/projects, (d) history.jsonl loses its line.
//
// We never touch a real user project. The project id is uniquely suffixed.
//
// Usage:
//   node docs/acceptance/project-list-delete/scripts/verify-destructive.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3131';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUND_DIR = resolve(__dirname, '..', 'round-1');
fs.mkdirSync(ROUND_DIR, { recursive: true });

const CLAUDE_ROOT = path.join(os.homedir(), '.claude');
const PROJECTS_ROOT = path.join(CLAUDE_ROOT, 'projects');
const HISTORY = path.join(CLAUDE_ROOT, 'history.jsonl');

const TOKEN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PROJECT_ID = `D--acceptance--project-list-delete--${TOKEN}`;
const SESSION_ID = `00000000-test-${TOKEN.slice(0, 4)}-0000-${TOKEN.padEnd(12, '0').slice(0, 12)}`;
const FAKE_CWD = `D:\\acceptance\\project-list-delete\\${TOKEN}`;
const PROJECT_DIR = path.join(PROJECTS_ROOT, PROJECT_ID);

function log(...args) {
  console.log(...args);
}

function provision() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  const jsonlLines = [
    {
      type: 'summary',
      summary: 'acceptance: synthetic project for project-list-delete',
      cwd: FAKE_CWD,
    },
    {
      uuid: '11111111-1111-1111-1111-111111111111',
      type: 'user',
      cwd: FAKE_CWD,
      timestamp: '2024-01-01T00:00:00.000Z',
      message: { role: 'user', content: 'hello acceptance' },
    },
    {
      uuid: '22222222-2222-2222-2222-222222222222',
      parentUuid: '11111111-1111-1111-1111-111111111111',
      type: 'assistant',
      cwd: FAKE_CWD,
      timestamp: '2024-01-01T00:00:01.000Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    },
  ];
  const jsonlPath = path.join(PROJECT_DIR, `${SESSION_ID}.jsonl`);
  fs.writeFileSync(jsonlPath, jsonlLines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  // Push mtime back 24h so the recent-activity guard doesn't block us.
  const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
  fs.utimesSync(jsonlPath, old, old);

  // Append a history line referencing this session id so we can confirm
  // history.jsonl rewrite removes it.
  if (fs.existsSync(HISTORY)) {
    const line = JSON.stringify({
      sessionId: SESSION_ID,
      cwd: FAKE_CWD,
      ts: Date.now(),
      acceptance: TOKEN,
    });
    fs.appendFileSync(HISTORY, line + os.EOL);
  }
  return { jsonlPath };
}

function cleanupOnFailure() {
  try {
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (fs.existsSync(HISTORY)) {
    try {
      const lines = fs.readFileSync(HISTORY, 'utf8').split(/\r?\n/);
      const filtered = lines.filter((l) => !l.includes(`"acceptance":"${TOKEN}"`));
      fs.writeFileSync(HISTORY, filtered.join(os.EOL));
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  log(`Project id: ${PROJECT_ID}`);
  log(`Session id: ${SESSION_ID}`);

  const { jsonlPath } = provision();
  log(`Provisioned ${jsonlPath}`);

  // Pre-check via API: project should now appear with sessionCount === 1
  const preList = JSON.parse(
    execFileSync('curl', ['-s', `${BASE}/api/projects`], { encoding: 'utf8' }),
  );
  const preEntry = preList.find((p) => p.id === PROJECT_ID);
  if (!preEntry || preEntry.sessionCount !== 1) {
    cleanupOnFailure();
    throw new Error(
      `Provisioned project not visible (entry=${JSON.stringify(preEntry)}, list=${preList.length})`,
    );
  }
  log(`Pre-check: project visible, sessionCount=${preEntry.sessionCount}`);

  // Run DELETE through a real browser so Origin header is set.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async ({ id }) => {
      const r = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { status: r.status, body: await r.json() };
    }, { id: PROJECT_ID });
    log(`DELETE response: status=${result.status} body=${JSON.stringify(result.body)}`);

    if (result.status !== 200) {
      throw new Error(`Expected 200, got ${result.status}`);
    }
    if (!result.body.projectDirRemoved) {
      throw new Error('Expected projectDirRemoved=true');
    }
    if (!result.body.deleted || result.body.deleted.length !== 1) {
      throw new Error(`Expected deleted.length=1, got ${result.body.deleted?.length}`);
    }
    if (result.body.deleted[0].sessionId !== SESSION_ID) {
      throw new Error(`Wrong sessionId in deleted: ${result.body.deleted[0].sessionId}`);
    }

    // Filesystem assertion
    if (fs.existsSync(PROJECT_DIR)) {
      throw new Error(`Project directory still exists: ${PROJECT_DIR}`);
    }
    if (fs.existsSync(jsonlPath)) {
      throw new Error(`jsonl still exists: ${jsonlPath}`);
    }

    // Project no longer in API list
    const postList = JSON.parse(
      execFileSync('curl', ['-s', `${BASE}/api/projects`], { encoding: 'utf8' }),
    );
    if (postList.find((p) => p.id === PROJECT_ID)) {
      throw new Error('Project still appears in /api/projects after delete');
    }
    log(`Post-check: project gone from list (count ${preList.length} → ${postList.length})`);

    // history.jsonl line removed (if we appended one)
    if (fs.existsSync(HISTORY)) {
      const text = fs.readFileSync(HISTORY, 'utf8');
      if (text.includes(`"acceptance":"${TOKEN}"`)) {
        throw new Error('history.jsonl still contains our acceptance line');
      }
      log(`history.jsonl rewrite: token line removed`);
    }
  } finally {
    await browser.close();
  }

  log('\n──────── Summary ────────');
  log('✅  A-03  full delete: 200 + projectDirRemoved=true + dir gone + list pruned + history rewritten');
  log('✅  A-06  /api/projects re-fetch reflects the removal (cache invalidation works on the API side)');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  cleanupOnFailure();
  process.exit(1);
});
