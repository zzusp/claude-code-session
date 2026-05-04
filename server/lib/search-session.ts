import fs from 'node:fs';
import readline from 'node:readline';
import type { SearchBlockKind, SearchSnippet } from '../types.ts';

export interface SearchSessionResult {
  snippets: SearchSnippet[];
  hasMore: boolean;
}

export interface SearchSessionOpts {
  include: ReadonlySet<SearchBlockKind>;
  perSession: number;
  windowChars?: number;
}

const DEFAULT_WINDOW = 60;
const ADJACENT_GAP = 120;

export async function searchSessionFile(
  filePath: string,
  pattern: string,
  opts: SearchSessionOpts,
): Promise<SearchSessionResult> {
  const windowChars = opts.windowChars ?? DEFAULT_WINDOW;
  const snippets: SearchSnippet[] = [];
  let hasMore = false;

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const raw of rl) {
      if (snippets.length >= opts.perSession) {
        hasMore = true;
        break;
      }
      const line = raw.trim();
      if (!line) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (obj.type !== 'user' && obj.type !== 'assistant') continue;
      const role = obj.type;
      const uuid = typeof obj.uuid === 'string' ? obj.uuid : '';
      if (!uuid) continue;
      const ts = typeof obj.timestamp === 'string' ? obj.timestamp : null;
      const message = (obj.message ?? {}) as { content?: unknown };

      const blocks = extractSearchableBlocks(message.content, opts.include);
      for (const block of blocks) {
        if (snippets.length >= opts.perSession) {
          hasMore = true;
          break;
        }
        const matches = findMatches(block.text, pattern);
        for (const match of matches) {
          if (snippets.length >= opts.perSession) {
            hasMore = true;
            break;
          }
          snippets.push({
            uuid,
            ts,
            role,
            blockKind: block.kind,
            ...sliceWindow(block.text, match.start, match.end, windowChars),
          });
        }
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { snippets, hasMore };
}

interface SearchableBlock {
  kind: SearchBlockKind;
  text: string;
}

function extractSearchableBlocks(
  content: unknown,
  include: ReadonlySet<SearchBlockKind>,
): SearchableBlock[] {
  if (typeof content === 'string') {
    return include.has('text') && content ? [{ kind: 'text', text: content }] : [];
  }
  if (!Array.isArray(content)) return [];

  const out: SearchableBlock[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    switch (b.type) {
      case 'text':
        if (include.has('text') && typeof b.text === 'string' && b.text) {
          out.push({ kind: 'text', text: b.text });
        }
        break;
      case 'tool_use':
        if (include.has('tool_use')) {
          const name = typeof b.name === 'string' ? b.name : '';
          let inputStr = '';
          try {
            inputStr = b.input == null ? '' : JSON.stringify(b.input);
          } catch {
            inputStr = '';
          }
          const text = inputStr ? `${name} ${inputStr}` : name;
          if (text) out.push({ kind: 'tool_use', text });
        }
        break;
      case 'tool_result':
        if (include.has('tool_result')) {
          const text = stringifyToolResult(b.content);
          if (text) out.push({ kind: 'tool_result', text });
        }
        break;
      case 'thinking':
        if (include.has('thinking') && typeof b.thinking === 'string' && b.thinking) {
          out.push({ kind: 'thinking', text: b.thinking });
        }
        break;
    }
  }
  return out;
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text') {
          const t = (b as { text?: unknown }).text;
          return typeof t === 'string' ? t : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

interface MatchPos {
  start: number;
  end: number;
}

function findMatches(text: string, pattern: string): MatchPos[] {
  const out: MatchPos[] = [];
  if (!pattern) return out;
  const lower = text.toLowerCase();
  const needle = pattern.toLowerCase();
  let from = 0;
  let lastEnd = -ADJACENT_GAP - 1;
  while (from <= lower.length) {
    const idx = lower.indexOf(needle, from);
    if (idx === -1) break;
    const end = idx + needle.length;
    if (idx - lastEnd >= ADJACENT_GAP) {
      out.push({ start: idx, end });
      lastEnd = end;
    }
    from = end > from ? end : from + 1;
  }
  return out;
}

function sliceWindow(
  text: string,
  start: number,
  end: number,
  windowChars: number,
): { before: string; match: string; after: string } {
  let beforeStart = Math.max(0, start - windowChars);
  let afterEnd = Math.min(text.length, end + windowChars);

  if (beforeStart > 0) {
    const ws = text.lastIndexOf(' ', beforeStart);
    if (ws !== -1 && start - ws < windowChars * 2) beforeStart = ws + 1;
  }
  if (afterEnd < text.length) {
    const ws = text.indexOf(' ', afterEnd);
    if (ws !== -1 && ws - end < windowChars * 2) afterEnd = ws;
  }

  let before = text.slice(beforeStart, start).replace(/\s+/g, ' ');
  let after = text.slice(end, afterEnd).replace(/\s+/g, ' ');
  if (beforeStart > 0) before = '… ' + before;
  if (afterEnd < text.length) after = after + ' …';

  return { before, match: text.slice(start, end), after };
}
