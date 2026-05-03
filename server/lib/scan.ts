import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './claude-paths.ts';
import { RECENT_ACTIVITY_WINDOW_MS } from './constants.ts';
import { decodeCwd } from './encode-cwd.ts';
import { dirSize, fileSize } from './fs-size.ts';
import { parseJsonlMeta } from './parse-jsonl.ts';
import { buildActiveSessionMap } from './active-sessions.ts';
import type { ProjectSummary, RelatedBytes, SessionSummary } from '../types.ts';

const JSONL_EXT = '.jsonl';

function listSessionIdsInProject(projectDir: string): string[] {
  if (!fs.existsSync(projectDir)) return [];
  const ids: string[] = [];
  for (const ent of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith(JSONL_EXT)) {
      ids.push(ent.name.slice(0, -JSONL_EXT.length));
    }
  }
  return ids;
}

function decodeProjectId(encoded: string, sampleCwd: string | null): {
  decoded: string;
  resolved: boolean;
} {
  if (sampleCwd) return { decoded: sampleCwd, resolved: true };
  const decoded = decodeCwd(encoded);
  let resolved = false;
  try {
    resolved = fs.statSync(decoded).isDirectory();
  } catch {
    resolved = false;
  }
  return { decoded, resolved };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (!fs.existsSync(PATHS.projects)) return [];
  const result: ProjectSummary[] = [];

  for (const ent of fs.readdirSync(PATHS.projects, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const projectId = ent.name;
    const projectDir = path.join(PATHS.projects, projectId);

    const sessionIds = listSessionIdsInProject(projectDir);
    let sampleCwd: string | null = null;
    let totalBytes = 0;
    let lastActiveAt: string | null = null;

    for (const id of sessionIds) {
      const jsonlPath = path.join(projectDir, `${id}${JSONL_EXT}`);
      const subdirPath = path.join(projectDir, id);
      totalBytes += fileSize(jsonlPath);
      totalBytes += dirSize(subdirPath);
      totalBytes += dirSize(path.join(PATHS.fileHistory, id));
      totalBytes += dirSize(path.join(PATHS.sessionEnv, id));

      if (!sampleCwd && fs.existsSync(jsonlPath)) {
        const meta = await parseJsonlMeta(jsonlPath);
        sampleCwd = meta.cwdFromMessages;
        if (meta.lastAt && (!lastActiveAt || meta.lastAt > lastActiveAt)) {
          lastActiveAt = meta.lastAt;
        }
      } else if (fs.existsSync(jsonlPath)) {
        try {
          const mtime = fs.statSync(jsonlPath).mtime.toISOString();
          if (!lastActiveAt || mtime > lastActiveAt) lastActiveAt = mtime;
        } catch {
          // ignore
        }
      }
    }

    const { decoded, resolved } = decodeProjectId(projectId, sampleCwd);

    result.push({
      id: projectId,
      encodedCwd: projectId,
      decodedCwd: decoded,
      cwdResolved: resolved,
      sessionCount: sessionIds.length,
      totalBytes,
      lastActiveAt,
    });
  }

  result.sort((a, b) => {
    const at = a.lastActiveAt ?? '';
    const bt = b.lastActiveAt ?? '';
    return bt.localeCompare(at);
  });
  return result;
}

export async function listSessionsForProject(projectId: string): Promise<SessionSummary[]> {
  const projectDir = path.join(PATHS.projects, projectId);
  if (!fs.existsSync(projectDir)) return [];

  const activeMap = buildActiveSessionMap();
  const ids = listSessionIdsInProject(projectDir);
  const out: SessionSummary[] = [];

  for (const id of ids) {
    const jsonlPath = path.join(projectDir, `${id}${JSONL_EXT}`);
    const subdirPath = path.join(projectDir, id);
    const fhPath = path.join(PATHS.fileHistory, id);
    const sePath = path.join(PATHS.sessionEnv, id);

    const related: RelatedBytes = {
      jsonl: fileSize(jsonlPath),
      subdir: dirSize(subdirPath),
      fileHistory: dirSize(fhPath),
      sessionEnv: dirSize(sePath),
    };

    let title = '(no jsonl)';
    let customTitle: string | null = null;
    let firstAt: string | null = null;
    let lastAt: string | null = null;
    let messageCount = 0;

    if (fs.existsSync(jsonlPath)) {
      const meta = await parseJsonlMeta(jsonlPath);
      title = meta.title;
      customTitle = meta.customTitle;
      firstAt = meta.firstAt;
      lastAt = meta.lastAt;
      messageCount = meta.messageCount;
    }

    const livePid = activeMap.get(id) ?? null;
    let isRecentlyActive = false;
    if (fs.existsSync(jsonlPath)) {
      try {
        const mtimeMs = fs.statSync(jsonlPath).mtimeMs;
        isRecentlyActive = Date.now() - mtimeMs < RECENT_ACTIVITY_WINDOW_MS;
      } catch {
        // ignore
      }
    }

    out.push({
      id,
      projectId,
      title,
      customTitle,
      firstAt,
      lastAt,
      messageCount,
      bytes: related.jsonl,
      relatedBytes: related,
      isLivePid: livePid !== null,
      isRecentlyActive,
      livePid,
    });
  }

  out.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  return out;
}
