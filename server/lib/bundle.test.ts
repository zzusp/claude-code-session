import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rewriteLineField, SENTINEL, sha256, transformFile } from './bundle.ts';

// bundle.ts 是 export/import 共用的"占位符替换 + 流式重写"原语。
// 这里关心的不是某条字段被改了，而是不该改的一律不能动：
// 消息正文 / gitBranch / version / 不匹配的 fromValue 全部原样保留。

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-bundle-test-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('rewriteLineField', () => {
  it('精确匹配 fromValue 时替换为 toValue', () => {
    const line = JSON.stringify({ type: 'user', cwd: '/Users/alice/proj', message: 'hi' });
    const out = rewriteLineField(line, 'cwd', '/Users/alice/proj', SENTINEL);
    expect(JSON.parse(out)).toEqual({
      type: 'user',
      cwd: SENTINEL,
      message: 'hi',
    });
  });

  it('字段不存在则走快速路径原样返回（按字节相等）', () => {
    const line = JSON.stringify({ type: 'user', message: 'no cwd here' });
    const out = rewriteLineField(line, 'cwd', '/whatever', SENTINEL);
    expect(out).toBe(line);
  });

  it('字段值不等于 fromValue 时不改', () => {
    const line = JSON.stringify({ cwd: '/Users/bob/other' });
    const out = rewriteLineField(line, 'cwd', '/Users/alice/proj', SENTINEL);
    expect(JSON.parse(out)).toEqual({ cwd: '/Users/bob/other' });
  });

  it('恰好是 fromValue 的子串但不是字段值时不改', () => {
    // message 里出现源 cwd 不能被殃及（消息正文必须保持归档原貌）
    const sourceCwd = '/Users/alice/proj';
    const line = JSON.stringify({
      type: 'assistant',
      cwd: '/Users/bob/other',
      message: `traceback at ${sourceCwd}/src/foo.ts`,
      gitBranch: 'main',
      version: '1.2.3',
    });
    const out = rewriteLineField(line, 'cwd', sourceCwd, SENTINEL);
    // cwd 不等于 sourceCwd，整行原样
    expect(out).toBe(line);
  });

  it('改 cwd 字段时 message / gitBranch / version 完全不动', () => {
    const sourceCwd = '/Users/alice/proj';
    const line = JSON.stringify({
      type: 'assistant',
      cwd: sourceCwd,
      message: `look at ${sourceCwd}/src/foo.ts please`,
      gitBranch: sourceCwd, // 故意挑事：值跟 sourceCwd 一致
      version: sourceCwd,
    });
    const out = rewriteLineField(line, 'cwd', sourceCwd, SENTINEL);
    const obj = JSON.parse(out) as Record<string, unknown>;
    expect(obj.cwd).toBe(SENTINEL);
    expect(obj.message).toBe(`look at ${sourceCwd}/src/foo.ts please`);
    expect(obj.gitBranch).toBe(sourceCwd);
    expect(obj.version).toBe(sourceCwd);
  });

  it('JSON 解析失败的行原样保留（容错）', () => {
    const raw = '{this is not valid json but mentions "cwd" key';
    const out = rewriteLineField(raw, 'cwd', '/x', SENTINEL);
    expect(out).toBe(raw);
  });

  it('export/import 双向对称：cwd -> sentinel -> cwd 还原到原值', () => {
    const sourceCwd = '/Users/alice/proj';
    const targetCwd = '/Users/alice/proj'; // roundtrip 到同一台机器
    const line = JSON.stringify({ cwd: sourceCwd, type: 'user' });

    const exported = rewriteLineField(line, 'cwd', sourceCwd, SENTINEL);
    const reimported = rewriteLineField(exported, 'cwd', SENTINEL, targetCwd);

    expect(JSON.parse(reimported)).toEqual({ cwd: targetCwd, type: 'user' });
  });

  it('import 到新设备：sentinel -> 新路径', () => {
    const exported = JSON.stringify({ cwd: SENTINEL, type: 'user' });
    const out = rewriteLineField(exported, 'cwd', SENTINEL, '/home/bob/proj');
    expect(JSON.parse(out)).toEqual({ cwd: '/home/bob/proj', type: 'user' });
  });

  it('history.jsonl 的 project 字段（不是 cwd）也走同一原语', () => {
    const sourceCwd = '/Users/alice/proj';
    const line = JSON.stringify({
      project: sourceCwd,
      cwd: sourceCwd, // history 行里如果有 cwd 不能动，目标字段是 project
      sessionId: 'sid-1',
      display: 'prompt',
    });
    const out = rewriteLineField(line, 'project', sourceCwd, SENTINEL);
    const obj = JSON.parse(out) as Record<string, unknown>;
    expect(obj.project).toBe(SENTINEL);
    expect(obj.cwd).toBe(sourceCwd); // 被显式保留
  });
});

describe('transformFile (流式重写整文件)', () => {
  it('流式把每行的 cwd 替换为 sentinel，并报告行数 + sha256', async () => {
    const src = path.join(tmp, 'src.jsonl');
    const dest = path.join(tmp, 'dest.jsonl');
    const sourceCwd = '/Users/alice/proj';
    const lines = [
      JSON.stringify({ type: 'user', cwd: sourceCwd, message: 'a' }),
      JSON.stringify({ type: 'assistant', cwd: sourceCwd, message: 'b' }),
      JSON.stringify({ type: 'summary' }), // 没 cwd 字段
    ];
    fs.writeFileSync(src, lines.join('\n') + '\n');

    const res = await transformFile(src, dest, 'cwd', sourceCwd, SENTINEL);
    expect(res.lines).toBe(3);

    const out = fs.readFileSync(dest, 'utf8').split('\n').filter(Boolean);
    expect(out).toHaveLength(3);
    const parsed = out.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed[0]!.cwd).toBe(SENTINEL);
    expect(parsed[1]!.cwd).toBe(SENTINEL);
    expect(parsed[2]!).toEqual({ type: 'summary' });

    // sha256 必须对应实际写入字节
    expect(res.sha256).toBe(sha256(fs.readFileSync(dest)));
  });

  it('丢空行（不携带记录），其他原样', async () => {
    const src = path.join(tmp, 'src.jsonl');
    const dest = path.join(tmp, 'dest.jsonl');
    fs.writeFileSync(src, '\n' + JSON.stringify({ cwd: '/x' }) + '\n\n');
    const res = await transformFile(src, dest, 'cwd', '/x', SENTINEL);
    expect(res.lines).toBe(1);
    expect(fs.readFileSync(dest, 'utf8')).toBe(JSON.stringify({ cwd: SENTINEL }) + '\n');
  });

  it('roundtrip：export 写入 sentinel 后再 import 回新路径，非目标字段保持字节一致', async () => {
    const src = path.join(tmp, 'src.jsonl');
    const exported = path.join(tmp, 'bundle.jsonl');
    const imported = path.join(tmp, 'imported.jsonl');

    const sourceCwd = '/Users/alice/proj';
    const targetCwd = '/Users/alice/proj'; // 同机 roundtrip
    const original = [
      JSON.stringify({
        type: 'user',
        cwd: sourceCwd,
        message: `stack at ${sourceCwd}/foo.ts`,
        gitBranch: 'main',
        version: '1.0.0',
      }),
      JSON.stringify({ type: 'summary', cwd: sourceCwd, message: 'done' }),
    ];
    fs.writeFileSync(src, original.join('\n') + '\n');

    await transformFile(src, exported, 'cwd', sourceCwd, SENTINEL);
    await transformFile(exported, imported, 'cwd', SENTINEL, targetCwd);

    const back = fs.readFileSync(imported, 'utf8').split('\n').filter(Boolean);
    const parsed = back.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed[0]).toEqual({
      type: 'user',
      cwd: targetCwd,
      message: `stack at ${sourceCwd}/foo.ts`, // 消息正文里的源路径保留为归档原貌
      gitBranch: 'main',
      version: '1.0.0',
    });
    expect(parsed[1]).toEqual({ type: 'summary', cwd: targetCwd, message: 'done' });
  });
});
