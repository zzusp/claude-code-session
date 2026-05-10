import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Breadcrumbs, { BreadcrumbFolderIcon } from '../components/Breadcrumbs.tsx';
import DeleteDialog from '../components/DeleteDialog.tsx';
import MessageBubble from '../components/MessageBubble.tsx';
import {
  api,
  type Block,
  type Message,
  type ProjectSummary,
  type SessionDetail,
  type SessionSummary,
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
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const [searchParams] = useSearchParams();
  const pid = projectId ?? '';
  const sid = sessionId ?? '';
  const urlFocus = searchParams.get('focus');
  const urlQuery = searchParams.get('q');

  const [showMeta, setShowMeta] = useState(false);
  const [onlyUser, setOnlyUser] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [windowSize, setWindowSize] = useState(INITIAL_WINDOW);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const urlAppliedRef = useRef<string | null>(null);
  const flashedKeyRef = useRef<string | null>(null);

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

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => api<ProjectSummary[]>('/api/projects'),
  });
  const project = useMemo(
    () => projectsQuery.data?.find((p) => p.id === pid),
    [projectsQuery.data, pid],
  );

  const projectSessionsQuery = useQuery({
    queryKey: queryKeys.projectSessions(pid),
    queryFn: () => api<SessionSummary[]>(`/api/projects/${encodeURIComponent(pid)}/sessions`),
    enabled: !!pid,
  });
  const currentSummary = useMemo(
    () => projectSessionsQuery.data?.find((s) => s.id === sid) ?? null,
    [projectSessionsQuery.data, sid],
  );
  const deleteTooltip = !currentSummary
    ? projectSessionsQuery.isLoading
      ? t('common.loading')
      : t('session.action.deleteTooltipBlocked')
    : undefined;

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

  const skipWindowing = !!deferredQuery || onlyUser;
  const renderList = useMemo(() => {
    if (skipWindowing) return visibleMessages;
    return visibleMessages.slice(-windowSize);
  }, [visibleMessages, skipWindowing, windowSize]);

  const hasMoreEarlier = !skipWindowing && renderList.length < visibleMessages.length;

  useEffect(() => {
    if (!data) return;
    const key = `${sid}|${urlFocus ?? ''}|${urlQuery ?? ''}`;
    if (urlAppliedRef.current === key) return;
    urlAppliedRef.current = key;
    if (urlQuery) setQuery(urlQuery);
    if (urlFocus) {
      const target = data.messages.find((m) => m.uuid === urlFocus);
      if (target?.isMeta) setShowMeta(true);
    }
  }, [data, sid, urlFocus, urlQuery]);

  useEffect(() => {
    if (!urlFocus || !data || skipWindowing) return;
    const idx = visibleMessages.findIndex((m) => m.message.uuid === urlFocus);
    if (idx === -1) return;
    const needed = visibleMessages.length - idx;
    if (needed > windowSize) setWindowSize(needed);
  }, [urlFocus, visibleMessages, windowSize, skipWindowing, data]);

  useEffect(() => {
    if (!urlFocus || !data) return;
    const key = `${sid}|${urlFocus}`;
    if (flashedKeyRef.current === key) return;
    if (!renderList.some((m) => m.message.uuid === urlFocus)) return;
    flashedKeyRef.current = key;
    const rafId = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-uuid="${CSS.escape(urlFocus)}"]`,
      );
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const flashTarget = el.closest('li') ?? el;
      flashTarget.classList.add('flash-focus');
      window.setTimeout(() => flashTarget.classList.remove('flash-focus'), 1300);
    });
    return () => cancelAnimationFrame(rafId);
  }, [urlFocus, renderList, data, sid]);

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
    onSuccess: ({ customTitle }) => {
      // Patch caches synchronously so the read-only title doesn't flash the
      // pre-rename value while the background refetch is in flight.
      queryClient.setQueryData<SessionDetail>(queryKeys.session(pid, sid), (prev) =>
        prev ? { ...prev, meta: { ...prev.meta, customTitle } } : prev,
      );
      queryClient.setQueryData<SessionSummary[]>(queryKeys.projectSessions(pid), (prev) =>
        prev?.map((s) => (s.id === sid ? { ...s, customTitle } : s)),
      );
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
          {
            label: projectTail,
            to: `/projects/${encodeURIComponent(pid)}`,
            mono: true,
            icon: <BreadcrumbFolderIcon />,
          },
          {
            label: sessionTitle ?? sid.slice(0, 8),
            mono: !sessionTitle,
            icon: <BreadcrumbFolderIcon />,
          },
        ]}
      />

      {data && (
        <div className="surface-card mt-4 p-6">
          <SessionMasthead
            sid={sid}
            title={sessionTitle}
            tagline={t('session.tagline', {
              started: formatRelativeTime(data.meta.firstAt),
              lastTouched: formatRelativeTime(data.meta.lastAt),
              branchPart: taglineBranchPart,
            })}
            firstAt={data.meta.firstAt}
            messageCount={data.meta.messageCount}
            bytes={data.meta.bytes}
            version={data.meta.version}
            branch={data.meta.gitBranch}
            editableValue={sessionTitle ?? ''}
            onTitleEdit={async (next) => {
              await renameMutation.mutateAsync(next);
            }}
            renameDisabled={currentSummary?.isLivePid === true}
            renameTooltip={
              currentSummary?.isLivePid === true
                ? t('session.action.renameTooltipLive', {
                    pid: currentSummary.livePid ?? '?',
                  })
                : undefined
            }
            onDelete={currentSummary ? () => setShowDeleteDialog(true) : undefined}
            deleteDisabled={!currentSummary}
            deleteTooltip={deleteTooltip}
            deleteLabel={t('session.action.delete')}
          />
        </div>
      )}

      {showDeleteDialog && currentSummary && (
        <DeleteDialog
          projectId={pid}
          selected={[currentSummary]}
          onClose={() => setShowDeleteDialog(false)}
          onDeleted={(deletedIds) => {
            if (deletedIds.includes(sid)) {
              setShowDeleteDialog(false);
              navigate(`/projects/${encodeURIComponent(pid)}`, { replace: true });
            }
          }}
        />
      )}

      <FilterLedger
        query={query}
        onQuery={setQuery}
        showMeta={showMeta}
        onShowMeta={setShowMeta}
        onlyUser={onlyUser}
        onOnlyUser={setOnlyUser}
        shown={renderList.length}
        total={visibleMessages.length}
        hasData={!!data}
      />

      <div className="mt-6">
        {data?.truncated && (
          <Admonition tone="warn" className="mb-6">
            {t('session.truncated', { n: MAX_SESSION_MESSAGES.toLocaleString() })}
          </Admonition>
        )}

        {isLoading && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            {t('common.loadingSession')}
          </p>
        )}
        {error && (
          <Admonition tone="danger">
            {t('common.failedSession')}: {(error as Error).message}
          </Admonition>
        )}

        {data && visibleMessages.length === 0 && (
          <p className="mt-2 max-w-2xl font-display text-[15px] italic text-[var(--color-fg-muted)]">
            {t('common.noMessagesMatch')}
          </p>
        )}

        {data && visibleMessages.length > 0 && (
          <ol className="border-t border-[var(--color-hairline-strong)]">
            {hasMoreEarlier && (
              <li className="flex justify-center border-b border-[var(--color-hairline)] py-3">
                <button
                  type="button"
                  onClick={() =>
                    setWindowSize((w) => Math.min(w + LOAD_STEP, visibleMessages.length))
                  }
                  className="rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
                >
                  {t('common.loadEarlier', {
                    n: Math.min(LOAD_STEP, visibleMessages.length - renderList.length),
                  })}
                </button>
              </li>
            )}

            <motion.div
              key={renderList.length === 0 ? 'empty' : 'list'}
              initial="hidden"
              animate="show"
              variants={staggerParent}
            >
              {renderList.map((m, i) => {
                const isMeta = m.message.isMeta;
                return (
                  <motion.li
                    key={m.message.uuid || m.message.ts || String(i)}
                    variants={fadeUpItem}
                    className={isMeta ? 'py-2' : 'py-3'}
                  >
                    <MessageBubble message={m.message} query={deferredQuery} />
                  </motion.li>
                );
              })}
            </motion.div>
          </ol>
        )}
      </div>

      {data && <ScrollToEdges />}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function SessionMasthead({
  sid,
  title,
  tagline,
  firstAt,
  messageCount,
  bytes,
  version,
  branch,
  editableValue,
  onTitleEdit,
  renameDisabled,
  renameTooltip,
  onDelete,
  deleteDisabled,
  deleteTooltip,
  deleteLabel,
}: {
  sid: string;
  title: string | null;
  tagline: string;
  firstAt: string | null;
  messageCount: number;
  bytes: number;
  version: string | null;
  branch: string | null;
  editableValue: string;
  onTitleEdit: (next: string) => Promise<void>;
  renameDisabled?: boolean;
  renameTooltip?: string;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteTooltip?: string;
  deleteLabel?: string;
}) {
  const t = useT();
  const dateline = formatDateline(firstAt);

  return (
    <header className="relative">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-hairline)] pb-3">
        <div className="flex min-w-0 items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          <span className="text-[var(--color-accent)]">●</span>
          <span>§ SESSION</span>
          <span className="hidden h-3 w-px bg-[var(--color-hairline-strong)] sm:inline-block" />
          <span className="hidden truncate normal-case tracking-[0.05em] text-[var(--color-fg-faint)] sm:inline">
            {sid}
          </span>
          {branch && (
            <>
              <span className="hidden h-3 w-px bg-[var(--color-hairline-strong)] md:inline-block" />
              <span className="hidden truncate md:inline">{branch}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] tabular-nums text-[var(--color-fg-muted)]">
            {dateline}
          </div>
          {(onDelete || deleteDisabled) && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteDisabled || !onDelete}
              title={deleteTooltip}
              aria-label={deleteLabel}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-danger)] transition hover:border-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <TrashIcon /> {deleteLabel}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 pt-5 pb-2 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <TitleSlot
            title={title ?? sid.slice(0, 12) + '…'}
            editableValue={editableValue}
            onTitleEdit={onTitleEdit}
            isFallback={!title}
            disabled={renameDisabled}
            disabledTooltip={renameTooltip}
          />
        </div>

        <div className="lg:col-span-4 lg:pt-3">
          <p className="border-l-2 border-[var(--color-accent)] pl-4 font-display text-[15px] italic leading-[1.55] text-[var(--color-fg-secondary)]">
            {tagline}
          </p>
        </div>
      </div>

      <div className="rule-dotted mt-6" aria-hidden />
      <dl className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <Fact label={t('session.meta.messages')} value={messageCount.toLocaleString()} />
        <Fact label={t('session.meta.size')} value={formatBytes(bytes)} />
        {version && <Fact label={t('session.meta.version')} value={version} />}
        <Fact label={t('session.meta.started')} value={formatDateTime(firstAt)} />
      </dl>
    </header>
  );
}

const MASTHEAD_TITLE_CLASS =
  'font-display text-[clamp(1.5rem,3vw,2rem)] font-light leading-[1.15] tracking-[-0.018em] text-[var(--color-fg-primary)]';

function TitleSlot({
  title,
  editableValue,
  onTitleEdit,
  isFallback,
  disabled,
  disabledTooltip,
}: {
  title: ReactNode;
  editableValue: string;
  onTitleEdit: (next: string) => Promise<void>;
  isFallback: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editableValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(editableValue);
  }, [editing, editableValue]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function startEdit() {
    setDraft(editableValue);
    setError(null);
    setEditing(true);
  }

  async function commit() {
    const next = draft.trim();
    if (!next || next === editableValue) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onTitleEdit(next);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (editing) {
    return (
      <div>
        <input
          ref={inputRef}
          value={draft}
          disabled={submitting}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
              setError(null);
            }
          }}
          onBlur={() => {
            if (!submitting && !error) {
              setEditing(false);
            }
          }}
          maxLength={200}
          className={
            MASTHEAD_TITLE_CLASS +
            ' w-full bg-transparent border-b border-[var(--color-accent)] outline-none focus:outline-none disabled:opacity-60'
          }
        />
        {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="group flex items-baseline gap-3">
      <h1 className={MASTHEAD_TITLE_CLASS + (isFallback ? ' font-mono' : '')}>
        {title}
        <span className="text-[var(--color-accent)]">.</span>
      </h1>
      <button
        type="button"
        onClick={startEdit}
        aria-label="Rename"
        title={disabled ? disabledTooltip ?? 'Rename unavailable' : 'Rename'}
        disabled={disabled}
        className="flex-shrink-0 rounded-md p-1.5 text-[var(--color-fg-muted)] opacity-0 transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)] focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--color-fg-muted)] disabled:opacity-40 disabled:group-hover:opacity-40"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="eyebrow">{label}</dt>
      <dd className="font-mono text-[12px] tabular-nums text-[var(--color-fg-primary)]">
        {value}
      </dd>
    </div>
  );
}

function formatDateline(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase()
    .replace(/,/g, ' ·');
}

/* ─────────────────────────────────────────────────────────────────── */

function FilterLedger({
  query,
  onQuery,
  showMeta,
  onShowMeta,
  onlyUser,
  onOnlyUser,
  shown,
  total,
  hasData,
}: {
  query: string;
  onQuery: (v: string) => void;
  showMeta: boolean;
  onShowMeta: (v: boolean) => void;
  onlyUser: boolean;
  onOnlyUser: (v: boolean) => void;
  shown: number;
  total: number;
  hasData: boolean;
}) {
  const t = useT();
  return (
    <div className="sticky top-2 z-30 mt-6 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 sm:px-5 py-2.5 shadow-[var(--shadow-rise)]">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-1 min-w-[14rem] items-center gap-2 border-b border-[var(--color-hairline)] py-1 transition focus-within:border-[var(--color-accent)]">
          <SearchIcon className="text-[var(--color-fg-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('common.searchPlaceholder')}
            className="w-full bg-transparent text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-faint)] focus:outline-none"
          />
        </div>

        <span className="hidden h-4 w-px bg-[var(--color-hairline-strong)] sm:inline-block" />

        <div className="flex items-center gap-4">
          <ToggleSwitch
            checked={showMeta}
            onChange={onShowMeta}
            label={t('common.system')}
          />
          <ToggleSwitch
            checked={onlyUser}
            onChange={onOnlyUser}
            label={t('common.onlyUser')}
          />
        </div>

        {hasData && (
          <>
            <span className="hidden h-4 w-px bg-[var(--color-hairline-strong)] sm:inline-block" />
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
              {t('session.shown', { shown, total })}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={
          'font-mono text-[11px] uppercase tracking-[0.16em] transition ' +
          (checked
            ? 'text-[var(--color-accent)] underline underline-offset-[6px] decoration-[var(--color-accent)]/50'
            : 'text-[var(--color-fg-faint)] hover:text-[var(--color-fg-secondary)]')
        }
      >
        {label}
      </span>
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function Admonition({
  tone,
  className = '',
  children,
}: {
  tone: 'warn' | 'danger';
  className?: string;
  children: ReactNode;
}) {
  const colors =
    tone === 'warn'
      ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]'
      : 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)]';
  return (
    <div className={`rounded-[10px] border px-4 py-3 text-sm ${colors} ${className}`}>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

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

function TrashIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M5.5 6l1.1 13.2A1.5 1.5 0 0 0 8.1 20.5h7.8a1.5 1.5 0 0 0 1.5-1.3L18.5 6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
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
    'rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] p-2.5 text-[var(--color-fg-secondary)] shadow-[var(--shadow-pop)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]';

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
