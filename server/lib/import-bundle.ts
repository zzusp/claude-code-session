import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { buildActiveSessionMap } from './active-sessions.ts';
import { isUnderClaudeRoot, PATHS } from './claude-paths.ts';
import { RECENT_ACTIVITY_WINDOW_MS } from './constants.ts';
import { encodeCwd } from './encode-cwd.ts';
import { parseJsonlMeta } from './parse-jsonl.ts';
import { isSafeId } from './safe-id.ts';
import { listProjects } from './scan.ts';
import { rewriteLineField, sha256, sha256File, SENTINEL } from './bundle.ts';
import {
  BUNDLE_KIND,
  BUNDLE_SCHEMA_VERSION,
  type BundleManifest,
  type BundleSource,
  type ImportCollisionPolicy,
  type ImportCommitRequest,
  type ImportMemoryAction,
  type ImportMemoryPlan,
  type ImportPreviewRequest,
  type ImportPreviewResult,
  type ImportRemapPlan,
  type ImportResult,
  type ImportSessionAction,
  type ImportSessionPlan,
  type ImportTargetSuggestion,
  type ImportedSession,
  type SkippedItem,
} from '../types.ts';

const HISTORY_TMP_SUFFIX = '.tmp-import';

export class ImportError extends Error {}

interface Plan {
  remap: ImportRemapPlan;
  sessions: ImportSessionPlan[];
  memory: ImportMemoryPlan[];
}

export async function previewImport(req: ImportPreviewRequest): Promise<ImportPreviewResult> {
  const bundleDir = path.resolve(req.bundleDir);
  const manifest = readManifest(bundleDir);
  const suggestions = await computeSuggestions(manifest.source);
  const targetCwd = req.targetCwd ?? suggestions[0]?.cwd ?? manifest.source.cwd;

  const plan = await buildPlan(bundleDir, manifest, targetCwd, req.collisionPolicy);
  const additions = await gatherHistoryAdditions(bundleDir, plan.sessions, plan.remap.targetCwd);

  return {
    source: manifest.source,
    remap: plan.remap,
    suggestions,
    sessions: plan.sessions,
    memory: plan.memory,
    historyLinesToAdd: additions.length,
  };
}

export async function commitImport(req: ImportCommitRequest): Promise<ImportResult> {
  const bundleDir = path.resolve(req.bundleDir);
  const manifest = readManifest(bundleDir);
  if (!path.isAbsolute(req.targetCwd)) throw new ImportError('target path must be absolute');

  const plan = await buildPlan(bundleDir, manifest, req.targetCwd, req.collisionPolicy);
  const { targetProjectId, targetCwd } = plan.remap;
  const projectDir = path.join(PATHS.projects, targetProjectId);

  const imported: ImportedSession[] = [];
  const skipped: SkippedItem[] = [];
  let madeProjectDir = false;

  for (const s of plan.sessions) {
    if (s.action === 'skip') {
      skipped.push({ projectId: targetProjectId, sessionId: s.sessionId, reason: s.reason ?? 'skipped' });
      continue;
    }
    const convSrc = path.join(bundleDir, 'sessions', s.sessionId, 'conversation.jsonl');
    if (!isSafeId(s.sessionId) || !fs.existsSync(convSrc)) {
      skipped.push({ projectId: targetProjectId, sessionId: s.sessionId, reason: 'bundle conversation file missing' });
      continue;
    }
    const destSid = s.newSessionId ?? s.sessionId;
    const destJsonl = path.join(projectDir, `${destSid}.jsonl`);
    if (!isUnderClaudeRoot(destJsonl)) {
      skipped.push({ projectId: targetProjectId, sessionId: s.sessionId, reason: 'path escapes ~/.claude' });
      continue;
    }

    if (!madeProjectDir) {
      fs.mkdirSync(projectDir, { recursive: true });
      madeProjectDir = true;
    }
    const tmp = destJsonl + HISTORY_TMP_SUFFIX;
    await writeConversation(convSrc, tmp, targetCwd, s.sessionId, s.newSessionId);
    fs.renameSync(tmp, destJsonl); // atomic; overwrites in place for 'overwrite'
    imported.push({ sessionId: s.sessionId, action: s.action, newSessionId: s.newSessionId });
  }

  const memoryWritten = writeMemory(bundleDir, projectDir, plan.memory);

  const additions = await gatherHistoryAdditions(bundleDir, plan.sessions, targetCwd);
  const historyLinesAdded = await appendHistoryLines(additions);

  return { targetProjectId, targetCwd, imported, skipped, historyLinesAdded, memoryWritten };
}

// ── manifest + suggestions ──────────────────────────────────────────────────

function readManifest(bundleDir: string): BundleManifest {
  const manifestPath = path.join(bundleDir, 'manifest.json');
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    throw new ImportError('no manifest.json found in the bundle directory');
  }
  let obj: BundleManifest;
  try {
    obj = JSON.parse(raw) as BundleManifest;
  } catch {
    throw new ImportError('manifest.json is not valid JSON');
  }
  if (obj.kind !== BUNDLE_KIND) throw new ImportError('not a Claude session bundle');
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > BUNDLE_SCHEMA_VERSION) {
    throw new ImportError(`unsupported bundle schemaVersion ${String(obj.schemaVersion)}`);
  }
  if (!obj.source || typeof obj.source.cwd !== 'string') {
    throw new ImportError('bundle manifest is missing its source');
  }
  if (!Array.isArray(obj.sessions)) throw new ImportError('bundle manifest is missing sessions');
  if (!obj.memory || !Array.isArray(obj.memory.entries)) {
    obj.memory = { hasIndex: false, entries: [] };
  }
  return obj;
}

async function computeSuggestions(source: BundleSource): Promise<ImportTargetSuggestion[]> {
  const out: ImportTargetSuggestion[] = [];
  const seen = new Set<string>();
  const add = (cwd: string, reason: ImportTargetSuggestion['reason']) => {
    const projectId = encodeCwd(cwd);
    if (seen.has(projectId)) return;
    seen.add(projectId);
    out.push({ cwd, projectId, reason, resolved: statDir(cwd) });
  };

  const projects = await listProjects();
  const exact = projects.find((p) => p.id === source.projectId);
  if (exact) add(exact.decodedCwd, 'existing-project');
  if (statDir(source.cwd)) add(source.cwd, 'original-path');

  const base = baseName(source.cwd);
  if (base) {
    for (const p of projects) {
      if (p.cwdResolved && baseName(p.decodedCwd) === base) add(p.decodedCwd, 'same-basename');
    }
  }
  return out;
}

// ── plan ────────────────────────────────────────────────────────────────────

async function buildPlan(
  bundleDir: string,
  manifest: BundleManifest,
  targetCwd: string,
  policy: ImportCollisionPolicy,
): Promise<Plan> {
  const targetProjectId = encodeCwd(targetCwd);
  if (!isSafeId(targetProjectId)) throw new ImportError('target path produces an unsafe project id');
  const projectDir = path.join(PATHS.projects, targetProjectId);
  if (!isUnderClaudeRoot(projectDir)) throw new ImportError('target escapes ~/.claude');

  const remap: ImportRemapPlan = {
    sourceCwd: manifest.source.cwd,
    targetCwd,
    targetProjectId,
    targetProjectExists: fs.existsSync(projectDir),
  };

  const liveMap = buildActiveSessionMap();
  const sessions: ImportSessionPlan[] = [];
  for (const s of manifest.sessions) {
    const sid = s.sessionId;
    if (!isSafeId(sid)) {
      sessions.push({
        sessionId: sid,
        title: s.title,
        action: 'skip',
        reason: 'invalid session id',
        isLivePid: false,
        isRecentlyActive: false,
        localLastAt: null,
        bundleLastAt: s.lastAt,
      });
      continue;
    }
    const destJsonl = path.join(projectDir, `${sid}.jsonl`);
    const exists = fs.existsSync(destJsonl);
    const isLive = liveMap.has(sid);
    const isRecent = exists && recentlyActive(destJsonl);
    const localLastAt = exists ? (await parseJsonlMeta(destJsonl)).lastAt : null;

    const decided = decideSessionAction(exists, isLive, isRecent, s.lastAt, localLastAt, policy);
    sessions.push({
      sessionId: sid,
      title: s.title,
      action: decided.action,
      reason: decided.reason,
      newSessionId: decided.mintNewSid ? crypto.randomUUID() : undefined,
      isLivePid: isLive,
      isRecentlyActive: isRecent,
      localLastAt,
      bundleLastAt: s.lastAt,
    });
  }

  const memDir = path.join(projectDir, 'memory');
  const memory: ImportMemoryPlan[] = [];
  for (const e of manifest.memory.entries) {
    if (!isSafeId(e.filename)) continue;
    const localPath = path.join(memDir, e.filename);
    let action: ImportMemoryAction;
    let writtenAs: string | undefined;
    if (!fs.existsSync(localPath)) {
      action = 'create';
    } else if (sha256File(localPath) === e.sha256) {
      action = 'skip';
    } else {
      action = 'conflict';
      writtenAs = conflictName(e.filename, e.isIndex, e.sha256);
    }
    memory.push({ filename: e.filename, isIndex: e.isIndex, action, writtenAs });
  }

  return { remap, sessions, memory };
}

function decideSessionAction(
  exists: boolean,
  isLive: boolean,
  isRecent: boolean,
  bundleLastAt: string | null,
  localLastAt: string | null,
  policy: ImportCollisionPolicy,
): { action: ImportSessionAction; reason?: string; mintNewSid: boolean } {
  // A live session anywhere owns this id; only keep-both (fresh id) is safe.
  if (isLive) {
    if (policy === 'keep-both') return { action: 'keep-both', mintNewSid: true };
    return {
      action: 'skip',
      reason: 'a live session owns this id — use keep-both to import a copy',
      mintNewSid: false,
    };
  }
  if (!exists) return { action: 'create', mintNewSid: false };

  switch (policy) {
    case 'skip':
      return { action: 'skip', reason: 'already present', mintNewSid: false };
    case 'keep-both':
      return { action: 'keep-both', mintNewSid: true };
    case 'overwrite-if-newer':
      if (isRecent) {
        return { action: 'skip', reason: 'modified within the last 5 minutes', mintNewSid: false };
      }
      if (bundleLastAt && localLastAt && bundleLastAt > localLastAt) {
        return { action: 'overwrite', mintNewSid: false };
      }
      return { action: 'skip', reason: 'local copy is newer or equal', mintNewSid: false };
  }
}

// ── writers ──────────────────────────────────────────────────────────────────

async function writeConversation(
  src: string,
  dest: string,
  targetCwd: string,
  oldSid: string,
  newSid: string | undefined,
): Promise<void> {
  const out = fs.createWriteStream(dest, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fs.createReadStream(src, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  try {
    for await (const raw of rl) {
      if (!raw) continue;
      let line = rewriteLineField(raw, 'cwd', SENTINEL, targetCwd);
      if (newSid) line = rewriteLineField(line, 'sessionId', oldSid, newSid);
      out.write(line + '\n');
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    out.destroy();
    throw err;
  }
}

function writeMemory(bundleDir: string, projectDir: string, plans: ImportMemoryPlan[]): string[] {
  const written: string[] = [];
  const memDir = path.join(projectDir, 'memory');
  let made = false;
  for (const p of plans) {
    if (p.action === 'skip') continue;
    if (!isSafeId(p.filename)) continue;
    const src = path.join(bundleDir, 'memory', p.filename);
    if (!fs.existsSync(src)) continue;
    const destName = p.action === 'conflict' ? (p.writtenAs ?? p.filename) : p.filename;
    if (!isSafeId(destName)) continue;
    const dest = path.join(memDir, destName);
    if (!isUnderClaudeRoot(dest)) continue;

    if (!made) {
      fs.mkdirSync(memDir, { recursive: true });
      made = true;
    }
    const tmp = dest + HISTORY_TMP_SUFFIX;
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dest);
    written.push(destName);
  }
  return written;
}

// ── history merge (append + dedup, atomic backup -> tmp -> rename) ────────────

async function gatherHistoryAdditions(
  bundleDir: string,
  sessions: ImportSessionPlan[],
  targetCwd: string,
): Promise<string[]> {
  const importing = sessions.filter((s) => s.action !== 'skip');
  if (importing.length === 0) return [];

  const seen = await loadHistoryKeys();
  const out: string[] = [];
  for (const s of importing) {
    const histPath = path.join(bundleDir, 'sessions', s.sessionId, 'history.ndjson');
    if (!fs.existsSync(histPath)) continue;
    const rl = readline.createInterface({
      input: fs.createReadStream(histPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const raw of rl) {
      if (!raw.trim()) continue;
      let line = rewriteLineField(raw, 'project', SENTINEL, targetCwd);
      if (s.newSessionId) line = rewriteLineField(line, 'sessionId', s.sessionId, s.newSessionId);
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const key = historyKey(obj);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

async function loadHistoryKeys(): Promise<Set<string>> {
  const set = new Set<string>();
  if (!fs.existsSync(PATHS.history)) return set;
  const rl = readline.createInterface({
    input: fs.createReadStream(PATHS.history, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    try {
      set.add(historyKey(JSON.parse(raw) as Record<string, unknown>));
    } catch {
      /* skip malformed */
    }
  }
  return set;
}

function historyKey(obj: Record<string, unknown>): string {
  const sid = typeof obj.sessionId === 'string' ? obj.sessionId : '';
  const ts = typeof obj.timestamp === 'string' ? obj.timestamp : '';
  const project = typeof obj.project === 'string' ? obj.project : '';
  const display = typeof obj.display === 'string' ? obj.display : '';
  // `project` is part of the identity: the same session+prompt remapped to a
  // different target cwd is a distinct history entry, while a re-import to the
  // same target collides and is correctly deduped (idempotent).
  return [sid, ts, project, sha256(display)].join(' ');
}

async function appendHistoryLines(lines: string[]): Promise<number> {
  if (lines.length === 0) return 0;

  const tmpPath = PATHS.history + HISTORY_TMP_SUFFIX;
  if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });

  try {
    const out = fs.createWriteStream(tmpPath, { encoding: 'utf8' });
    if (fs.existsSync(PATHS.history)) {
      const rl = readline.createInterface({
        input: fs.createReadStream(PATHS.history, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });
      for await (const raw of rl) {
        if (!raw) {
          out.write(os.EOL);
          continue;
        }
        out.write(raw);
        out.write(os.EOL);
      }
    }
    for (const line of lines) {
      out.write(line);
      out.write(os.EOL);
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }

  if (!fs.existsSync(PATHS.history)) {
    fs.renameSync(tmpPath, PATHS.history);
    return lines.length;
  }

  // Windows-safe atomic-ish replace: backup original, swap tmp in, drop backup.
  const backup = PATHS.history + '.bak-' + Date.now();
  fs.renameSync(PATHS.history, backup);
  try {
    fs.renameSync(tmpPath, PATHS.history);
    fs.rmSync(backup, { force: true });
  } catch (err) {
    if (fs.existsSync(backup)) {
      try {
        fs.renameSync(backup, PATHS.history);
      } catch {
        /* keep backup for manual recovery */
      }
    }
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
  return lines.length;
}

// ── small helpers ─────────────────────────────────────────────────────────────

function recentlyActive(jsonlPath: string): boolean {
  try {
    return Date.now() - fs.statSync(jsonlPath).mtimeMs < RECENT_ACTIVITY_WINDOW_MS;
  } catch {
    return false;
  }
}

function statDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? '';
}

function conflictName(filename: string, isIndex: boolean, sha: string): string {
  if (isIndex) return 'MEMORY.imported.md';
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  return `${base}.imported-${sha.slice(0, 8)}${ext}`;
}
