import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// delete.ts 的关键不变量是"5 处级联 + 2 类安全网"：
//   级联 = projects/<id>.jsonl + projects/<id>/ + file-history/<id>/ + session-env/<id>/
//          + history.jsonl 里的行 + sessions/<pid>.json
//   安全网 = live PID OR 5 分钟内 mtime → 直接跳过
// 每次都 mock claude-paths.ts 把 PATHS 指到一个独立 tmp dir，
// 保证测试不会读到真实 ~/.claude。

let fakeRoot: string;
let fakePaths: {
  root: string;
  projects: string;
  fileHistory: string;
  sessionEnv: string;
  sessions: string;
  history: string;
};

vi.mock('./claude-paths.ts', () => {
  // 注意：vi.mock 是 hoist 的，工厂里不能引用模块作用域变量。
  // 改用 process.env.CCSM_TEST_ROOT 桥接，afterEach 时清掉。
  return {
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
  };
});

beforeEach(() => {
  fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-delete-test-'));
  process.env.CCSM_TEST_ROOT = fakeRoot;
  fakePaths = {
    root: fakeRoot,
    projects: path.join(fakeRoot, 'projects'),
    fileHistory: path.join(fakeRoot, 'file-history'),
    sessionEnv: path.join(fakeRoot, 'session-env'),
    sessions: path.join(fakeRoot, 'sessions'),
    history: path.join(fakeRoot, 'history.jsonl'),
  };
  fs.mkdirSync(fakePaths.projects, { recursive: true });
  fs.mkdirSync(fakePaths.fileHistory, { recursive: true });
  fs.mkdirSync(fakePaths.sessionEnv, { recursive: true });
  fs.mkdirSync(fakePaths.sessions, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CCSM_TEST_ROOT;
  fs.rmSync(fakeRoot, { recursive: true, force: true });
});

interface SessionFixture {
  projectId: string;
  sessionId: string;
  jsonlPath: string;
  subdirPath: string;
  fhPath: string;
  sePath: string;
}

/** 在 fake root 下铺出一份 5 个位置都存在的 session 文件布局。*/
function makeSession(opts: { sessionId?: string; projectId?: string; mtimeMs?: number } = {}): SessionFixture {
  const sessionId = opts.sessionId ?? 'sid-' + Math.random().toString(36).slice(2, 10);
  const projectId = opts.projectId ?? '-Users-alice-proj';
  const projectDir = path.join(fakePaths.projects, projectId);
  fs.mkdirSync(projectDir, { recursive: true });

  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
  fs.writeFileSync(jsonlPath, JSON.stringify({ type: 'user', sessionId }) + '\n');

  const subdirPath = path.join(projectDir, sessionId);
  fs.mkdirSync(subdirPath, { recursive: true });
  fs.writeFileSync(path.join(subdirPath, 'notes.md'), 'sub');

  const fhPath = path.join(fakePaths.fileHistory, sessionId);
  fs.mkdirSync(fhPath, { recursive: true });
  fs.writeFileSync(path.join(fhPath, 'a.txt'), 'fh');

  const sePath = path.join(fakePaths.sessionEnv, sessionId);
  fs.mkdirSync(sePath, { recursive: true });
  fs.writeFileSync(path.join(sePath, 'env.json'), '{}');

  // mtime 拨到一小时前，绕开 5 分钟安全网
  const mtime = opts.mtimeMs ?? Date.now() - 60 * 60 * 1000;
  fs.utimesSync(jsonlPath, mtime / 1000, mtime / 1000);

  return { projectId, sessionId, jsonlPath, subdirPath, fhPath, sePath };
}

function writeHistory(lines: Array<Record<string, unknown>>): void {
  fs.writeFileSync(
    fakePaths.history,
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
  );
}

function writePidFile(pid: number, sessionId: string, cwd = '/Users/alice/proj'): string {
  const file = path.join(fakePaths.sessions, `${pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ pid, sessionId, cwd }));
  return file;
}

describe('deleteSessions：5 处级联清理', () => {
  it('一次 delete 删 jsonl + subdir + file-history + session-env + history 行 + 死 PID 文件', async () => {
    const { deleteSessions } = await import('./delete.ts');
    const s = makeSession();

    // history.jsonl：留两条同 sid、一条别的
    writeHistory([
      { sessionId: s.sessionId, project: '/Users/alice/proj', timestamp: 'T1', display: 'q1' },
      { sessionId: s.sessionId, project: '/Users/alice/proj', timestamp: 'T2', display: 'q2' },
      { sessionId: 'sid-other', project: '/Users/alice/proj', timestamp: 'T3', display: 'q3' },
    ]);

    // 一个已死 PID 文件：进程不存在，但 sessions/<pid>.json 还在
    const deadPid = 999999;
    const pidFile = writePidFile(deadPid, s.sessionId);

    const res = await deleteSessions([{ projectId: s.projectId, sessionId: s.sessionId }]);

    expect(res.deleted).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);
    expect(res.historyLinesRemoved).toBe(2);

    expect(fs.existsSync(s.jsonlPath)).toBe(false);
    expect(fs.existsSync(s.subdirPath)).toBe(false);
    expect(fs.existsSync(s.fhPath)).toBe(false);
    expect(fs.existsSync(s.sePath)).toBe(false);
    expect(fs.existsSync(pidFile)).toBe(false);

    // history.jsonl 的非目标行保留
    const remaining = fs
      .readFileSync(fakePaths.history, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { sessionId: string });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.sessionId).toBe('sid-other');

    expect(res.deleted[0]!.cleaned).toEqual(
      expect.arrayContaining([
        'projects/<id>.jsonl',
        'projects/<id>/',
        'file-history/<id>/',
        'session-env/<id>/',
      ]),
    );
  });

  it('history.jsonl 没有目标 sid 时不重写（atomic 三步不触发）', async () => {
    const { deleteSessions } = await import('./delete.ts');
    const s = makeSession();
    writeHistory([{ sessionId: 'sid-other', project: '/x', timestamp: 'T0', display: 'q' }]);
    const before = fs.readFileSync(fakePaths.history, 'utf8');

    const res = await deleteSessions([{ projectId: s.projectId, sessionId: s.sessionId }]);
    expect(res.historyLinesRemoved).toBe(0);
    expect(fs.readFileSync(fakePaths.history, 'utf8')).toBe(before);

    // 没有遗留的 .tmp-clean
    const stray = fs.readdirSync(fakeRoot).filter((n) => n.startsWith('history.jsonl.tmp-'));
    expect(stray).toEqual([]);
  });
});

describe('deleteSessions：安全网', () => {
  it('id 不合法（含 .. / 斜杠 / 点开头）直接 skip', async () => {
    const { deleteSessions } = await import('./delete.ts');
    const res = await deleteSessions([
      { projectId: 'p', sessionId: '../escape' },
      { projectId: 'p', sessionId: '.hidden' },
    ]);
    expect(res.deleted).toHaveLength(0);
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped.every((s) => s.reason === 'invalid id')).toBe(true);
  });

  it('jsonl 在 5 分钟内被改过则跳过（可能仍在用）', async () => {
    const { deleteSessions } = await import('./delete.ts');
    // mtime = now，落在 5 分钟窗口内
    const s = makeSession({ mtimeMs: Date.now() });
    const res = await deleteSessions([{ projectId: s.projectId, sessionId: s.sessionId }]);
    expect(res.deleted).toHaveLength(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/within the last 5 minutes/);
    // 文件仍在
    expect(fs.existsSync(s.jsonlPath)).toBe(true);
    expect(fs.existsSync(s.fhPath)).toBe(true);
  });

  it('sessionId 出现在仍存活的 PID 文件中则跳过', async () => {
    const { deleteSessions } = await import('./delete.ts');
    const s = makeSession();
    // 用当前进程的 pid 当"活进程"，process.kill(pid, 0) 必为 true
    writePidFile(process.pid, s.sessionId);

    const res = await deleteSessions([{ projectId: s.projectId, sessionId: s.sessionId }]);
    expect(res.deleted).toHaveLength(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/live PID/);
    expect(fs.existsSync(s.jsonlPath)).toBe(true);
  });

  it('一批里混合 OK / live / recent，逐条独立判定', async () => {
    const { deleteSessions } = await import('./delete.ts');
    const ok = makeSession({ sessionId: 'sid-ok' });
    const liveSid = 'sid-live';
    const live = makeSession({ sessionId: liveSid });
    writePidFile(process.pid, liveSid);
    const recent = makeSession({ sessionId: 'sid-recent', mtimeMs: Date.now() });

    const res = await deleteSessions([
      { projectId: ok.projectId, sessionId: ok.sessionId },
      { projectId: live.projectId, sessionId: live.sessionId },
      { projectId: recent.projectId, sessionId: recent.sessionId },
    ]);

    expect(res.deleted.map((d) => d.sessionId)).toEqual(['sid-ok']);
    expect(res.skipped.map((s) => s.sessionId).sort()).toEqual(['sid-live', 'sid-recent']);
    expect(fs.existsSync(ok.jsonlPath)).toBe(false);
    expect(fs.existsSync(live.jsonlPath)).toBe(true);
    expect(fs.existsSync(recent.jsonlPath)).toBe(true);
  });
});
