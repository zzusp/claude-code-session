import { Hono } from 'hono';
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
