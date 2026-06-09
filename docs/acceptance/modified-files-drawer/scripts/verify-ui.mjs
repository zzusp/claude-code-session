// Round-1 UI smoke for the Modified-files drawer (SessionDetail).
//
// Serves the BUILT SPA from an ISOLATED backend (throwaway HOME/USERPROFILE) so
// the real ~/.claude is never touched, then drives the actual UI with Playwright:
//   SessionDetail -> masthead "Modified files" trigger -> right drawer opens
//   IDE tree renders (nested folders + single-child chain merge + outside-cwd file)
//   click a file -> content pane shows Write body / Edit diff / MultiEdit / error
//   "Jump to" closes the drawer; Esc / close button dismiss it
//
// Prereq: `npm run build` (dist/ must exist). Usage:
//   node docs/acceptance/modified-files-drawer/scripts/verify-ui.mjs
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
const CWD = isWin ? 'D:\\fake\\mfd' : '/fake/mfd';
const OUTSIDE = isWin ? 'D:\\other\\outside.txt' : '/other/outside.txt';
const PID = encodeCwd(CWD);
const SID = '33333333-3333-4333-8333-333333333333';

const P = (...segs) => path.join(CWD, ...segs);

// Seed a session whose jsonl carries Edit / Write / MultiEdit tool_use blocks (plus
// matching tool_results, one errored) so both the /modified-files aggregate and the
// drawer's editLookup (built from messages) have real data to render.
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

  // opening user turn (gives the session a title + a non-tool message)
  lines.push({
    parentUuid: null, uuid: 'root', type: 'user', cwd: CWD, sessionId: SID,
    timestamp: '2026-06-01T09:59:00.000Z',
    message: { role: 'user', content: 'please make the edits' },
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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-mfd-'));
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

    // ── Open session detail ───────────────────────────────────────────────────
    await page.goto(`${base}/projects/${encodeURIComponent(PID)}/sessions/${SID}`);
    await page.waitForSelector('main', { state: 'visible' });

    const trigger = page.getByRole('button', { name: 'Open modified files' });
    await trigger.waitFor({ state: 'visible', timeout: 8000 });
    check('masthead trigger renders', await trigger.isVisible());
    // count badge = 5 modified files
    const triggerText = (await trigger.innerText()).replace(/\s+/g, ' ').trim();
    check('trigger shows file count', /\b5\b/.test(triggerText), triggerText);
    await page.screenshot({ path: path.join(SHOTS, 'm01-masthead-trigger.png') });

    // ── Open drawer ───────────────────────────────────────────────────────────
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Modified files' });
    await drawer.waitFor({ state: 'visible', timeout: 4000 });
    check('drawer opens from the right', await drawer.isVisible());

    // ── Tree structure ────────────────────────────────────────────────────────
    check('tree shows src folder', await drawer.getByRole('button', { name: /^src$/ }).count() > 0);
    check('single-child chain merged (deep/nested)', await drawer.getByRole('button', { name: 'deep/nested' }).count() > 0);
    check('file leaf Button.tsx present', await drawer.getByRole('button', { name: /Button\.tsx/ }).count() > 0);
    check('file leaf README.md present', await drawer.getByRole('button', { name: /README\.md/ }).count() > 0);
    check('outside-cwd file outside.txt present', await drawer.getByRole('button', { name: /outside\.txt/ }).count() > 0);
    await page.screenshot({ path: path.join(SHOTS, 'm02-drawer-tree.png') });

    // ── Write content ─────────────────────────────────────────────────────────
    await drawer.getByRole('button', { name: /Button\.tsx/ }).click();
    check('Write body renders in detail pane', await drawer.getByText('WRITE_BUTTON_BODY').isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'm03-write-content.png') });

    // ── Edit diff ─────────────────────────────────────────────────────────────
    await drawer.getByRole('button', { name: /app\.ts/ }).click();
    check('Edit diff shows before value', await drawer.getByText('OLD_APP_VALUE').isVisible());
    check('Edit diff shows after value', await drawer.getByText('NEW_APP_VALUE').isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'm04-edit-diff.png') });

    // ── MultiEdit ─────────────────────────────────────────────────────────────
    await drawer.getByRole('button', { name: /README\.md/ }).click();
    check('MultiEdit shows edit 1 label', await drawer.getByText('edit 1').first().isVisible());
    check('MultiEdit shows a changed value', await drawer.getByText('NEW_HEADING').isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'm05-multiedit.png') });

    // ── Errored outside-cwd file ──────────────────────────────────────────────
    await drawer.getByRole('button', { name: /outside\.txt/ }).click();
    check('errored op badge shows in detail', await drawer.getByText(/1 errored/).isVisible());
    check('absolute-path note shown for outside-cwd file', await drawer.getByText(/absolute path/).isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'm06-errored-absolute.png') });

    // ── Collapse all folders ──────────────────────────────────────────────────
    await drawer.getByRole('button', { name: 'collapse all' }).click();
    check('collapse-all hides nested file leaf', await drawer.getByRole('button', { name: /Button\.tsx/ }).count() === 0);
    await drawer.getByRole('button', { name: 'expand all' }).click();
    check('expand-all restores nested file leaf', await drawer.getByRole('button', { name: /Button\.tsx/ }).count() > 0);

    // ── Jump to message closes the drawer ─────────────────────────────────────
    await drawer.getByRole('button', { name: /app\.ts/ }).click();
    await drawer.getByRole('button', { name: 'Jump to' }).first().click();
    const closedAfterJump = await drawer.waitFor({ state: 'hidden', timeout: 4000 }).then(() => true).catch(() => false);
    check('Jump to closes the drawer', closedAfterJump);
    check('URL carries ?focus= after jump', /[?&]focus=/.test(page.url()), page.url());

    // ── Reopen + Esc dismiss ──────────────────────────────────────────────────
    await trigger.click();
    await drawer.waitFor({ state: 'visible', timeout: 4000 });
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

main().catch((e) => { console.error('mfd ui verify crashed:', e); process.exit(2); });
