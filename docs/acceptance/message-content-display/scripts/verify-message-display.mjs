// 验证「会话消息内容展示优化」：markdown 渲染 / tool 摘要 / diff 展开体 /
// result 来源标注 / 弹窗对话栏一致性 / 搜索高亮 / 暗色主题 / 无 console error。
// 只读：不触发任何删除 / 导入 / 导出。
//
// 前置：`npm run dev` 已起（vite 5173 + backend 3131）。
// 运行：node docs/acceptance/message-content-display/scripts/verify-message-display.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.CCSM_URL ?? 'http://localhost:5173';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'round-1');
mkdirSync(OUT, { recursive: true });

const results = [];
function pass(id, detail) {
  results.push({ id, ok: true, detail });
  console.log(`PASS ${id} — ${detail}`);
}
function fail(id, detail) {
  results.push({ id, ok: false, detail });
  console.error(`FAIL ${id} — ${detail}`);
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`server not reachable at ${BASE}`);
}

/** 在真实数据里挑一个「含 markdown 回复 + Edit/Write 调用 + tool_result」的会话。 */
async function pickSession() {
  const projects = await (await fetch(`${BASE}/api/projects`)).json();
  // 当前仓库的项目优先（必然有 markdown 重度会话），其余按活跃度兜底。
  projects.sort((a, b) =>
    a.id.includes('claude-code-session') ? -1 : b.id.includes('claude-code-session') ? 1 : 0,
  );
  for (const p of projects) {
    const sessions = await (
      await fetch(`${BASE}/api/projects/${encodeURIComponent(p.id)}/sessions`)
    ).json();
    sessions.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    for (const s of sessions.slice(0, 12)) {
      const d = await (
        await fetch(
          `${BASE}/api/sessions/${encodeURIComponent(p.id)}/${encodeURIComponent(s.id)}`,
        )
      ).json();
      let hasMd = false;
      let hasEdit = false;
      let hasResult = false;
      let word = null;
      for (const m of d.messages ?? []) {
        for (const b of m.blocks ?? []) {
          if (m.type === 'assistant' && b.type === 'text') {
            if (/```|\*\*|^#{1,3} /m.test(b.text)) {
              hasMd = true;
              // 取一个码块外的普通词做搜索高亮用例。
              if (!word) {
                const prose = b.text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
                word = (prose.match(/[A-Za-z]{5,}/) ?? [])[0] ?? null;
              }
            }
          }
          if (b.type === 'tool_use' && ['Edit', 'Write', 'MultiEdit'].includes(b.name)) {
            hasEdit = true;
          }
          if (b.type === 'tool_result') hasResult = true;
        }
      }
      if (hasMd && hasEdit && hasResult && word) {
        return { projectId: p.id, sessionId: s.id, word };
      }
    }
  }
  throw new Error('no suitable session found (markdown + edit + result)');
}

await waitForServer();
const target = await pickSession();
console.log(`target session: ${target.projectId}/${target.sessionId} (word=${target.word})`);

const browser = await chromium.launch();
const consoleErrors = [];
async function openPage(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.addInitScript(
    ([t]) => {
      localStorage.setItem('locale', 'zh');
      localStorage.setItem('theme', t);
    },
    [theme],
  );
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  await page.goto(
    `${BASE}/projects/${encodeURIComponent(target.projectId)}/sessions/${encodeURIComponent(target.sessionId)}`,
  );
  await page.waitForSelector('ol article', { timeout: 30_000 });
  return { ctx, page };
}

const { ctx, page } = await openPage('light');

// V3 markdown 实渲染：assistant 气泡（rounded-tl-sm）内出现结构化元素。
{
  const n = await page
    .locator('article.rounded-tl-sm :is(strong, h1, h2, h3, ul, ol, pre, code, table)')
    .count();
  if (n > 0) pass('V3', `assistant 气泡内 markdown 元素 ×${n}`);
  else fail('V3', 'assistant 气泡内未发现 markdown 元素');
}

// V4 tool_use 折叠头摘要非空。
{
  const summaries = page.locator('article button span.truncate.font-mono');
  const n = await summaries.count();
  let nonEmpty = 0;
  for (let i = 0; i < Math.min(n, 20); i++) {
    if (((await summaries.nth(i).textContent()) ?? '').trim()) nonEmpty++;
  }
  if (nonEmpty > 0) pass('V4', `tool 摘要非空 ×${nonEmpty}（采样 ${Math.min(n, 20)}）`);
  else fail('V4', `未发现非空 tool 摘要（span 总数 ${n}）`);
}

// V5 Edit/Write 展开体 −/+ diff 着色行。
{
  const editHeader = page
    .locator('article button', {
      // 工具名 span 渲染为「<svg/> Edit」，textContent 带前导空格。
      has: page.locator('span', { hasText: /^\s*(Edit|Write|MultiEdit)\s*$/ }),
    })
    .first();
  if ((await editHeader.count()) === 0) {
    fail('V5', '页面内未找到 Edit/Write tool 块（windowing 可能截走，需换会话）');
  } else {
    await editHeader.scrollIntoViewIfNeeded();
    await editHeader.click();
    const diffRows = page.locator(
      'article [class*="moss-soft"], article [class*="danger-soft"]',
    );
    await diffRows.first().waitFor({ timeout: 5_000 }).catch(() => {});
    const n = await diffRows.count();
    if (n > 0) pass('V5', `展开后 diff 着色行/块 ×${n}`);
    else fail('V5', '展开 Edit/Write 后未出现 −/+ 着色行');
  }
}

// V6 tool_result 头部带来源工具名（「工具返回 · X」）。
{
  const n = await page.locator('article span', { hasText: /^(工具返回|工具错误)$/ }).count();
  const withName = await page
    .locator('article span:has-text("工具返回") span:has-text("·")')
    .count();
  if (withName > 0) pass('V6', `result 头部带来源工具名 ×${withName}`);
  else fail('V6', `result 头部未见来源工具名（result 块 ×${n}）`);
}

// V8 搜索高亮：输入 markdown 内文词，断言 assistant 气泡里出现 <mark>。
{
  const input = page.locator('input[type="search"]');
  await input.fill(target.word);
  await page.waitForTimeout(800); // deferred query + 重渲染
  const marks = await page.locator('article.rounded-tl-sm mark').count();
  if (marks > 0) pass('V8', `markdown 内文 <mark> ×${marks}（query=${target.word}）`);
  else fail('V8', `搜索 ${target.word} 后 assistant 气泡内无 <mark>`);
  await page.screenshot({ path: path.join(OUT, 'search-highlight.png') });
  await input.fill('');
  await page.waitForTimeout(500);
}

await page.screenshot({ path: path.join(OUT, 'timeline-light.png'), fullPage: false });

// V7 弹窗对话栏：同样的 markdown 渲染 + tool 摘要 + split diff。
{
  await page.locator('button[aria-label]', { hasText: '修改的文件' }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900); // 入场动画 + 对话栏滚动定位
  const md = await dialog
    .locator('article.rounded-tl-sm :is(strong, h1, h2, h3, ul, ol, pre, code, table)')
    .count();
  const summaries = await dialog.locator('button span.truncate.font-mono').count();
  const split = await dialog.locator('[class*="moss-soft"], [class*="danger-soft"]').count();
  if (md > 0 && summaries > 0) {
    pass('V7', `弹窗对话栏 markdown ×${md}、tool 摘要 ×${summaries}、diff 着色 ×${split}`);
  } else {
    fail('V7', `弹窗对话栏 markdown ×${md}、tool 摘要 ×${summaries}`);
  }
  await page.screenshot({ path: path.join(OUT, 'drawer.png') });
  await page.keyboard.press('Escape');
}

await ctx.close();

// V9 暗色主题。
{
  const { ctx: dctx, page: dpage } = await openPage('dark');
  const n = await dpage
    .locator('article.rounded-tl-sm :is(strong, h2, pre, code, ul)')
    .count();
  if (n > 0) pass('V9', `暗色主题 markdown 元素 ×${n}`);
  else fail('V9', '暗色主题下未发现 markdown 元素');
  await dpage.screenshot({ path: path.join(OUT, 'timeline-dark.png') });
  await dctx.close();
}

// V10 console error。
{
  const real = consoleErrors.filter(
    // vite dev 下 React DevTools 提示等噪声不算；保守起见只过滤明确无害项。
    (e) => !e.includes('Download the React DevTools'),
  );
  if (real.length === 0) pass('V10', '无 console error / pageerror');
  else fail('V10', `console errors ×${real.length}: ${real.slice(0, 3).join(' | ')}`);
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
