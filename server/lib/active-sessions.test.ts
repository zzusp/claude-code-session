import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// active-sessions.ts 是 delete / import "跳过活会话"安全网的事实源头。
// 测试覆盖 isPidAlive 的 POSIX 分支 + buildActiveSessionMap 对死/活 PID 的区分。

let fakeRoot: string;

vi.mock('./claude-paths.ts', () => ({
  get PATHS() {
    const root = process.env.CCSM_TEST_ROOT!;
    return {
      root,
      projects: path.join(root, 'projects'),
      fileHistory: path.join(root, 'file-history'),
      sessionEnv: path.join(root, 'session-env'),
      sessions: path.join(root, 'sessions'),
      history: path.join(root, 'history.jsonl'),
    };
  },
  isUnderClaudeRoot(target: string): boolean {
    const root = process.env.CCSM_TEST_ROOT!;
    const resolved = path.resolve(target);
    return resolved === root || resolved.startsWith(root + path.sep);
  },
  getCacheDir(): string {
    return path.join(process.env.CCSM_TEST_ROOT!, '_cache');
  },
}));

beforeEach(() => {
  fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-active-test-'));
  process.env.CCSM_TEST_ROOT = fakeRoot;
  fs.mkdirSync(path.join(fakeRoot, 'sessions'), { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CCSM_TEST_ROOT;
  fs.rmSync(fakeRoot, { recursive: true, force: true });
});

describe('isPidAlive (POSIX)', () => {
  it('当前进程 pid 必为活', async () => {
    const { isPidAlive } = await import('./active-sessions.ts');
    // 仅在非 Windows 平台跑 POSIX 断言；CI 上若在 Windows 这条用 process.platform 跳过
    if (process.platform === 'win32') return;
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('明显不可能的 pid 不应判活', async () => {
    const { isPidAlive } = await import('./active-sessions.ts');
    if (process.platform === 'win32') return;
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-1)).toBe(false);
    expect(isPidAlive(Number.NaN)).toBe(false);
  });

  it('一个上限附近、几乎不可能存在的 pid 判死', async () => {
    const { isPidAlive } = await import('./active-sessions.ts');
    if (process.platform === 'win32') return;
    // 4194304 是 Linux 默认 pid_max；macOS 99998；两边都极不可能命中真实进程
    expect(isPidAlive(4194303)).toBe(false);
  });
});

describe('readActivePidEntries / buildActiveSessionMap', () => {
  function writePidFile(pid: number, sessionId: string): void {
    fs.writeFileSync(
      path.join(fakeRoot, 'sessions', `${pid}.json`),
      JSON.stringify({ pid, sessionId, cwd: '/Users/alice/proj' }),
    );
  }

  it('活进程被读出且 alive=true、死进程 alive=false', async () => {
    const { readActivePidEntries, buildActiveSessionMap } = await import('./active-sessions.ts');
    if (process.platform === 'win32') return;

    writePidFile(process.pid, 'sid-live');
    writePidFile(4194303, 'sid-dead');

    const entries = readActivePidEntries();
    const live = entries.find((e) => e.sessionId === 'sid-live');
    const dead = entries.find((e) => e.sessionId === 'sid-dead');
    expect(live?.alive).toBe(true);
    expect(dead?.alive).toBe(false);

    const map = buildActiveSessionMap();
    expect(map.get('sid-live')).toBe(process.pid);
    expect(map.has('sid-dead')).toBe(false);
  });

  it('PID 文件格式不合（缺字段 / 非 JSON）静默跳过，不抛', async () => {
    const { readActivePidEntries } = await import('./active-sessions.ts');
    if (process.platform === 'win32') return;

    fs.writeFileSync(path.join(fakeRoot, 'sessions', '111.json'), 'not json');
    fs.writeFileSync(
      path.join(fakeRoot, 'sessions', '222.json'),
      JSON.stringify({ sessionId: 'no-pid-here' }),
    );
    fs.writeFileSync(
      path.join(fakeRoot, 'sessions', '333.json'),
      JSON.stringify({ pid: 333 }), // 缺 sessionId
    );

    const entries = readActivePidEntries();
    expect(entries).toEqual([]);
  });

  it('sessions 目录不存在时返回空（不创建副作用）', async () => {
    const { readActivePidEntries } = await import('./active-sessions.ts');
    fs.rmSync(path.join(fakeRoot, 'sessions'), { recursive: true, force: true });
    expect(readActivePidEntries()).toEqual([]);
    expect(fs.existsSync(path.join(fakeRoot, 'sessions'))).toBe(false);
  });
});
