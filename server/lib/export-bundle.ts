import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { isUnderClaudeRoot, PATHS } from './claude-paths.ts';
import { parseJsonlMeta } from './parse-jsonl.ts';
import { isSafeId } from './safe-id.ts';
import { resolveProjectCwd } from './scan.ts';
import { rewriteLineField, sha256, sha256File, SENTINEL, transformFile } from './bundle.ts';
import {
  BUNDLE_KIND,
  BUNDLE_SCHEMA_VERSION,
  type BundleManifest,
  type BundleMemoryFileMeta,
  type BundleMemoryInventory,
  type BundleSessionMeta,
  type ExportResult,
} from '../types.ts';

const JSONL_EXT = '.jsonl';

export class ExportError extends Error {}

/**
 * Write a path-independent bundle of a project's memory + conversations to
 * `destDir`. The structural project root is replaced with {@link SENTINEL} so the
 * bundle can be moved to a device where the project lives at a different path.
 */
export async function exportBundle(
  projectId: string,
  sessionIds: string[] | 'all',
  destDir: string,
): Promise<ExportResult> {
  if (!isSafeId(projectId)) throw new ExportError('invalid project id');

  const projectDir = path.join(PATHS.projects, projectId);
  if (!fs.existsSync(projectDir)) throw new ExportError('project not found');

  // The real source cwd — the golden record we replace with the sentinel.
  const resolved = await resolveProjectCwd(projectId);
  if (!resolved) throw new ExportError('project not found');
  const sourceCwd = resolved.decoded;

  // Never write the bundle inside ~/.claude — that would corrupt the store.
  const dest = path.resolve(destDir);
  if (!path.isAbsolute(dest)) throw new ExportError('destination must be an absolute path');
  if (isUnderClaudeRoot(dest)) throw new ExportError('destination must be outside ~/.claude');
  prepareDestDir(dest);

  const allIds = listSessionIds(projectDir);
  const ids =
    sessionIds === 'all'
      ? allIds
      : sessionIds.filter((id) => isSafeId(id) && allIds.includes(id));
  if (ids.length === 0) throw new ExportError('no sessions to export');
  const idSet = new Set(ids);

  // Scan history.jsonl once, bucketing matching lines (project -> sentinel) by sid.
  const historyBuckets = await bucketHistoryLines(idSet, sourceCwd);

  const sessionsDir = path.join(dest, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  let totalBytes = 0;
  let historyLinesExported = 0;
  const sessionMetas: BundleSessionMeta[] = [];

  for (const id of ids) {
    const jsonlPath = path.join(projectDir, `${id}${JSONL_EXT}`);
    if (!fs.existsSync(jsonlPath)) continue;

    const sessDir = path.join(sessionsDir, id);
    fs.mkdirSync(sessDir, { recursive: true });

    const convPath = path.join(sessDir, 'conversation.jsonl');
    const conv = await transformFile(jsonlPath, convPath, 'cwd', sourceCwd, SENTINEL);
    const convBytes = fs.statSync(convPath).size;
    totalBytes += convBytes;

    let history: BundleSessionMeta['history'] = null;
    const bucket = historyBuckets.get(id);
    if (bucket && bucket.length > 0) {
      const content = bucket.join('\n') + '\n';
      fs.writeFileSync(path.join(sessDir, 'history.ndjson'), content, 'utf8');
      const histBytes = Buffer.byteLength(content, 'utf8');
      totalBytes += histBytes;
      historyLinesExported += bucket.length;
      history = { sha256: sha256(content), lines: bucket.length, bytes: histBytes };
    }

    const meta = await parseJsonlMeta(jsonlPath);
    sessionMetas.push({
      sessionId: id,
      title: meta.title,
      customTitle: meta.customTitle,
      firstAt: meta.firstAt,
      lastAt: meta.lastAt,
      messageCount: meta.messageCount,
      cwdRewritten: meta.cwdFromMessages === sourceCwd,
      conversation: { sha256: conv.sha256, lines: conv.lines, bytes: convBytes },
      history,
    });
  }

  const memory = copyMemory(projectId, dest);
  totalBytes += memory.bytes;

  const manifest: BundleManifest = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    kind: BUNDLE_KIND,
    exportedAt: new Date().toISOString(),
    placeholder: SENTINEL,
    source: {
      platform: process.platform,
      pathSep: path.sep,
      projectId,
      cwd: sourceCwd,
      cwdResolvedAtExport: resolved.resolved,
    },
    memory: memory.inventory,
    sessions: sessionMetas,
  };
  const manifestStr = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(dest, 'manifest.json'), manifestStr, 'utf8');
  totalBytes += Buffer.byteLength(manifestStr, 'utf8');

  return {
    destDir: dest,
    sessionsExported: sessionMetas.length,
    memoryFilesExported: memory.inventory.entries.length,
    historyLinesExported,
    totalBytes,
  };
}

function listSessionIds(projectDir: string): string[] {
  const ids: string[] = [];
  for (const ent of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith(JSONL_EXT)) {
      ids.push(ent.name.slice(0, -JSONL_EXT.length));
    }
  }
  return ids;
}

/** Create dest if absent; allow an empty dir or a prior bundle (re-export). */
function prepareDestDir(dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
    return;
  }
  if (!fs.statSync(dest).isDirectory()) throw new ExportError('destination is not a directory');
  if (fs.readdirSync(dest).length === 0) return;
  if (!isPriorBundle(path.join(dest, 'manifest.json'))) {
    throw new ExportError('destination is not empty (and not a prior bundle)');
  }
  for (const name of ['manifest.json', 'sessions', 'memory']) {
    fs.rmSync(path.join(dest, name), { recursive: true, force: true });
  }
}

function isPriorBundle(manifestPath: string): boolean {
  try {
    const obj = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { kind?: unknown };
    return obj.kind === BUNDLE_KIND;
  } catch {
    return false;
  }
}

async function bucketHistoryLines(
  idSet: Set<string>,
  sourceCwd: string,
): Promise<Map<string, string[]>> {
  const buckets = new Map<string, string[]>();
  if (!fs.existsSync(PATHS.history)) return buckets;

  const rl = readline.createInterface({
    input: fs.createReadStream(PATHS.history, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    let sid: unknown;
    try {
      sid = (JSON.parse(raw) as { sessionId?: unknown }).sessionId;
    } catch {
      continue;
    }
    if (typeof sid !== 'string' || !idSet.has(sid)) continue;
    let bucket = buckets.get(sid);
    if (!bucket) buckets.set(sid, (bucket = []));
    bucket.push(rewriteLineField(raw, 'project', sourceCwd, SENTINEL));
  }
  return buckets;
}

function copyMemory(
  projectId: string,
  dest: string,
): { inventory: BundleMemoryInventory; bytes: number } {
  const memDir = path.join(PATHS.projects, projectId, 'memory');
  const inventory: BundleMemoryInventory = { hasIndex: false, entries: [] };
  let bytes = 0;
  if (!fs.existsSync(memDir)) return { inventory, bytes };

  const outDir = path.join(dest, 'memory');
  let made = false;
  for (const filename of fs.readdirSync(memDir)) {
    if (!filename.toLowerCase().endsWith('.md')) continue;
    const src = path.join(memDir, filename);
    let stat;
    try {
      stat = fs.statSync(src);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    if (!made) {
      fs.mkdirSync(outDir, { recursive: true });
      made = true;
    }
    fs.copyFileSync(src, path.join(outDir, filename));
    const isIndex = filename.toLowerCase() === 'memory.md';
    const entry: BundleMemoryFileMeta = {
      filename,
      isIndex,
      sha256: sha256File(src),
      bytes: stat.size,
    };
    bytes += stat.size;
    if (isIndex) inventory.hasIndex = true;
    inventory.entries.push(entry);
  }
  return { inventory, bytes };
}
