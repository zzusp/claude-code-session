import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PATHS } from './claude-paths.ts';
import { MAX_SESSION_MESSAGES } from './constants.ts';
import { SYSTEM_TAG_RE, pickTitleText } from './system-tags.ts';
import type { Block, Message, SessionDetail, SessionMeta } from '../types.ts';

export async function loadSessionDetail(
  projectId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const jsonlPath = path.join(PATHS.projects, projectId, `${sessionId}.jsonl`);
  if (!fs.existsSync(jsonlPath)) return null;

  let bytes = 0;
  let mtimeIso: string | null = null;
  try {
    const stat = fs.statSync(jsonlPath);
    bytes = stat.size;
    mtimeIso = stat.mtime.toISOString();
  } catch {
    /* ignore */
  }

  const meta: SessionMeta = {
    sessionId,
    projectId,
    cwd: null,
    gitBranch: null,
    version: null,
    firstAt: null,
    lastAt: null,
    messageCount: 0,
    bytes,
    title: '(untitled)',
    customTitle: null,
    contextTokens: null,
    contextWindow: 200_000,
  };

  const messages: Message[] = [];
  let truncated = false;
  // Latest `ai-title` record wins (Claude rewrites it every turn). Kept off
  // the wire shape; just used to seed `meta.title` once parsing finishes.
  let aiTitle: string | null = null;
  // Context-window occupancy. `lastContextTokens` follows the most recent
  // assistant turn (records are chronological), `peakContextTokens` the high
  // water mark, `lastModel` the model that turn ran on — together they size the
  // ring's ceiling (see `contextWindowFor`).
  let lastContextTokens: number | null = null;
  let peakContextTokens = 0;
  let lastModel: string | null = null;

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

    captureMeta(obj, meta);
    if (obj.type === 'ai-title' && typeof obj.aiTitle === 'string') {
      aiTitle = obj.aiTitle;
    }
    if (obj.type === 'assistant') {
      const model = (obj.message as { model?: unknown } | undefined)?.model;
      if (typeof model === 'string' && model) lastModel = model;
      const used = contextTokensOf(obj);
      if (used !== null) {
        lastContextTokens = used;
        if (used > peakContextTokens) peakContextTokens = used;
      }
    }

    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    if (messages.length >= MAX_SESSION_MESSAGES) {
      truncated = true;
      continue;
    }

    const msg = buildMessage(obj);
    if (msg) messages.push(msg);
  }

  messages.sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''));

  // Match `parseJsonlMeta`: file mtime advances on untimestamped meta rewrites
  // (ai-title rotate, rename), so fold it into lastAt to stay in sync with
  // `claude code resume`.
  if (mtimeIso && (!meta.lastAt || mtimeIso > meta.lastAt)) {
    meta.lastAt = mtimeIso;
  }

  meta.messageCount = messages.length;
  meta.title = aiTitle || deriveAutoTitle(messages);
  meta.contextTokens = lastContextTokens;
  meta.contextWindow = contextWindowFor(lastModel, peakContextTokens);
  return { meta, messages, truncated };
}

const STANDARD_CONTEXT_WINDOW = 200_000;
const LARGE_CONTEXT_WINDOW = 1_000_000;

// 已知不支持 1M 上下文、仍是 200K 标准窗口的模型：Haiku 全系，以及 legacy Claude 3.x /
// 2.x / instant。当前在产的 Opus 4.x / Sonnet 4.x / Fable 5 都是 1M。
const SUB_LARGE_CONTEXT_RE = /haiku|claude-3|claude-2|claude-instant/i;

/** Context window the ring is scaled against, derived from the session's model.
 *  Default to Claude's 1M window (Opus 4.x / Sonnet 4.x / Fable 5 all support it,
 *  and Claude Code strips the `[1m]` suffix from logged records so we can't rely on
 *  it). Only models known to cap at 200K — Haiku and legacy Claude 3.x / 2.x — fall
 *  back to the standard window. The ceiling is never scaled below what the session
 *  actually consumed, so a 200K model that somehow overshot still bumps to 1M. */
function contextWindowFor(model: string | null, peakTokens: number): number {
  const base =
    model !== null && SUB_LARGE_CONTEXT_RE.test(model)
      ? STANDARD_CONTEXT_WINDOW
      : LARGE_CONTEXT_WINDOW;
  return peakTokens > base ? LARGE_CONTEXT_WINDOW : base;
}

/** Input-side token total of an assistant record's `message.usage`
 *  (`input_tokens + cache_creation_input_tokens + cache_read_input_tokens`) — the
 *  context-window occupancy after that turn. Null when no usage block is present
 *  or the totals are all zero (synthetic-error records carry a zeroed usage). */
function contextTokensOf(obj: Record<string, unknown>): number | null {
  const message = obj.message as { usage?: unknown } | undefined;
  const usage = message?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const total =
    num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
  return total > 0 ? total : null;
}

function captureMeta(obj: Record<string, unknown>, meta: SessionMeta): void {
  if (typeof obj.cwd === 'string' && !meta.cwd) meta.cwd = obj.cwd;
  if (typeof obj.gitBranch === 'string' && !meta.gitBranch) meta.gitBranch = obj.gitBranch;
  if (typeof obj.version === 'string' && !meta.version) meta.version = obj.version;
  if (obj.type === 'custom-title' && typeof obj.customTitle === 'string') {
    meta.customTitle = obj.customTitle;
  }
  const ts = typeof obj.timestamp === 'string' ? obj.timestamp : null;
  if (ts) {
    if (!meta.firstAt) meta.firstAt = ts;
    meta.lastAt = ts;
  }
}

function deriveAutoTitle(messages: Message[]): string {
  for (const m of messages) {
    if (m.type !== 'user' || m.isMeta) continue;
    for (const block of m.blocks) {
      if (block.type !== 'text') continue;
      const usable = pickTitleText(block.text);
      if (!usable) continue;
      const line = usable.trim().split('\n')[0] ?? '';
      if (!line) continue;
      return line.length > 80 ? line.slice(0, 80) + '…' : line;
    }
  }
  return '(untitled)';
}

function buildMessage(obj: Record<string, unknown>): Message | null {
  const type = obj.type === 'user' ? 'user' : 'assistant';
  const message = (obj.message ?? {}) as { content?: unknown; model?: unknown };
  const blocks = parseContent(message.content);

  let isMeta = false;
  if (type === 'user' && blocks.length === 1 && blocks[0]!.type === 'text') {
    if (SYSTEM_TAG_RE.test(blocks[0]!.text)) isMeta = true;
  }

  return {
    uuid: typeof obj.uuid === 'string' ? obj.uuid : '',
    parentUuid: typeof obj.parentUuid === 'string' ? obj.parentUuid : null,
    type,
    ts: typeof obj.timestamp === 'string' ? obj.timestamp : null,
    model: typeof message.model === 'string' ? message.model : null,
    blocks,
    isMeta,
  };
}

function parseContent(content: unknown): Block[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (!Array.isArray(content)) return [];

  const out: Block[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    switch (b.type) {
      case 'text':
        out.push({ type: 'text', text: typeof b.text === 'string' ? b.text : '' });
        break;
      case 'tool_use':
        out.push({
          type: 'tool_use',
          id: typeof b.id === 'string' ? b.id : '',
          name: typeof b.name === 'string' ? b.name : '(unknown)',
          input: b.input ?? null,
        });
        break;
      case 'tool_result':
        out.push({
          type: 'tool_result',
          toolUseId: typeof b.tool_use_id === 'string' ? b.tool_use_id : '',
          content: stringifyToolResult(b.content),
          isError: b.is_error === true,
        });
        break;
      case 'thinking':
        out.push({
          type: 'thinking',
          text: typeof b.thinking === 'string' ? b.thinking : '',
        });
        break;
      case 'image': {
        const src = b.source as { media_type?: unknown } | undefined;
        out.push({
          type: 'image',
          mediaType: typeof src?.media_type === 'string' ? src.media_type : null,
        });
        break;
      }
      default:
        out.push({ type: 'unknown', raw: b });
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
        if (b && typeof b === 'object' && (b as { type?: unknown }).type === 'image') {
          return '[image]';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}
