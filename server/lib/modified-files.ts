import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PATHS } from './claude-paths.ts';
import type {
  ModifiedFileOperation,
  ModifiedFileSummary,
  ModifiedFileToolName,
  ModifiedFilesResponse,
} from '../types.ts';

const FILE_MOD_TOOLS = new Set<ModifiedFileToolName>([
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
]);

interface PendingOp {
  toolUseId: string;
  toolName: ModifiedFileToolName;
  ts: string | null;
  messageUuid: string | null;
  filePath: string;
}

export async function loadModifiedFiles(
  projectId: string,
  sessionId: string,
): Promise<ModifiedFilesResponse | null> {
  const jsonlPath = path.join(PATHS.projects, projectId, `${sessionId}.jsonl`);
  if (!fs.existsSync(jsonlPath)) return null;

  const ops: PendingOp[] = [];
  // tool_use_id → is_error；tool_result 在 jsonl 中通常出现在对应 tool_use 之后，
  // 但不强依赖顺序——单次扫完再回填。
  const resultErr = new Map<string, boolean>();
  let cwd: string | null = null;

  const rl = readline.createInterface({
    input: fs.createReadStream(jsonlPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (typeof obj.cwd === 'string' && !cwd) cwd = obj.cwd;

    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    const message = obj.message;
    if (!message || typeof message !== 'object') continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : null;
    const messageUuid = typeof obj.uuid === 'string' ? obj.uuid : null;

    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const name = b.name;
        if (typeof name !== 'string') continue;
        if (!FILE_MOD_TOOLS.has(name as ModifiedFileToolName)) continue;
        const input = b.input;
        if (!input || typeof input !== 'object') continue;
        const filePath = extractFilePath(input as Record<string, unknown>);
        if (!filePath) continue;
        const id = typeof b.id === 'string' ? b.id : '';
        if (!id) continue;
        ops.push({
          toolUseId: id,
          toolName: name as ModifiedFileToolName,
          ts,
          messageUuid,
          filePath,
        });
      } else if (b.type === 'tool_result') {
        const id = b.tool_use_id;
        if (typeof id !== 'string' || !id) continue;
        // 同一 tool_use_id 理论上只对应一条 result；以首次出现为准。
        if (!resultErr.has(id)) resultErr.set(id, b.is_error === true);
      }
    }
  }

  // 按 filePath 聚合
  const byPath = new Map<string, ModifiedFileSummary>();
  for (const op of ops) {
    const errored = resultErr.get(op.toolUseId) === true;
    const pending = !resultErr.has(op.toolUseId);
    const operation: ModifiedFileOperation = {
      toolUseId: op.toolUseId,
      toolName: op.toolName,
      ts: op.ts,
      messageUuid: op.messageUuid,
      errored,
      pending,
    };
    let summary = byPath.get(op.filePath);
    if (!summary) {
      summary = {
        filePath: op.filePath,
        relativePath: null,
        editCount: 0,
        writeCount: 0,
        multiEditCount: 0,
        notebookEditCount: 0,
        totalCount: 0,
        errorCount: 0,
        firstAt: null,
        lastAt: null,
        operations: [],
      };
      byPath.set(op.filePath, summary);
    }
    summary.operations.push(operation);
    summary.totalCount += 1;
    if (errored) summary.errorCount += 1;
    switch (op.toolName) {
      case 'Edit':
        summary.editCount += 1;
        break;
      case 'Write':
        summary.writeCount += 1;
        break;
      case 'MultiEdit':
        summary.multiEditCount += 1;
        break;
      case 'NotebookEdit':
        summary.notebookEditCount += 1;
        break;
    }
    if (op.ts) {
      if (!summary.firstAt || op.ts < summary.firstAt) summary.firstAt = op.ts;
      if (!summary.lastAt || op.ts > summary.lastAt) summary.lastAt = op.ts;
    }
  }

  for (const summary of byPath.values()) {
    summary.operations.sort(compareByTs);
    summary.relativePath = relativizeIfUnder(summary.filePath, cwd);
  }

  const files = Array.from(byPath.values()).sort((a, b) => {
    // lastAt desc，null 排末尾
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0;
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.filePath.localeCompare(b.filePath);
  });

  return { sessionId, projectId, cwd, files };
}

function extractFilePath(input: Record<string, unknown>): string | null {
  const fp = input.file_path;
  if (typeof fp === 'string' && fp) return fp;
  // NotebookEdit uses notebook_path.
  const np = input.notebook_path;
  if (typeof np === 'string' && np) return np;
  return null;
}

function relativizeIfUnder(filePath: string, cwd: string | null): string | null {
  if (!cwd) return null;
  // 用 posix-style 简单前缀判断即可——session 是在 macOS/Linux/Windows
  // 各自原生路径下记录的 cwd，不跨平台。
  const normCwd = cwd.replace(/[\\/]+$/, '');
  if (filePath === normCwd) return '.';
  if (filePath.startsWith(normCwd + '/')) return filePath.slice(normCwd.length + 1);
  if (filePath.startsWith(normCwd + '\\')) return filePath.slice(normCwd.length + 1);
  return null;
}

function compareByTs(a: ModifiedFileOperation, b: ModifiedFileOperation): number {
  if (a.ts && b.ts) return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
  if (a.ts) return -1;
  if (b.ts) return 1;
  return 0;
}
