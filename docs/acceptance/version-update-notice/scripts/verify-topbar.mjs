import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3134';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'round-2');

const MOCK = {
  current: '1.0.1', latest: '1.2.0', hasUpdate: true, releaseName: 'v1.2.0',
  releaseNotes: '## x\n- y', releaseUrl: 'https://e/x', publishedAt: '2026-06-01T00:00:00Z',
  repositoryUrl: 'https://github.com/zzusp/claude-code-session', checkError: null,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 414, height: 820 }, deviceScaleFactor: 2 });
await page.route('**/api/version', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK) }));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const btn = page.locator('button[aria-label]', { has: page.locator('span.pulse-danger') }).first();
await btn.scrollIntoViewIfNeeded();
await btn.screenshot({ path: `${OUT}/04-hamburger-dot.png` });
await browser.close();
console.log('hamburger shot saved');
