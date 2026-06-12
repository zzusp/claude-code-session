// 验证：会话内搜索仍能命中“配对走的工具返回正文”（haystack 折叠）+ 错误过滤仍能筛出
// 工具错误（独立 result 已剔除，错误信息现内联在调用块）。
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:5174';
const SID = '8afefc96-2541-4e57-8065-f77f2c47f979';
const PID = 'D--project-claude-code-session';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'PASS' : 'FAIL') + ' · ' + m); };

await page.goto(`${BASE}/projects/${PID}/sessions/${SID}`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(1200);

// ── 错误过滤：点页脚「错误」段，应筛出至少 1 条（含 PowerShell typecheck 失败那条）──
await page.locator('button[role="radio"]:has-text("错误")').click();
await page.waitForTimeout(500);
const errBubbles = await page.locator('[data-uuid]').count();
ok(errBubbles > 0, `错误过滤筛出 ${errBubbles} 条消息（含工具错误的调用块）`);
await page.screenshot({ path: 'docs/acceptance/session-tool-pairing-layout/round-1/04-error-filter.png' });
// 切回全部
await page.locator('button[role="radio"]:has-text("全部")').click();
await page.waitForTimeout(300);

// ── 搜索：搜一个只出现在“工具返回正文”里的词（typecheck 报错里的 TS2307）──
// 打开会话内搜索（标题栏放大镜）。
await page.locator('button[aria-label="在此会话中搜索…"]').click();
await page.waitForTimeout(300);
await page.locator('input[type="search"]').fill('TS2307');
await page.waitForTimeout(700);
const matched = await page.locator('[data-uuid]').count();
ok(matched > 0, `搜索“TS2307”（仅存在于工具返回正文）命中 ${matched} 条 → haystack 折叠生效`);
await page.screenshot({ path: 'docs/acceptance/session-tool-pairing-layout/round-1/05-search-result-body.png' });

await browser.close();
console.log('\n' + (fails.length ? `FAILED ${fails.length}` : 'ALL PASS'));
process.exit(fails.length ? 1 : 0);
