// 临时：截一张含围栏代码块的 assistant 气泡特写（验收 round-1 的视觉抽查）。
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

// 全项目扫描：找一条含 ``` 围栏代码块的 assistant 消息，拿 uuid 深链 focus。
let pid = null;
let sid = null;
let target = null;
outer: for (const p of await (await fetch(`${BASE}/api/projects`)).json()) {
  const sessions = await (
    await fetch(`${BASE}/api/projects/${encodeURIComponent(p.id)}/sessions`)
  ).json();
  sessions.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  for (const s of sessions.slice(0, 20)) {
    const detail = await (
      await fetch(`${BASE}/api/sessions/${encodeURIComponent(p.id)}/${encodeURIComponent(s.id)}`)
    ).json();
    const hit = (detail.messages ?? []).find(
      (m) =>
        m.type === 'assistant' &&
        !m.isMeta &&
        m.blocks.some((b) => b.type === 'text' && /```\w*\n[\s\S]*?```/.test(b.text)),
    );
    if (hit) {
      pid = p.id;
      sid = s.id;
      target = hit;
      break outer;
    }
  }
}
if (!target) throw new Error('no assistant message with fenced code found anywhere');
console.log(`fenced-code message: ${pid}/${sid} uuid=${target.uuid}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
await page.addInitScript(() => localStorage.setItem('locale', 'zh'));
await page.goto(`${BASE}/projects/${pid}/sessions/${sid}?focus=${target.uuid}`);
await page.waitForSelector(`[data-uuid="${target.uuid}"]`, { timeout: 30_000 });

const bubble = page.locator(`[data-uuid="${target.uuid}"] article`).first();
await bubble.scrollIntoViewIfNeeded();
await page.waitForTimeout(1600); // 等 focus 滚动 + flash 结束
await bubble.locator('[class*="group/code"] pre').first().hover(); // 复制按钮现身
await page.waitForTimeout(300);
const box = await bubble.boundingBox();
await page.screenshot({
  path: 'docs/acceptance/message-content-display/round-1/markdown-zoom.png',
  clip: { x: box.x - 8, y: Math.max(0, box.y - 8), width: box.width + 16, height: Math.min(box.height + 16, 1150) },
});
console.log('saved markdown-zoom.png', JSON.stringify(box));
await browser.close();
