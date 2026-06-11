import fs from 'node:fs';
import readline from 'node:readline';
import { INTERRUPTED_MARKER_RE } from './constants.ts';
import { SYSTEM_TAG_RE, pickTitleText } from './system-tags.ts';

export interface JsonlMeta {
  title: string;
  /** Latest `custom-title` record value, or null if never renamed. */
  customTitle: string | null;
  firstAt: string | null;
  lastAt: string | null;
  messageCount: number;
  /** Count of tool_result blocks flagged `is_error` across the session. */
  errorCount: number;
  cwdFromMessages: string | null;
  /**
   * The last conversation turn is unfinished — Claude still owes output. True when
   * the final `user`/`assistant` record is either a `user` message (and not an
   * abort marker) or an `assistant` message that ends on a `tool_use` block. This
   * is the structural half of "working"; liveness gating happens in the caller.
   */
  lastTurnIncomplete: boolean;
}

export async function parseJsonlMeta(filePath: string): Promise<JsonlMeta> {
  let firstUserTitle = '';
  let aiTitle: string | null = null;
  let customTitle: string | null = null;
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  let messageCount = 0;
  let errorCount = 0;
  let cwdFromMessages: string | null = null;
  // Re-evaluated on every conversation record so it reflects the *last* turn once
  // the scan finishes.
  let lastTurnIncomplete = false;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
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

    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : null;
    if (ts) {
      if (!firstAt) firstAt = ts;
      lastAt = ts;
    }

    if (obj.cwd && typeof obj.cwd === 'string' && !cwdFromMessages) {
      cwdFromMessages = obj.cwd;
    }

    if (obj.type === 'custom-title' && typeof obj.customTitle === 'string') {
      customTitle = obj.customTitle;
    }

    // Claude Code rewrites this record every turn; the latest copy is canonical.
    if (obj.type === 'ai-title' && typeof obj.aiTitle === 'string') {
      aiTitle = obj.aiTitle;
    }

    if (obj.type === 'user' || obj.type === 'assistant') {
      messageCount += 1;
      const msg = obj.message as { content?: unknown } | undefined;
      errorCount += countErrorResults(msg?.content);

      if (obj.type === 'assistant') {
        lastTurnIncomplete = endsWithToolUse(msg?.content);
      } else {
        const candidate = extractUserText(msg?.content);
        // A trailing user record means Claude owes a reply — unless it is the
        // synthetic abort marker, which means the operator stopped the turn.
        lastTurnIncomplete = !INTERRUPTED_MARKER_RE.test(candidate);

        if (!firstUserTitle && candidate && !SYSTEM_TAG_RE.test(candidate)) {
          const usable = pickTitleText(candidate);
          if (usable) {
            firstUserTitle = usable.slice(0, 80).replace(/\s+/g, ' ').trim();
          }
        }
      }
    }
  }

  // `claude code resume` keys off file mtime, which advances even when Claude Code
  // rewrites untimestamped meta records (ai-title rotate, custom-title/agent-name on
  // rename, last-prompt, permission-mode). Reconcile so the UI agrees with resume.
  const mtimeIso = fs.statSync(filePath).mtime.toISOString();
  const reconciledLastAt = !lastAt || mtimeIso > lastAt ? mtimeIso : lastAt;

  return {
    title: aiTitle || firstUserTitle || '(untitled)',
    customTitle,
    firstAt,
    lastAt: reconciledLastAt,
    messageCount,
    errorCount,
    cwdFromMessages,
    lastTurnIncomplete,
  };
}

// An assistant message that ends on a `tool_use` block (Anthropic `stop_reason:
// "tool_use"`) is mid-work: a tool is pending and Claude will continue once it
// returns. Verified 1:1 against `stop_reason` across real sessions.
function endsWithToolUse(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block && typeof block === 'object' && typeof (block as { type?: unknown }).type === 'string') {
      return (block as { type: string }).type === 'tool_use';
    }
  }
  return false;
}

function extractUserText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        'type' in block &&
        block.type === 'text' &&
        'text' in block &&
        typeof (block as { text: unknown }).text === 'string'
      ) {
        return (block as { text: string }).text;
      }
    }
  }
  return '';
}

function countErrorResults(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_result' &&
      (block as { is_error?: unknown }).is_error === true
    ) {
      n += 1;
    }
  }
  return n;
}
