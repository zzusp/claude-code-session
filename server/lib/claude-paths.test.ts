import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// claude-paths.ts 在模块加载期就锁定 `os.homedir() + .claude` 作为根，
// 所以这里全部用动态 import + vi.resetModules，让每个 case 拿到一份新评估的常量。

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-test-home-'));
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('isUnderClaudeRoot (POSIX 语义)', () => {
  it('对 ~/.claude/ 内的路径返回 true', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
    const { isUnderClaudeRoot, PATHS } = await import('./claude-paths.ts');

    expect(isUnderClaudeRoot(PATHS.root)).toBe(true);
    expect(isUnderClaudeRoot(PATHS.projects)).toBe(true);
    expect(isUnderClaudeRoot(path.join(PATHS.projects, 'some-proj', 'a.jsonl'))).toBe(true);
    expect(isUnderClaudeRoot(PATHS.history)).toBe(true);
  });

  it('对 ~/.claude/ 外的路径返回 false', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
    const { isUnderClaudeRoot } = await import('./claude-paths.ts');

    expect(isUnderClaudeRoot(path.join(tmpHome, 'other'))).toBe(false);
    expect(isUnderClaudeRoot('/etc/passwd')).toBe(false);
    expect(isUnderClaudeRoot(tmpHome)).toBe(false); // 父目录本身不算
  });

  it('挡住 prefix-only 但实为兄弟目录的路径（防 .claude_evil 形态）', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
    const { isUnderClaudeRoot } = await import('./claude-paths.ts');

    // ~/.claude_evil 与 ~/.claude 同前缀，但不是子目录，必须拒绝
    expect(isUnderClaudeRoot(path.join(tmpHome, '.claude_evil', 'x'))).toBe(false);
    expect(isUnderClaudeRoot(path.join(tmpHome, '.claude-other'))).toBe(false);
  });

  it('包含 .. 的目标先 path.resolve 再判断，逃逸出 root 的会被拒绝', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
    const { isUnderClaudeRoot, PATHS } = await import('./claude-paths.ts');

    // .claude/projects/../../escape 解析后位于 tmpHome 之外
    const escaped = path.join(PATHS.projects, '..', '..', 'escape');
    expect(isUnderClaudeRoot(escaped)).toBe(false);
  });
});

describe('isUnderClaudeRoot (Windows 大小写折叠语义)', () => {
  // 说明：claude-paths 走 node:path 而非 path.win32 / path.posix，
  // 真正在 POSIX runtime 把 'C:\...' 喂给 path.resolve 会被当成相对路径处理。
  // 想在 macOS 上跑 win32 分支需要重写实现选 path.win32，本测试不动产代码。
  // 退而求其次：在 POSIX 上用全小写假根模拟"折叠后"的等价语义，
  // 校验大小写折叠分支确实把不同大小写的目标视为同一棵子树。
  it('折叠后路径以小写比较，混合大小写目标仍被识别为子树（POSIX 模拟）', async () => {
    const origPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    // 在 POSIX 环境下喂 POSIX 风格的假根，避免 path.resolve('C:\\') 把它当相对路径
    const lowerRoot = path.join(tmpHome, 'home', 'alice');
    vi.spyOn(os, 'homedir').mockReturnValue(lowerRoot);
    try {
      const { isUnderClaudeRoot } = await import('./claude-paths.ts');
      const claudeRoot = path.join(lowerRoot, '.claude');
      // 大小写互换的子路径仍判定为子树
      expect(isUnderClaudeRoot(claudeRoot)).toBe(true);
      expect(isUnderClaudeRoot(claudeRoot.toUpperCase())).toBe(true);
      expect(isUnderClaudeRoot(path.join(claudeRoot.toUpperCase(), 'projects', 'foo'))).toBe(true);
      // 兄弟目录（同前缀但非子目录）仍然拒绝
      expect(isUnderClaudeRoot(claudeRoot + '_evil')).toBe(false);
    } finally {
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    }
  });
});

describe('PATHS 派生项', () => {
  it('所有子路径都基于 root 拼接，方便集中改 layout', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
    const { PATHS } = await import('./claude-paths.ts');

    expect(PATHS.root).toBe(path.join(tmpHome, '.claude'));
    expect(PATHS.projects).toBe(path.join(PATHS.root, 'projects'));
    expect(PATHS.fileHistory).toBe(path.join(PATHS.root, 'file-history'));
    expect(PATHS.sessionEnv).toBe(path.join(PATHS.root, 'session-env'));
    expect(PATHS.sessions).toBe(path.join(PATHS.root, 'sessions'));
    expect(PATHS.history).toBe(path.join(PATHS.root, 'history.jsonl'));
  });
});
