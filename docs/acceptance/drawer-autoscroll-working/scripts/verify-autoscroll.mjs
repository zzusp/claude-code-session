// 验证「Claude 处理中、有新消息到达时自动滚到底」——同时覆盖会话时间线与「修改的文件」抽屉对话栏。
// 用 page.route() mock 掉 4 个 GET 接口，把会话详情接口做成「每次轮询可增长」，
// 通过在测试步骤之间 bump `phase` 让下一次实时轮询带回更多消息，断言滚动跟随行为。
//
// 运行（PowerShell）：
//   $env:PLAYWRIGHT_BROWSERS_PATH="<job tmp>/pw-browsers"
//   node --experimental-vm-modules <此文件>   # playwright 从 job tmp 的 node_modules 解析
// BASE / pwModules 由环境变量传入，缺省见下。
// playwright 从隔离安装目录解析（PW_MODULES 指向含 playwright 的 node_modules）。
import { pathToFileURL } from 'node:url';
const pwEntry = (process.env.PW_MODULES || '.') + '/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(pwEntry).href);

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3133';
const PID = 'proj-abc123';
const SID = 'sess-xyz789';

// 抽屉对话栏「贴底」阈值是 120px，断言留点余量。
const STICK_PX = 130;

const nowIso = () => new Date().toISOString();

// 造一条「高」消息，确保少量消息也能撑出滚动条。
function userMsg(n) {
  return {
    uuid: `u-${n}`, parentUuid: n === 1 ? null : `a-${n - 1}`, type: 'user', ts: nowIso(),
    model: null, isMeta: false,
    blocks: [{ type: 'text', text: `User turn #${n}\n` + Array.from({ length: 6 }, (_, i) => `line ${i} of user request ${n}`).join('\n') }],
  };
}
function assistantWorkingMsg(n) {
  return {
    uuid: `a-${n}`, parentUuid: `u-${n}`, type: 'assistant', ts: nowIso(),
    model: 'claude-3-5-sonnet-20241022', isMeta: false,
    blocks: [
      { type: 'text', text: `Assistant turn #${n}\n` + Array.from({ length: 6 }, (_, i) => `line ${i} of assistant reply ${n}`).join('\n') },
      // 最后一个 block 是 tool_use → lastTurnIncomplete=true → isWorking=true（配合 lastAt=now）。
      { type: 'tool_use', id: `tu-${n}`, name: 'Edit', input: { file_path: '/Users/dev/myproject/src/utils.ts', old_string: `old ${n}`, new_string: `new ${n}` } },
    ],
  };
}

// 会话由 `turns` 对 user/assistant 组成；测试通过改 turns 模拟「新消息到达」。
let turns = 6; // 12 条消息起步，足以撑出滚动条
function buildMessages() {
  const out = [];
  for (let n = 1; n <= turns; n++) { out.push(userMsg(n)); out.push(assistantWorkingMsg(n)); }
  return out;
}
function detailBody() {
  const messages = buildMessages();
  return {
    meta: {
      sessionId: SID, projectId: PID, cwd: '/Users/dev/myproject', gitBranch: 'feature/autoscroll',
      version: '0.22.1', firstAt: '2026-06-08T10:00:00Z', lastAt: nowIso(),
      messageCount: messages.length, bytes: 65536, title: 'Auto-scroll verify', customTitle: null,
    },
    messages, truncated: false,
  };
}

const projectsBody = [{
  id: PID, encodedCwd: 'enc', decodedCwd: '/Users/dev/myproject', cwdResolved: true,
  sessionCount: 1, totalBytes: 65536, lastActiveAt: nowIso(),
}];
const sessionsBody = [{
  id: SID, projectId: PID, title: 'Auto-scroll verify', customTitle: null,
  firstAt: '2026-06-08T10:00:00Z', lastAt: nowIso(), messageCount: 12, bytes: 65536,
  relatedBytes: { jsonl: 50000, subdir: 10000, fileHistory: 4000, sessionEnv: 1536 },
  isLivePid: true, isRecentlyActive: true, livePid: 12345, isWorking: true,
}];
const modifiedBody = {
  sessionId: SID, projectId: PID, cwd: '/Users/dev/myproject',
  files: [{
    filePath: '/Users/dev/myproject/src/utils.ts', relativePath: 'src/utils.ts',
    editCount: 1, writeCount: 0, multiEditCount: 0, notebookEditCount: 0, totalCount: 1, errorCount: 0,
    firstAt: '2026-06-08T11:30:05Z', lastAt: nowIso(),
    operations: [{
      toolUseId: 'tu-1', toolName: 'Edit', ts: nowIso(), messageUuid: 'a-1', errored: false, pending: false,
      structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [' ctx', '-old', '+new'] }],
    }],
  }],
};

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

// 抽屉对话栏滚动容器：唯一带 overflow-auto 且祖先是 role=dialog 的滚动 div。
const convDistanceFromBottom = async (page) => page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const el = dialog && [...dialog.querySelectorAll('div')].find((d) => {
    const s = getComputedStyle(d);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 4;
  });
  if (!el) return null;
  return { dist: el.scrollHeight - (el.scrollTop + el.clientHeight), sh: el.scrollHeight, st: el.scrollTop, ch: el.clientHeight };
});

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()); });

  await page.route('**/api/projects', (r) => r.fulfill(json(projectsBody)));
  await page.route('**/api/projects/*/sessions', (r) => r.fulfill(json(sessionsBody)));
  await page.route('**/api/sessions/*/*/modified-files', (r) => r.fulfill(json(modifiedBody)));
  await page.route('**/api/sessions/*/*', (r) => {
    if (r.request().url().includes('/modified-files')) return r.fallback();
    return r.fulfill(json(detailBody()));
  });

  await page.goto(`${BASE}/projects/${PID}/sessions/${SID}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Assistant turn #', { timeout: 10000 });

  // ── Test C: 会话时间线（window 滚动）在底部时跟随新消息 ───────────────────
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  turns += 1; // 新增一对消息
  await page.waitForTimeout(2800); // 等下一次实时轮询(2s)带回 + 渲染 + 平滑滚动
  const winDist = await page.evaluate(() => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight));
  check('timeline: 停在底部时新消息到达自动跟随', winDist < STICK_PX, `distFromBottom=${Math.round(winDist)}px`);

  // ── 打开「修改的文件」抽屉 ──────────────────────────────────────────────
  await page.getByRole('button', { name: 'Open modified files' }).click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  await page.waitForTimeout(400); // 等首挂载 layout effect 落底

  const d0 = await convDistanceFromBottom(page);
  check('drawer: 打开时对话栏落在底部', d0 && d0.dist < STICK_PX, d0 ? `dist=${Math.round(d0.dist)}px sh=${d0.sh}` : 'no scroll container');

  // ── Test A: 抽屉停在底部时，新消息到达自动跟随 ───────────────────────────
  turns += 1;
  await page.waitForTimeout(2800);
  const dA = await convDistanceFromBottom(page);
  check('drawer: 停在底部时新消息到达自动跟随', dA && dA.dist < STICK_PX, dA ? `dist=${Math.round(dA.dist)}px` : 'no container');

  // ── Test B: 抽屉滚到顶部读历史时，新消息到达不被拽回底部 ──────────────────
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const el = dialog && [...dialog.querySelectorAll('div')].find((d) => {
      const s = getComputedStyle(d);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 4;
    });
    if (el) el.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  turns += 1;
  await page.waitForTimeout(2800);
  const dB = await convDistanceFromBottom(page);
  // 在顶部 → 距底部应远大于阈值（未被拽下去）。
  check('drawer: 往上翻历史时新消息到达不打断（不拽回底部）', dB && dB.dist > STICK_PX, dB ? `dist=${Math.round(dB.dist)}px st=${dB.st}` : 'no container');

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
  if (failed.length) { process.exitCode = 1; }
};

main().catch((e) => { console.error('SCRIPT ERROR', e); process.exitCode = 1; });
