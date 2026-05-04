import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { searchAll, type SearchAllOpts } from '../lib/search-all.ts';
import type { SearchBlockKind } from '../types.ts';

export const searchRoute = new Hono();

const ALL_KINDS: ReadonlyArray<SearchBlockKind> = [
  'text',
  'tool_use',
  'tool_result',
  'thinking',
];
const DEFAULT_INCLUDE: ReadonlySet<SearchBlockKind> = new Set([
  'text',
  'tool_use',
  'thinking',
]);

const Q_MIN = 2;
const Q_MAX = 200;
const PER_SESSION_MIN = 1;
const PER_SESSION_MAX = 20;
const PER_SESSION_DEFAULT = 5;
const MAX_SESSIONS_MIN = 1;
const MAX_SESSIONS_MAX = 200;
const MAX_SESSIONS_DEFAULT = 50;

searchRoute.get('/', async (c) => {
  const q = c.req.query('q') ?? '';
  if (q.length < Q_MIN) {
    return c.json({ error: `q must be at least ${Q_MIN} characters` }, 400);
  }
  if (q.length > Q_MAX) {
    return c.json({ error: `q exceeds max length ${Q_MAX}` }, 400);
  }

  const perSession = clampInt(c.req.query('perSession'), PER_SESSION_MIN, PER_SESSION_MAX, PER_SESSION_DEFAULT);
  const maxSessions = clampInt(c.req.query('maxSessions'), MAX_SESSIONS_MIN, MAX_SESSIONS_MAX, MAX_SESSIONS_DEFAULT);
  const include = parseInclude(c.req.query('include'));

  const opts: SearchAllOpts = { query: q, include, perSession, maxSessions };

  c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
  c.header('Cache-Control', 'no-store');
  c.header('X-Accel-Buffering', 'no');

  return stream(c, async (s) => {
    let aborted = false;
    s.onAbort(() => {
      aborted = true;
    });
    for await (const event of searchAll(opts)) {
      if (aborted) return;
      await s.write(JSON.stringify(event) + '\n');
    }
  });
});

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function parseInclude(raw: string | undefined): ReadonlySet<SearchBlockKind> {
  if (!raw) return DEFAULT_INCLUDE;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const set = new Set<SearchBlockKind>();
  for (const p of parts) {
    if ((ALL_KINDS as readonly string[]).includes(p)) {
      set.add(p as SearchBlockKind);
    }
  }
  return set.size > 0 ? set : DEFAULT_INCLUDE;
}
