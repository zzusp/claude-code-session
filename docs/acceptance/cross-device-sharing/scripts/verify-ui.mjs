// Round-1 UI smoke for cross-device sharing (Export dialog + Import page).
//
// Serves the BUILT SPA from an ISOLATED backend (throwaway HOME/USERPROFILE) so
// the real ~/.claude is never touched, then drives the actual UI with Playwright:
//   ProjectDetail Export dialog -> writes a bundle
//   Import page -> load bundle -> remap to a new path -> commit -> result
//
// Prereq: `npm run build` (dist/ must exist). Usage:
//   node docs/acceptance/cross-device-sharing/scripts/verify-ui.mjs
//
// Outputs screenshots to ../round-1/ and exits non-zero on failure.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, '..', 'round-1');
const REPO = path.resolve(__dirname, '..', '..', '..', '..');

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
}

function encodeCwd(cwd) {
  if (path.isAbsolute(cwd) && /^[A-Za-z]:[\\/]/.test(cwd)) {
    return `${cwd[0].toUpperCase()}--${cwd.slice(3).replace(/[\\/]/g, '-')}`;
  }
  return cwd.replace(/\//g, '-');
}

const isWin = process.platform === 'win32';
const SRC_CWD = isWin ? 'D:\\fake\\alpha' : '/fake/alpha';
const TARGET_CWD = isWin ? 'D:\\fake\\ui-target' : '/fake/ui-target';
const SRC_ID = encodeCwd(SRC_CWD);
const TARGET_ID = encodeCwd(TARGET_CWD);
const SID = '22222222-2222-4222-8222-222222222222';

function seed(home) {
  const claude = path.join(home, '.claude');
  const projDir = path.join(claude, 'projects', SRC_ID);
  const memDir = path.join(projDir, 'memory');
  fs.mkdirSync(memDir, { recursive: true });
  const lines = [
    { type: 'file-history-snapshot', messageId: 's1', snapshot: {} },
    {
      parentUuid: null, uuid: 'u1', type: 'user', cwd: SRC_CWD, sessionId: SID,
      timestamp: '2026-06-01T10:00:00.000Z',
      message: { role: 'user', content: `hello from ${SRC_CWD}` },
    },
    {
      parentUuid: 'u1', uuid: 'a1', type: 'assistant', cwd: SRC_CWD, sessionId: SID,
      timestamp: '2026-06-01T10:00:05.000Z',
      message: { role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: 'hi' }] },
    },
  ];
  fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(path.join(memDir, 'MEMORY.md'), '# Memory index\n');
  fs.writeFileSync(path.join(claude, 'history.jsonl'),
    JSON.stringify({ display: 'hello', pastedContents: {}, timestamp: '2026-06-01T10:00:00.000Z', project: SRC_CWD, sessionId: SID }) + '\n');
  return { claude };
}

function startServer(home) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--import', 'tsx', 'server/index.ts'], {
      cwd: REPO,
      env: { ...process.env, USERPROFILE: home, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { child.stdout.off('data', onData); resolve({ child, base: `http://127.0.0.1:${m[1]}` }); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => process.env.DEBUG && process.stderr.write(d));
    child.on('exit', (c) => reject(new Error(`server exited early (${c}): ${buf}`)));
    setTimeout(() => reject(new Error(`server timeout: ${buf}`)), 20000);
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-ui-'));
  const bundleDir = path.join(home, 'bundle');
  seed(home);

  const { child, base } = await startServer(home);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  try {
    await page.goto(base);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('locale', 'en');
      localStorage.setItem('theme', 'light');
    });

    // ── Export via ProjectDetail ──────────────────────────────────────────────
    await page.goto(`${base}/projects/${encodeURIComponent(SRC_ID)}`);
    await page.waitForSelector('main', { state: 'visible' });
    await page.getByRole('button', { name: 'Export' }).click();

    const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'Export project' });
    await dialog.waitFor({ state: 'visible', timeout: 4000 });
    check('export dialog opens', await dialog.isVisible());

    await page.getByPlaceholder(/claude-shared/i).fill(bundleDir);
    await page.screenshot({ path: path.join(SHOTS, 'u01-export-dialog.png') });
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();

    const exportOk = await page
      .getByText(/Exported\s+1\s+session/i)
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check('export completes with success message', exportOk);
    check('bundle manifest written to disk', fs.existsSync(path.join(bundleDir, 'manifest.json')));
    await page.screenshot({ path: path.join(SHOTS, 'u02-export-result.png') });
    await page.getByRole('button', { name: 'Done' }).click();

    // ── Import via /import ────────────────────────────────────────────────────
    await page.goto(`${base}/import`);
    await page.waitForSelector('main', { state: 'visible' });
    await page.getByPlaceholder('Path to an exported bundle').fill(bundleDir);
    await page.getByRole('button', { name: 'Load bundle' }).click();

    // Preview appears: source line + a target input. Remap to a NEW path so the
    // session resolves to action=create (default suggestion is the existing src).
    const targetInput = page.getByRole('textbox', { name: 'Import into (this device)' });
    await targetInput.waitFor({ state: 'visible', timeout: 6000 });
    check('import preview renders', await targetInput.isVisible());

    await targetInput.fill(TARGET_CWD);
    await targetInput.press('Enter');

    const createBadge = await page
      .getByText('create', { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    check('preview shows a create action for the new target', createBadge);
    const targetIdShown = await page.getByText(new RegExp(TARGET_ID)).count();
    check('preview shows remapped project id', targetIdShown > 0, TARGET_ID);
    await page.screenshot({ path: path.join(SHOTS, 'u03-import-preview.png') });

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const importOk = await page
      .getByText(/Import complete/i)
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check('import commit completes', importOk);
    check('imported jsonl exists on disk', fs.existsSync(path.join(home, '.claude', 'projects', TARGET_ID, `${SID}.jsonl`)));
    await page.screenshot({ path: path.join(SHOTS, 'u04-import-result.png') });

    // Open imported project and confirm the session is listed.
    await page.getByRole('link', { name: 'Open imported project' }).click();
    await page.waitForURL(new RegExp(`/projects/${TARGET_ID.replace(/[-]/g, '\\-')}`), { timeout: 5000 }).catch(() => {});
    const sessionVisible = await page.getByText(SID).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    check('imported session visible in target project', sessionVisible);
    await page.screenshot({ path: path.join(SHOTS, 'u05-imported-project.png') });
  } finally {
    await browser.close();
    child.kill();
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* temp */ }
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ui verify crashed:', e); process.exit(2); });
