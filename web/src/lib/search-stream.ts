import type { SearchEvent } from './api.ts';

export interface StreamSearchOpts {
  query: string;
  perSession?: number;
  maxSessions?: number;
  signal?: AbortSignal;
}

export async function* streamSearch(opts: StreamSearchOpts): AsyncGenerator<SearchEvent> {
  const params = new URLSearchParams({ q: opts.query });
  if (opts.perSession !== undefined) params.set('perSession', String(opts.perSession));
  if (opts.maxSessions !== undefined) params.set('maxSessions', String(opts.maxSessions));

  const res = await fetch(`/api/search?${params.toString()}`, {
    signal: opts.signal,
    headers: { accept: 'application/x-ndjson' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  if (!res.body) {
    throw new Error('search stream returned no body');
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          const event = parseLine(buffer);
          if (event) yield event;
        }
        return;
      }
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const event = parseLine(raw);
        if (event) yield event;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}

function parseLine(raw: string): SearchEvent | null {
  const line = raw.trim();
  if (!line) return null;
  try {
    return JSON.parse(line) as SearchEvent;
  } catch {
    return null;
  }
}
