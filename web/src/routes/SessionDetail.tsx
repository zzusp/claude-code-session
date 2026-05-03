import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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

const INITIAL_WINDOW = 50;
const LOAD_STEP = 50;

export default function SessionDetailRoute() {
  const t = useT();
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const pid = projectId ?? '';
  const sid = sessionId ?? '';

  const [showMeta, setShowMeta] = useState(false);
  const [onlyUser, setOnlyUser] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [windowSize, setWindowSize] = useState(INITIAL_WINDOW);
  const lastScrolledSid = useRef<string | null>(null);

  useEffect(() => {
    setWindowSize(INITIAL_WINDOW);
  }, [pid, sid]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.session(pid, sid),
    queryFn: () =>
      api<SessionDetail>(
        `/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}`,
      ),
    enabled: !!pid && !!sid,
  });

  useEffect(() => {
    if (!data) return;
    if (lastScrolledSid.current === sid) return;
    lastScrolledSid.current = sid;
    if (deferredQuery) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
    });
  }, [sid, data, deferredQuery]);

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
    if (onlyUser) list = list.filter((m) => isUserTyped(m.message));
    if (deferredQuery) {
      const q = deferredQuery.toLowerCase();
      list = list.filter((m) => m.haystack.includes(q));
    }
    return list;
  }, [indexed, showMeta, onlyUser, deferredQuery]);

  // Intent-driven filters (search, only-me) want all matches across the whole
  // conversation; windowing is for "paginate recency" and would hide matches.
  const skipWindowing = !!deferredQuery || onlyUser;
  const renderList = useMemo(() => {
    if (skipWindowing) return visibleMessages;
    return visibleMessages.slice(-windowSize);
  }, [visibleMessages, skipWindowing, windowSize]);

  const hasMoreEarlier = !skipWindowing && renderList.length < visibleMessages.length;

  const projectTail = useMemo(() => {
    const cwd = project?.decodedCwd;
    if (!cwd) return pid.slice(-12);
    const parts = cwd.split(/[\\/]+/).filter(Boolean);
    return parts.at(-1) ?? cwd;
  }, [project, pid]);

  const sessionTitle = useMemo(() => {
    if (!data) return null;
    return data.meta.customTitle ?? data.meta.title;
  }, [data]);

  const queryClient = useQueryClient();
  const renameMutation = useMutation({
    mutationFn: (next: string) =>
      api<{ customTitle: string }>(
        `/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}`,
        { method: 'PATCH', body: JSON.stringify({ customTitle: next }) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.session(pid, sid) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectSessions(pid) });
    },
  });

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
            editableValue={sessionTitle ?? ''}
            onTitleEdit={async (next) => {
              await renameMutation.mutateAsync(next);
            }}
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
          <label className="inline-flex items-center gap-2 text-xs text-[var(--color-fg-secondary)]">
            <input
              type="checkbox"
              checked={onlyUser}
              onChange={(e) => setOnlyUser(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
            />
            <span className="font-mono uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              {t('common.onlyUser')}
            </span>
          </label>
          {data && (
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
              {t('session.shown', {
                shown: renderList.length,
                total: visibleMessages.length,
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
        {hasMoreEarlier && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() =>
                setWindowSize((w) => Math.min(w + LOAD_STEP, visibleMessages.length))
              }
              className="rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
            >
              {t('common.loadEarlier', {
                n: Math.min(LOAD_STEP, visibleMessages.length - renderList.length),
              })}
            </button>
          </div>
        )}
        <motion.div
          key={renderList.length === 0 ? 'empty' : 'list'}
          initial="hidden"
          animate="show"
          variants={staggerParent}
          className="space-y-4"
        >
          {renderList.map((m, i) => (
            <motion.div key={m.message.uuid || m.message.ts || String(i)} variants={fadeUpItem}>
              <MessageBubble message={m.message} query={deferredQuery} />
            </motion.div>
          ))}
        </motion.div>
        {data && visibleMessages.length === 0 && (
          <p className="text-sm text-[var(--color-fg-muted)]">{t('common.noMessagesMatch')}</p>
        )}
      </div>

      {data && <ScrollToEdges />}
    </section>
  );
}

// Match MessageBubble.tsx's classification: a `type:user` message whose blocks
// are exclusively tool_result is rendered as a "tool" bubble, not as the user.
function isUserTyped(m: Message): boolean {
  if (m.type !== 'user') return false;
  if (m.blocks.length === 0) return true;
  return m.blocks.some((b) => b.type !== 'tool_result');
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

const EDGE_THRESHOLD = 320;

function ScrollToEdges() {
  const t = useT();
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollY = window.scrollY;
      const viewport = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      setShowTop(scrollY >= EDGE_THRESHOLD);
      setShowBottom(total - (scrollY + viewport) >= EDGE_THRESHOLD);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  if (!showTop && !showBottom) return null;

  const buttonClass =
    'rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] p-2.5 text-[var(--color-fg-secondary)] shadow-[var(--shadow-rise)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]';

  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-2">
      {showTop && (
        <button
          type="button"
          aria-label={t('common.scrollToTop')}
          title={t('common.scrollToTop')}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={buttonClass}
        >
          <ChevronIcon direction="up" />
        </button>
      )}
      {showBottom && (
        <button
          type="button"
          aria-label={t('common.scrollToBottom')}
          title={t('common.scrollToBottom')}
          onClick={() =>
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
          }
          className={buttonClass}
        >
          <ChevronIcon direction="down" />
        </button>
      )}
    </div>
  );
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direction === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}
