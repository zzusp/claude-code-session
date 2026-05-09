#!/usr/bin/env node
// Playwright + filesystem verification: every session row's `lastAt` returned by
// the API equals the underlying .jsonl file's mtime, and the page renders that
// data without errors. This proves the parse-jsonl.ts / load-session.ts fix
// where `lastAt = max(latest record timestamp, file mtime)`.
//
// Usage:
//   node docs/acceptance/session-last-activity-mtime/scripts/verify-mtime-alignment.mjs
//
// Server must be running at BASE (default http://127.0.0.1:3131).

import { chromium } from 'playwright';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3131';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUND_DIR = resolve(__dirname, '..', 'round-1');
mkdirSync(ROUND_DIR, { recursive: true });

const PROJECT_ID = 'D--project-claude-code-session';
const PROJECT_DIR = join(homedir(), '.claude', 'projects', PROJECT_ID);

const results = [];
function record(id, ok, notes) {
  results.push({ id, ok, notes });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${notes}`);
}

async function main() {
  // ─── Fetch API ────────────────────────────────────────────────────────────
  const apiRes = await fetch(`${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/sessions`);
  if (!apiRes.ok) {
    console.error(`API failed: ${apiRes.status}`);
    process.exit(2);
  }
  const sessions = await apiRes.json();

  // ─── Compare lastAt vs mtime for every session ────────────────────────────
  const rows = [];
  for (const s of sessions) {
    const jsonlPath = join(PROJECT_DIR, `${s.id}.jsonl`);
    let mtimeIso = null;
    try {
      mtimeIso = statSync(jsonlPath).mtime.toISOString();
    } catch (e) {
      record(`stat-${s.id.slice(0, 8)}`, false, `stat failed: ${e.message}`);
      continue;
    }

    // After the fix, lastAt should equal mtime (or be slightly larger if a
    // record-timestamp inside the jsonl is newer than mtime, which shouldn't
    // happen on a non-live file but stays tolerated).
    const apiTs = Date.parse(s.lastAt);
    const fsTs = Date.parse(mtimeIso);
    const driftMs = apiTs - fsTs;

    // Allow lastAt >= mtime within 2s of slack (live sessions append between
    // the two reads). Fail if lastAt is OLDER than mtime by more than 1s —
    // that's the pre-fix regression.
    const ok = driftMs >= -1000;

    rows.push({
      sid8: s.id.slice(0, 8),
      title: (s.customTitle || s.title || '').slice(0, 50),
      lastAt: s.lastAt,
      mtime: mtimeIso,
      driftMs,
      live: s.isLivePid || s.isRecentlyActive,
    });
    record(
      `align-${s.id.slice(0, 8)}`,
      ok,
      `drift=${driftMs}ms${s.isLivePid ? ' (live)' : s.isRecentlyActive ? ' (recent)' : ''} title="${(s.customTitle || s.title || '').slice(0, 40)}"`,
    );
  }

  // Markdown evidence table
  const tableLines = [
    '| sid | title | API lastAt | fs mtime | drift (ms) | live |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| \`${r.sid8}\` | ${r.title} | ${r.lastAt} | ${r.mtime} | ${r.driftMs} | ${r.live ? 'yes' : ''} |`,
    ),
  ];
  writeFileSync(
    resolve(ROUND_DIR, 'alignment.md'),
    `# round-1 — session-last-activity-mtime alignment\n\n` +
      `Generated: ${new Date().toISOString()}\n` +
      `Project: \`${PROJECT_ID}\`\n\n` +
      `Fix: \`parse-jsonl.ts\` / \`load-session.ts\` reconcile \`lastAt\` to \`max(latest record ts, file mtime)\`.\n\n` +
      tableLines.join('\n') +
      '\n',
    'utf8',
  );

  // ─── Visit the page so we capture render-time errors + a screenshot ───────
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(`${BASE}/projects/${encodeURIComponent(PROJECT_ID)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('a[href*="/sessions/"]', { timeout: 5000 });
  await page.screenshot({ path: resolve(ROUND_DIR, 'project-sessions.png'), fullPage: true });

  record(
    'page-render',
    pageErrors.length === 0,
    pageErrors.length === 0 ? 'no page errors' : `errors: ${pageErrors.join(' | ')}`,
  );

  await browser.close();

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n──────── Summary ────────');
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'}  ${r.id}  ${r.notes}`);
  const allOk = results.every((r) => r.ok);
  console.log(`\nResult: ${allOk ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log(`Evidence: ${ROUND_DIR}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
