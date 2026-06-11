// Verify: opening the Modified-files drawer for a session that modified NO files
// keeps the THREE-column framework + the left conversation column. Only the right
// two columns (middle content / file tree) go empty — the page must NOT collapse
// into a single one-line "no files" notice.
//
// Reuses the modified-files-drawer harness (isolated throwaway HOME, built SPA).
// Seeds a session with plain conversation turns ONLY — no Edit/Write/MultiEdit —
// so the backend reports zero modified files.
//
// Prereq: `npm run build` (dist/ must exist). Usage:
//   node docs/acceptance/empty-modified-drawer/scripts/verify-empty-drawer.mjs
//
// Outputs a screenshot to ../round-1/ and exits non-zero on failure.

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
const CWD = isWin ? 'D:\\fake\\empty-mfd' : '/fake/empty-mfd';
const PID = encodeCwd(CWD);
const SID = '44444444-4444-4444-8444-444444444444';

function seed(home) {
  const claude = path.join(home, '.claude');
  const projDir = path.join(claude, 'projects', PID);
  fs.mkdirSync(projDir, { recursive: true });

  // Plain conversation — NO tool_use edits → backend reports zero modified files.
  const lines = [
    {
      parentUuid: null, uuid: 'root', type: 'user', cwd: CWD, sessionId: SID,
      timestamp: '2026-06-01T09:59:00.000Z',
      message: { role: 'user', content: 'just chatting NO_EDITS_PLEASE' },
    },
    {
      parentUuid: 'root', uuid: 'a1', type: 'assistant', cwd: CWD, sessionId: SID,
      timestamp: '2026-06-01T10:00:00.000Z',
      message: { role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: 'sure, ASSISTANT_REPLY_HERE' }] },
    },
  ];

  fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-empty-mfd-'));
  seed(home);

  const { child, base } = await startServer(home);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  try {
    await page.goto(base);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('locale', 'en');
      localStorage.setItem('theme', 'light');
    });

    await page.goto(`${base}/projects/${encodeURIComponent(PID)}/sessions/${SID}`);
    await page.waitForSelector('main', { state: 'visible' });

    const trigger = page.getByRole('button', { name: 'Open modified files' });
    await trigger.waitFor({ state: 'visible', timeout: 8000 });

    // ── Open drawer (zero modified files) ──────────────────────────────────────
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Modified files' });
    await drawer.waitFor({ state: 'visible', timeout: 4000 });
    check('drawer opens with zero modified files', await drawer.isVisible());

    // ── Three-column FRAMEWORK persists ────────────────────────────────────────
    check('① conversation column header present',
      await drawer.getByText('Conversation', { exact: true }).isVisible());
    check('③ file tree column header present',
      await drawer.getByText('Files', { exact: true }).isVisible());
    check('two draggable splitters present (3-col frame intact)',
      (await drawer.getByRole('separator').count()) === 2,
      `separators=${await drawer.getByRole('separator').count()}`);

    // ── ① Conversation column still renders the dialogue ───────────────────────
    check('conversation renders the user message',
      await drawer.getByText(/NO_EDITS_PLEASE/).isVisible());
    check('conversation renders the assistant reply',
      await drawer.getByText(/ASSISTANT_REPLY_HERE/).isVisible());

    // ── ② + ③ right two columns show the empty state (no content) ──────────────
    check('"no files modified" empty notice shown in content pane',
      (await drawer.getByText('No files were modified in this session.').count()) > 0);

    // ── Column ORDER: conversation left of the file tree ───────────────────────
    const convBox = await drawer.getByText('Conversation', { exact: true }).boundingBox();
    const treeBox = await drawer.getByText('Files', { exact: true }).boundingBox();
    check('conversation sits left of the file tree', convBox && treeBox && convBox.x < treeBox.x,
      convBox && treeBox ? `conv.x=${Math.round(convBox.x)} tree.x=${Math.round(treeBox.x)}` : 'missing');

    await page.screenshot({ path: path.join(SHOTS, 'empty-three-columns.png') });

    // ── Esc still closes ───────────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    const closedByEsc = await drawer.waitFor({ state: 'hidden', timeout: 4000 }).then(() => true).catch(() => false);
    check('Esc closes the drawer', closedByEsc);
  } finally {
    await browser.close();
    child.kill();
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* temp */ }
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('empty-mfd verify crashed:', e); process.exit(2); });
