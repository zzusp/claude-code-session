import os from 'node:os';
import path from 'node:path';

const isWin = process.platform === 'win32';

// 显式按平台选 path 实现，而不是用 node:path 默认导出。
// 真实运行时这与默认导出等价（Windows 上默认就是 path.win32，POSIX 上是 path.posix），
// 行为零变化；好处是单测能在 macOS / Linux 上把 process.platform 设成 'win32' 后喂真实
// `C:\...` / UNC 形式，跑通 Windows 盘符正规化 + 大小写折叠的全分支——
// 默认导出在 POSIX runtime 会把 `C:\...` 当相对路径，没法测真实 Windows 路径形态。
const platformPath = isWin ? path.win32 : path.posix;

const claudeRoot = platformPath.join(os.homedir(), '.claude');

export const PATHS = {
  root: claudeRoot,
  projects: platformPath.join(claudeRoot, 'projects'),
  fileHistory: platformPath.join(claudeRoot, 'file-history'),
  sessionEnv: platformPath.join(claudeRoot, 'session-env'),
  sessions: platformPath.join(claudeRoot, 'sessions'),
  history: platformPath.join(claudeRoot, 'history.jsonl'),
} as const;

function normalizeForCompare(p: string): string {
  const resolved = platformPath.resolve(p);
  return isWin ? resolved.toLowerCase() : resolved;
}

const claudeRootNorm = normalizeForCompare(claudeRoot);

export function isUnderClaudeRoot(target: string): boolean {
  const norm = normalizeForCompare(target);
  return norm === claudeRootNorm || norm.startsWith(claudeRootNorm + platformPath.sep);
}

export function getCacheDir(): string {
  const env = process.env;
  const base =
    env.XDG_CACHE_HOME ??
    env.LOCALAPPDATA ??
    platformPath.join(os.homedir(), '.cache');
  return platformPath.join(base, 'claude-session-viewer');
}
