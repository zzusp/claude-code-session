import fs from 'node:fs';
import path from 'node:path';
import { PATHS, isUnderClaudeRoot } from './claude-paths.ts';
import { decodeCwd } from './encode-cwd.ts';
import { isSafeId } from './safe-id.ts';
import { parseJsonlMeta } from './parse-jsonl.ts';
import { searchSessionFile, type SearchSessionOpts } from './search-session.ts';
import type { SearchBlockKind, SearchEvent, SearchSessionHit } from '../types.ts';

const JSONL_EXT = '.jsonl';

export interface SearchAllOpts {
  query: string;
  include: ReadonlySet<SearchBlockKind>;
  perSession: number;
  maxSessions: number;
}

interface SessionFileEntry {
  projectId: string;
  sessionId: string;
  filePath: string;
  mtimeMs: number;
}

export async function* searchAll(opts: SearchAllOpts): AsyncGenerator<SearchEvent> {
  const startedAt = Date.now();
  const files = enumerateSessionFiles();
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const sessionOpts: SearchSessionOpts = {
    include: opts.include,
    perSession: opts.perSession,
  };

  let scanned = 0;
  let matched = 0;
  let truncated = false;

  for (const entry of files) {
    if (matched >= opts.maxSessions) {
      truncated = true;
      break;
    }
    scanned++;

    let result;
    try {
      result = await searchSessionFile(entry.filePath, opts.query, sessionOpts);
    } catch {
      continue;
    }
    if (result.snippets.length === 0) continue;

    let meta;
    try {
      meta = await parseJsonlMeta(entry.filePath);
    } catch {
      continue;
    }

    matched++;
    const decodedCwd = meta.cwdFromMessages ?? decodeCwd(entry.projectId);
    const hit: SearchSessionHit = {
      type: 'session',
      projectId: entry.projectId,
      sessionId: entry.sessionId,
      projectDecodedCwd: decodedCwd,
      title: meta.title,
      customTitle: meta.customTitle,
      lastAt: meta.lastAt,
      hasMore: result.hasMore,
      snippets: result.snippets,
    };
    yield hit;
  }

  yield {
    type: 'done',
    scanned,
    matched,
    durationMs: Date.now() - startedAt,
    truncated,
  };
}

function enumerateSessionFiles(): SessionFileEntry[] {
  if (!fs.existsSync(PATHS.projects)) return [];
  const out: SessionFileEntry[] = [];

  let projects: fs.Dirent[];
  try {
    projects = fs.readdirSync(PATHS.projects, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const projEnt of projects) {
    if (!projEnt.isDirectory()) continue;
    if (!isSafeId(projEnt.name)) continue;
    const projectId = projEnt.name;
    const projectDir = path.join(PATHS.projects, projectId);
    if (!isUnderClaudeRoot(projectDir)) continue;

    let files: fs.Dirent[];
    try {
      files = fs.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const fileEnt of files) {
      if (!fileEnt.isFile() || !fileEnt.name.endsWith(JSONL_EXT)) continue;
      const sessionId = fileEnt.name.slice(0, -JSONL_EXT.length);
      if (!isSafeId(sessionId)) continue;
      const filePath = path.join(projectDir, fileEnt.name);
      if (!isUnderClaudeRoot(filePath)) continue;

      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      out.push({ projectId, sessionId, filePath, mtimeMs });
    }
  }

  return out;
}
