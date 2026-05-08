import fs from 'node:fs';
import path from 'node:path';
import { buildActiveSessionMap } from './active-sessions.ts';
import { isUnderClaudeRoot, PATHS } from './claude-paths.ts';
import { RECENT_ACTIVITY_WINDOW_MS } from './constants.ts';
import { deleteSessions } from './delete.ts';
import { isSafeId } from './safe-id.ts';
import type { DeleteProjectResult, SkippedItem } from '../types.ts';

const JSONL_EXT = '.jsonl';

export async function deleteProject(projectId: string): Promise<DeleteProjectResult> {
  if (!isSafeId(projectId)) {
    return {
      deleted: [],
      skipped: [{ projectId, sessionId: '', reason: 'invalid project id' }],
      historyLinesRemoved: 0,
      projectDirRemoved: false,
    };
  }

  const projectDir = path.join(PATHS.projects, projectId);
  if (!isUnderClaudeRoot(projectDir)) {
    return {
      deleted: [],
      skipped: [{ projectId, sessionId: '', reason: 'path escapes ~/.claude' }],
      historyLinesRemoved: 0,
      projectDirRemoved: false,
    };
  }
  if (!fs.existsSync(projectDir)) {
    return {
      deleted: [],
      skipped: [{ projectId, sessionId: '', reason: 'project directory does not exist' }],
      historyLinesRemoved: 0,
      projectDirRemoved: false,
    };
  }

  const sessionIds: string[] = [];
  for (const ent of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith(JSONL_EXT)) {
      sessionIds.push(ent.name.slice(0, -JSONL_EXT.length));
    }
  }

  // All-or-nothing precheck: refuse to touch any session if even one is live or
  // recently active. Confirmed by the user — partial deletes leave the project
  // half-cleared, which is more confusing than a clean "try again later".
  const liveMap = buildActiveSessionMap();
  const blockers: SkippedItem[] = [];
  for (const sid of sessionIds) {
    if (liveMap.has(sid)) {
      blockers.push({
        projectId,
        sessionId: sid,
        reason: `live PID ${liveMap.get(sid)} owns this session`,
      });
      continue;
    }
    const jsonlPath = path.join(projectDir, `${sid}${JSONL_EXT}`);
    try {
      if (Date.now() - fs.statSync(jsonlPath).mtimeMs < RECENT_ACTIVITY_WINDOW_MS) {
        blockers.push({
          projectId,
          sessionId: sid,
          reason: 'jsonl modified within the last 5 minutes — could still be in use',
        });
      }
    } catch {
      /* missing file is fine — deleteSessions will skip it */
    }
  }

  if (blockers.length > 0) {
    return {
      deleted: [],
      skipped: blockers,
      historyLinesRemoved: 0,
      projectDirRemoved: false,
    };
  }

  const result = await deleteSessions(
    sessionIds.map((sessionId) => ({ projectId, sessionId })),
  );

  let projectDirRemoved = false;
  if (result.skipped.length === 0) {
    try {
      // Recursive remove also catches any orphan subdirs whose .jsonl was missing.
      fs.rmSync(projectDir, { recursive: true, force: true });
      projectDirRemoved = true;
    } catch {
      /* leave dir for manual cleanup */
    }
  }

  return { ...result, projectDirRemoved };
}
