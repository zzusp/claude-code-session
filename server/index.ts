import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PATHS } from './lib/claude-paths.ts';
import { findAvailablePort } from './lib/port.ts';
import { diskRoute } from './routes/disk.ts';
import { importRoute } from './routes/import.ts';
import { projectsRoute } from './routes/projects.ts';
import { searchRoute } from './routes/search.ts';
import { sessionsRoute } from './routes/sessions.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const PORT_RANGE_START = 3131;
const PORT_RANGE_END = 3140;
const DEFAULT_HOST = '127.0.0.1';

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
app.route('/api/search', searchRoute);
app.route('/api/import', importRoute);

if (fs.existsSync(distDir)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), distDir) || '.' }));
  app.get('*', serveStatic({ path: path.relative(process.cwd(), path.join(distDir, 'index.html')) }));
}

function parseCliArgs() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      options: {
        port: { type: 'string', short: 'p' },
        host: { type: 'string' },
        open: { type: 'boolean', short: 'o' },
      },
    });
  } catch (err) {
    console.error(`[server] ${(err as Error).message}`);
    console.error('[server] run "ccsm --help" for usage');
    process.exit(1);
  }
}

const { values } = parseCliArgs();
const host = values.host ?? DEFAULT_HOST;
const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';

let port: number;
if (values.port !== undefined) {
  const requested = Number(values.port);
  if (!Number.isInteger(requested) || requested < 1 || requested > 65535) {
    console.error(`[server] invalid --port "${values.port}" (expected an integer 1..65535)`);
    process.exit(1);
  }
  try {
    port = await findAvailablePort(requested, requested, host);
  } catch {
    console.error(`[server] port ${requested} on ${host} is already in use`);
    process.exit(1);
  }
} else {
  port = await findAvailablePort(PORT_RANGE_START, PORT_RANGE_END, host);
}

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`[server] listening on http://${info.address}:${info.port}`);
  console.log(`[server] claudeRoot = ${PATHS.root}`);
  if (!isLoopback) {
    console.warn(
      `[server] WARNING: bound to ${host} (not loopback). The UI is now reachable from your network ` +
        `and has NO authentication — anyone who can reach this host:port can read and delete your ` +
        `Claude Code history. Only do this on a network you trust.`,
    );
  }
  if (!fs.existsSync(distDir)) {
    console.log('[server] dist/ not built yet — run "npm run build" (or open the Vite dev server: npm run dev:web)');
  }
  if (values.open) {
    const browseHost = isLoopback ? (host === '::1' ? '[::1]' : host) : 'localhost';
    openInBrowser(`http://${browseHost}:${info.port}`);
  }
});

function openInBrowser(url: string): void {
  let cmd: string;
  if (process.platform === 'win32') cmd = 'explorer.exe';
  else if (process.platform === 'darwin') cmd = 'open';
  else cmd = 'xdg-open';
  try {
    const child = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => console.error('[server] could not open browser:', err.message));
    child.unref();
  } catch (err) {
    console.error('[server] could not open browser:', (err as Error).message);
  }
}
