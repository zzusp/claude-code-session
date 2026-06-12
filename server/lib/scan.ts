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

export async function resolveProjectCwd(
  projectId: string,
): Promise<{ decoded: string; resolved: boolean } | null> {
  const projectDir = path.join(PATHS.projects, projectId);
  if (!fs.existsSync(projectDir)) return null;

  const sessionIds = listSessionIdsInProject(projectDir);
  let sampleCwd: string | null = null;
  for (const id of sessionIds) {
    const jsonlPath = path.join(projectDir, `${id}${JSONL_EXT}`);
    if (!fs.existsSync(jsonlPath)) continue;
    const meta = await parseJsonlMeta(jsonlPath);
    if (meta.cwdFromMessages) {
      sampleCwd = meta.cwdFromMessages;
      break;
    }
  }
  return decodeProjectId(projectId, sampleCwd);
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

/**
 * 把一条会话散落在 4 处的字节 + jsonl meta + 活跃态收敛成一个 SessionSummary。
 * `activeMap` 由调用方构建一次后复用——按项目各建一次代价高（Windows 下 = 一次
 * `tasklist` spawn），跨项目的 recents / 单项目的列表都从外面传入同一份。
 */
async function buildSessionSummary(
  projectId: string,
  id: string,
  activeMap: Map<string, number>,
): Promise<SessionSummary> {
  const projectDir = path.join(PATHS.projects, projectId);
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
  let errorCount = 0;
  let lastTurnIncomplete = false;

  if (fs.existsSync(jsonlPath)) {
    const meta = await parseJsonlMeta(jsonlPath);
    title = meta.title;
    customTitle = meta.customTitle;
    firstAt = meta.firstAt;
    lastAt = meta.lastAt;
    messageCount = meta.messageCount;
    errorCount = meta.errorCount;
    lastTurnIncomplete = meta.lastTurnIncomplete;
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

  return {
    id,
    projectId,
    title,
    customTitle,
    firstAt,
    lastAt,
    messageCount,
    errorCount,
    bytes: related.jsonl,
    relatedBytes: related,
    isLivePid: livePid !== null,
    isRecentlyActive,
    livePid,
    // "Working" narrows "live" to actively-processing: a live PID, fresh file
    // activity, and an unfinished last turn. The live-PID gate keeps a session
    // that crashed mid-turn (file frozen with a trailing `user` record) from
    // reading as "working".
    isWorking: livePid !== null && isRecentlyActive && lastTurnIncomplete,
  };
}

export async function listSessionsForProject(projectId: string): Promise<SessionSummary[]> {
  const projectDir = path.join(PATHS.projects, projectId);
  if (!fs.existsSync(projectDir)) return [];

  const activeMap = buildActiveSessionMap();
  const ids = listSessionIdsInProject(projectDir);
  const out: SessionSummary[] = [];

  for (const id of ids) {
    out.push(await buildSessionSummary(projectId, id, activeMap));
  }

  out.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  return out;
}

/**
 * 跨全部项目的「最近会话」——侧栏 Recents 用。先用廉价的 statSync 取每条 jsonl 的
 * mtime 选出最近 `limit` 条候选，只对这批解析 jsonl meta + 计算字节，避免把全盘每条
 * 会话都解析一遍。active map 全局只建一次（见 buildSessionSummary 注释）。
 */
export async function listRecentSessions(limit = 12): Promise<SessionSummary[]> {
  if (!fs.existsSync(PATHS.projects)) return [];

  const candidates: { projectId: string; id: string; mtimeMs: number }[] = [];
  for (const ent of fs.readdirSync(PATHS.projects, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const projectId = ent.name;
    const projectDir = path.join(PATHS.projects, projectId);
    for (const id of listSessionIdsInProject(projectDir)) {
      try {
        const mtimeMs = fs.statSync(path.join(projectDir, `${id}${JSONL_EXT}`)).mtimeMs;
        candidates.push({ projectId, id, mtimeMs });
      } catch {
        // jsonl vanished between readdir and stat — skip
      }
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const top = candidates.slice(0, Math.max(0, limit));

  const activeMap = buildActiveSessionMap();
  const out: SessionSummary[] = [];
  for (const c of top) {
    out.push(await buildSessionSummary(c.projectId, c.id, activeMap));
  }

  out.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  return out;
}

export interface DiskScanSession {
  id: string;
  title: string;
  customTitle: string | null;
  lastAt: string | null;
  relatedBytes: RelatedBytes;
}

export interface DiskScanProject {
  id: string;
  decodedCwd: string;
  cwdResolved: boolean;
  totalBytes: number;
  sessionCount: number;
  sessions: DiskScanSession[];
}

/**
 * 磁盘视图（disk-usage + cleanup-suggestions）专用的单遍扫描：逐会话算
 * relatedBytes + 解析一次 jsonl meta，项目 totalBytes = 其会话之和。
 *
 * 刻意不做 live-PID / recently-active 探测：两个磁盘视图都不展示这些，而
 * `listSessionsForProject` 会按项目各建一次 active map（Windows 下 = 一次
 * `tasklist` spawn，~400-700ms），被这两个接口按项目数放大成几十次 tasklist，
 * 是磁盘页加载慢的主因。size/meta 原语与 `listSessionsForProject` 复用，只去掉
 * active map 与「listProjects + listSessionsForProject」之间重复的 size 遍历。
 */
export async function scanProjectsForDisk(): Promise<DiskScanProject[]> {
  if (!fs.existsSync(PATHS.projects)) return [];

  const projectIds = fs
    .readdirSync(PATHS.projects, { withFileTypes: true })
    .filter((ent) => ent.isDirectory())
    .map((ent) => ent.name);

  const result: DiskScanProject[] = [];
  for (const projectId of projectIds) {
    const projectDir = path.join(PATHS.projects, projectId);
    const ids = listSessionIdsInProject(projectDir);

    const scanned = await Promise.all(ids.map((id) => scanDiskSession(projectDir, id)));

    let totalBytes = 0;
    let sampleCwd: string | null = null;
    const sessions: DiskScanSession[] = [];
    for (const { session, cwdFromMessages } of scanned) {
      const r = session.relatedBytes;
      totalBytes += r.jsonl + r.subdir + r.fileHistory + r.sessionEnv;
      if (!sampleCwd && cwdFromMessages) sampleCwd = cwdFromMessages;
      sessions.push(session);
    }

    const { decoded, resolved } = decodeProjectId(projectId, sampleCwd);
    result.push({
      id: projectId,
      decodedCwd: decoded,
      cwdResolved: resolved,
      totalBytes,
      sessionCount: ids.length,
      sessions,
    });
  }

  return result;
}

async function scanDiskSession(
  projectDir: string,
  id: string,
): Promise<{ session: DiskScanSession; cwdFromMessages: string | null }> {
  const jsonlPath = path.join(projectDir, `${id}${JSONL_EXT}`);
  const relatedBytes: RelatedBytes = {
    jsonl: fileSize(jsonlPath),
    subdir: dirSize(path.join(projectDir, id)),
    fileHistory: dirSize(path.join(PATHS.fileHistory, id)),
    sessionEnv: dirSize(path.join(PATHS.sessionEnv, id)),
  };

  let title = '(no jsonl)';
  let customTitle: string | null = null;
  let lastAt: string | null = null;
  let cwdFromMessages: string | null = null;
  if (fs.existsSync(jsonlPath)) {
    const meta = await parseJsonlMeta(jsonlPath);
    title = meta.title;
    customTitle = meta.customTitle;
    lastAt = meta.lastAt;
    cwdFromMessages = meta.cwdFromMessages;
  }

  return {
    session: { id, title, customTitle, lastAt, relatedBytes },
    cwdFromMessages,
  };
}
