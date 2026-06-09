// Round-1 e2e for the version update notice + one-click self-update.
//
// Server must be running on 127.0.0.1:<port> (prod: `npm run build` then
// `npm run start`). Usage:
//   PORT=3131 node docs/acceptance/version-update-notice/scripts/e2e.mjs
//
// SAFETY: the real `POST /api/version/update` is only exercised with bad/absent
// Origin (→ 403, short-circuits before any npm install). The success/failure
// update flows are driven entirely through Playwright route mocks, so this test
// NEVER runs `npm install -g`.
//
// Outputs:
//   - stdout pass/fail per item
//   - docs/acceptance/version-update-notice/round-1/screenshots/*.png
//   - docs/acceptance/version-update-notice/round-1/verdict.json

import { chromium, expect } from 'playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUND = process.env.ROUND || 'round-1';
const ROUND_DIR = path.resolve(__dirname, '..', ROUND);
const SHOTS_DIR = path.join(ROUND_DIR, 'screenshots');
const PORT = process.env.PORT || '3131';
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;

const REPO_URL = 'https://github.com/zzusp/claude-code-session';
const RELEASE_URL = `${REPO_URL}/releases/tag/v1.2.0`;
const NOTES = '## v1.2.0\n\n- ADDED_VERSION_NOTICE\n- fixed CCSM_FAKE_BUG';

const results = [];
function record(id, name, status, note = '') {
  results.push({ id, name, status, note });
  const tag = status === 'pass' ? '[PASS]' : '[FAIL]';
  console.log(`${tag} ${id}  ${name}${note ? ' — ' + note : ''}`);
}
async function check(id, name, fn) {
  try {
    await fn();
    record(id, name, 'pass');
  } catch (err) {
    record(id, name, 'fail', String(err.message || err).split('\n')[0]);
  }
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });
  await runApi();
  await runUi();

  await writeFile(
    path.join(ROUND_DIR, 'verdict.json'),
    JSON.stringify({ at: new Date().toISOString(), port: PORT, results }, null, 2),
  );
  const failed = results.filter((r) => r.status === 'fail');
  console.log(`\n${results.length} checks, ${failed.length} failure(s).`);
  process.exit(failed.length ? 1 : 0);
}

// ── Real-server API: shape + CSRF guards (no npm install is ever triggered) ──
async function runApi() {
  await check('A-01', 'GET /api/version → 200, current string + repositoryUrl + boolean hasUpdate', async () => {
    const res = await fetch(`${BASE}/api/version`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.current).toBe('string');
    expect(body.repositoryUrl).toBe(REPO_URL);
    expect(typeof body.hasUpdate).toBe('boolean');
  });

  await check('A-02', 'GET baseline hasUpdate=false (current==latest v1.0.0 release)', async () => {
    const body = await (await fetch(`${BASE}/api/version`)).json();
    // If GitHub is unreachable, checkError is set and hasUpdate is still false — both acceptable.
    expect(body.hasUpdate).toBe(false);
  });

  await check('A-03', 'POST /api/version/update without Origin → 403', async () => {
    const res = await fetch(`${BASE}/api/version/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(403);
  });

  await check('A-04', 'POST /api/version/update foreign Origin → 403', async () => {
    const res = await fetch(`${BASE}/api/version/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example.com' },
    });
    expect(res.status).toBe(403);
  });
}

// ── UI: every /api/version* call is mocked → deterministic, offline-safe ─────
async function runUi() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // Mutable mock state, swapped between scenarios.
  let versionResponse = updateAvailable();
  let updateResponse = { ok: true, fromVersion: '1.0.0', toVersion: '1.2.0', output: 'changed 1 package', restartRequired: true };
  let updatePostCount = 0;

  // Register version (GET) first, then the more specific /update so it is matched first.
  await page.route('**/api/version*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(versionResponse) }),
  );
  await page.route('**/api/version/update', async (route) => {
    if (route.request().method() === 'POST') {
      updatePostCount++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updateResponse) });
    } else {
      await route.continue();
    }
  });

  async function gotoZh() {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.setItem('locale', 'zh'));
    await page.goto(BASE);
    await page.waitForSelector('aside', { state: 'visible' });
  }

  // U-01: update-available pill in the sidebar (zh)
  await gotoZh();
  const pill = page.getByRole('button', { name: /新版本/ });
  await check('U-01', 'sidebar shows amber "新版本 v1.2.0" pill', async () => {
    await expect(pill).toBeVisible({ timeout: 10000 });
    await expect(pill).toContainText('v1.2.0');
  });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u01-sidebar-pill.png') });

  // U-02: modal opens, shows title + current→latest + release notes
  await pill.click();
  await check('U-02', 'modal title "发现新版本" + current→latest + release notes', async () => {
    await expect(page.getByRole('heading', { name: '发现新版本' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('v1.0.0').first()).toBeVisible();
    await expect(page.getByText('v1.2.0').first()).toBeVisible();
    await expect(page.getByText('ADDED_VERSION_NOTICE')).toBeVisible();
  });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u02-modal-update.png') });

  // U-03: external links to release page + repository with correct hrefs
  await check('U-03', 'release-page + repository links present with correct hrefs', async () => {
    await expect(page.locator(`a[href="${RELEASE_URL}"]`)).toBeVisible();
    await expect(page.locator(`a[href="${REPO_URL}"]`)).toBeVisible();
  });

  // U-04: click "立即更新" → mocked success → restart message; POST fired once
  await page.getByRole('button', { name: '立即更新' }).click();
  await check('U-04', 'update success shows "更新完成" + restart hint; POST fired', async () => {
    await expect(page.getByText('更新完成')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/请重启 ccsm/)).toBeVisible();
    expect(updatePostCount).toBe(1);
  });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u04-update-success.png') });

  // U-05: failure path → "更新失败" + manual command + output
  updateResponse = { ok: false, fromVersion: '1.0.0', toVersion: null, output: 'npm ERR! EACCES permission denied', restartRequired: false };
  await page.keyboard.press('Escape');
  await pill.click();
  await page.getByRole('button', { name: '立即更新' }).click();
  await check('U-05', 'update failure shows "更新失败" + manual command + npm output', async () => {
    await expect(page.getByText('更新失败')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('npm install -g @zzusp/ccsm@latest')).toBeVisible();
    await expect(page.getByText(/EACCES permission denied/)).toBeVisible();
  });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u05-update-failure.png') });

  // U-06: no-update state → plain version, "已是最新版本" modal, no update button
  await page.keyboard.press('Escape');
  versionResponse = upToDate();
  await page.reload();
  await page.waitForSelector('aside', { state: 'visible' });
  await check('U-06', 'no-update: sidebar shows v1.0.0, modal "已是最新版本", no 立即更新', async () => {
    const verBtn = page.getByRole('button', { name: /版本/ }).first();
    await expect(verBtn).toContainText('v1.0.0', { timeout: 8000 });
    await verBtn.click();
    await expect(page.getByRole('heading', { name: '已是最新版本' })).toBeVisible({ timeout: 8000 });
    await expect(page.locator(`a[href="${REPO_URL}"]`)).toBeVisible();
    await expect(page.getByRole('button', { name: '立即更新' })).toHaveCount(0);
  });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u06-up-to-date.png') });

  // U-07: en locale pill label
  versionResponse = updateAvailable();
  await page.evaluate(() => localStorage.setItem('locale', 'en'));
  await page.reload();
  await page.waitForSelector('aside', { state: 'visible' });
  await check('U-07', 'en locale renders "Update v1.2.0" pill', async () => {
    await expect(page.getByRole('button', { name: /Update v1\.2\.0/ })).toBeVisible({ timeout: 8000 });
  });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u07-sidebar-pill-en.png') });

  await browser.close();
}

function updateAvailable() {
  return {
    current: '1.0.0',
    latest: '1.2.0',
    hasUpdate: true,
    releaseName: 'v1.2.0',
    releaseNotes: NOTES,
    releaseUrl: RELEASE_URL,
    publishedAt: '2026-06-01T00:00:00Z',
    repositoryUrl: REPO_URL,
    checkError: null,
  };
}
function upToDate() {
  return {
    current: '1.0.0',
    latest: '1.0.0',
    hasUpdate: false,
    releaseName: 'v1.0.0',
    releaseNotes: NOTES,
    releaseUrl: `${REPO_URL}/releases/tag/v1.0.0`,
    publishedAt: '2026-05-01T00:00:00Z',
    repositoryUrl: REPO_URL,
    checkError: null,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
