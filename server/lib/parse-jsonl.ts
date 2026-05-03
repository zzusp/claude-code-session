import fs from 'node:fs';
import readline from 'node:readline';
import { SYSTEM_TAG_RE } from './system-tags.ts';

export interface JsonlMeta {
  title: string;
  firstAt: string | null;
  lastAt: string | null;
  messageCount: number;
  cwdFromMessages: string | null;
}

export async function parseJsonlMeta(filePath: string): Promise<JsonlMeta> {
  let title = '';
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

    if (obj.type === 'user' || obj.type === 'assistant') {
      messageCount += 1;

      if (!title && obj.type === 'user') {
        const msg = obj.message as { content?: unknown } | undefined;
        const candidate = extractUserText(msg?.content);
        if (candidate && !SYSTEM_TAG_RE.test(candidate)) {
          title = candidate.slice(0, 80).replace(/\s+/g, ' ').trim();
        }
      }
    }
  }

  return {
    title: title || '(untitled)',
    firstAt,
    lastAt,
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
