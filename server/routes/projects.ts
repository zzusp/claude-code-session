import { Hono } from 'hono';
import { deleteProject } from '../lib/delete-project.ts';
import { loadProjectMemory } from '../lib/load-memory.ts';
import { isSafeId } from '../lib/safe-id.ts';
import { listProjects, listSessionsForProject } from '../lib/scan.ts';

export const projectsRoute = new Hono();

projectsRoute.get('/', async (c) => {
  const projects = await listProjects();
  return c.json(projects);
});

projectsRoute.get('/:id/sessions', async (c) => {
  const id = c.req.param('id');
  if (!isSafeId(id)) return c.json({ error: 'invalid project id' }, 400);
  const sessions = await listSessionsForProject(id);
  return c.json(sessions);
});

projectsRoute.get('/:id/memory', async (c) => {
  const id = c.req.param('id');
  if (!isSafeId(id)) return c.json({ error: 'invalid project id' }, 400);
  const memory = await loadProjectMemory(id);
  return c.json(memory);
});

projectsRoute.delete('/:id', async (c) => {
  if (!isAcceptableOrigin(c.req.header('origin'))) {
    return c.json({ error: 'origin not allowed' }, 403);
  }
  const id = c.req.param('id');
  if (!isSafeId(id)) return c.json({ error: 'invalid project id' }, 400);
  const result = await deleteProject(id);
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
