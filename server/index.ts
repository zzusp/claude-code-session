import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS } from './lib/claude-paths.ts';
import { findAvailablePort } from './lib/port.ts';
import { diskRoute } from './routes/disk.ts';
import { projectsRoute } from './routes/projects.ts';
import { sessionsRoute } from './routes/sessions.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const PORT_RANGE_START = 3131;
const PORT_RANGE_END = 3140;
const HOST = '127.0.0.1';

const app = new Hono();

app.onError((err, c) => {
  console.error('[server] unhandled error', err);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: err.message || 'internal error' }, 500);
  }
  return c.text('internal error', 500);
});

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    claudeRoot: PATHS.root,
    claudeRootExists: fs.existsSync(PATHS.root),
    platform: process.platform,
    node: process.version,
    pid: process.pid,
  }),
);

app.route('/api/projects', projectsRoute);
app.route('/api/sessions', sessionsRoute);
app.route('/api/disk-usage', diskRoute);

if (fs.existsSync(distDir)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), distDir) || '.' }));
  app.get('*', serveStatic({ path: path.relative(process.cwd(), path.join(distDir, 'index.html')) }));
}

const port = await findAvailablePort(PORT_RANGE_START, PORT_RANGE_END, HOST);

serve({ fetch: app.fetch, hostname: HOST, port }, (info) => {
  console.log(`[server] listening on http://${info.address}:${info.port}`);
  console.log(`[server] claudeRoot = ${PATHS.root}`);
  if (!fs.existsSync(distDir)) {
    console.log(`[server] dist/ not built yet — open the Vite dev server (npm run dev:web prints its URL)`);
  }
});
