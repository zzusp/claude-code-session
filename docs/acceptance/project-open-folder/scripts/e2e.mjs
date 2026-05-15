// Round-1 e2e for project open-folder.
// Server must be running on 127.0.0.1:<port> (default 3131, falls back through 3140).
//
// Usage:
//   PORT=3132 node docs/acceptance/project-open-folder/scripts/e2e.mjs
//
// Side effect: A-01 actually spawns Explorer once. Close the popup afterward.
//
// Outputs:
//   - stdout pass/fail per item
//   - docs/acceptance/project-open-folder/round-1/screenshots/*.png
//   - docs/acceptance/project-open-folder/round-1/verdict.json

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

const results = [];
function record(id, name, status, note = '') {
  results.push({ id, name, status, note });
  const tag = status === 'pass' ? '[PASS]' : '[FAIL]';
  console.log(`${tag} ${id}  ${name}${note ? ' — ' + note : ''}`);
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });

  const projects = await fetchJSON(`${BASE}/api/projects`);
  const resolved = projects.find((p) => p.cwdResolved);
  const missing = projects.find((p) => !p.cwdResolved);
  if (!resolved) throw new Error('no resolved project found');

  await runApi(resolved, missing);
  await runUi(resolved, missing);

  await writeFile(
    path.join(ROUND_DIR, 'verdict.json'),
    JSON.stringify({ at: new Date().toISOString(), port: PORT, results }, null, 2),
  );

  const failed = results.filter((r) => r.status === 'fail');
  console.log(`\n${results.length} checks, ${failed.length} failure(s).`);
  process.exit(failed.length ? 1 : 0);
}

async function runApi(resolved, missing) {
  // A-01: valid project + valid Origin → 200, path === decodedCwd
  {
    const res = await postReveal(resolved.id, { origin: ORIGIN });
    const body = await res.json().catch(() => null);
    const ok = res.status === 200 && body && body.ok === true && body.path === resolved.decodedCwd;
    record('A-01', `reveal resolved project → 200 path=${resolved.decodedCwd}`,
      ok ? 'pass' : 'fail',
      ok ? '' : `got status=${res.status} body=${JSON.stringify(body)}`);
  }

  // A-02: no Origin → 403
  {
    const res = await postReveal(resolved.id, { origin: null });
    record('A-02', 'reveal without Origin → 403',
      res.status === 403 ? 'pass' : 'fail',
      `status=${res.status}`);
  }

  // A-03: foreign Origin → 403
  {
    const res = await postReveal(resolved.id, { origin: 'http://evil.example.com' });
    record('A-03', 'reveal with foreign Origin → 403',
      res.status === 403 ? 'pass' : 'fail',
      `status=${res.status}`);
  }

  // A-04: unknown project id → 404
  {
    const id = 'definitely-not-a-real-project-id-zzz';
    const res = await postReveal(id, { origin: ORIGIN });
    const body = await res.json().catch(() => null);
    const ok = res.status === 404 && body && /not found/.test(body.error || '');
    record('A-04', 'reveal unknown id → 404 project not found',
      ok ? 'pass' : 'fail',
      `status=${res.status} body=${JSON.stringify(body)}`);
  }

  // A-05: cwdResolved=false project → 404 directory missing
  if (missing) {
    const res = await postReveal(missing.id, { origin: ORIGIN });
    const body = await res.json().catch(() => null);
    const ok = res.status === 404 && body && /missing/.test(body.error || '');
    record('A-05', `reveal cwdResolved=false (${missing.id.slice(0, 40)}…) → 404 directory missing`,
      ok ? 'pass' : 'fail',
      `status=${res.status} body=${JSON.stringify(body)}`);
  } else {
    record('A-05', 'reveal cwdResolved=false → 404', 'fail', 'no missing-dir fixture in current ~/.claude/projects/');
  }

  // A-06: fixture availability
  record('A-06', 'project list has ≥1 cwdResolved=false fixture',
    missing ? 'pass' : 'fail');
}

async function runUi(resolved, missing) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // Intercept reveal so UI clicks don't pop more Explorer windows during the test.
  await page.route('**/api/projects/*/reveal', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, path: 'mock' }),
      });
    } else {
      await route.continue();
    }
  });

  // U-01: resolved project, en locale, button enabled, title = decoded cwd
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.setItem('locale', 'en'); });
  await page.goto(`${BASE}/projects/${encodeURIComponent(resolved.id)}`);
  await page.waitForSelector('main', { state: 'visible' });
  const enBtn = page.getByRole('button', { name: /open folder/i });
  await enBtn.waitFor({ state: 'visible', timeout: 5000 });
  try {
    await expect(enBtn).toBeEnabled({ timeout: 15000 });
    await expect(enBtn).toHaveAttribute('title', resolved.decodedCwd, { timeout: 15000 });
    record('U-01', `resolved project shows enabled "Open folder" (title=${resolved.decodedCwd})`, 'pass');
  } catch (err) {
    const actualTitle = await enBtn.getAttribute('title').catch(() => '<unreadable>');
    record('U-01', 'resolved project enabled button', 'fail',
      `${err.message.split('\n')[0]} (actual title=${actualTitle})`);
  }
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u01-resolved-en.png'), fullPage: false });

  // U-02: missing-dir project → disabled, tooltip = missing-dir text
  if (missing) {
    await page.goto(`${BASE}/projects/${encodeURIComponent(missing.id)}`);
    await page.waitForSelector('main', { state: 'visible' });
    const btn = page.getByRole('button', { name: /open folder/i });
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    try {
      await expect(btn).toBeDisabled({ timeout: 15000 });
      await expect(btn).toHaveAttribute('title', /no longer exists/i, { timeout: 15000 });
      record('U-02', 'cwdResolved=false project shows disabled "Open folder"', 'pass');
    } catch (err) {
      record('U-02', 'disabled state on missing-dir project', 'fail', err.message.split('\n')[0]);
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, 'u02-missing-en.png'), fullPage: false });
  } else {
    record('U-02', 'disabled state on missing-dir project', 'fail', 'no fixture');
  }

  // U-03: zh locale label
  await page.evaluate(() => { localStorage.setItem('locale', 'zh'); });
  await page.goto(`${BASE}/projects/${encodeURIComponent(resolved.id)}`);
  await page.waitForSelector('main', { state: 'visible' });
  const zhBtn = page.getByRole('button', { name: /打开目录/ });
  const zhVisible = await zhBtn.isVisible().catch(() => false);
  record('U-03', 'zh locale renders "打开目录"', zhVisible ? 'pass' : 'fail');
  await page.screenshot({ path: path.join(SHOTS_DIR, 'u03-resolved-zh.png'), fullPage: false });

  await browser.close();
}

async function postReveal(id, { origin }) {
  const headers = { 'content-type': 'application/json' };
  if (origin) headers['origin'] = origin;
  return fetch(`${BASE}/api/projects/${encodeURIComponent(id)}/reveal`, { method: 'POST', headers });
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
