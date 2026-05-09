import fs from 'node:fs';
import readline from 'node:readline';
import { SYSTEM_TAG_RE } from './system-tags.ts';

export interface JsonlMeta {
  title: string;
  /** Latest `custom-title` record value, or null if never renamed. */
  customTitle: string | null;
  firstAt: string | null;
  lastAt: string | null;
  messageCount: number;
  cwdFromMessages: string | null;
}

export async function parseJsonlMeta(filePath: string): Promise<JsonlMeta> {
  let firstUserTitle = '';
  let aiTitle: string | null = null;
  let customTitle: string | null = null;
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  let messageCount = 0;
  let cwdFromMessages: string | null = null;

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

      if (!firstUserTitle && obj.type === 'user') {
        const msg = obj.message as { content?: unknown } | undefined;
        const candidate = extractUserText(msg?.content);
        if (candidate && !SYSTEM_TAG_RE.test(candidate)) {
          firstUserTitle = candidate.slice(0, 80).replace(/\s+/g, ' ').trim();
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
    cwdFromMessages,
  };
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
