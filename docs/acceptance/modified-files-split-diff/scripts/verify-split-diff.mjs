// Verify the modified-files drawer changes:
//   ① conversation column defaults to the BOTTOM (latest) and renders only the
//      tail (last 20); earlier messages are collapsed behind a "show earlier" button.
//   ② middle file-change pane is a SPLIT (side-by-side) diff: old on the left,
//      new on the right.
//   ③ right-hand file names are tinted by change type (A=added / M=modified),
//      with distinct colors.
//
// Reuses the seed/server harness from verify-3col-layout.mjs. Serves the BUILT SPA
// from an ISOLATED backend (throwaway HOME) so the real ~/.claude is never touched.
//
// Prereq: `npm run build` (dist/ must exist). Usage:
//   node docs/acceptance/modified-files-split-diff/scripts/verify-split-diff.mjs
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
const CWD = isWin ? 'D:\\fake\\mfsplit' : '/fake/mfsplit';
const PID = encodeCwd(CWD);
const SID = '44444444-4444-4444-8444-444444444444';
const P = (...segs) => path.join(CWD, ...segs);

function seed(home) {
  const claude = path.join(home, '.claude');
  const projDir = path.join(claude, 'projects', PID);
  fs.mkdirSync(projDir, { recursive: true });

  let n = 0;
  const ts = () => `2026-06-01T10:${String(n).padStart(2, '0')}:00.000Z`;
  const lines = [];
  let last = null;
  const push = (obj) => {
    obj.parentUuid = last;
    last = obj.uuid;
    lines.push(obj);
  };

  // tool_use + tool_result pair; optional structuredPatch sentinel on the result.
  function pair(tool, input, { isError = false, patch = null } = {}) {
    n += 1;
    const id = `tu${n}`;
    push({
      uuid: `a${n}`, type: 'assistant', cwd: CWD, sessionId: SID, timestamp: ts(),
      message: { role: 'assistant', model: 'claude-test', content: [{ type: 'tool_use', id, name: tool, input }] },
    });
    const result = {
      uuid: `u${n}`, type: 'user', cwd: CWD, sessionId: SID, timestamp: ts(),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: isError ? 'error' : 'ok', is_error: isError }] },
    };
    if (patch) result.toolUseResult = { structuredPatch: patch };
    push(result);
  }

  function text(role, body) {
    n += 1;
    push({
      uuid: `${role[0]}t${n}`, type: role, cwd: CWD, sessionId: SID, timestamp: ts(),
      message: { role, content: role === 'assistant' ? [{ type: 'text', text: body }] : body },
    });
  }

  // First message carries an EARLY marker (will be collapsed out of the initial view).
  text('user', 'EARLY_MARKER_FIRST please make the edits');

  // The file edits (these land in the collapsed/early region).
  pair('Edit', { file_path: P('src', 'app.ts'), old_string: 'const VALUE = "OLD_APP_VALUE"', new_string: 'const VALUE = "NEW_APP_VALUE"' }, {
    patch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-const VALUE = "OLD_APP_VALUE"', '+const VALUE = "NEW_APP_VALUE"'] }],
  });
  // Write to a brand-new file → structuredPatch: [] (the create signal → "added").
  pair('Write', { file_path: P('src', 'Button.tsx'), content: 'export const Button = "WRITE_BUTTON_BODY";' }, { patch: [] });

  // 30 plain conversation turns so the total exceeds the 20-message tail window.
  for (let i = 1; i <= 30; i += 1) {
    text('user', `turn ${i} question`);
    text('assistant', i === 30 ? 'LATEST_MARKER final reply' : `turn ${i} answer`);
  }

  fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-mfsplit-'));
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
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Modified files' });
    await drawer.waitFor({ state: 'visible', timeout: 4000 });
    check('drawer opens', await drawer.isVisible());

    // ── ① Conversation defaults to bottom + tail-only ──────────────────────────
    const convScroll = drawer.locator('ol').first().locator('xpath=..');
    await page.waitForTimeout(400); // let layout-effect scroll-to-bottom settle
    check('latest message visible by default', await drawer.getByText(/LATEST_MARKER/).isVisible());
    check('earliest message collapsed (not in DOM)',
      (await drawer.getByText(/EARLY_MARKER_FIRST/).count()) === 0);
    const showEarlier = drawer.getByRole('button', { name: /show \d+ earlier messages/i });
    check('"show earlier" button present', (await showEarlier.count()) > 0);

    const scrollState = await convScroll.evaluate((el) => ({
      top: Math.round(el.scrollTop),
      max: Math.round(el.scrollHeight - el.clientHeight),
    }));
    check('conversation scrolled to (near) bottom on open',
      scrollState.max > 0 && scrollState.max - scrollState.top <= 24,
      `top=${scrollState.top} max=${scrollState.max}`);
    await page.screenshot({ path: path.join(SHOTS, 's01-conversation-bottom.png') });

    // Expanding reveals earlier messages; keep clicking until the button is gone
    // (all revealed). The earliest message must then be in the DOM.
    const countBefore = await drawer.locator('ol > li').count();
    await showEarlier.first().click();
    await page.waitForTimeout(250);
    check('one "show earlier" click renders MORE messages',
      (await drawer.locator('ol > li').count()) > countBefore);
    for (let i = 0; i < 5 && (await showEarlier.count()) > 0; i += 1) {
      await showEarlier.first().click();
      await page.waitForTimeout(150);
    }
    check('after fully expanding, the earliest message is rendered',
      (await drawer.getByText(/EARLY_MARKER_FIRST/).count()) > 0);
    check('"show earlier" button is gone once everything is shown',
      (await showEarlier.count()) === 0);

    // ── ② Split diff: old left, new right ──────────────────────────────────────
    await drawer.getByRole('button', { name: /app\.ts/ }).click();
    await page.waitForTimeout(200);
    const oldBox = await drawer.getByText('OLD_APP_VALUE', { exact: false }).first().boundingBox();
    const newBox = await drawer.getByText('NEW_APP_VALUE', { exact: false }).first().boundingBox();
    check('split diff shows both old and new', oldBox && newBox);
    check('old value sits LEFT of new value (side-by-side)',
      oldBox && newBox && oldBox.x < newBox.x,
      oldBox && newBox ? `old.x=${Math.round(oldBox.x)} new.x=${Math.round(newBox.x)}` : 'missing');
    await page.screenshot({ path: path.join(SHOTS, 's02-split-diff.png') });

    // ── ③ File-name change-type coloring (A=added, M=modified, distinct colors) ──
    const appColor = await drawer.getByRole('button', { name: /app\.ts/ })
      .locator('span', { hasText: 'app.ts' }).first()
      .evaluate((el) => getComputedStyle(el).color);
    const btnColor = await drawer.getByRole('button', { name: /Button\.tsx/ })
      .locator('span', { hasText: 'Button.tsx' }).first()
      .evaluate((el) => getComputedStyle(el).color);
    check('modified vs added file names use DISTINCT colors',
      appColor && btnColor && appColor !== btnColor, `app=${appColor} button=${btnColor}`);
    check('modified file shows "M" badge', (await drawer.getByText('M', { exact: true }).count()) > 0);
    check('added file shows "A" badge', (await drawer.getByText('A', { exact: true }).count()) > 0);
    await page.screenshot({ path: path.join(SHOTS, 's03-filename-colors.png') });
  } finally {
    await browser.close();
    child.kill();
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* temp */ }
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('split-diff verify crashed:', e); process.exit(2); });
