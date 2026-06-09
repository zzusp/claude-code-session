import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 用 CCSM_TEST_ROOT 跨进程桥接的写法跟 delete.test.ts 保持一致——vi.mock 的工厂
// 必须 hoist 安全，闭包里不能引用模块作用域变量。
vi.mock('./claude-paths.ts', () => {
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

import { loadModifiedFiles } from './modified-files.ts';

let fakeRoot: string;

beforeEach(() => {
  fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-modfiles-test-'));
  process.env.CCSM_TEST_ROOT = fakeRoot;
  fs.mkdirSync(path.join(fakeRoot, 'projects'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(fakeRoot, { recursive: true, force: true });
  delete process.env.CCSM_TEST_ROOT;
});

function writeJsonl(projectId: string, sessionId: string, lines: object[]): string {
  const dir = path.join(fakeRoot, 'projects', projectId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

function userMsg(uuid: string, ts: string, content: unknown): object {
  return { type: 'user', uuid, timestamp: ts, message: { content } };
}

function assistantMsg(uuid: string, ts: string, content: unknown): object {
  return { type: 'assistant', uuid, timestamp: ts, message: { content } };
}

function toolUse(id: string, name: string, input: unknown): object {
  return { type: 'tool_use', id, name, input };
}

function toolResult(toolUseId: string, isError = false): object {
  return { type: 'tool_result', tool_use_id: toolUseId, content: '', is_error: isError };
}

describe('loadModifiedFiles', () => {
  it('returns null when session jsonl missing', async () => {
    const out = await loadModifiedFiles('proj', 'no-such-sid');
    expect(out).toBeNull();
  });

  it('aggregates Edit/Write/MultiEdit/NotebookEdit by filePath and counts per-tool', async () => {
    writeJsonl('proj-1', 'sid-1', [
      { type: 'summary', cwd: '/Users/me/repo' },
      assistantMsg('a1', '2026-06-01T10:00:00.000Z', [
        toolUse('t1', 'Edit', { file_path: '/Users/me/repo/src/a.ts', old_string: 'x', new_string: 'y' }),
      ]),
      userMsg('u1', '2026-06-01T10:00:01.000Z', [toolResult('t1', false)]),
      assistantMsg('a2', '2026-06-01T10:01:00.000Z', [
        toolUse('t2', 'Edit', { file_path: '/Users/me/repo/src/a.ts', old_string: 'a', new_string: 'b' }),
      ]),
      userMsg('u2', '2026-06-01T10:01:01.000Z', [toolResult('t2', false)]),
      assistantMsg('a3', '2026-06-01T10:02:00.000Z', [
        toolUse('t3', 'Write', { file_path: '/Users/me/repo/src/b.ts', content: 'new file' }),
      ]),
      userMsg('u3', '2026-06-01T10:02:01.000Z', [toolResult('t3', false)]),
      assistantMsg('a4', '2026-06-01T10:03:00.000Z', [
        toolUse('t4', 'MultiEdit', {
          file_path: '/Users/me/repo/src/b.ts',
          edits: [{ old_string: 'a', new_string: 'b' }],
        }),
      ]),
      userMsg('u4', '2026-06-01T10:03:01.000Z', [toolResult('t4', false)]),
      assistantMsg('a5', '2026-06-01T10:04:00.000Z', [
        toolUse('t5', 'NotebookEdit', {
          notebook_path: '/Users/me/repo/nb.ipynb',
          cell_id: 'c1',
          new_source: 'print(1)',
        }),
      ]),
      userMsg('u5', '2026-06-01T10:04:01.000Z', [toolResult('t5', false)]),
    ]);

    const out = await loadModifiedFiles('proj-1', 'sid-1');
    expect(out).not.toBeNull();
    expect(out!.cwd).toBe('/Users/me/repo');
    expect(out!.files).toHaveLength(3);

    // 排序 by lastAt desc: nb.ipynb (10:04) → b.ts (10:03) → a.ts (10:01)
    const nb = out!.files[0]!;
    const b = out!.files[1]!;
    const a = out!.files[2]!;
    expect(nb.filePath).toBe('/Users/me/repo/nb.ipynb');
    expect(nb.notebookEditCount).toBe(1);
    expect(nb.relativePath).toBe('nb.ipynb');

    expect(b.filePath).toBe('/Users/me/repo/src/b.ts');
    expect(b.relativePath).toBe('src/b.ts');
    expect(b.writeCount).toBe(1);
    expect(b.multiEditCount).toBe(1);
    expect(b.totalCount).toBe(2);

    expect(a.filePath).toBe('/Users/me/repo/src/a.ts');
    expect(a.relativePath).toBe('src/a.ts');
    expect(a.editCount).toBe(2);
    expect(a.totalCount).toBe(2);
    expect(a.errorCount).toBe(0);
    expect(a.firstAt).toBe('2026-06-01T10:00:00.000Z');
    expect(a.lastAt).toBe('2026-06-01T10:01:00.000Z');
    expect(a.operations.map((o) => o.toolUseId)).toEqual(['t1', 't2']);
    expect(a.operations.every((o) => !o.pending && !o.errored)).toBe(true);
  });

  it('marks errored when tool_result.is_error=true and pending when no result line found', async () => {
    writeJsonl('proj', 'sid', [
      assistantMsg('a1', '2026-06-01T10:00:00.000Z', [
        toolUse('t-err', 'Edit', { file_path: '/repo/x.ts', old_string: 'a', new_string: 'b' }),
      ]),
      userMsg('u1', '2026-06-01T10:00:01.000Z', [toolResult('t-err', true)]),
      assistantMsg('a2', '2026-06-01T10:01:00.000Z', [
        toolUse('t-pend', 'Edit', { file_path: '/repo/x.ts', old_string: 'b', new_string: 'c' }),
      ]),
      // 没有 t-pend 的 tool_result
    ]);

    const out = await loadModifiedFiles('proj', 'sid');
    const x = out!.files[0]!;
    expect(x.totalCount).toBe(2);
    expect(x.errorCount).toBe(1);
    const err = x.operations.find((o) => o.toolUseId === 't-err')!;
    expect(err.errored).toBe(true);
    expect(err.pending).toBe(false);
    const pend = x.operations.find((o) => o.toolUseId === 't-pend')!;
    expect(pend.errored).toBe(false);
    expect(pend.pending).toBe(true);
  });

  it('ignores non-file-mutating tools (Bash/Read/Grep/Task)', async () => {
    writeJsonl('proj', 'sid', [
      assistantMsg('a1', '2026-06-01T10:00:00.000Z', [
        toolUse('t1', 'Bash', { command: 'ls' }),
        toolUse('t2', 'Read', { file_path: '/repo/x.ts' }),
        toolUse('t3', 'Grep', { pattern: 'foo' }),
      ]),
      userMsg('u1', '2026-06-01T10:00:01.000Z', [
        toolResult('t1', false),
        toolResult('t2', false),
        toolResult('t3', false),
      ]),
    ]);
    const out = await loadModifiedFiles('proj', 'sid');
    expect(out!.files).toEqual([]);
  });

  it('relativePath is null when filePath sits outside cwd', async () => {
    writeJsonl('proj', 'sid', [
      { type: 'summary', cwd: '/Users/me/repo' },
      assistantMsg('a1', '2026-06-01T10:00:00.000Z', [
        toolUse('t1', 'Write', { file_path: '/tmp/elsewhere.txt', content: 'hi' }),
      ]),
      userMsg('u1', '2026-06-01T10:00:01.000Z', [toolResult('t1')]),
    ]);
    const out = await loadModifiedFiles('proj', 'sid');
    expect(out!.files[0]!.relativePath).toBeNull();
  });

  it('operations within a file are ordered by ts asc', async () => {
    writeJsonl('proj', 'sid', [
      assistantMsg('a1', '2026-06-01T10:02:00.000Z', [
        toolUse('t2', 'Edit', { file_path: '/repo/x.ts', old_string: 'a', new_string: 'b' }),
      ]),
      userMsg('u1', '2026-06-01T10:02:01.000Z', [toolResult('t2')]),
      assistantMsg('a2', '2026-06-01T10:01:00.000Z', [
        toolUse('t1', 'Edit', { file_path: '/repo/x.ts', old_string: 'c', new_string: 'd' }),
      ]),
      userMsg('u2', '2026-06-01T10:01:01.000Z', [toolResult('t1')]),
    ]);
    const out = await loadModifiedFiles('proj', 'sid');
    expect(out!.files[0]!.operations.map((o) => o.toolUseId)).toEqual(['t1', 't2']);
    expect(out!.files[0]!.firstAt).toBe('2026-06-01T10:01:00.000Z');
    expect(out!.files[0]!.lastAt).toBe('2026-06-01T10:02:00.000Z');
  });

  it('skips malformed jsonl lines and tool_use entries without id/file_path', async () => {
    const file = path.join(fakeRoot, 'projects', 'proj', 'sid.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      [
        '{not json',
        JSON.stringify(
          assistantMsg('a1', '2026-06-01T10:00:00.000Z', [
            toolUse('', 'Edit', { file_path: '/x.ts', old_string: 'a', new_string: 'b' }), // empty id → skip
            toolUse('t1', 'Edit', { /* no file_path */ old_string: 'a', new_string: 'b' }), // no path → skip
            toolUse('t2', 'Write', { file_path: '/ok.ts', content: 'hi' }),
          ]),
        ),
        JSON.stringify(userMsg('u1', '2026-06-01T10:00:01.000Z', [toolResult('t2')])),
        '',
      ].join('\n'),
    );
    const out = await loadModifiedFiles('proj', 'sid');
    expect(out!.files).toHaveLength(1);
    expect(out!.files[0]!.filePath).toBe('/ok.ts');
  });

  it('attaches structuredPatch from toolUseResult; [] for create, null when absent', async () => {
    writeJsonl('proj-sp', 'sid-sp', [
      { type: 'summary', cwd: '/repo' },
      // Edit whose result line carries a real structuredPatch (accurate file line numbers).
      assistantMsg('a1', '2026-06-01T10:00:00.000Z', [
        toolUse('t1', 'Edit', { file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' }),
      ]),
      {
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-06-01T10:00:01.000Z',
        message: { content: [toolResult('t1', false)] },
        toolUseResult: {
          type: 'update',
          filePath: '/repo/a.ts',
          structuredPatch: [
            { oldStart: 10, oldLines: 2, newStart: 10, newLines: 2, lines: [' ctx', '-x', '+y'] },
          ],
        },
      },
      // Write create → structuredPatch is an empty array (render input as all-added).
      assistantMsg('a2', '2026-06-01T10:01:00.000Z', [
        toolUse('t2', 'Write', { file_path: '/repo/b.ts', content: 'new' }),
      ]),
      {
        type: 'user',
        uuid: 'u2',
        timestamp: '2026-06-01T10:01:01.000Z',
        message: { content: [toolResult('t2', false)] },
        toolUseResult: { type: 'create', filePath: '/repo/b.ts', structuredPatch: [] },
      },
      // Edit whose result has no toolUseResult sentinel → null (fall back to input diff).
      assistantMsg('a3', '2026-06-01T10:02:00.000Z', [
        toolUse('t3', 'Edit', { file_path: '/repo/c.ts', old_string: 'm', new_string: 'n' }),
      ]),
      userMsg('u3', '2026-06-01T10:02:01.000Z', [toolResult('t3', false)]),
    ]);

    const out = await loadModifiedFiles('proj-sp', 'sid-sp');
    expect(out).not.toBeNull();
    const byPath = new Map(out!.files.map((f) => [f.filePath, f]));

    expect(byPath.get('/repo/a.ts')!.operations[0]!.structuredPatch).toEqual([
      { oldStart: 10, oldLines: 2, newStart: 10, newLines: 2, lines: [' ctx', '-x', '+y'] },
    ]);
    expect(byPath.get('/repo/b.ts')!.operations[0]!.structuredPatch).toEqual([]);
    expect(byPath.get('/repo/c.ts')!.operations[0]!.structuredPatch).toBeNull();
  });
});
