export * from '../../../shared/types.ts';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        if (typeof parsed.error === 'string') detail = parsed.error;
      } catch {
        /* keep raw text */
      }
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}
