import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { isUnderClaudeRoot, PATHS } from './claude-paths.ts';
import { RECENT_ACTIVITY_WINDOW_MS } from './constants.ts';
import { dirSize, fileSize } from './fs-size.ts';
import { isSafeId } from './safe-id.ts';
import {
  buildActiveSessionMap,
  readActivePidEntries,
} from './active-sessions.ts';
import type {
  DeletedItem,
  DeleteRequestItem,
  DeleteResult,
  RelatedBytes,
  SkippedItem,
} from '../types.ts';

export type { DeleteRequestItem, DeleteResult } from '../types.ts';

const HISTORY_TMP_SUFFIX = '.tmp-clean';

export async function deleteSessions(items: DeleteRequestItem[]): Promise<DeleteResult> {
  const liveMap = buildActiveSessionMap();
  const deleted: DeletedItem[] = [];
  const skipped: SkippedItem[] = [];
  const targetIds = new Set<string>();

  for (const item of items) {
    if (!isSafeId(item.projectId) || !isSafeId(item.sessionId)) {
      skipped.push({ ...item, reason: 'invalid id' });
      continue;
    }

    const projectDir = path.join(PATHS.projects, item.projectId);
    const jsonlPath = path.join(projectDir, `${item.sessionId}.jsonl`);
    const subdirPath = path.join(projectDir, item.sessionId);
    const fhPath = path.join(PATHS.fileHistory, item.sessionId);
    const sePath = path.join(PATHS.sessionEnv, item.sessionId);

    const escaped = [jsonlPath, subdirPath, fhPath, sePath].find(
      (p) => !isUnderClaudeRoot(p),
    );
    if (escaped) {
      skipped.push({ ...item, reason: `path escapes ~/.claude: ${escaped}` });
      continue;
    }

    if (liveMap.has(item.sessionId)) {
      skipped.push({
        ...item,
        reason: `live PID ${liveMap.get(item.sessionId)} owns this session`,
      });
      continue;
    }

    if (isRecentlyActive(jsonlPath)) {
      skipped.push({
        ...item,
        reason: 'jsonl modified within the last 5 minutes — could still be in use',
      });
      continue;
    }

    if (!fs.existsSync(jsonlPath) && !fs.existsSync(subdirPath)) {
      skipped.push({ ...item, reason: 'no files for this session' });
      continue;
    }

    const related: RelatedBytes = {
      jsonl: fileSize(jsonlPath),
      subdir: dirSize(subdirPath),
      fileHistory: dirSize(fhPath),
      sessionEnv: dirSize(sePath),
    };
    const cleaned: string[] = [];

    if (rmFile(jsonlPath)) cleaned.push('projects/<id>.jsonl');
    if (rmDir(subdirPath)) cleaned.push('projects/<id>/');
    if (rmDir(fhPath)) cleaned.push('file-history/<id>/');
    if (rmDir(sePath)) cleaned.push('session-env/<id>/');

    deleted.push({
      ...item,
      freedBytes:
        related.jsonl + related.subdir + related.fileHistory + related.sessionEnv,
      cleaned,
      relatedBytes: related,
    });
    targetIds.add(item.sessionId);
  }

  let historyLinesRemoved = 0;
  if (targetIds.size > 0) {
    historyLinesRemoved = await rewriteHistoryWithout(targetIds);
    cleanupDeadPidFiles(targetIds);
  }

  return { deleted, skipped, historyLinesRemoved };
}

function rmFile(p: string): boolean {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { force: true });
  return true;
}

function rmDir(p: string): boolean {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

function isRecentlyActive(jsonlPath: string): boolean {
  try {
    return Date.now() - fs.statSync(jsonlPath).mtimeMs < RECENT_ACTIVITY_WINDOW_MS;
  } catch {
    return false;
  }
}

async function rewriteHistoryWithout(sessionIds: Set<string>): Promise<number> {
  if (!fs.existsSync(PATHS.history)) return 0;

  const tmpPath = PATHS.history + HISTORY_TMP_SUFFIX;
  if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });

  let removed = 0;
  try {
    const out = fs.createWriteStream(tmpPath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fs.createReadStream(PATHS.history, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const raw of rl) {
      if (!raw) {
        out.write(os.EOL);
        continue;
      }
      let drop = false;
      try {
        const obj = JSON.parse(raw) as { sessionId?: unknown };
        if (typeof obj.sessionId === 'string' && sessionIds.has(obj.sessionId)) {
          drop = true;
        }
      } catch {
        /* keep malformed lines */
      }
      if (drop) {
        removed += 1;
      } else {
        out.write(raw);
        out.write(os.EOL);
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }

  if (removed === 0) {
    fs.rmSync(tmpPath, { force: true });
    return 0;
  }

  // Windows-safe atomic-ish replace: backup original, swap tmp in, drop backup.
  // unlink + rename is the alternative but loses recoverability mid-failure.
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
  return removed;
}

function cleanupDeadPidFiles(sessionIds: Set<string>): void {
  for (const entry of readActivePidEntries()) {
    if (!sessionIds.has(entry.sessionId)) continue;
    if (entry.alive) continue;
    try {
      fs.rmSync(entry.sourceFile, { force: true });
    } catch {
      /* ignore */
    }
  }
}
