import { Hono } from 'hono';
import {
  computeCleanupSuggestions,
  deleteOrphan,
} from '../lib/cleanup-suggestions.ts';
import { isSafeId } from '../lib/safe-id.ts';
import type { DiskOrphanDeleteResult, DiskOrphanKind } from '../types.ts';

export const diskCleanupRoute = new Hono();

diskCleanupRoute.get('/suggestions', async (c) => {
  const data = await computeCleanupSuggestions();
  return c.json(data);
});

diskCleanupRoute.delete('/orphan/:kind/:sid', async (c) => {
  if (!isAcceptableOrigin(c.req.header('origin'))) {
    return c.json({ error: 'origin not allowed' }, 403);
  }
  const kindParam = c.req.param('kind');
  const sid = c.req.param('sid');
  if (!isOrphanKind(kindParam)) {
    return c.json({ error: 'invalid kind' }, 400);
  }
  if (!isSafeId(sid)) {
    return c.json({ error: 'invalid id' }, 400);
  }
  const result = deleteOrphan(kindParam, sid);
  if (!result.ok) {
    const status = result.reason === 'orphan no longer exists' ? 404 : 409;
    return c.json({ error: result.reason }, status);
  }
  const payload: DiskOrphanDeleteResult = {
    sessionId: sid,
    kind: kindParam,
    freedBytes: result.freedBytes,
  };
  return c.json(payload);
});

function isOrphanKind(v: string): v is DiskOrphanKind {
  return v === 'file-history' || v === 'session-env';
}

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
