import fs from 'node:fs/promises';
import path from 'node:path';
import { isUnderClaudeRoot, PATHS } from './claude-paths.ts';
import type { MemoryEntry, MemoryResponse, MemoryType } from '../types.ts';

const KNOWN_TYPES: ReadonlySet<MemoryType> = new Set([
  'user',
  'feedback',
  'project',
  'reference',
]);

const TYPE_ORDER: ReadonlyArray<MemoryType> = ['user', 'feedback', 'project', 'reference'];

export async function loadProjectMemory(projectId: string): Promise<MemoryResponse> {
  const dir = path.join(PATHS.projects, projectId, 'memory');
  if (!isUnderClaudeRoot(dir)) return { index: null, entries: [] };

  let dirents: string[];
  try {
    dirents = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { index: null, entries: [] };
    }
    throw err;
  }

  let index: string | null = null;
  const entries: MemoryEntry[] = [];

  for (const filename of dirents) {
    if (!filename.toLowerCase().endsWith('.md')) continue;
    const full = path.join(dir, filename);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    let raw: string;
    try {
      raw = await fs.readFile(full, 'utf8');
    } catch {
      continue;
    }

    if (filename.toLowerCase() === 'memory.md') {
      index = raw;
      continue;
    }

    const { name, description, type, body } = parseFrontmatter(raw);
    entries.push({
      filename,
      name,
      description,
      type,
      body,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
    });
  }

  entries.sort((a, b) => {
    const ai = a.type ? TYPE_ORDER.indexOf(a.type) : TYPE_ORDER.length;
    const bi = b.type ? TYPE_ORDER.indexOf(b.type) : TYPE_ORDER.length;
    if (ai !== bi) return ai - bi;
    const an = a.name ?? a.filename;
    const bn = b.name ?? b.filename;
    return an.localeCompare(bn);
  });

  return { index, entries };
}

interface Parsed {
  name: string | null;
  description: string | null;
  type: MemoryType | null;
  body: string;
}

function parseFrontmatter(raw: string): Parsed {
  const result: Parsed = { name: null, description: null, type: null, body: raw };
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return result;

  const fmBlock = m[1] ?? '';
  result.body = (m[2] ?? '').replace(/^\r?\n/, '');

  for (const line of fmBlock.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = stripQuotes(line.slice(colon + 1).trim());
    if (!value) continue;
    if (key === 'name') result.name = value;
    else if (key === 'description') result.description = value;
    else if (key === 'type') {
      const lower = value.toLowerCase() as MemoryType;
      if (KNOWN_TYPES.has(lower)) result.type = lower;
    }
  }

  return result;
}

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}
