// Round-2 验证：对抗性 review 修复后的「读用富渲染，搜用原文高亮」行为。
// 只读真实会话数据，无写操作。
//
// 覆盖：
//   R1 非搜索态：assistant 文本是 markdown（有结构元素）。
//   R2 搜索态：同一批 assistant 文本退回纯文本（markdown 元素消失）、且命中处有 <mark>。
//   R3 搜索态：tool_use 展开体退回 JSON 原文 + <mark>（#4 回归修复：命中可见）。
//   R4 非搜索态：tool_use 展开体是富 diff（−/+ 着色），不是 JSON。
//   R5 无 console error。
//
// 前置：`npm run dev` 已起。
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.CCSM_URL ?? 'http://localhost:5173';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'round-2');
mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (id, d) => (results.push({ id, ok: true }), console.log(`PASS ${id} — ${d}`));
const fail = (id, d) => (results.push({ id, ok: false }), console.error(`FAIL ${id} — ${d}`));

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server not reachable at ${BASE}`);
}

/** 找一个含 markdown 回复 + Edit 工具的会话，并从某个 Edit 的 file_path 取一个
 *  独特 token 作为搜索词（必命中该 tool_use 的 JSON haystack）。 */
async function pick() {
  const projects = await (await fetch(`${BASE}/api/projects`)).json();
  projects.sort((a, b) => (a.id.includes('claude-code-session') ? -1 : 1));
  for (const p of projects) {
    const sessions = await (
      await fetch(`${BASE}/api/projects/${encodeURIComponent(p.id)}/sessions`)
    ).json();
    sessions.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    for (const s of sessions.slice(0, 12)) {
      const d = await (
        await fetch(`${BASE}/api/sessions/${encodeURIComponent(p.id)}/${encodeURIComponent(s.id)}`)
      ).json();
      let hasMd = false;
      let editToken = null;
      for (const m of d.messages ?? []) {
        for (const b of m.blocks ?? []) {
          if (m.type === 'assistant' && b.type === 'text' && /```|\*\*|^#{1,3} /m.test(b.text)) {
            hasMd = true;
          }
          if (b.type === 'tool_use' && b.name === 'Edit' && !editToken) {
            const fp = b.input?.file_path ?? '';
            const base = String(fp).split(/[\\/]/).pop() ?? '';
            // 取文件名里的一段字母 token（>=5 长，避免高频噪声）。
            const tok = (base.match(/[A-Za-z]{5,}/) ?? [])[0];
            if (tok) editToken = tok;
          }
        }
      }
      if (hasMd && editToken) return { projectId: p.id, sessionId: s.id, token: editToken };
    }
  }
  throw new Error('no suitable session (markdown + Edit with token)');
}

await waitForServer();
const target = await pick();
console.log(`target: ${target.projectId}/${target.sessionId} token=${target.token}`);

const browser = await chromium.launch();
const consoleErrors = [];
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('locale', 'zh'));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto(
  `${BASE}/projects/${encodeURIComponent(target.projectId)}/sessions/${encodeURIComponent(target.sessionId)}`,
);
await page.waitForSelector('ol article', { timeout: 30_000 });

// 仅取 markdown 独有元素：strong/标题/引用/表格。pre/code/ul 在 tool 块（result 的
// <pre>、TodoList 的 <ul>、JSON 体的 <pre>）里也出现，不能用来判定 markdown 是否在渲染。
const mdSelector = 'article.rounded-tl-sm :is(strong, h1, h2, h3, h4, h5, blockquote, table)';

// R1 非搜索态：markdown 元素在场。markdown 是 lazy chunk，先等它渲染出来再计数。
await page.waitForSelector(mdSelector, { timeout: 15_000 }).catch(() => {});
const mdBefore = await page.locator(mdSelector).count();
if (mdBefore > 0) pass('R1', `非搜索态 markdown 元素 ×${mdBefore}`);
else fail('R1', '非搜索态未见 markdown 元素');

// R4 非搜索态：展开一个 Edit → 富 diff（−/+ 着色），不是 JSON。
{
  const editHeader = page
    .locator('article button', {
      has: page.locator('span', { hasText: /^\s*Edit\s*$/ }),
    })
    .first();
  if ((await editHeader.count()) === 0) {
    fail('R4', '未找到 Edit tool 块');
  } else {
    await editHeader.scrollIntoViewIfNeeded();
    await editHeader.click();
    await page.waitForTimeout(400);
    const diff = await page
      .locator('article [class*="moss-soft"], article [class*="danger-soft"]')
      .count();
    if (diff > 0) pass('R4', `非搜索态 Edit 展开＝富 diff 着色 ×${diff}`);
    else fail('R4', '非搜索态 Edit 展开未见 diff 着色');
    await editHeader.click(); // 收起，避免影响后续
    await page.waitForTimeout(200);
  }
}

// 进入搜索态。
const input = page.locator('input[type="search"]');
await input.fill(target.token);
await page.waitForTimeout(900); // deferredQuery + 重渲染

// R2 搜索态：markdown 元素消失（文本退回纯文本），且有 <mark>。
{
  const mdAfter = await page.locator(mdSelector).count();
  const marks = await page.locator('article.rounded-tl-sm mark').count();
  if (mdAfter === 0 && marks > 0) {
    pass('R2', `搜索态 markdown 元素=0、纯文本 <mark> ×${marks}`);
  } else {
    fail('R2', `搜索态 markdown 元素=${mdAfter}（应 0）、<mark>=${marks}（应 >0）`);
  }
}

// R3 搜索态：展开命中 Edit → JSON 原文体 + <mark>。
{
  const editHeader = page
    .locator('article button', {
      has: page.locator('span', { hasText: /^\s*Edit\s*$/ }),
    })
    .first();
  if ((await editHeader.count()) === 0) {
    fail('R3', '搜索态下列表内无 Edit 块（haystack 未命中？）');
  } else {
    await editHeader.scrollIntoViewIfNeeded();
    await editHeader.click();
    await page.waitForTimeout(400);
    // JSON 体特征：含 "file_path" 键文本；命中 token 应被 <mark> 包裹。
    const body = editHeader.locator('xpath=following-sibling::div[1]');
    const bodyText = (await body.textContent()) ?? '';
    const jsonish = bodyText.includes('file_path') || bodyText.includes('"');
    const marksInBody = await body.locator('mark').count();
    if (jsonish && marksInBody > 0) {
      pass('R3', `搜索态 Edit 展开＝JSON 原文 + <mark> ×${marksInBody}`);
    } else {
      fail('R3', `搜索态 Edit 展开：jsonish=${jsonish}、bodyMark=${marksInBody}`);
    }
    await page.screenshot({ path: path.join(OUT, 'search-tool-json.png') });
  }
}

// R5 console error。
{
  const real = consoleErrors.filter((e) => !e.includes('Download the React DevTools'));
  if (real.length === 0) pass('R5', '无 console error');
  else fail('R5', `console errors ×${real.length}: ${real.slice(0, 3).join(' | ')}`);
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
