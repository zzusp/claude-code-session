import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3134';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'round-2');
mkdirSync(OUT, { recursive: true });

const MOCK = {
  current: '1.0.1',
  latest: '1.2.0',
  hasUpdate: true,
  releaseName: 'v1.2.0',
  releaseNotes: [
    '## Highlights',
    '',
    '- Added a **red dot** update indicator on the sidebar and hamburger menu',
    '- Rendered `markdown` release notes inside the modal',
    '- See [the pull request](https://github.com/zzusp/claude-code-session/pull/53) for details',
    '',
    '### Bug fixes',
    '',
    '1. First fix with some *emphasis*',
    '2. Second fix',
    '',
    '```',
    'npm install -g @zzusp/ccsm@latest',
    '```',
  ].join('\n'),
  releaseUrl: 'https://github.com/zzusp/claude-code-session/releases/tag/v1.2.0',
  publishedAt: '2026-06-01T00:00:00Z',
  repositoryUrl: 'https://github.com/zzusp/claude-code-session',
  checkError: null,
};

const browser = await chromium.launch();
const fails = [];

async function route(page) {
  await page.route('**/api/version', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK) }),
  );
}

// ---- Desktop: sidebar badge + modal ----
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await route(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const badge = page.getByText('新版本 v1.2.0', { exact: false });
  await badge.waitFor({ timeout: 5000 }).catch(() => fails.push('desktop: update badge not found'));
  await page.screenshot({ path: `${OUT}/01-sidebar-badge.png` });

  await badge.click();
  await page.waitForTimeout(400);

  const modalHasHeading = await page.getByText('Highlights', { exact: false }).count();
  if (!modalHasHeading) fails.push('modal: rendered heading "Highlights" missing');
  const link = page.getByRole('link', { name: /pull request/ });
  if (!(await link.count())) fails.push('modal: rendered markdown link missing');
  const strong = await page.locator('strong', { hasText: 'red dot' }).count();
  if (!strong) fails.push('modal: rendered bold text missing');
  const pre = await page.locator('pre', { hasText: 'npm install' }).count();
  if (!pre) fails.push('modal: rendered code block missing');

  await page.screenshot({ path: `${OUT}/02-modal-markdown.png` });
  await page.close();
}

// ---- Mobile: hamburger red dot ----
{
  const page = await browser.newPage({ viewport: { width: 414, height: 820 } });
  await route(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const dot = page.locator('button[aria-label] span.pulse-danger');
  if (!(await dot.count())) fails.push('mobile: hamburger red dot (pulse-danger) missing');
  await page.screenshot({ path: `${OUT}/03-mobile-hamburger-dot.png` });
  await page.close();
}

await browser.close();

if (fails.length) {
  console.log('FAIL:\n' + fails.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('PASS: all version-update UI assertions green');
