// UI + API smoke for the Modified-files drawer enhancements:
//   wider drawer · split (left/right) git-diff · open-file affordance + endpoint
//   · full filename + horizontal scroll · draggable rail/content splitter
//
// Serves the BUILT SPA from an ISOLATED backend (throwaway HOME) so the real
// ~/.claude is never touched, then drives the actual UI with Playwright.
//
// Prereq: `npm run build` (dist/ must exist). Usage:
//   node docs/acceptance/modified-files-diff-resize/scripts/verify-ui.mjs
//
// Screenshots → ../round-1/. Exits non-zero on any failed check.

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
const CWD = isWin ? 'D:\\fake\\mfd2' : '/fake/mfd2';
const PID = encodeCwd(CWD);
const SID = '44444444-4444-4444-8444-444444444444';
const LONG_NAME =
  'a-very-long-file-name-that-should-overflow-the-tree-rail-and-trigger-horizontal-scroll.ts';
const P = (...segs) => path.join(CWD, ...segs);
const MEMBER_MISSING = P('src', 'app.ts'); // 属于会话、但磁盘上不存在 → open-file 应 404

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
      uuid: `a${n}`, type: 'assistant', cwd: CWD, sessionId: SID, timestamp: ts(),
      message: { role: 'assistant', model: 'claude-test', content: [{ type: 'tool_use', id, name: tool, input }] },
    });
    lines.push({
      parentUuid: `a${n}`, uuid: `u${n}`, type: 'user', cwd: CWD, sessionId: SID, timestamp: ts(),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: isError ? 'error' : 'ok', is_error: isError }] },
    });
  }

  lines.push({
    parentUuid: null, uuid: 'root', type: 'user', cwd: CWD, sessionId: SID,
    timestamp: '2026-06-01T09:59:00.000Z',
    message: { role: 'user', content: 'please make the edits' },
  });

  // 多行 Edit：line1 / line3 不变、中间一行替换 → split diff 同屏出现 equal + del/add。
  pair('Edit', {
    file_path: MEMBER_MISSING,
    old_string: 'line1\nconst VALUE = "OLD_APP_VALUE"\nline3',
    new_string: 'line1\nconst VALUE = "NEW_APP_VALUE"\nline3',
  });
  // 超长文件名 → 触发树栏横向滚动。
  pair('Edit', {
    file_path: P('src', LONG_NAME),
    old_string: 'const A = 1',
    new_string: 'const A = 2',
  });

  fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

function startServer(home) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--import', 'tsx', 'server/index.ts'], {
      cwd: REPO, env: { ...process.env, USERPROFILE: home, HOME: home },
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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-mfd2-'));
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

    await page.goto(`${base}/projects/${encodeURIComponent(PID)}/sessions/${SID}`);
    await page.waitForSelector('main', { state: 'visible' });

    const trigger = page.getByRole('button', { name: 'Open modified files' });
    await trigger.waitFor({ state: 'visible', timeout: 8000 });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Modified files' });
    await drawer.waitFor({ state: 'visible', timeout: 4000 });
    check('drawer opens', await drawer.isVisible());

    // ── (1) wider drawer ─────────────────────────────────────────────────────
    const box = await drawer.boundingBox();
    check('drawer is wide (~1280px cap, was 900)', box && box.width > 1100, box ? `${Math.round(box.width)}px` : 'no box');

    // ── (2) split (left/right) git-diff ──────────────────────────────────────
    await drawer.getByRole('button', { name: /app\.ts/ }).first().click();
    check('diff: before column header', await drawer.getByText(/before/i).first().isVisible());
    check('diff: after column header', await drawer.getByText(/after/i).first().isVisible());
    check('diff: old value present', await drawer.getByText('OLD_APP_VALUE').isVisible());
    check('diff: new value present', await drawer.getByText('NEW_APP_VALUE').isVisible());
    // 同屏左右两栏：before 头与 after 头的 x 应左<右（同一行）。
    const beforeBox = await drawer.getByText(/before/i).first().boundingBox();
    const afterBox = await drawer.getByText(/after/i).first().boundingBox();
    check('diff: before is left of after (side-by-side)',
      beforeBox && afterBox && beforeBox.x < afterBox.x,
      beforeBox && afterBox ? `before.x=${Math.round(beforeBox.x)} after.x=${Math.round(afterBox.x)}` : 'no box');
    await page.screenshot({ path: path.join(SHOTS, 'e01-split-diff.png') });

    // ── (3) open-file affordance ─────────────────────────────────────────────
    check('detail header has "open file" button', await drawer.getByRole('button', { name: 'open file' }).first().isVisible());
    const treeOpenBtns = await page.locator('li[role="treeitem"] button[aria-label="open file"]').count();
    check('tree rows carry an open button (per file)', treeOpenBtns >= 2, `${treeOpenBtns} buttons`);

    // ── (4a) full filename + horizontal scroll in tree ───────────────────────
    const longVisible = await drawer.getByRole('button', { name: new RegExp(LONG_NAME.slice(0, 30)) }).first().isVisible();
    check('long filename rendered untruncated', longVisible);
    const scrollState = await page.locator('ul[role="tree"]').evaluate((ul) => {
      const sc = ul.parentElement; // overflow-auto scroll container
      return { scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth };
    });
    check('tree scrolls horizontally for long names', scrollState.scrollWidth > scrollState.clientWidth + 1,
      `scrollW=${scrollState.scrollWidth} clientW=${scrollState.clientWidth}`);

    // ── (4b) draggable splitter ──────────────────────────────────────────────
    const sep = drawer.locator('[role="separator"][aria-orientation="vertical"]');
    check('splitter present', await sep.count() === 1);
    const railWidth = () => page.locator('ul[role="tree"]').evaluate((ul) => {
      // ul → scroll div → rail div (style width)
      return ul.parentElement.parentElement.getBoundingClientRect().width;
    });
    const w0 = await railWidth();
    const sb = await sep.boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 + 140, sb.y + sb.height / 2, { steps: 12 });
    await page.mouse.up();
    const w1 = await railWidth();
    check('drag right widens the tree rail', w1 > w0 + 80, `${Math.round(w0)} → ${Math.round(w1)}`);
    await page.screenshot({ path: path.join(SHOTS, 'e02-rail-widened.png') });

    // drag back left → narrower
    const sb2 = await sep.boundingBox();
    await page.mouse.move(sb2.x + sb2.width / 2, sb2.y + sb2.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb2.x + sb2.width / 2 - 160, sb2.y + sb2.height / 2, { steps: 12 });
    await page.mouse.up();
    const w2 = await railWidth();
    check('drag left narrows the tree rail', w2 < w1 - 80, `${Math.round(w1)} → ${Math.round(w2)}`);

    // ── (5) open-file endpoint guards (no spawn / no side effects) ───────────
    const origin = base;
    const callOpen = (headers, body) =>
      fetch(`${base}/api/sessions/${encodeURIComponent(PID)}/${encodeURIComponent(SID)}/open-file`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body ?? {}),
      });
    const r403 = await callOpen({}, { filePath: MEMBER_MISSING }); // no Origin
    check('open-file: 403 without Origin', r403.status === 403, `status ${r403.status}`);
    const r400body = await callOpen({ origin }, {}); // missing filePath
    check('open-file: 400 without filePath', r400body.status === 400, `status ${r400body.status}`);
    const r400member = await callOpen({ origin }, { filePath: isWin ? 'D:\\not\\member.ts' : '/not/member.ts' });
    check('open-file: 400 for non-member path', r400member.status === 400, `status ${r400member.status}`);
    const r404 = await callOpen({ origin }, { filePath: MEMBER_MISSING }); // member but not on disk
    check('open-file: 404 for member missing on disk', r404.status === 404, `status ${r404.status}`);
  } finally {
    await browser.close();
    child.kill();
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* temp */ }
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('mfd2 verify crashed:', e); process.exit(2); });
