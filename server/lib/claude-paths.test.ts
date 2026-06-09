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
  // claude-paths 现在按 process.platform 显式选 path.win32 / path.posix，
  // 所以在 POSIX runtime 上把 platform 设成 'win32' + 喂真实 Windows 路径形式
  // （盘符 + 反斜杠 / UNC），就能跑通真实的 path.win32 盘符正规化 + 大小写折叠分支，
  // 不再靠 POSIX 假根模拟。isUnderClaudeRoot 是纯字符串比较，不碰 fs，无需铺真实目录。
  // async 包装：必须 `return await fn()`，让 finally 的平台还原发生在 await import + 断言
  // 全部完成之后。若写成同步 `return fn()`，finally 会在动态 import 真正求值模块前就还原，
  // 模块顶层读到的就不是 'win32' 了。
  async function withWin32<T>(fn: () => Promise<T>): Promise<T> {
    const origPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      return await fn();
    } finally {
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    }
  }

  it('真实 C:\\ 路径：盘符大小写 + 路径大小写折叠后判同一子树', async () => {
    await withWin32(async () => {
      vi.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\Foo');
      const { isUnderClaudeRoot, PATHS } = await import('./claude-paths.ts');

      expect(PATHS.root).toBe('C:\\Users\\Foo\\.claude');

      // root 自身 + 子路径
      expect(isUnderClaudeRoot('C:\\Users\\Foo\\.claude')).toBe(true);
      expect(isUnderClaudeRoot('C:\\Users\\Foo\\.claude\\projects\\bar')).toBe(true);
      // 盘符小写 + 整段大小写互换仍判为同一子树
      expect(isUnderClaudeRoot('c:\\users\\foo\\.claude\\projects\\bar')).toBe(true);
      expect(isUnderClaudeRoot('C:\\USERS\\FOO\\.CLAUDE')).toBe(true);
      // 兄弟目录（同前缀非子树）拒绝
      expect(isUnderClaudeRoot('C:\\Users\\Foo\\.claude_evil')).toBe(false);
      // 父目录本身不算
      expect(isUnderClaudeRoot('C:\\Users\\Foo')).toBe(false);
      // 含 .. 逃逸出 root 的被 path.win32.resolve 解析后拒绝
      expect(isUnderClaudeRoot('C:\\Users\\Foo\\.claude\\..\\..\\escape')).toBe(false);
    });
  });

  it('UNC 路径（\\\\server\\share\\...）同样走 win32 正规化 + 折叠', async () => {
    await withWin32(async () => {
      vi.spyOn(os, 'homedir').mockReturnValue('\\\\server\\share\\Foo');
      const { isUnderClaudeRoot, PATHS } = await import('./claude-paths.ts');

      expect(PATHS.root).toBe('\\\\server\\share\\Foo\\.claude');
      expect(isUnderClaudeRoot('\\\\server\\share\\Foo\\.claude')).toBe(true);
      expect(isUnderClaudeRoot('\\\\SERVER\\SHARE\\FOO\\.claude\\file-history\\sid')).toBe(true);
      expect(isUnderClaudeRoot('\\\\server\\share\\Foo\\.claude_evil')).toBe(false);
    });
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
