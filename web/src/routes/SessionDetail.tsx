import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.tsx';
import MessageBubble from '../components/MessageBubble.tsx';
import PageHeader, { MetaItem } from '../components/PageHeader.tsx';
import {
  api,
  type Block,
  type Message,
  type ProjectSummary,
  type SessionDetail,
} from '../lib/api.ts';
import { MAX_SESSION_MESSAGES } from '../lib/constants.ts';
import { formatBytes, formatDateTime, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

interface IndexedMessage {
  message: Message;
  haystack: string;
}

export default function SessionDetailRoute() {
  const t = useT();
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

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => api<ProjectSummary[]>('/api/projects'),
  });
  const project = useMemo(
    () => projectsQuery.data?.find((p) => p.id === pid),
    [projectsQuery.data, pid],
  );

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

  const projectTail = useMemo(() => {
    const cwd = project?.decodedCwd;
    if (!cwd) return pid.slice(-12);
    const parts = cwd.split(/[\\/]+/).filter(Boolean);
    return parts.at(-1) ?? cwd;
  }, [project, pid]);

  const sessionTitle = useMemo(() => {
    if (!data) return null;
    return findSessionTitle(data.messages) ?? sid.slice(0, 8);
  }, [data, sid]);

  const taglineBranchPart = data?.meta.gitBranch
    ? t('session.tagline.branch', { branch: data.meta.gitBranch })
    : '';

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: t('session.crumbProjects'), to: '/' },
          { label: projectTail, to: `/projects/${encodeURIComponent(pid)}`, mono: true },
          { label: sessionTitle ?? sid.slice(0, 8), mono: !sessionTitle },
        ]}
      />

      {data && (
        <div className="mt-4">
          <PageHeader
            eyebrow={
              <span className="font-mono normal-case tracking-[0.05em] text-[var(--color-fg-faint)]">
                {sid}
              </span>
            }
            title={sessionTitle ?? <span className="font-mono">{sid.slice(0, 12)}…</span>}
            tagline={t('session.tagline', {
              started: formatRelativeTime(data.meta.firstAt),
              lastTouched: formatRelativeTime(data.meta.lastAt),
              branchPart: taglineBranchPart,
            })}
            meta={
              <>
                <MetaItem label={t('session.meta.messages')} value={data.meta.messageCount.toLocaleString()} />
                <MetaItem label={t('session.meta.size')} value={formatBytes(data.meta.bytes)} />
                {data.meta.version && (
                  <MetaItem label={t('session.meta.version')} value={data.meta.version} />
                )}
                <MetaItem label={t('session.meta.started')} value={formatDateTime(data.meta.firstAt)} />
              </>
            }
          />
        </div>
      )}

      <div className="sticky top-0 z-30 -mx-5 sm:-mx-8 lg:-mx-12 mt-6 border-y border-[var(--color-hairline)] bg-[var(--color-canvas)]/85 px-5 sm:px-8 lg:px-12 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[12rem]">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.searchPlaceholder')}
              className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] py-1.5 pl-9 pr-3 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-faint)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--color-fg-secondary)]">
            <input
              type="checkbox"
              checked={showMeta}
              onChange={(e) => setShowMeta(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
            />
            <span className="font-mono uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              {t('common.system')}
            </span>
          </label>
          {data && (
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
              {t('session.shown', {
                shown: visibleMessages.length,
                total: data.messages.length,
              })}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {isLoading && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            {t('common.loadingSession')}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {t('common.failedSession')}: {(error as Error).message}
          </p>
        )}
        {data?.truncated && (
          <p className="rounded-[10px] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-4 py-2.5 text-xs text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
            {t('session.truncated', { n: MAX_SESSION_MESSAGES.toLocaleString() })}
          </p>
        )}
        <motion.div
          key={visibleMessages.length === 0 ? 'empty' : 'list'}
          initial="hidden"
          animate="show"
          variants={staggerParent}
          className="space-y-4"
        >
          {visibleMessages.map((m, i) => (
            <motion.div key={m.message.uuid || m.message.ts || String(i)} variants={fadeUpItem}>
              <MessageBubble message={m.message} query={deferredQuery} />
            </motion.div>
          ))}
        </motion.div>
        {data && visibleMessages.length === 0 && (
          <p className="text-sm text-[var(--color-fg-muted)]">{t('common.noMessagesMatch')}</p>
        )}
      </div>
    </section>
  );
}

function findSessionTitle(messages: Message[]): string | null {
  for (const m of messages) {
    if (m.type !== 'user' || m.isMeta) continue;
    for (const block of m.blocks) {
      if (block.type === 'text' && block.text.trim()) {
        const line = block.text.trim().split('\n')[0] ?? '';
        return line.length > 80 ? line.slice(0, 80) + '…' : line;
      }
    }
  }
  return null;
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

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.2" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}
