#!/usr/bin/env node
// Playwright verification: session list rows skip slash-command markup
// (`<command-name>/clear</command-name>...`, etc.) and fall through to the
// first real user prompt. Also confirms ai-title is captured in the session
// detail endpoint (previous round only updated the list path).
//
// Usage:
//   node docs/acceptance/session-title-slash-skip/scripts/verify-titles.mjs
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

const HIQ = 'D--project-hiq-project';
const CCS = 'D--project-claude-code-session';
const DOC = 'D--project-doc-first-dev';

// Cases for the slash-skip fix: each entry is a sid prefix + the substring
// the row text MUST contain after the fix. customTitle / aiTitle hits act as
// regression guards alongside the new slash-skip recoveries.
const LIST_CASES = [
  // === D--project-hiq-project: was showing <command-name>/clear|/model|/login
  { proj: HIQ, prefix: '7dfaf7cf', expect: '帮我分析分析这个pr', kind: 'slash-skip' },
  { proj: HIQ, prefix: 'b093dcb5', expect: '查看这三个代码仓库', kind: 'slash-skip' },
  { proj: HIQ, prefix: '24b1d800', expect: '我发现两个fast flow', kind: 'slash-skip' },
  { proj: HIQ, prefix: 'ee017991', expect: 'worktree-flow-scaffold', kind: 'custom-title (regression)' },

  // === D--project-doc-first-dev: tests the <command-message>-first shape
  { proj: DOC, prefix: '69eb2882', expect: 'Please analyze this codebase', kind: 'slash-skip (msg-first shape)' },
  { proj: DOC, prefix: '75cd9f6d', expect: '(untitled)', kind: 'genuinely empty → (untitled)' },

  // === D--project-claude-code-session: regression for previous round (ai-title)
  { proj: CCS, prefix: '575e9779', expect: 'Add browser tab favicon', kind: 'ai-title (regression)' },
  { proj: CCS, prefix: '3fe89855', expect: 'windows环境下打开页面', kind: 'custom-title (regression)' },
];

// Detail-page case: confirms loadSessionDetail now reads ai-title (the gap
// from previous round). 575e7779 has no customTitle, has 32 ai-title records.
const DETAIL_AITITLE_PROJ = CCS;
const DETAIL_AITITLE_PREFIX = '575e9779';
const DETAIL_AITITLE_EXPECT = 'Add browser tab favicon';

const results = [];
function record(id, ok, notes) {
  results.push({ id, ok, notes });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${notes}`);
}

async function readListRows(page, projectId, prefixes) {
  await page.goto(`${BASE}/projects/${encodeURIComponent(projectId)}`, { waitUntil: 'networkidle' });
  return page.evaluate((wanted) => {
    const rows = Array.from(document.querySelectorAll('a[href*="/sessions/"]'));
    const out = {};
    for (const prefix of wanted) {
      const hit = rows.find((a) => {
        const href = a.getAttribute('href') ?? '';
        const sid = href.split('/sessions/')[1] ?? '';
        return sid.startsWith(prefix);
      });
      if (hit) out[prefix] = hit.textContent ?? '';
    }
    return out;
  }, prefixes);
}

async function resolveFullSid(page, projectId, prefix) {
  return page.evaluate(async ({ base, projectId, prefix }) => {
    const r = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/sessions`);
    const list = await r.json();
    return (list.find((s) => s.id.startsWith(prefix)) || {}).id ?? null;
  }, { base: BASE, projectId, prefix });
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  // Group cases by project so we only navigate once per page.
  const byProject = new Map();
  for (const c of LIST_CASES) {
    if (!byProject.has(c.proj)) byProject.set(c.proj, []);
    byProject.get(c.proj).push(c);
  }

  for (const [proj, cases] of byProject) {
    const rows = await readListRows(
      page,
      proj,
      cases.map((c) => c.prefix),
    );
    for (const c of cases) {
      const text = rows[c.prefix];
      if (!text) {
        record(`${proj}/${c.prefix}`, false, `no row found (${c.kind})`);
        continue;
      }
      const ok = text.includes(c.expect);
      record(
        `${proj}/${c.prefix}`,
        ok,
        `${c.kind} → expected "${c.expect}" found=${ok}`,
      );
    }
    await page.screenshot({
      path: resolve(ROUND_DIR, `list-${proj}.png`),
      fullPage: true,
    });
  }

  // Detail-page check for the previous-round ai-title gap.
  const fullSid = await resolveFullSid(page, DETAIL_AITITLE_PROJ, DETAIL_AITITLE_PREFIX);
  if (!fullSid) {
    record('detail-ai-title', false, `could not resolve sid prefix ${DETAIL_AITITLE_PREFIX}`);
  } else {
    await page.goto(
      `${BASE}/projects/${encodeURIComponent(DETAIL_AITITLE_PROJ)}/sessions/${fullSid}`,
      { waitUntil: 'networkidle' },
    );
    const headerText = await page.locator('body').innerText();
    const ok = headerText.includes(DETAIL_AITITLE_EXPECT);
    record(
      'detail-ai-title',
      ok,
      `session detail header includes "${DETAIL_AITITLE_EXPECT}" → ${ok}`,
    );
    await page.screenshot({
      path: resolve(ROUND_DIR, `detail-ai-title.png`),
      fullPage: false,
    });
  }

  await browser.close();

  console.log('\n──────── Summary ────────');
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'}  ${r.id}  ${r.notes}`);
  const allOk = results.every((r) => r.ok);
  console.log(`\nResult: ${allOk ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log(`Screenshots: ${ROUND_DIR}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
