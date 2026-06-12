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
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DeleteDialog from '../components/DeleteDialog.tsx';
import FileThumb from '../components/FileThumb.tsx';
import { Loading } from '../components/Loading.tsx';
import MessageBubble, { WorkingIndicator } from '../components/MessageBubble.tsx';
import { type EditLookup } from '../components/ModifiedFilesView.tsx';
import {
  api,
  type Block,
  type Message,
  type ModifiedFilesResponse,
  type ProjectSummary,
  type SessionDetail,
  type SessionSummary,
} from '../lib/api.ts';
import {
  INTERRUPTED_MARKER_RE,
  MAX_SESSION_MESSAGES,
  RECENT_ACTIVITY_WINDOW_MIN,
} from '../lib/constants.ts';
import { formatBytes, formatDateTime, formatDuration, formatTokens } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

interface IndexedMessage {
  message: Message;
  haystack: string;
}

// Mutually-exclusive message view modes for the footer's single-select filter.
type MessageFilter = 'all' | 'system' | 'user' | 'error';

const INITIAL_WINDOW = 50;
const LOAD_STEP = 50;

// Live tail: while a session is still being written, poll the detail endpoint so
// new messages append on their own. "Still being written" = the session's lastAt
// (max of latest record ts and file mtime) sits inside the same recent-activity
// window the rest of the app uses for "active". Polling self-terminates: once the
// file stops changing, lastAt goes stale and refetchInterval returns false.
const LIVE_POLL_INTERVAL_MS = 2000;
const LIVE_WINDOW_MS = RECENT_ACTIVITY_WINDOW_MIN * 60 * 1000;
// Auto-follow only kicks in when the viewport is within this many px of the
// bottom — so watching the tail follows new messages, but scrolling up to read
// history is never yanked back down.
const BOTTOM_STICK_THRESHOLD_PX = 120;

function isWithinLiveWindow(lastAt: string | null | undefined): boolean {
  if (!lastAt) return false;
  const ms = new Date(lastAt).getTime();
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms < LIVE_WINDOW_MS;
}

// Mirror of the server's `lastTurnIncomplete` over the parsed message list: the
// last turn is unfinished when the final record is a `user` message (Claude owes
// a reply) that isn't an abort marker, or an `assistant` message that ends on a
// pending `tool_use`. Combined with the live window this drives the "working" UI.
function lastTurnIncomplete(messages: Message[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  if (last.type === 'assistant') {
    return last.blocks[last.blocks.length - 1]?.type === 'tool_use';
  }
  const text = last.blocks.find((b) => b.type === 'text');
  return !(text && INTERRUPTED_MARKER_RE.test(text.text));
}

export default function SessionDetailRoute() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const [searchParams] = useSearchParams();
  const pid = projectId ?? '';
  const sid = sessionId ?? '';
  const urlFocus = searchParams.get('focus');
  const urlQuery = searchParams.get('q');

  // Message view filter — single-select (claude.ai-style segmented control), so
  // the four modes are mutually exclusive rather than three independent toggles.
  // 'system' surfaces meta rows; 'user'/'error' narrow to those; 'all' is default.
  const [filter, setFilter] = useState<MessageFilter>('all');
  const showMeta = filter === 'system';
  const onlyUser = filter === 'user';
  const onlyError = filter === 'error';
  const [query, setQuery] = useState('');
  // Search is collapsed to a button in the title row; clicking reveals the input.
  const [searchOpen, setSearchOpen] = useState(false);
  // Delete confirm dialog for the current session (opened from the title menu).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const [windowSize, setWindowSize] = useState(INITIAL_WINDOW);
  const urlAppliedRef = useRef<string | null>(null);
  const flashedKeyRef = useRef<string | null>(null);
  // Live-tail follow state: whether the reader is parked at the bottom, and the
  // message count from the previous render so we only follow genuine new arrivals.
  const stickToBottomRef = useRef(true);
  const prevMsgCountRef = useRef<number | null>(null);
  // Previous "working" flag, so the tail follows the moment the working indicator
  // appears (the indicator grows the page without bumping messageCount).
  const prevIsWorkingRef = useRef(false);

  useEffect(() => {
    setWindowSize(INITIAL_WINDOW);
    prevMsgCountRef.current = null;
  }, [pid, sid]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.session(pid, sid),
    queryFn: () =>
      api<SessionDetail>(
        `/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}`,
      ),
    enabled: !!pid && !!sid,
    // Re-read the jsonl on an interval while the session is live so newly written
    // messages stream in on their own. The function form is re-evaluated with a
    // fresh Date.now() after every poll, so it stops on its own once activity
    // stops — even when the response is byte-identical and never re-renders us.
    refetchInterval: (query) =>
      isWithinLiveWindow(query.state.data?.meta.lastAt) ? LIVE_POLL_INTERVAL_MS : false,
  });
  const isLive = isWithinLiveWindow(data?.meta.lastAt);
  // Recomputed off the polled message list every 2s, so the working indicator
  // appears while Claude generates and clears the moment its reply lands.
  const isWorking = isLive && !!data && lastTurnIncomplete(data.messages);

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
  // Modified-files summary (aggregated from a full jsonl scan, server-side). Fetched
  // eagerly at route level so the header trigger can show the count; the page reuses
  // this same data instead of querying again.
  const modifiedFilesQuery = useQuery({
    queryKey: queryKeys.sessionModifiedFiles(pid, sid),
    queryFn: () =>
      api<ModifiedFilesResponse>(
        `/api/sessions/${encodeURIComponent(pid)}/${encodeURIComponent(sid)}/modified-files`,
      ),
    enabled: !!pid && !!sid,
  });
  const modifiedFiles = modifiedFilesQuery.data?.files ?? [];

  // 「修改的文件」改为在新标签里打开独立整页（见 ModifiedFilesPage）——脱离本会话页
  // 的实时轮询 / 大时间线 DOM / 滚动监听。
  const openModifiedInNewTab = () =>
    window.open(
      `/projects/${encodeURIComponent(pid)}/sessions/${encodeURIComponent(sid)}/modified`,
      '_blank',
      'noopener',
    );

  const indexed: IndexedMessage[] = useMemo(() => {
    if (!data) return [];
    return data.messages.map((message) => ({
      message,
      haystack: indexMessage(message),
    }));
  }, [data]);

  // tool_use id → { name, input } for the loaded messages, so the drawer can render
  // each edit's actual content (Write body / Edit diff) without a second request.
  const editLookup: EditLookup = useMemo(() => {
    const map: EditLookup = new Map();
    if (!data) return map;
    for (const m of data.messages) {
      for (const b of m.blocks) {
        if (b.type === 'tool_use' && b.id) map.set(b.id, { name: b.name, input: b.input });
      }
    }
    return map;
  }, [data]);

  // 时间线 tool_result 头部标注来源工具：toolUseId → 工具名（tool_use 与其
  // result 分属两条消息，需跨消息反查）。
  const toolNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, v] of editLookup) m.set(id, v.name);
    return m;
  }, [editLookup]);

  const visibleMessages = useMemo(() => {
    let list = indexed;
    if (!showMeta) list = list.filter((m) => !m.message.isMeta);
    if (onlyUser) list = list.filter((m) => isUserTyped(m.message));
    if (onlyError) list = list.filter((m) => hasError(m.message));
    if (deferredQuery) {
      const q = deferredQuery.toLowerCase();
      list = list.filter((m) => m.haystack.includes(q));
    }
    return list;
  }, [indexed, showMeta, onlyUser, onlyError, deferredQuery]);

  const skipWindowing = !!deferredQuery || onlyUser || onlyError;
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
    if (urlQuery) {
      setQuery(urlQuery);
      setSearchOpen(true);
    }
    if (urlFocus) {
      const target = data.messages.find((m) => m.uuid === urlFocus);
      if (target?.isMeta) setFilter('system');
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

  // Track whether the reader is parked at the bottom of the page, so live appends
  // can follow the tail without hijacking an upward scroll through history.
  useEffect(() => {
    const onScroll = () => {
      const distance =
        document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      stickToBottomRef.current = distance < BOTTOM_STICK_THRESHOLD_PX;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // When a live poll appends new messages and the reader is at the bottom — and not
  // mid-search or deep-linked to a specific message — follow the tail downward.
  useEffect(() => {
    const count = data?.meta.messageCount ?? null;
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = count;
    if (prev === null || count === null || count <= prev) return;
    if (urlFocus || skipWindowing || !stickToBottomRef.current) return;
    const rafId = requestAnimationFrame(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(rafId);
  }, [data?.meta.messageCount, urlFocus, skipWindowing]);

  // The working indicator appears below the last message without bumping
  // messageCount — follow the tail the moment it shows up so it stays in view.
  useEffect(() => {
    const startedWorking = isWorking && !prevIsWorkingRef.current;
    prevIsWorkingRef.current = isWorking;
    if (!startedWorking) return;
    if (urlFocus || skipWindowing || !stickToBottomRef.current) return;
    const rafId = requestAnimationFrame(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(rafId);
  }, [isWorking, urlFocus, skipWindowing]);

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

  // Session model = the latest assistant turn's model (sessions have no top-level
  // model field; the footer surfaces it like claude.ai's "Opus 4.8" footer chip).
  const sessionModel = useMemo(() => {
    if (!data) return null;
    for (let i = data.messages.length - 1; i >= 0; i--) {
      if (data.messages[i]!.model) return data.messages[i]!.model;
    }
    return null;
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.recentSessions() });
    },
  });

  return (
    <section className="flex min-h-[calc(100dvh-6rem)] flex-col">
      {/* Title as a claude.ai-style breadcrumb on the canvas (project / session),
          no card. The bar spans the full content width (like every other page's
          breadcrumb) so it lines up with the canvas edges. The in-session search
          sits beneath; both stick to the top. Session metadata + the Modified-files
          entry live in the sticky footer below. */}
      <div className="z-30 lg:sticky lg:top-0 topbar-glass border-b border-[var(--color-hairline)]">
        <SessionTitleBar
          projectId={pid}
          projectTail={projectTail}
          isLive={isLive}
          isWorking={isWorking}
          title={sessionTitle ?? sid.slice(0, 12) + '…'}
          isFallback={!sessionTitle}
          editableValue={sessionTitle ?? ''}
          onTitleEdit={async (next) => {
            await renameMutation.mutateAsync(next);
          }}
          renameDisabled={currentSummary?.isLivePid === true}
          renameTooltip={
            currentSummary?.isLivePid === true
              ? t('session.action.renameTooltipLive', { pid: currentSummary.livePid ?? '?' })
              : undefined
          }
          onDelete={() => setDeleteOpen(true)}
          deleteDisabled={!currentSummary}
          deleteTooltip={!currentSummary ? t('session.action.deleteTooltipBlocked') : undefined}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen((v) => !v)}
        />
        {searchOpen && (
          <SearchReveal
            query={query}
            onQuery={setQuery}
            onClose={() => {
              setQuery('');
              setSearchOpen(false);
            }}
            shown={renderList.length}
            total={visibleMessages.length}
            hasData={!!data}
          />
        )}
      </div>

      <div className="mt-6 flex-1 px-3 pb-24">
        {data?.truncated && (
          <Admonition tone="warn" className="mb-6">
            {t('session.truncated', { n: MAX_SESSION_MESSAGES.toLocaleString() })}
          </Admonition>
        )}

        {isLoading && <Loading label={t('common.loadingSession')} />}
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
          <ol>
            {hasMoreEarlier && (
              <li className="flex items-center justify-center gap-3 border-b border-[var(--color-hairline)] py-3">
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
                <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
                  {t('session.shown', { shown: renderList.length, total: visibleMessages.length })}
                </span>
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
                    <MessageBubble
                      message={m.message}
                      query={deferredQuery}
                      toolNames={toolNames}
                    />
                  </motion.li>
                );
              })}
            </motion.div>

            {isWorking && !skipWindowing && <WorkingIndicator />}
          </ol>
        )}
      </div>

      {data && (
        <SessionFooter
          cwd={data.meta.cwd ?? project?.decodedCwd ?? null}
          branch={data.meta.gitBranch}
          model={sessionModel}
          bytes={data.meta.bytes}
          startedAt={data.meta.firstAt}
          lastAt={data.meta.lastAt}
          messageCount={data.meta.messageCount}
          modifiedCount={modifiedFiles.length}
          modifiedLoading={modifiedFilesQuery.isLoading}
          onOpenModified={openModifiedInNewTab}
          filter={filter}
          onFilter={setFilter}
          contextTokens={data.meta.contextTokens}
          contextWindow={data.meta.contextWindow}
        />
      )}

      {data && <ScrollToEdges />}

      {deleteOpen && currentSummary && (
        <DeleteDialog
          projectId={pid}
          selected={[currentSummary]}
          onClose={() => setDeleteOpen(false)}
          // 删除成功后此会话已不存在，直接退回项目页（避免本页继续轮询 404）。
          onDeleted={() => {
            setDeleteOpen(false);
            navigate(`/projects/${encodeURIComponent(pid)}`);
          }}
        />
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

// claude.ai-style title breadcrumb on the canvas: live beacon + monitor glyph +
// project link / editable session title. No card box. Session metadata and the
// Modified-files entry moved to the sticky footer; deletion moved off this page
// (use the project page or the sidebar Recents).
function SessionTitleBar({
  projectId,
  projectTail,
  isLive,
  isWorking,
  title,
  isFallback,
  editableValue,
  onTitleEdit,
  renameDisabled,
  renameTooltip,
  onDelete,
  deleteDisabled,
  deleteTooltip,
  searchOpen,
  onToggleSearch,
}: {
  projectId: string;
  projectTail: string;
  isLive: boolean;
  isWorking: boolean;
  title: string;
  isFallback: boolean;
  editableValue: string;
  onTitleEdit: (next: string) => Promise<void>;
  renameDisabled?: boolean;
  renameTooltip?: string;
  onDelete: () => void;
  deleteDisabled?: boolean;
  deleteTooltip?: string;
  searchOpen: boolean;
  onToggleSearch: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <StatusBeacon isLive={isLive} isWorking={isWorking} />
      <span aria-hidden className="shrink-0 text-[var(--color-fg-muted)]">
        <MonitorIcon />
      </span>
      <Link
        to={`/projects/${encodeURIComponent(projectId)}`}
        title={projectTail}
        className="hidden max-w-[14rem] shrink-0 truncate text-[13px] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg-primary)] sm:inline"
      >
        {projectTail}
      </Link>
      <span aria-hidden className="hidden shrink-0 text-[var(--color-fg-faint)] sm:inline">
        /
      </span>
      <div className="min-w-0 flex-1">
        <TitleSlot
          title={title}
          editableValue={editableValue}
          onTitleEdit={onTitleEdit}
          isFallback={isFallback}
          disabled={renameDisabled}
          disabledTooltip={renameTooltip}
          onDelete={onDelete}
          deleteDisabled={deleteDisabled}
          deleteTooltip={deleteTooltip}
        />
      </div>
      <button
        type="button"
        onClick={onToggleSearch}
        aria-label={t('common.searchPlaceholder')}
        title={t('common.searchPlaceholder')}
        aria-expanded={searchOpen}
        className={
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ' +
          (searchOpen
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]'
            : 'border-transparent text-[var(--color-fg-muted)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]')
        }
      >
        <SearchIcon />
      </button>
    </div>
  );
}

// Sticky bottom info bar — claude.ai's footer. Carries the session metadata
// (folder / branch / model / size / started / duration) plus the Modified-files
// entry, which moved here off the header. Stays reachable while scrolling.
function SessionFooter({
  cwd,
  branch,
  model,
  bytes,
  startedAt,
  lastAt,
  messageCount,
  modifiedCount,
  modifiedLoading,
  onOpenModified,
  filter,
  onFilter,
  contextTokens,
  contextWindow,
}: {
  cwd: string | null;
  branch: string | null;
  model: string | null;
  bytes: number;
  startedAt: string | null;
  lastAt: string | null;
  messageCount: number;
  modifiedCount: number;
  modifiedLoading: boolean;
  onOpenModified: () => void;
  filter: MessageFilter;
  onFilter: (v: MessageFilter) => void;
  contextTokens: number | null;
  contextWindow: number;
}) {
  const t = useT();
  return (
    <div className="z-30 mt-4 lg:sticky lg:bottom-0 topbar-glass border-t border-[var(--color-hairline)]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
        <dl className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {cwd && (
            <FooterFact icon={<FolderGlyph />} value={cwd} mono title={cwd} className="max-w-[20rem]" />
          )}
          {branch && <FooterFact icon={<BranchGlyph />} value={branch} mono />}
          {model && <FooterFact icon={<ModelGlyph />} value={model} mono />}
          <FooterFact label={t('session.meta.size')} value={formatBytes(bytes)} />
          <FooterFact label={t('session.meta.messages')} value={messageCount.toLocaleString()} />
          {startedAt && (
            <FooterFact label={t('session.meta.started')} value={formatDateTime(startedAt)} />
          )}
          {startedAt && lastAt && (
            <FooterFact label={t('session.meta.duration')} value={formatDuration(startedAt, lastAt)} />
          )}
          {contextTokens !== null && (
            <ContextRing tokens={contextTokens} window={contextWindow} />
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Message filters live here (moved off the toolbar): single-select. */}
          <SegmentedFilter value={filter} onChange={onFilter} />
          <span aria-hidden className="hidden h-4 w-px bg-[var(--color-hairline-strong)] sm:inline-block" />
          <button
            type="button"
            onClick={onOpenModified}
            disabled={modifiedLoading}
            aria-label={t('session.modified.openAria')}
            title={t('session.modified.title')}
            className="group/file inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] py-1 pl-1.5 pr-2.5 transition hover:border-[var(--color-accent)] hover:bg-[var(--color-sunken)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileThumb size="sm" />
            <span className="text-[12px] font-medium text-[var(--color-fg-secondary)] transition-colors group-hover/file:text-[var(--color-fg-primary)]">
              {t('session.modified.title')}
            </span>
            {modifiedCount > 0 && (
              <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 font-mono text-[10px] tabular-nums text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
                {modifiedCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FooterFact({
  label,
  icon,
  value,
  mono,
  title,
  className = '',
}: {
  label?: string;
  icon?: ReactNode;
  value: ReactNode;
  mono?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={title}>
      {icon && <span className="shrink-0 text-[var(--color-fg-faint)]">{icon}</span>}
      {label && <span className="eyebrow shrink-0">{label}</span>}
      <span
        className={
          'truncate text-[11.5px] text-[var(--color-fg-secondary)] ' +
          (mono ? 'font-mono ' : '') +
          className
        }
      >
        {value}
      </span>
    </div>
  );
}

// Compact live/working/idle indicator — animated dots while working, pulsing dot
// while live, a quiet dot when idle.
function StatusBeacon({ isLive, isWorking }: { isLive: boolean; isWorking: boolean }) {
  if (isWorking) {
    return (
      <span aria-hidden className="loading-dots shrink-0 text-[var(--color-accent)]">
        <span />
        <span />
        <span />
      </span>
    );
  }
  if (isLive) {
    return (
      <span aria-hidden className="relative inline-flex h-2 w-2 shrink-0">
        <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] pulse-amber" />
        <span className="absolute inset-0 rounded-full bg-[var(--color-accent)]" />
      </span>
    );
  }
  return <span aria-hidden className="shrink-0 text-[10px] text-[var(--color-accent)]">●</span>;
}

// Breadcrumb-scale title — sits inline in the sticky title bar next to the
// project link, claude.ai style (smaller than the old editorial masthead h1).
const HEADER_TITLE_CLASS =
  'font-display text-[15px] font-medium leading-tight tracking-[-0.01em] text-[var(--color-fg-primary)]';

function TitleSlot({
  title,
  editableValue,
  onTitleEdit,
  isFallback,
  disabled,
  disabledTooltip,
  onDelete,
  deleteDisabled,
  deleteTooltip,
}: {
  title: ReactNode;
  editableValue: string;
  onTitleEdit: (next: string) => Promise<void>;
  isFallback: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
  onDelete: () => void;
  deleteDisabled?: boolean;
  deleteTooltip?: string;
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
            HEADER_TITLE_CLASS +
            ' w-full bg-transparent border-b border-[var(--color-accent)] outline-none focus:outline-none disabled:opacity-60'
          }
        />
        {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <h1 className={HEADER_TITLE_CLASS + ' truncate' + (isFallback ? ' font-mono' : '')}>
        {title}
      </h1>
      <TitleMenu
        onRename={startEdit}
        renameDisabled={disabled}
        renameTooltip={disabledTooltip}
        onDelete={onDelete}
        deleteDisabled={deleteDisabled}
        deleteTooltip={deleteTooltip}
      />
    </div>
  );
}

// claude.ai-style caret menu next to the session title. Replaces the old inline
// pencil: a down-caret opens a small dropdown with Rename (inline edit) + Delete
// (confirm dialog). Closes on outside-click / Escape. No portal needed — the
// sticky header has no transform and nothing clips it (topbar-glass is blur-only).
function TitleMenu({
  onRename,
  renameDisabled,
  renameTooltip,
  onDelete,
  deleteDisabled,
  deleteTooltip,
}: {
  onRename: () => void;
  renameDisabled?: boolean;
  renameTooltip?: string;
  onDelete: () => void;
  deleteDisabled?: boolean;
  deleteTooltip?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('session.action.menu')}
        title={t('session.action.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          'inline-flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)] ' +
          (open
            ? 'bg-[var(--color-sunken)] text-[var(--color-fg-primary)]'
            : 'text-[var(--color-fg-muted)]')
        }
      >
        <CaretDownIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1.5 min-w-[8.5rem] overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-pop)]"
        >
          <TitleMenuItem
            icon={<PencilIcon />}
            label={t('session.action.rename')}
            disabled={renameDisabled}
            title={renameDisabled ? renameTooltip : undefined}
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          />
          <TitleMenuItem
            icon={<MenuTrashIcon />}
            label={t('session.action.delete')}
            danger
            disabled={deleteDisabled}
            title={deleteDisabled ? deleteTooltip : undefined}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          />
        </div>
      )}
    </div>
  );
}

function TitleMenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ' +
        (danger
          ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]'
          : 'text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]')
      }
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

// Collapsible search — revealed from the title-bar search button. Just the input
// (plus a live result count and a close button); the system/only-me/error filters
// moved to the sticky footer, the load-more count to the "load earlier" row.
function SearchReveal({
  query,
  onQuery,
  onClose,
  shown,
  total,
  hasData,
}: {
  query: string;
  onQuery: (v: string) => void;
  onClose: () => void;
  shown: number;
  total: number;
  hasData: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 border-t border-[var(--color-hairline)] px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 border-b border-[var(--color-hairline)] py-1 transition focus-within:border-[var(--color-accent)]">
        <SearchIcon className="text-[var(--color-fg-muted)]" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={t('common.searchPlaceholder')}
          className="w-full bg-transparent text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-faint)] focus:outline-none"
        />
      </div>
      {hasData && query && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
          {t('session.shown', { shown, total })}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.cancel')}
        title={t('common.cancel')}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

// Single-select message filter — claude.ai-style segmented control. The four
// modes are mutually exclusive (was three independent checkboxes); the active
// segment lifts onto a surface chip, the rest stay quiet.
const FILTER_OPTIONS: {
  value: MessageFilter;
  labelKey: 'common.all' | 'common.system' | 'common.onlyUser' | 'common.onlyError';
}[] = [
  { value: 'all', labelKey: 'common.all' },
  { value: 'system', labelKey: 'common.system' },
  { value: 'user', labelKey: 'common.onlyUser' },
  { value: 'error', labelKey: 'common.onlyError' },
];

function SegmentedFilter({
  value,
  onChange,
}: {
  value: MessageFilter;
  onChange: (v: MessageFilter) => void;
}) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t('common.filterLabel')}
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] p-0.5"
    >
      {FILTER_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              'rounded-[6px] px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] transition ' +
              (active
                ? 'bg-[var(--color-surface)] text-[var(--color-accent-ink)] shadow-[var(--shadow-rise)] dark:text-[var(--color-accent)]'
                : 'text-[var(--color-fg-faint)] hover:text-[var(--color-fg-secondary)]')
            }
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

// Context-window occupancy ring — claude.ai's footer context meter. A small SVG
// donut filled to `tokens / window`, greening below 70%, clay 70–90%, danger past
// 90%. Sits with the other footer facts; the full count + percent are in the title.
function ContextRing({ tokens, window }: { tokens: number; window: number }) {
  const t = useT();
  const pct = window > 0 ? Math.min(100, Math.round((tokens / window) * 100)) : 0;
  const r = 7;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;
  const tone =
    pct >= 90
      ? 'var(--color-danger)'
      : pct >= 70
        ? 'var(--color-accent)'
        : 'var(--color-moss)';
  const tip = t('session.context.tooltip', {
    used: formatTokens(tokens),
    total: formatTokens(window),
    pct,
  });
  return (
    <div className="flex items-center gap-1.5" title={tip}>
      <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90" aria-hidden>
        <circle cx="9" cy="9" r={r} fill="none" stroke="var(--color-hairline-strong)" strokeWidth="2.2" />
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <span className="eyebrow shrink-0">{t('session.meta.context')}</span>
      <span className="font-mono text-[11.5px] tabular-nums text-[var(--color-fg-secondary)]">
        {formatTokens(tokens)}
        <span className="text-[var(--color-fg-faint)]">/{formatTokens(window)}</span>
      </span>
    </div>
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

function hasError(m: Message): boolean {
  return m.blocks.some((b) => b.type === 'tool_result' && b.isError);
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

// Monitor glyph for the title breadcrumb — denotes a Claude Code session, echoing
// claude.ai/code's laptop mark before the project / session crumb.
function MonitorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="1.6" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2a1.5 1.5 0 0 1 1.05.43l1.34 1.32A1.5 1.5 0 0 0 12.14 7.2H19.5A1.5 1.5 0 0 1 21 8.7v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
    </svg>
  );
}

function BranchGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="8" r="2.4" />
      <path d="M6 8.4v7.2" />
      <path d="M18 10.4c0 3.4-3.4 4.2-6 4.6" />
    </svg>
  );
}

// Sunburst glyph (same family as the brand mark) marking the model fact.
function ModelGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v3.6" />
      <path d="M12 17.4V21" />
      <path d="M3 12h3.6" />
      <path d="M17.4 12H21" />
      <path d="M6.3 6.3l2.5 2.5" />
      <path d="M15.2 15.2l2.5 2.5" />
      <path d="M6.3 17.7l2.5-2.5" />
      <path d="M15.2 8.8l2.5-2.5" />
    </svg>
  );
}

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// Down-caret marking the session-title menu trigger — echoes the chevron beside
// claude.ai's conversation title.
function CaretDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function MenuTrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M5.5 6l1.1 13.2A1.5 1.5 0 0 0 8.1 20.5h7.8a1.5 1.5 0 0 0 1.5-1.3L18.5 6" />
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
