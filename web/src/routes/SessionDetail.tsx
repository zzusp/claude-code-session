import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MessageBubble from '../components/MessageBubble.tsx';
import { api, type Block, type Message, type SessionDetail } from '../lib/api.ts';
import { MAX_SESSION_MESSAGES } from '../lib/constants.ts';
import { formatBytes, formatDateTime } from '../lib/format.ts';
import { queryKeys } from '../lib/query-keys.ts';

interface IndexedMessage {
  message: Message;
  haystack: string;
}

export default function SessionDetailRoute() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const pid = projectId ?? '';
  const sid = sessionId ?? '';

  const [showMeta, setShowMeta] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.session(pid, sid),
    queryFn: () =>
      api<SessionDetail>(
        `/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}`,
      ),
    enabled: !!pid && !!sid,
  });

  const indexed: IndexedMessage[] = useMemo(() => {
    if (!data) return [];
    return data.messages.map((message) => ({
      message,
      haystack: indexMessage(message),
    }));
  }, [data]);

  const visibleMessages = useMemo(() => {
    let list = indexed;
    if (!showMeta) list = list.filter((m) => !m.message.isMeta);
    if (deferredQuery) {
      const q = deferredQuery.toLowerCase();
      list = list.filter((m) => m.haystack.includes(q));
    }
    return list;
  }, [indexed, showMeta, deferredQuery]);

  return (
    <section>
      <Link
        to={`/projects/${encodeURIComponent(pid)}`}
        className="text-sm text-neutral-500 hover:text-neutral-800"
      >
        ← Back to project
      </Link>

      {data && (
        <header className="mt-2">
          <h1 className="font-mono text-base text-neutral-900 break-all">{sid}</h1>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs text-neutral-600">
            <dt className="text-neutral-500">cwd</dt>
            <dd className="font-mono text-neutral-800">{data.meta.cwd ?? '—'}</dd>
            <dt className="text-neutral-500">git</dt>
            <dd className="font-mono text-neutral-800">{data.meta.gitBranch ?? '—'}</dd>
            <dt className="text-neutral-500">version</dt>
            <dd className="font-mono text-neutral-800">{data.meta.version ?? '—'}</dd>
            <dt className="text-neutral-500">started</dt>
            <dd className="font-mono text-neutral-800">{formatDateTime(data.meta.firstAt)}</dd>
            <dt className="text-neutral-500">last</dt>
            <dd className="font-mono text-neutral-800">{formatDateTime(data.meta.lastAt)}</dd>
            <dt className="text-neutral-500">size</dt>
            <dd className="font-mono text-neutral-800">
              {formatBytes(data.meta.bytes)} · {data.meta.messageCount} messages
            </dd>
          </dl>
        </header>
      )}

      <div className="sticky top-0 -mx-4 mt-4 border-b border-neutral-200 bg-neutral-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-neutral-50/70">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this session…"
            className="flex-1 min-w-[12rem] rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={showMeta}
              onChange={(e) => setShowMeta(e.target.checked)}
            />
            show system messages
          </label>
          {data && (
            <span className="text-xs text-neutral-500">
              {visibleMessages.length} / {data.messages.length} shown
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && <p className="text-sm text-neutral-500">Loading session…</p>}
        {error && (
          <p className="text-sm text-red-600">
            Failed to load: {(error as Error).message}
          </p>
        )}
        {data?.truncated && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Session truncated to first {MAX_SESSION_MESSAGES} messages.
          </p>
        )}
        {visibleMessages.map((m, i) => (
          <MessageBubble
            key={m.message.uuid || m.message.ts || String(i)}
            message={m.message}
            query={deferredQuery}
          />
        ))}
        {data && visibleMessages.length === 0 && (
          <p className="text-sm text-neutral-500">No messages match.</p>
        )}
      </div>
    </section>
  );
}

function indexMessage(message: Message): string {
  return message.blocks.map(blockText).join('\n').toLowerCase();
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'text':
    case 'thinking':
      return block.text;
    case 'tool_use':
      return `${block.name} ${JSON.stringify(block.input)}`;
    case 'tool_result':
      return block.content;
    case 'image':
      return '';
    default:
      return JSON.stringify(block.raw);
  }
}
