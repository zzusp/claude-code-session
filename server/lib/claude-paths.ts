import os from 'node:os';
import path from 'node:path';

const claudeRoot = path.join(os.homedir(), '.claude');

export const PATHS = {
  root: claudeRoot,
  projects: path.join(claudeRoot, 'projects'),
  fileHistory: path.join(claudeRoot, 'file-history'),
  sessionEnv: path.join(claudeRoot, 'session-env'),
  sessions: path.join(claudeRoot, 'sessions'),
  history: path.join(claudeRoot, 'history.jsonl'),
} as const;

const isWin = process.platform === 'win32';

function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p);
  return isWin ? resolved.toLowerCase() : resolved;
}

const claudeRootNorm = normalizeForCompare(claudeRoot);

export function isUnderClaudeRoot(target: string): boolean {
  const norm = normalizeForCompare(target);
  return norm === claudeRootNorm || norm.startsWith(claudeRootNorm + path.sep);
}

export function getCacheDir(): string {
  const env = process.env;
  const base =
    env.XDG_CACHE_HOME ??
    env.LOCALAPPDATA ??
    path.join(os.homedir(), '.cache');
  return path.join(base, 'claude-session-viewer');
}
