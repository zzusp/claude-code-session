import { Hono } from 'hono';
import { deleteSessions, type DeleteRequestItem } from '../lib/delete.ts';
import { loadSessionDetail } from '../lib/load-session.ts';
import { isSafeId } from '../lib/safe-id.ts';

export const sessionsRoute = new Hono();

sessionsRoute.get('/:projectId/:sessionId', async (c) => {
  const projectId = c.req.param('projectId');
  const sessionId = c.req.param('sessionId');
  if (!isSafeId(projectId) || !isSafeId(sessionId)) {
    return c.json({ error: 'invalid id' }, 400);
  }
  const detail = await loadSessionDetail(projectId, sessionId);
  if (!detail) return c.json({ error: 'not found' }, 404);
  return c.json(detail);
});

sessionsRoute.delete('/', async (c) => {
  if (!isAcceptableOrigin(c.req.header('origin'))) {
    return c.json({ error: 'origin not allowed' }, 403);
  }
  let body: { items?: unknown };
  try {
    body = (await c.req.json()) as { items?: unknown };
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: 'items[] required' }, 400);
  }
  const items: DeleteRequestItem[] = [];
  for (const raw of body.items) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof (raw as { projectId?: unknown }).projectId !== 'string' ||
      typeof (raw as { sessionId?: unknown }).sessionId !== 'string'
    ) {
      return c.json({ error: 'each item needs projectId and sessionId strings' }, 400);
    }
    items.push(raw as DeleteRequestItem);
  }
  const result = await deleteSessions(items);
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
