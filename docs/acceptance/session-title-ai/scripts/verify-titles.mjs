#!/usr/bin/env node
// Playwright verification: session list rows in /projects/:id show the same
// titles as `claude resume`. Fix references the latest `ai-title` JSONL record
// instead of falling back to the first user message.
//
// Usage:
//   node docs/acceptance/session-title-ai/scripts/verify-titles.mjs
//
// Server must be running at BASE (default http://127.0.0.1:3131).

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3131';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUND_DIR = resolve(__dirname, '..', 'round-1');
mkdirSync(ROUND_DIR, { recursive: true });

const PROJECT_ID = 'D--project-claude-code-session';

// Triples lifted from the user's `claude resume` listing: (sid prefix, expected
// title shown by claude resume, source — ai vs custom). The custom-title row
// existed before the fix; the two ai-title rows are what was broken.
const EXPECTED = [
  { prefix: '575e9779', source: 'ai-title', title: 'Add browser tab favicon' },
  { prefix: 'e6e5cbad', source: 'ai-title', title: 'Add delete button to session detail page' },
  {
    prefix: '3fe89855',
    source: 'custom-title',
    title: 'windows环境下打开页面，显示“加载项目失败: 500 Internal Server Error”',
  },
];

const results = [];
function record(id, ok, notes) {
  results.push({ id, ok, notes });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${notes}`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  await page.goto(`${BASE}/projects/${encodeURIComponent(PROJECT_ID)}`, { waitUntil: 'networkidle' });

  // The project page renders one <a> per session whose href ends with the full sid.
  // We resolve each expected prefix to its row, then read the row's visible text.
  const rowMap = await page.evaluate((expectedPrefixes) => {
    const rows = Array.from(document.querySelectorAll('a[href*="/sessions/"]'));
    const out = {};
    for (const prefix of expectedPrefixes) {
      const hit = rows.find((a) => {
        const href = a.getAttribute('href') ?? '';
        const sid = href.split('/sessions/')[1] ?? '';
        return sid.startsWith(prefix);
      });
      if (hit) {
        out[prefix] = hit.textContent ?? '';
      }
    }
    return out;
  }, EXPECTED.map((e) => e.prefix));

  for (const exp of EXPECTED) {
    const text = rowMap[exp.prefix];
    if (!text) {
      record(`row-${exp.prefix}`, false, `no row found for sid prefix ${exp.prefix}`);
      continue;
    }
    const ok = text.includes(exp.title);
    record(
      `row-${exp.prefix}`,
      ok,
      `expected (${exp.source}) "${exp.title.slice(0, 60)}…" — found in row text: ${ok}`,
    );
  }

  await page.screenshot({ path: resolve(ROUND_DIR, 'project-sessions.png'), fullPage: true });

  await browser.close();

  console.log('\n──────── Summary ────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'}  ${r.id}  ${r.notes}`);
  }
  const allOk = results.every((r) => r.ok);
  console.log(`\nResult: ${allOk ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log(`Screenshot: ${resolve(ROUND_DIR, 'project-sessions.png')}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
