import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 这份测试目标只有一个：**对称性**。
//   export：把项目 jsonl 里的 cwd、history.jsonl 里的 project 替换成 ${CLAUDE_PROJECT_ROOT}
//   import：把同一占位符替换回本机目标路径
// 不该改的（消息正文 / gitBranch / version）一律按字节保持。
// roundtrip 后取出的对象图必须与原始相等（cwd 字段视目标路径替换）。

let fakeRoot: string;
let externalDest: string;

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
  fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-bundle-rt-'));
  externalDest = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-bundle-out-'));
  process.env.CCSM_TEST_ROOT = fakeRoot;
  fs.mkdirSync(path.join(fakeRoot, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(fakeRoot, 'file-history'), { recursive: true });
  fs.mkdirSync(path.join(fakeRoot, 'session-env'), { recursive: true });
  fs.mkdirSync(path.join(fakeRoot, 'sessions'), { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CCSM_TEST_ROOT;
  fs.rmSync(fakeRoot, { recursive: true, force: true });
  fs.rmSync(externalDest, { recursive: true, force: true });
});

const SOURCE_CWD = '/Users/alice/proj';
const PROJECT_ID = '-Users-alice-proj';
const SESSION_ID = '019410ce-49fb-7d5c-b0a4-2d7d2b6a4b7d';

interface ConvLine {
  type: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: unknown;
  gitBranch?: string;
  version?: string;
}

function seedProject(lines: ConvLine[]): void {
  const projDir = path.join(fakeRoot, 'projects', PROJECT_ID);
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(
    path.join(projDir, `${SESSION_ID}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
  );
}

function seedHistory(rows: Array<Record<string, unknown>>): void {
  fs.writeFileSync(
    path.join(fakeRoot, 'history.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
  );
}

describe('export + import bundle roundtrip', () => {
  it('cwd / project 双字段被替换成 sentinel；message / gitBranch / version 不动；reimport 还原到目标路径', async () => {
    const { exportBundle } = await import('./export-bundle.ts');
    const { commitImport } = await import('./import-bundle.ts');

    const original: ConvLine[] = [
      {
        type: 'user',
        sessionId: SESSION_ID,
        cwd: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:00Z',
        message: { content: `look at ${SOURCE_CWD}/src/foo.ts` },
        gitBranch: 'main',
        version: '1.0.0',
      },
      {
        type: 'assistant',
        sessionId: SESSION_ID,
        cwd: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:05Z',
        message: { content: 'sure' },
        gitBranch: 'main',
        version: '1.0.0',
      },
    ];
    seedProject(original);
    seedHistory([
      {
        sessionId: SESSION_ID,
        project: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:00Z',
        display: 'look at ${SOURCE_CWD}/src/foo.ts',
        // cwd 字段同源路径，但 history 行的目标字段是 project，cwd 必须保持原样
        cwd: SOURCE_CWD,
      },
      {
        sessionId: 'sid-other',
        project: '/some/other/proj',
        timestamp: '2026-06-09T01:00:00Z',
        display: 'unrelated',
      },
    ]);

    // ── export ──────────────────────────────────────────────
    const exportDir = path.join(externalDest, 'bundle');
    const exp = await exportBundle(PROJECT_ID, 'all', exportDir);
    expect(exp.sessionsExported).toBe(1);
    expect(exp.historyLinesExported).toBe(1); // 只有匹配 SID 的那条被打包

    // 校验 bundle 里 conversation.jsonl：cwd 被替换、消息正文不动
    const conv = fs
      .readFileSync(path.join(exportDir, 'sessions', SESSION_ID, 'conversation.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ConvLine);
    expect(conv).toHaveLength(2);
    for (const line of conv) {
      expect(line.cwd).toBe('${CLAUDE_PROJECT_ROOT}');
      expect(line.gitBranch).toBe('main');
      expect(line.version).toBe('1.0.0');
    }
    // 消息正文里的源路径作为归档原貌保留
    expect((conv[0]!.message as { content: string }).content).toBe(
      `look at ${SOURCE_CWD}/src/foo.ts`,
    );

    // history.ndjson：project 字段被替换；cwd 字段（即便等于 sourceCwd）保留
    const hist = fs
      .readFileSync(path.join(exportDir, 'sessions', SESSION_ID, 'history.ndjson'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.project).toBe('${CLAUDE_PROJECT_ROOT}');
    expect(hist[0]!.cwd).toBe(SOURCE_CWD); // 不该改
    expect(hist[0]!.sessionId).toBe(SESSION_ID);

    // bundle 不能写到 ~/.claude 里（再次抽样确认）
    expect(exportDir.startsWith(fakeRoot)).toBe(false);

    // ── 清理原项目目录 + history，模拟"导入到另一台机器"────
    fs.rmSync(path.join(fakeRoot, 'projects', PROJECT_ID), { recursive: true, force: true });
    // 仅保留无关行，等会儿 import 后看是否正确追加
    seedHistory([
      {
        sessionId: 'sid-other',
        project: '/some/other/proj',
        timestamp: '2026-06-09T01:00:00Z',
        display: 'unrelated',
      },
    ]);

    // ── import 到新路径 ────────────────────────────────────
    const targetCwd = '/Users/bob/different-machine-proj';
    const targetProjectId = '-Users-bob-different-machine-proj';
    const imp = await commitImport({
      bundleDir: exportDir,
      targetCwd,
      collisionPolicy: 'skip',
    });
    expect(imp.targetProjectId).toBe(targetProjectId);
    expect(imp.imported).toHaveLength(1);
    expect(imp.imported[0]!.sessionId).toBe(SESSION_ID);
    expect(imp.historyLinesAdded).toBe(1);

    // 导入后的 jsonl：cwd 替换为目标路径，其它字段按字节回到原状
    const importedJsonl = path.join(
      fakeRoot,
      'projects',
      targetProjectId,
      `${SESSION_ID}.jsonl`,
    );
    expect(fs.existsSync(importedJsonl)).toBe(true);
    const reimported = fs
      .readFileSync(importedJsonl, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ConvLine);
    expect(reimported).toHaveLength(2);
    for (const line of reimported) {
      expect(line.cwd).toBe(targetCwd);
      expect(line.sessionId).toBe(SESSION_ID);
      expect(line.gitBranch).toBe('main');
      expect(line.version).toBe('1.0.0');
    }
    expect((reimported[0]!.message as { content: string }).content).toBe(
      `look at ${SOURCE_CWD}/src/foo.ts`,
    );

    // history.jsonl：原有无关行保留 + 新追加一条 project=targetCwd
    const historyAfter = fs
      .readFileSync(path.join(fakeRoot, 'history.jsonl'), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(historyAfter).toHaveLength(2);
    const newHist = historyAfter.find((r) => r.sessionId === SESSION_ID)!;
    expect(newHist.project).toBe(targetCwd);
    expect(newHist.cwd).toBe(SOURCE_CWD); // cwd 字段不在替换范围
  });

  it('同 bundle 重复 import 到同一目标路径是幂等的（history 去重 key 含 project）', async () => {
    const { exportBundle } = await import('./export-bundle.ts');
    const { commitImport } = await import('./import-bundle.ts');

    seedProject([
      {
        type: 'user',
        sessionId: SESSION_ID,
        cwd: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:00Z',
        message: { content: 'hello' },
      },
    ]);
    seedHistory([
      {
        sessionId: SESSION_ID,
        project: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:00Z',
        display: 'hello',
      },
    ]);

    const exportDir = path.join(externalDest, 'bundle');
    await exportBundle(PROJECT_ID, 'all', exportDir);

    // 抹掉本机的项目目录但保留 history 的"原始一行"
    fs.rmSync(path.join(fakeRoot, 'projects', PROJECT_ID), { recursive: true, force: true });

    const targetCwd = SOURCE_CWD; // 故意 import 回原路径
    const first = await commitImport({
      bundleDir: exportDir,
      targetCwd,
      collisionPolicy: 'skip',
    });
    expect(first.historyLinesAdded).toBe(0); // 原始那行已经在 history 里，去重命中

    // 再 import 一次：sessionId 跟本地一样 → skip
    const second = await commitImport({
      bundleDir: exportDir,
      targetCwd,
      collisionPolicy: 'skip',
    });
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
    expect(second.historyLinesAdded).toBe(0);
  });

  it('import 到不同目标路径：history 会新增一条（project 字段不同视为不同记录）', async () => {
    const { exportBundle } = await import('./export-bundle.ts');
    const { commitImport } = await import('./import-bundle.ts');

    seedProject([
      {
        type: 'user',
        sessionId: SESSION_ID,
        cwd: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:00Z',
        message: { content: 'hi' },
      },
    ]);
    seedHistory([
      {
        sessionId: SESSION_ID,
        project: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:00Z',
        display: 'hi',
      },
    ]);

    const exportDir = path.join(externalDest, 'bundle');
    await exportBundle(PROJECT_ID, 'all', exportDir);

    fs.rmSync(path.join(fakeRoot, 'projects', PROJECT_ID), { recursive: true, force: true });
    const targetCwd = '/Users/bob/elsewhere';
    const res = await commitImport({
      bundleDir: exportDir,
      targetCwd,
      collisionPolicy: 'skip',
    });
    expect(res.historyLinesAdded).toBe(1);

    const rows = fs
      .readFileSync(path.join(fakeRoot, 'history.jsonl'), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    // 原有一条 + 新增一条
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.project).sort()).toEqual([SOURCE_CWD, targetCwd].sort());
  });

  it('export 拒绝写到 ~/.claude/ 内', async () => {
    const { exportBundle, ExportError } = await import('./export-bundle.ts');
    seedProject([
      {
        type: 'user',
        sessionId: SESSION_ID,
        cwd: SOURCE_CWD,
        timestamp: '2026-06-09T01:00:00Z',
        message: { content: 'hi' },
      },
    ]);
    const inside = path.join(fakeRoot, 'sneaky-bundle');
    await expect(exportBundle(PROJECT_ID, 'all', inside)).rejects.toBeInstanceOf(ExportError);
  });

  it('export 拒绝非法 projectId（path traversal）', async () => {
    const { exportBundle, ExportError } = await import('./export-bundle.ts');
    await expect(
      exportBundle('../etc', 'all', path.join(externalDest, 'b')),
    ).rejects.toBeInstanceOf(ExportError);
  });
});
