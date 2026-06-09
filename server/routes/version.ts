import { Hono } from 'hono';
import { runSelfUpdate } from '../lib/update.ts';
import { getVersionInfo } from '../lib/version.ts';

export const versionRoute = new Hono();

versionRoute.get('/', async (c) => {
  const refresh = c.req.query('refresh') === '1';
  const info = await getVersionInfo(refresh);
  return c.json(info);
});

versionRoute.post('/update', async (c) => {
  if (!isAcceptableOrigin(c.req.header('origin'))) {
    return c.json({ error: 'origin not allowed' }, 403);
  }
  const info = await getVersionInfo();
  if (!info.hasUpdate) {
    return c.json({ error: 'already up to date' }, 400);
  }
  const result = await runSelfUpdate(info.latest);
  return c.json(result);
});

function isAcceptableOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
