// 再生成配方：仿 Claude 桌面端改版的明暗双主题截图。
//
// 前置：
//   1) npm run build && npm run start   （生产单进程，读真实 ~/.claude，端口 3131）
//   2) npx playwright install chromium  （若本机无 chromium）
// 运行（从仓库根）：
//   node docs/acceptance/claude-desktop-redesign/scripts/shot.mjs [baseUrl]
// 产物：写到本脚本同级的 ../round-1/*.png（覆盖）。
//
// 截到 home / project / session 三页 × light / dark 两主题 = 6 张。需要本机
// ~/.claude 下至少有一个项目、且该项目至少有一个会话，否则后两页会跳过。

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = process.argv[2] || process.env.CCSM_BASE || 'http://127.0.0.1:3131';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'round-1');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();

async function settle() {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700); // 字体 + stagger 动画落定
}
async function setTheme(mode) {
  await page.evaluate((m) => {
    document.documentElement.classList.toggle('dark', m === 'dark');
    try { localStorage.setItem('theme', m); } catch {}
  }, mode);
  await page.waitForTimeout(350);
}
async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await settle();
await setTheme('light'); await shot('01-home-light');
await setTheme('dark');  await shot('02-home-dark');

await setTheme('light');
const projHref = await page.evaluate(() => document.querySelector('a[href^="/projects/"]')?.getAttribute('href') ?? null);
if (projHref) {
  await page.goto(BASE + projHref, { waitUntil: 'domcontentloaded' });
  await settle();
  await setTheme('light'); await shot('03-project-light');
  await setTheme('dark');  await shot('04-project-dark');

  await setTheme('light');
  const sessHref = await page.evaluate(() => document.querySelector('a[href*="/sessions/"]')?.getAttribute('href') ?? null);
  if (sessHref) {
    await page.goto(BASE + sessHref, { waitUntil: 'domcontentloaded' });
    await settle();
    await page.waitForTimeout(800);
    await setTheme('light'); await shot('05-session-light');
    await setTheme('dark');  await shot('06-session-dark');
  }
}

await browser.close();
console.log('DONE ->', OUT);
