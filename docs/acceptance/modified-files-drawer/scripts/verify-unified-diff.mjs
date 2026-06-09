// Round-2 UI check for the structuredPatch-driven UNIFIED diff in the Modified-files drawer.
//
// Verifies the three things the redesign promised (driven by toolUseResult.structuredPatch):
//   1. accurate FILE line numbers (gutter shows e.g. 120, not snippet-local 1..N)
//   2. unchanged regions omitted + folded into a "N unchanged lines" gap row
//   3. added lines tinted GREEN, deleted lines tinted RED — including
//        • Write create  → all-green (new file)
//        • Write overwrite → deleted old content shown in red
//
// Serves the BUILT SPA from an ISOLATED backend (throwaway HOME) so real ~/.claude is
// never touched. Colors are asserted via getComputedStyle (channel comparison), so the
// check is robust to the exact OKLCH token values.
//
// Prereq: `npm run build`. Usage:
//   node docs/acceptance/modified-files-drawer/scripts/verify-unified-diff.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, '..', 'round-2');
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
const P = (...segs) => path.join(CWD, ...segs);

// Computed background-color → reddish / greenish classifier. Chrome may return either
// rgb(...) (R/G/B channel dominance) or oklch(L C H) (hue: ~30°=red, ~140°=green).
function classify(color) {
  if (!color) return null;
  const ok = color.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (ok) {
    const chroma = +ok[2], hue = +ok[3];
    if (chroma < 0.01) return null; // grey
    if (hue <= 60 || hue >= 330) return 'red';
    if (hue >= 90 && hue <= 180) return 'green';
    return null;
  }
  const m = color.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return null;
  const r = +m[0], g = +m[1], b = +m[2];
  if (r > g + 6 && r > b + 6) return 'red';
  if (g > r + 6 && g > b + 6) return 'green';
  return null;
}
const isReddish = (c) => classify(c) === 'red';
const isGreenish = (c) => classify(c) === 'green';

function seed(home) {
  const claude = path.join(home, '.claude');
  const projDir = path.join(claude, 'projects', PID);
  fs.mkdirSync(projDir, { recursive: true });

  let n = 0;
  const ts = () => `2026-06-02T10:0${n}:00.000Z`;
  const lines = [];
  // pair() can attach a toolUseResult (the sentinel that carries structuredPatch) to the
  // user message — exactly how Claude Code records it next to the tool_result block.
  function pair(tool, input, toolUseResult) {
    n += 1;
    const id = `tu${n}`;
    lines.push({
      parentUuid: lines.length ? lines[lines.length - 1].uuid : null,
      uuid: `a${n}`, type: 'assistant', cwd: CWD, sessionId: SID, timestamp: ts(),
      message: { role: 'assistant', model: 'claude-test', content: [{ type: 'tool_use', id, name: tool, input }] },
    });
    const userLine = {
      parentUuid: `a${n}`, uuid: `u${n}`, type: 'user', cwd: CWD, sessionId: SID, timestamp: ts(),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok', is_error: false }] },
    };
    if (toolUseResult) userLine.toolUseResult = toolUseResult;
    lines.push(userLine);
  }

  lines.push({
    parentUuid: null, uuid: 'root', type: 'user', cwd: CWD, sessionId: SID,
    timestamp: '2026-06-02T09:59:00.000Z',
    message: { role: 'user', content: 'please make the edits' },
  });

  // (A) Edit with a two-hunk structuredPatch far apart → real line numbers + gap row + red/green.
  pair(
    'Edit',
    { file_path: P('src', 'app.ts'), old_string: 'DELETED_LINE_ALPHA', new_string: 'ADDED_LINE_ALPHA' },
    {
      type: 'update', filePath: P('src', 'app.ts'), userModified: false,
      structuredPatch: [
        { oldStart: 40, oldLines: 3, newStart: 40, newLines: 3,
          lines: [' ctx_before_A', '-DELETED_LINE_ALPHA', '+ADDED_LINE_ALPHA', ' ctx_after_A'] },
        { oldStart: 120, oldLines: 2, newStart: 120, newLines: 2,
          lines: [' ctx_before_B', '+ADDED_LINE_BETA', ' ctx_after_B'] },
      ],
    },
  );

  // (B) Write create (brand-new file) → structuredPatch [] → all-added (green) from input content.
  pair(
    'Write',
    { file_path: P('src', 'created.ts'), content: 'CREATE_BODY_LINE_ONE\nCREATE_BODY_LINE_TWO' },
    { type: 'create', filePath: P('src', 'created.ts'), structuredPatch: [], userModified: false },
  );

  // (C) Write overwrite → structuredPatch with a deletion → old content shown in RED.
  pair(
    'Write',
    { file_path: P('src', 'over.ts'), content: 'KEPT_LINE\nINSERTED_LINE' },
    {
      type: 'update', filePath: P('src', 'over.ts'), userModified: false,
      structuredPatch: [
        { oldStart: 5, oldLines: 2, newStart: 5, newLines: 2,
          lines: [' KEPT_LINE', '-OVERWRITE_DELETED', '+INSERTED_LINE'] },
      ],
    },
  );

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

// bg of the unified row that contains `text` (walk up past transparent inner nodes).
async function rowBg(drawer, text) {
  return drawer.getByText(text, { exact: true }).first().evaluate((el) => {
    let n = el;
    const transparent = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    while (n && transparent(getComputedStyle(n).backgroundColor)) n = n.parentElement;
    return n ? getComputedStyle(n).backgroundColor : null;
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

    // ── (A) Edit: real line numbers + gap + red/green ─────────────────────────
    await drawer.getByRole('button', { name: /app\.ts/ }).click();
    check('real file line number 120 in gutter', await drawer.getByText('120', { exact: true }).count() > 0);
    check('snippet is NOT renumbered from 1 (no lone "1")', await drawer.getByText('40', { exact: true }).count() > 0);
    check('unchanged region folded into a gap row', await drawer.getByText(/unchanged lines/).count() > 0);
    check('deleted line text shown', await drawer.getByText('DELETED_LINE_ALPHA', { exact: true }).isVisible());
    check('added line text shown', await drawer.getByText('ADDED_LINE_ALPHA', { exact: true }).isVisible());
    const delBg = await rowBg(drawer, 'DELETED_LINE_ALPHA');
    const addBg = await rowBg(drawer, 'ADDED_LINE_ALPHA');
    check('deleted line tinted RED', isReddish(delBg), delBg || 'n/a');
    check('added line tinted GREEN', isGreenish(addBg), addBg || 'n/a');
    await page.screenshot({ path: path.join(SHOTS, 'u01-edit-unified.png') });

    // ── (B) Write create: all-added GREEN ─────────────────────────────────────
    await drawer.getByRole('button', { name: /created\.ts/ }).click();
    check('create body line shown', await drawer.getByText('CREATE_BODY_LINE_ONE', { exact: true }).isVisible());
    const createBg = await rowBg(drawer, 'CREATE_BODY_LINE_ONE');
    check('new-file content tinted GREEN', isGreenish(createBg), createBg || 'n/a');
    await page.screenshot({ path: path.join(SHOTS, 'u02-write-create-green.png') });

    // ── (C) Write overwrite: deleted old content RED ──────────────────────────
    await drawer.getByRole('button', { name: /over\.ts/ }).click();
    check('overwrite deleted line shown', await drawer.getByText('OVERWRITE_DELETED', { exact: true }).isVisible());
    const overDelBg = await rowBg(drawer, 'OVERWRITE_DELETED');
    check('overwrite deleted content tinted RED', isReddish(overDelBg), overDelBg || 'n/a');
    await page.screenshot({ path: path.join(SHOTS, 'u03-write-overwrite-red.png') });
  } finally {
    await browser.close();
    child.kill();
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* temp */ }
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('unified-diff ui verify crashed:', e); process.exit(2); });
