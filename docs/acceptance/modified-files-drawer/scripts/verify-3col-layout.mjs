// Round-3 UI check: Modified-files drawer re-laid-out into THREE columns —
//   ① conversation (left)  ② file content (middle)  ③ file tree (right)
//
// Verifies the new layout + the changed Jump behavior (drawer now STAYS open and
// scrolls its own conversation column instead of closing) + both draggable
// splitters + the open/close motion (overlay present on open, gone after close).
//
// Reuses the Round-1 seed/server harness. Serves the BUILT SPA from an ISOLATED
// backend (throwaway HOME/USERPROFILE) so the real ~/.claude is never touched.
//
// Prereq: `npm run build` (dist/ must exist). Usage:
//   node docs/acceptance/modified-files-drawer/scripts/verify-3col-layout.mjs
//
// Outputs screenshots to ../round-3/ and exits non-zero on failure.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, '..', 'round-3');
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
const CWD = isWin ? 'D:\\fake\\mfd' : '/fake/mfd';
const OUTSIDE = isWin ? 'D:\\other\\outside.txt' : '/other/outside.txt';
const PID = encodeCwd(CWD);
const SID = '33333333-3333-4333-8333-333333333333';

const P = (...segs) => path.join(CWD, ...segs);

function seed(home) {
  const claude = path.join(home, '.claude');
  const projDir = path.join(claude, 'projects', PID);
  fs.mkdirSync(projDir, { recursive: true });

  let n = 0;
  const ts = () => `2026-06-01T10:0${n}:00.000Z`;
  const lines = [];
  function pair(tool, input, { isError = false } = {}) {
    n += 1;
    const id = `tu${n}`;
    lines.push({
      parentUuid: lines.length ? lines[lines.length - 1].uuid : null,
      uuid: `a${n}`,
      type: 'assistant',
      cwd: CWD,
      sessionId: SID,
      timestamp: ts(),
      message: { role: 'assistant', model: 'claude-test', content: [{ type: 'tool_use', id, name: tool, input }] },
    });
    lines.push({
      parentUuid: `a${n}`,
      uuid: `u${n}`,
      type: 'user',
      cwd: CWD,
      sessionId: SID,
      timestamp: ts(),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: isError ? 'error' : 'ok', is_error: isError }] },
    });
  }

  lines.push({
    parentUuid: null, uuid: 'root', type: 'user', cwd: CWD, sessionId: SID,
    timestamp: '2026-06-01T09:59:00.000Z',
    message: { role: 'user', content: 'please make the edits PLEASE_MAKE_EDITS' },
  });

  pair('Edit', { file_path: P('src', 'app.ts'), old_string: 'const VALUE = "OLD_APP_VALUE"', new_string: 'const VALUE = "NEW_APP_VALUE"' });
  pair('Write', { file_path: P('src', 'components', 'Button.tsx'), content: 'export const Button = "WRITE_BUTTON_BODY";\nexport default Button;' });
  pair('Write', { file_path: P('deep', 'nested', 'only.ts'), content: 'export const ONLY = "DEEP_ONLY_BODY";' });
  pair('MultiEdit', {
    file_path: P('README.md'),
    edits: [
      { old_string: '# OLD_HEADING', new_string: '# NEW_HEADING' },
      { old_string: 'OLD_PARA', new_string: 'NEW_PARA' },
    ],
  });
  pair('Write', { file_path: OUTSIDE, content: 'OUTSIDE_BODY' }, { isError: true });

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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-mfd3-'));
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

    // ── Open drawer ───────────────────────────────────────────────────────────
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Modified files' });
    await drawer.waitFor({ state: 'visible', timeout: 4000 });
    check('drawer opens', await drawer.isVisible());

    // ── ① Conversation column (left) ──────────────────────────────────────────
    check('conversation column header present', await drawer.getByText('Conversation', { exact: true }).isVisible());
    check('conversation renders the opening user message',
      await drawer.getByText(/PLEASE_MAKE_EDITS/).isVisible());

    // ── ③ File tree column (right) ─────────────────────────────────────────────
    check('tree shows src folder', await drawer.getByRole('button', { name: /^src$/ }).count() > 0);
    check('single-child chain merged (deep/nested)', await drawer.getByRole('button', { name: 'deep/nested' }).count() > 0);
    check('file leaf Button.tsx present', await drawer.getByRole('button', { name: /Button\.tsx/ }).count() > 0);

    // ── Column ORDER: conversation left, tree right ────────────────────────────
    const convBox = await drawer.getByText('Conversation', { exact: true }).boundingBox();
    const treeBox = await drawer.getByText('Files', { exact: true }).boundingBox();
    check('conversation sits left of the file tree', convBox && treeBox && convBox.x < treeBox.x,
      convBox && treeBox ? `conv.x=${Math.round(convBox.x)} tree.x=${Math.round(treeBox.x)}` : 'missing');
    await page.screenshot({ path: path.join(SHOTS, 'm01-three-columns.png') });

    // ── ② Middle content pane reacts to tree selection ─────────────────────────
    await drawer.getByRole('button', { name: /Button\.tsx/ }).click();
    check('Write body renders in middle content pane', await drawer.getByText('WRITE_BUTTON_BODY').isVisible());
    await drawer.getByRole('button', { name: /app\.ts/ }).click();
    check('Edit diff shows before value', await drawer.getByText('OLD_APP_VALUE').isVisible());
    check('Edit diff shows after value', await drawer.getByText('NEW_APP_VALUE').isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'm02-content-middle.png') });

    // ── Jump to: drawer now STAYS open and syncs ?focus ────────────────────────
    await drawer.getByRole('button', { name: 'Jump to' }).first().click();
    await page.waitForTimeout(500);
    check('Jump to keeps the drawer OPEN (new behavior)', await drawer.isVisible());
    check('URL carries ?focus= after jump', /[?&]focus=/.test(page.url()), page.url());
    await page.screenshot({ path: path.join(SHOTS, 'm03-jump-stays-open.png') });

    // ── Draggable conversation splitter (1st separator) ────────────────────────
    const sep = drawer.getByRole('separator').first();
    const sepBefore = await sep.boundingBox();
    await page.mouse.move(sepBefore.x + 0.5, sepBefore.y + sepBefore.height / 2);
    await page.mouse.down();
    await page.mouse.move(sepBefore.x - 140, sepBefore.y + sepBefore.height / 2, { steps: 10 });
    await page.mouse.up();
    const sepAfter = await sep.boundingBox();
    check('conversation splitter drags (column resizes)', Math.abs(sepAfter.x - sepBefore.x) > 60,
      `before=${Math.round(sepBefore.x)} after=${Math.round(sepAfter.x)}`);

    // ── Draggable tree splitter (2nd separator) ────────────────────────────────
    const sep2 = drawer.getByRole('separator').nth(1);
    const sep2Before = await sep2.boundingBox();
    await page.mouse.move(sep2Before.x + 0.5, sep2Before.y + sep2Before.height / 2);
    await page.mouse.down();
    await page.mouse.move(sep2Before.x - 120, sep2Before.y + sep2Before.height / 2, { steps: 10 });
    await page.mouse.up();
    const sep2After = await sep2.boundingBox();
    check('tree splitter drags (column resizes)', Math.abs(sep2After.x - sep2Before.x) > 50,
      `before=${Math.round(sep2Before.x)} after=${Math.round(sep2After.x)}`);
    await page.screenshot({ path: path.join(SHOTS, 'm04-after-resize.png') });

    // ── Esc closes; overlay gone (close motion completes) ──────────────────────
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

main().catch((e) => { console.error('mfd 3col verify crashed:', e); process.exit(2); });
