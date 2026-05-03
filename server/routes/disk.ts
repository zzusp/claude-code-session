import { Hono } from 'hono';
import { computeDiskUsage } from '../lib/disk-usage.ts';

export const diskRoute = new Hono();

diskRoute.get('/', async (c) => {
  const usage = await computeDiskUsage();
  return c.json(usage);
});
