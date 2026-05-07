#!/usr/bin/env node
// Mocked DELETE verification for A-03: after a successful deletion, the
// SessionDetail page should call navigate() back to /projects/:pid (with
// replace:true). We intercept DELETE /api/sessions and return a fake success
// payload so no real session is touched.
//
// Usage:
//   node docs/acceptance/session-detail-delete/scripts/verify-navigation.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3131';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUND_DIR = resolve(__dirname, '..', 'round-1');
mkdirSync(ROUND_DIR, { recursive: true });

const PID = 'D--project-hiq-project';
const SID_PREFIX = '7dfaf7cf';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Resolve full sid from prefix.
  const sid = await page.evaluate(async (args) => {
    const r = await fetch(`/api/projects/${encodeURIComponent(args.pid)}/sessions`);
    const list = await r.json();
    return list.find((s) => s.id.startsWith(args.prefix))?.id;
  }, { pid: PID, prefix: SID_PREFIX });
  if (!sid) throw new Error(`No session with prefix ${SID_PREFIX}`);
  console.log('Test target sid:', sid);

  // Intercept DELETE /api/sessions and return a fake success.
  let interceptedBody = null;
  await context.route('**/api/sessions', async (route, req) => {
    if (req.method() !== 'DELETE') return route.continue();
    interceptedBody = JSON.parse(req.postData() ?? '{}');
    const fake = {
      deleted: interceptedBody.items.map((it) => ({
        projectId: it.projectId,
        sessionId: it.sessionId,
        freedBytes: 12345,
        cleaned: ['jsonl', 'subdir'],
        relatedBytes: { jsonl: 100, subdir: 200, fileHistory: 300, sessionEnv: 400 },
      })),
      skipped: [],
      historyLinesRemoved: 1,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fake),
    });
  });

  // Visit detail.
  await page.goto(`${BASE}/projects/${encodeURIComponent(PID)}/sessions/${sid}`, {
    waitUntil: 'networkidle',
  });

  // Click Delete.
  const delBtn = page.locator('button:has-text("Delete"), button:has-text("删除")').first();
  await delBtn.waitFor({ state: 'visible' });
  await delBtn.click();

  // Wait for dialog.
  const dialog = page.locator('div[class*="rounded-[var(--radius-panel)]"]').first();
  await dialog.waitFor({ state: 'visible' });

  // Click confirm in footer (the danger-styled bg-[var(--color-danger)] button).
  const confirmBtn = dialog
    .locator('footer button:has-text("Delete"), footer button:has-text("删除")')
    .last();
  await confirmBtn.click();

  // The detail page's onDeleted callback fires inside the mutation's onSuccess
  // — it closes the dialog AND navigates to /projects/:pid in the same tick.
  // User sees no "Done" button; navigation is automatic.
  await page.waitForURL(`**/projects/${encodeURIComponent(PID)}`, { timeout: 5000 });
  await page.screenshot({ path: resolve(ROUND_DIR, 'a03-after-navigate.png') });

  const finalUrl = page.url();
  const navigatedOk = finalUrl.endsWith(`/projects/${encodeURIComponent(PID)}`);

  // Verify the back-button cannot return to detail (replace:true).
  await page.goBack().catch(() => {});
  await page.waitForTimeout(500);
  const afterBackUrl = page.url();
  const replaceOk = !afterBackUrl.includes(`/sessions/${sid}`);
  await page.screenshot({ path: resolve(ROUND_DIR, 'a03-after-back.png') });

  console.log('\n──────── Summary ────────');
  console.log(
    `intercepted DELETE body: ${JSON.stringify(interceptedBody)}`,
  );
  console.log(`navigated to project list: ${navigatedOk} (url=${finalUrl})`);
  console.log(`back button blocked (replace:true): ${replaceOk} (after-back url=${afterBackUrl})`);

  const ok = navigatedOk && replaceOk && interceptedBody?.items?.[0]?.sessionId === sid;
  console.log(`\n${ok ? '✅ A-03 PASS' : '❌ A-03 FAIL'}`);

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
