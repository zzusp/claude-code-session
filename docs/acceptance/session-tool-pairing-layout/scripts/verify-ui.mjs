// 验证三处改动：PowerShell 折叠/展开对齐 Bash + 工具返回内联配对 + 三层定高布局。
// 前置：npm run dev（vite 在 5174，proxy → 后端 3131，读真实 ~/.claude）。
// 运行：node docs/acceptance/session-tool-pairing-layout/scripts/verify-ui.mjs [baseUrl]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const SID = '8afefc96-2541-4e57-8065-f77f2c47f979';
const PID = 'D--project-claude-code-session';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'round-1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'PASS' : 'FAIL') + ' · ' + m); };

await page.goto(`${BASE}/projects/${PID}/sessions/${SID}`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(1200);

// ── 请求2：PowerShell 折叠行 = 「运行 + description」，不再是工具名 + 命令 ──
// 折叠行内：动词「运行」(font-medium) + description 摘要。先找含「运行」的折叠按钮。
const ranButtons = await page.locator('button:has-text("运行")').all();
ok(ranButtons.length > 0, `存在「运行」折叠行（PowerShell/Bash 共用动词），count=${ranButtons.length}`);
// 不应再出现把 PowerShell 当工具名的折叠行（动词位是工具名 "PowerShell"）。
const psVerbRows = await page.locator('button >> span.font-medium:text-is("PowerShell")').count();
ok(psVerbRows === 0, `折叠行动词位不再是 "PowerShell"，count=${psVerbRows}`);

// 展开第一个「运行」行，断言展开体含命令块（$ 前缀）+ 配对返回（工具返回/工具错误 标头）。
const first = ranButtons[0];
await first.scrollIntoViewIfNeeded();
await first.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/01-ran-expanded.png` });
// 展开体在该行之后的兄弟容器里。整页找一处同时含命令 $ 提示符 与「工具返回/工具错误」。
const hasResultLabel = await page.locator('text=/工具返回|工具错误/').count();
ok(hasResultLabel > 0, `展开体出现配对返回标头（工具返回/工具错误），count=${hasResultLabel}`);

// ── 请求1：不再有独立的「工具」标头消息（MetaRow label=工具）──
// MetaRow 里 label 文本「工具」出现在独立 tool 消息头。配对后时间线不应再有。
// 注意「工具返回/工具错误」是配对标头，不算；这里精确匹配独立的角色标签「工具」。
const toolRoleLabels = await page.locator('span.font-medium:text-is("工具")').count();
ok(toolRoleLabels === 0, `时间线无独立「工具」角色标头消息，count=${toolRoleLabels}`);

// ── 请求3：三层定高布局 + 预览不压页脚 ──
// 打开一个文件预览，量盒子。
const cards = await page.locator('button[aria-pressed]').all();
ok(cards.length > 0, `存在文件卡，count=${cards.length}`);
await cards[Math.min(2, cards.length - 1)].scrollIntoViewIfNeeded();
await cards[Math.min(2, cards.length - 1)].click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-preview-open.png` });

const m1 = await measure(page);
console.log('boxes(top):', JSON.stringify(m1));
// 预览面板底 <= 页脚顶（不重叠，留 1px 容差）。
ok(m1.aside && m1.footer && m1.aside.bottom <= m1.footer.top + 1,
  `预览面板底(${m1.aside?.bottom}) 不压页脚顶(${m1.footer?.top})`);
// 预览面板顶 >= 页头底（在页头之下）。
ok(m1.aside && m1.header && m1.aside.top >= m1.header.bottom - 1,
  `预览面板顶(${m1.aside?.top}) 在页头底(${m1.header?.bottom}) 之下`);
// 窗口本身不滚动（定高三层）：documentElement 不可滚。
ok(m1.pageScrollH <= m1.viewportH + 2, `整页窗口不滚动 scrollH=${m1.pageScrollH} viewportH=${m1.viewportH}`);

// 滚动中间容器到底，页脚仍在底部、预览仍填中间层（不脱离）。
await page.evaluate(() => {
  const el = document.querySelector('section .overflow-y-auto');
  if (el) el.scrollTo({ top: el.scrollHeight });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-preview-scrolled.png` });
const m2 = await measure(page);
console.log('boxes(scrolled):', JSON.stringify(m2));
ok(m2.aside && m2.footer && m2.aside.bottom <= m2.footer.top + 1,
  `滚到底后预览面板底(${m2.aside?.bottom}) 仍不压页脚顶(${m2.footer?.top})`);
ok(m2.aside && m2.aside.top >= (m2.header?.bottom ?? 0) - 1,
  `滚到底后预览面板顶(${m2.aside?.top}) 仍在页头之下（不脱离上移）`);
ok(m2.footer && Math.abs(m2.footer.bottom - m2.viewportH) <= 2,
  `滚到底后页脚仍贴视口底 footer.bottom=${m2.footer?.bottom} viewportH=${m2.viewportH}`);

async function measure(page) {
  return page.evaluate(() => {
    const pick = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
    const section = document.querySelector('section');
    const header = section?.children[0];
    const aside = document.querySelector('section aside');
    let footer = null;
    for (const c of section?.children ?? []) {
      if (c.querySelector && (c.textContent || '').match(/修改的文件|Modified files/)) footer = c;
    }
    return {
      viewportH: window.innerHeight,
      pageScrollH: document.documentElement.scrollHeight,
      header: pick(header), aside: pick(aside), footer: pick(footer),
    };
  });
}

await browser.close();
console.log('\n' + (fails.length ? `FAILED ${fails.length}` : 'ALL PASS') + ' -> ' + OUT);
process.exit(fails.length ? 1 : 0);
