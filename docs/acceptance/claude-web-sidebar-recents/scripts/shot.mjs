// 再生成配方：侧栏 Recents + Close sidebar + 会话详情简化的验证截图。
//
// 前置：
//   1) npm run build && npm run start   （生产单进程，读真实 ~/.claude）
//   2) npx playwright install chromium  （若本机无 chromium）
// 运行（从仓库根；BASE 用 start 打印的实际端口，OUT 默认写到 ../round-1）：
//   node docs/acceptance/claude-web-sidebar-recents/scripts/shot.mjs [baseUrl] [outDir]
//
// 截 7 张：home(Recents) light/dark、collapsed、reopened、session light/dark、
// session 滚动后（验证 sticky header 钉住）。需本机 ~/.claude 至少一个项目一个会话。
// 注：C 盘满会导致截图写 0 字节——OUT 落到有空间的盘。

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = process.argv[2] || process.env.CCSM_BASE || 'http://127.0.0.1:3131';
const OUT = process.argv[3] || resolve(dirname(fileURLToPath(import.meta.url)), '..', 'round-1');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

async function settle(ms = 800) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}
async function setTheme(mode) {
  await page.evaluate((m) => {
    document.documentElement.classList.toggle('dark', m === 'dark');
    try { localStorage.setItem('theme', m); } catch {}
  }, mode);
  await page.waitForTimeout(300);
}
async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  try {
    localStorage.setItem('sidebar-collapsed', '0');
    localStorage.setItem('locale', 'en');
  } catch {}
});
await page.reload({ waitUntil: 'domcontentloaded' });
await settle();

await setTheme('light'); await shot('01-home-recents-light');
await setTheme('dark');  await shot('02-home-recents-dark');

// Close sidebar (desktop) → floating reopen handle → reopen
await setTheme('light');
await page.locator('aside button[aria-label="Close sidebar"]').first().click();
await page.waitForTimeout(500);
await shot('03-sidebar-collapsed-light');
await page.locator('button[aria-label="Open sidebar"]').first().click();
await page.waitForTimeout(500);
await shot('04-sidebar-reopened-light');

// Simplified session detail
const sessHref = await page.evaluate(
  () => document.querySelector('a[href*="/sessions/"]')?.getAttribute('href') ?? null,
);
if (sessHref) {
  await page.goto(BASE + sessHref, { waitUntil: 'domcontentloaded' });
  await settle();
  await setTheme('light'); await shot('05-session-simplified-light');
  await setTheme('dark');  await shot('06-session-simplified-dark');
  await setTheme('light');
  await page.evaluate(() => window.scrollTo({ top: 700 }));
  await page.waitForTimeout(500);
  await shot('07-session-scrolled-light');
}

await browser.close();
console.log('DONE ->', OUT);
