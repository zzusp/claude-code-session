import { Hono } from 'hono';
import { commitImport, ImportError, previewImport } from '../lib/import-bundle.ts';
import type { ImportCollisionPolicy } from '../types.ts';

export const importRoute = new Hono();

const POLICIES: ReadonlySet<ImportCollisionPolicy> = new Set([
  'skip',
  'overwrite-if-newer',
  'keep-both',
]);

importRoute.post('/preview', async (c) => {
  if (!isAcceptableOrigin(c.req.header('origin'))) {
    return c.json({ error: 'origin not allowed' }, 403);
  }
  let body: { bundleDir?: unknown; targetCwd?: unknown; collisionPolicy?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  if (typeof body.bundleDir !== 'string' || body.bundleDir.trim() === '') {
    return c.json({ error: 'bundleDir is required' }, 400);
  }
  const targetCwd =
    typeof body.targetCwd === 'string' && body.targetCwd.trim() !== '' ? body.targetCwd : undefined;

  try {
    const result = await previewImport({
      bundleDir: body.bundleDir,
      targetCwd,
      collisionPolicy: normalizePolicy(body.collisionPolicy),
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

importRoute.post('/', async (c) => {
  if (!isAcceptableOrigin(c.req.header('origin'))) {
    return c.json({ error: 'origin not allowed' }, 403);
  }
  let body: { bundleDir?: unknown; targetCwd?: unknown; collisionPolicy?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  if (typeof body.bundleDir !== 'string' || body.bundleDir.trim() === '') {
    return c.json({ error: 'bundleDir is required' }, 400);
  }
  if (typeof body.targetCwd !== 'string' || body.targetCwd.trim() === '') {
    return c.json({ error: 'targetCwd is required' }, 400);
  }

  try {
    const result = await commitImport({
      bundleDir: body.bundleDir,
      targetCwd: body.targetCwd,
      collisionPolicy: normalizePolicy(body.collisionPolicy),
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

function normalizePolicy(raw: unknown): ImportCollisionPolicy {
  return typeof raw === 'string' && POLICIES.has(raw as ImportCollisionPolicy)
    ? (raw as ImportCollisionPolicy)
    : 'skip';
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
