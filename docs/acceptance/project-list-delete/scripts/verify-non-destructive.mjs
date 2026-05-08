#!/usr/bin/env node
// Non-destructive Playwright verification for the Projects-index Delete flow.
// Covers A-01 (trash button visible), A-02 (idle dialog content + no blockers),
// A-04 (live/recent dialog blocker + Delete disabled), A-05 (origin check via
// curl). Does NOT confirm any deletion.
//
// Usage:
//   node docs/acceptance/project-list-delete/scripts/verify-non-destructive.mjs \
//     --idleProject=D--project-lcd-calculation \
//     --liveProject=D--project-claude-code-session
//
// Server must be running at BASE (default http://127.0.0.1:3131).

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3131';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUND_DIR = resolve(__dirname, '..', 'round-1');
mkdirSync(ROUND_DIR, { recursive: true });

const ARGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const IDLE_PID = ARGS.idleProject ?? 'D--project-lcd-calculation';
const LIVE_PID = ARGS.liveProject ?? 'D--project-claude-code-session';

const results = [];
function record(id, ok, notes) {
  results.push({ id, ok, notes });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${notes}`);
}

async function clickTrashFor(page, projectId) {
  // Trash buttons share aria-label "Delete project" / "删除项目". Pick the one
  // whose closest row link points at /projects/<projectId>.
  const buttons = page.locator('button[aria-label="Delete project"], button[aria-label="删除项目"]');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const btn = buttons.nth(i);
    const rowLink = btn.locator('xpath=ancestor::div[contains(@class,"ribbon-row")]//a').first();
    const href = await rowLink.getAttribute('href');
    if (href && href.endsWith(`/projects/${encodeURIComponent(projectId)}`)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  // ─── A-01: trash button is rendered on every row ──────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href^="/projects/"]', { timeout: 5000 });
  const rowCount = await page.locator('div.ribbon-row').count();
  const trashCount = await page
    .locator('button[aria-label="Delete project"], button[aria-label="删除项目"]')
    .count();
  await page.screenshot({ path: resolve(ROUND_DIR, 'a01-index-trash.png'), fullPage: false });
  record(
    'A-01',
    rowCount > 0 && trashCount === rowCount,
    `rows=${rowCount}, trash buttons=${trashCount}`,
  );

  // ─── A-02: idle project → dialog opens, no blocker, Delete enabled ────
  let a02ok = false;
  let a02note = '';
  const found02 = await clickTrashFor(page, IDLE_PID);
  if (!found02) {
    a02note = `idle project ${IDLE_PID} not present in index`;
  } else {
    const dialog = page.locator('div[class*="rounded-[var(--radius-panel)]"]').first();
    await dialog.waitFor({ state: 'visible', timeout: 3000 });
    const confirmBtn = dialog
      .locator('footer button:has-text("Delete project"), footer button:has-text("删除项目")')
      .last();
    // Dialog fetches sessions on open; the confirm button is disabled while
    // sessionsQuery is loading. Wait for it to settle (enabled = no blocker;
    // still disabled after 5s = blocker present, but for an idle project we
    // expect enabled).
    await page.waitForFunction((el) => el && !el.disabled, await confirmBtn.elementHandle(), {
      timeout: 5000,
    }).catch(() => {});
    const dialogText = await dialog.innerText();
    const hasTitle = /Delete project|删除项目/.test(dialogText);
    const hasWarning = /removes every session|删除 .* 下的全部会话/.test(dialogText);
    const hasBlocker = /are live or were modified|个会话正在运行/.test(dialogText);
    const confirmEnabled = await confirmBtn.isEnabled();
    await page.screenshot({ path: resolve(ROUND_DIR, 'a02-idle-dialog.png'), fullPage: false });
    a02ok = hasTitle && hasWarning && !hasBlocker && confirmEnabled;
    a02note = `title=${hasTitle} warning=${hasWarning} blocker=${hasBlocker} confirmEnabled=${confirmEnabled}`;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  record('A-02', a02ok, a02note);

  // ─── A-04: live/recent project → blocker banner + Delete disabled ─────
  let a04ok = false;
  let a04note = '';
  const found04 = await clickTrashFor(page, LIVE_PID);
  if (!found04) {
    a04note = `live project ${LIVE_PID} not present in index`;
  } else {
    const dialog = page.locator('div[class*="rounded-[var(--radius-panel)]"]').first();
    await dialog.waitFor({ state: 'visible', timeout: 3000 });
    // Wait for the blocker banner to appear (sessionsQuery resolved with a live/recent hit).
    await dialog
      .locator('text=/are live or were modified|个会话正在运行/')
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    const dialogText = await dialog.innerText();
    const hasBlocker = /are live or were modified|个会话正在运行/.test(dialogText);
    const confirmBtn = dialog
      .locator('footer button:has-text("Delete project"), footer button:has-text("删除项目")')
      .last();
    const confirmDisabled = await confirmBtn.isDisabled();
    await page.screenshot({ path: resolve(ROUND_DIR, 'a04-live-blocker.png'), fullPage: false });
    a04ok = hasBlocker && confirmDisabled;
    a04note = `blocker=${hasBlocker} confirmDisabled=${confirmDisabled}`;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  record('A-04', a04ok, a04note);

  await browser.close();

  // ─── A-05: curl without Origin → 403, against a definitely-bogus id ────
  let a05ok = false;
  let a05note = '';
  try {
    const out = execFileSync(
      'curl',
      [
        '-s',
        '-o',
        '-',
        '-w',
        '\n___STATUS=%{http_code}',
        '-X',
        'DELETE',
        `${BASE}/api/projects/__definitely_not_a_real_project__`,
      ],
      { encoding: 'utf8' },
    );
    const status = /___STATUS=(\d+)/.exec(out)?.[1];
    const body = out.replace(/\n___STATUS=\d+\s*$/, '');
    a05ok = status === '403' && /origin not allowed/.test(body);
    a05note = `status=${status} body=${body.trim().slice(0, 80)}`;
  } catch (e) {
    a05note = `curl failed: ${e.message}`;
  }
  record('A-05', a05ok, a05note);

  console.log('\n──────── Summary ────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'}  ${r.id}  ${r.notes}`);
  }
  const allOk = results.every((r) => r.ok);
  console.log(`\nResult: ${allOk ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log(`Screenshots saved to: ${ROUND_DIR}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
