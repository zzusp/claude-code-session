import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// safeRemove 是 deleteSessions 与 deleteOrphan 共用的"路径校验 + 实际 rm"唯一入口。
// 这里把 claude-paths.ts mock 到一个独立 tmp root（通过 process.env.CCSM_TEST_ROOT 桥接，
// 与 delete.test.ts 同套路），校验它只删 root 子树内的东西、逃出去的一律抛错。

let fakeRoot: string;

vi.mock('./claude-paths.ts', () => {
  return {
    isUnderClaudeRoot(target: string): boolean {
      const root = process.env.CCSM_TEST_ROOT!;
      const resolved = path.resolve(target);
      return resolved === root || resolved.startsWith(root + path.sep);
    },
  };
});

beforeEach(() => {
  fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-safe-remove-test-'));
  process.env.CCSM_TEST_ROOT = fakeRoot;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CCSM_TEST_ROOT;
  fs.rmSync(fakeRoot, { recursive: true, force: true });
});

describe('safeRemove', () => {
  it('删 root 子树内的文件，返回 true', async () => {
    const { safeRemove } = await import('./safe-remove.ts');
    const f = path.join(fakeRoot, 'a.jsonl');
    fs.writeFileSync(f, 'x');

    expect(safeRemove(f)).toBe(true);
    expect(fs.existsSync(f)).toBe(false);
  });

  it('删 root 子树内的目录（recursive），返回 true', async () => {
    const { safeRemove } = await import('./safe-remove.ts');
    const dir = path.join(fakeRoot, 'file-history', 'sid-1');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'nested.txt'), 'y');

    expect(safeRemove(dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('目标不存在返回 false（幂等，不抛）', async () => {
    const { safeRemove } = await import('./safe-remove.ts');
    expect(safeRemove(path.join(fakeRoot, 'missing'))).toBe(false);
  });

  it('逃出 ~/.claude 子树的目标一律抛错，且不删任何东西', async () => {
    const { safeRemove } = await import('./safe-remove.ts');
    // 在 fakeRoot 之外铺一个文件，确认它不会被删
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-safe-remove-outside-'));
    const victim = path.join(outside, 'do-not-delete.txt');
    fs.writeFileSync(victim, 'keep me');
    try {
      expect(() => safeRemove(victim)).toThrow(/outside ~\/\.claude/);
      expect(fs.existsSync(victim)).toBe(true);
      // 兄弟目录（同前缀但非子树）也必须拒绝
      expect(() => safeRemove(fakeRoot + '_evil')).toThrow(/outside ~\/\.claude/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
