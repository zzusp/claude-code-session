import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './claude-paths.ts';

export interface ActivePidEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  alive: boolean;
  /** Absolute path to the PID file we read this entry from. */
  sourceFile: string;
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return out.toLowerCase().includes(`"${pid}"`);
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Windows: enumerate every running PID with one `tasklist` call.
 * Each call is ~400-700ms; doing it once instead of per-PID turns the
 * cost from O(N×tasklist) into O(1×tasklist) for `readActivePidEntries`.
 */
function listAlivePidsWindows(): Set<number> {
  const set = new Set<number>();
  try {
    const out = execFileSync('tasklist', ['/NH', '/FO', 'CSV'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split(/\r?\n/)) {
      // Format: "Image Name","PID","Session Name","Session#","Mem Usage"
      const m = line.match(/^"[^"]*","(\d+)"/);
      if (m) set.add(Number(m[1]));
    }
  } catch {
    /* return whatever we have; callers treat unknown PIDs as dead */
  }
  return set;
}

export function readActivePidEntries(): ActivePidEntry[] {
  if (!fs.existsSync(PATHS.sessions)) return [];
  const alivePids = process.platform === 'win32' ? listAlivePidsWindows() : null;
  const entries: ActivePidEntry[] = [];
  for (const name of fs.readdirSync(PATHS.sessions)) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(PATHS.sessions, name);
    try {
      const obj = JSON.parse(fs.readFileSync(full, 'utf8')) as {
        pid?: number;
        sessionId?: string;
        cwd?: string;
      };
      if (typeof obj.pid !== 'number' || typeof obj.sessionId !== 'string') continue;
      const alive = alivePids ? alivePids.has(obj.pid) : isPidAlive(obj.pid);
      entries.push({
        pid: obj.pid,
        sessionId: obj.sessionId,
        cwd: typeof obj.cwd === 'string' ? obj.cwd : '',
        alive,
        sourceFile: full,
      });
    } catch {
      // skip malformed PID files
    }
  }
  return entries;
}

export function buildActiveSessionMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of readActivePidEntries()) {
    if (e.alive) map.set(e.sessionId, e.pid);
  }
  return map;
}
