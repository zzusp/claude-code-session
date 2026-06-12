import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Breadcrumbs, { BreadcrumbFolderIcon } from '../components/Breadcrumbs.tsx';
import ExportDialog from '../components/ExportDialog.tsx';
import { Loading } from '../components/Loading.tsx';
import PageHeader, { MetaItem, Sep } from '../components/PageHeader.tsx';
import StatusDot from '../components/StatusDot.tsx';
import {
  api,
  type DeleteResult,
  type MemoryResponse,
  type ProjectSummary,
  type RevealProjectResult,
  type SessionSummary,
} from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

interface BulkProgress {
  index: number;
  total: number;
}

interface BulkOutcome {
  ok: { sessionId: string; title: string }[];
  skipped: { sessionId: string; title: string; reason: string }[];
  failed: { sessionId: string; title: string; error: string }[];
}

export default function ProjectDetail() {
  const t = useT();
  const queryClient = useQueryClient();
  const { projectId } = useParams<{ projectId: string }>();
  const id = projectId ?? '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showExport, setShowExport] = useState(false);
  // 批量删除运行态：null 表示空闲；progress 推进时显示「正在删除 i/total」
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<BulkOutcome | null>(null);
  const [bulkDetailOpen, setBulkDetailOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.projectSessions(id),
    queryFn: () => api<SessionSummary[]>(`/api/projects/${encodeURIComponent(id)}/sessions`),
    enabled: !!id,
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => api<ProjectSummary[]>('/api/projects'),
  });

  const memoryQuery = useQuery({
    queryKey: queryKeys.projectMemory(id),
    queryFn: () => api<MemoryResponse>(`/api/projects/${encodeURIComponent(id)}/memory`),
    enabled: !!id,
  });
  const memoryCount = memoryQuery.data?.entries.length ?? 0;

  const revealMutation = useMutation({
    mutationFn: () =>
      api<RevealProjectResult>(`/api/projects/${encodeURIComponent(id)}/reveal`, {
        method: 'POST',
      }),
    onError: (err: Error) => {
      window.alert(t('project.action.openFolderFailed', { msg: err.message }));
    },
  });

  const project = useMemo(
    () => projectsQuery.data?.find((p) => p.id === id),
    [projectsQuery.data, id],
  );

  const sessions = sessionsQuery.data ?? [];
  const selectedSessions = useMemo(
    () => sessions.filter((s) => selected.has(s.id)),
    [sessions, selected],
  );
  const sessionsToExport = selected.size > 0 ? selectedSessions : sessions;
  const projectBytes = useMemo(() => sessions.reduce((a, s) => a + totalBytes(s), 0), [sessions]);
  // Disjoint buckets: working ⊂ live, so subtract working from the live count to
  // keep the three meta tallies mutually exclusive (matches the per-row StatusDot).
  const workingCount = useMemo(() => sessions.filter((s) => s.isWorking).length, [sessions]);
  const liveCount = useMemo(
    () => sessions.filter((s) => s.isLivePid && !s.isWorking).length,
    [sessions],
  );
  const recentCount = useMemo(
    () => sessions.filter((s) => s.isRecentlyActive && !s.isLivePid).length,
    [sessions],
  );

  function toggle(sid: string) {
    const next = new Set(selected);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === sessions.length) setSelected(new Set());
    else setSelected(new Set(sessions.map((s) => s.id)));
  }

  function enterSelectMode() {
    setSelectMode(true);
    setBulkOutcome(null);
    setBulkDetailOpen(false);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // 串行调用 DELETE /api/sessions（每次 items 长度 1），失败继续推进，
  // 完成后写入 outcome 并退出选择模式；不在完成时跳转，留给用户查看反馈。
  async function runBulkDelete() {
    const targets = selectedSessions;
    if (targets.length === 0) return;
    const outcome: BulkOutcome = { ok: [], skipped: [], failed: [] };
    setBulkOutcome(null);
    setBulkDetailOpen(false);
    let i = 0;
    for (const s of targets) {
      i++;
      const title = s.customTitle ?? s.title;
      setBulkProgress({ index: i, total: targets.length });
      try {
        const res = await api<DeleteResult>('/api/sessions', {
          method: 'DELETE',
          body: JSON.stringify({ items: [{ projectId: id, sessionId: s.id }] }),
        });
        if (res.deleted.length > 0) {
          outcome.ok.push({ sessionId: s.id, title });
        } else if (res.skipped.length > 0) {
          outcome.skipped.push({
            sessionId: s.id,
            title,
            reason: res.skipped[0]?.reason ?? 'unknown',
          });
        } else {
          // 后端既未删也未跳过的边界情况，记为失败避免静默
          outcome.failed.push({ sessionId: s.id, title, error: 'no-op' });
        }
      } catch (err) {
        outcome.failed.push({
          sessionId: s.id,
          title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setBulkProgress(null);
    setBulkOutcome(outcome);
    setBulkDetailOpen(outcome.skipped.length + outcome.failed.length > 0);
    setSelectMode(false);
    setSelected(new Set());
    // 刷新列表 / 项目元数据 / 磁盘统计
    queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
    queryClient.invalidateQueries({ queryKey: queryKeys.projectSessions(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.diskUsage() });
  }

  const cwd = project?.decodedCwd ?? id;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.at(-1) ?? cwd;
  const head = parts.slice(0, -1).join('/');

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: t('session.crumbProjects'), to: '/' },
          { label: tail, mono: true, icon: <BreadcrumbFolderIcon /> },
        ]}
      />

      <div className="mt-8">
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-2">
              {head ? (
                <span className="font-mono normal-case tracking-normal">{head}/</span>
              ) : (
                t('project.eyebrow')
              )}
              {project?.cwdResolved === false && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-danger)]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" />
                  {t('project.warn.missingDir')}
                </span>
              )}
            </span>
          }
          title={<span className="font-mono">{tail}</span>}
          actions={
            <>
              <button
                type="button"
                onClick={() => revealMutation.mutate()}
                disabled={
                  revealMutation.isPending || project?.cwdResolved === false
                }
                title={
                  project?.cwdResolved === false
                    ? t('project.action.openFolderTooltipMissing')
                    : cwd
                }
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-[var(--color-accent)]"
              >
                <FolderOpenIcon />
                {t('project.action.openFolder')}
              </button>
              <Link
                to={`/projects/${encodeURIComponent(id)}/memory`}
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
              >
                <BrainIcon />
                {memoryCount > 0
                  ? t('memory.action.openCount', { n: memoryCount })
                  : t('memory.action.open')}
              </Link>
              <button
                type="button"
                onClick={() => setShowExport(true)}
                disabled={sessions.length === 0}
                title={selected.size > 0 ? `${selected.size}` : undefined}
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-[var(--color-accent)]"
              >
                <ExportIcon />
                {selected.size > 0
                  ? `${t('export.action')} · ${selected.size}`
                  : t('export.action')}
              </button>
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : enterSelectMode())}
                disabled={sessions.length === 0 || bulkProgress !== null}
                aria-pressed={selectMode}
                className={
                  'inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40 ' +
                  (selectMode
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]'
                    : 'border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-fg-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]')
                }
              >
                <CheckSquareIcon />
                {selectMode ? t('project.action.exitSelect') : t('project.action.select')}
              </button>
            </>
          }
          meta={
            sessions.length > 0 ? (
              <>
                <MetaItem label={t('project.meta.sessions')} value={sessions.length} />
                <Sep />
                <MetaItem label={t('project.meta.onDisk')} value={formatBytes(projectBytes)} />
                {workingCount > 0 && (
                  <>
                    <Sep />
                    <MetaItem
                      label={t('project.meta.working')}
                      value={
                        <span className="text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
                          {workingCount}
                        </span>
                      }
                    />
                  </>
                )}
                <Sep />
                <MetaItem
                  label={t('project.meta.live')}
                  value={
                    liveCount > 0 ? (
                      <span className="text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
                        {liveCount}
                      </span>
                    ) : (
                      0
                    )
                  }
                />
                <Sep />
                <MetaItem label={t('project.meta.recent')} value={recentCount} />
              </>
            ) : null
          }
        />
      </div>

      {sessionsQuery.isLoading && <Loading label={t('common.readingSessions')} className="mt-10" />}
      {sessionsQuery.error && (
        <p className="mt-10 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {t('common.failedSessions')}: {(sessionsQuery.error as Error).message}
        </p>
      )}
      {sessionsQuery.data && sessionsQuery.data.length === 0 && (
        <p className="mt-10 text-sm text-[var(--color-fg-muted)]">{t('common.noSessions')}</p>
      )}

      {sessions.length > 0 && (
        <div className="mt-10">
          {(selectMode || bulkProgress || bulkOutcome) && (
            <BulkBar
              selectMode={selectMode}
              selectedCount={selected.size}
              totalCount={sessions.length}
              progress={bulkProgress}
              outcome={bulkOutcome}
              detailOpen={bulkDetailOpen}
              onToggleAll={toggleAll}
              onDelete={runBulkDelete}
              onCancel={exitSelectMode}
              onToggleDetail={() => setBulkDetailOpen((v) => !v)}
              onDismiss={() => {
                setBulkOutcome(null);
                setBulkDetailOpen(false);
              }}
              t={t}
            />
          )}
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-medium tracking-tight text-[var(--color-fg-primary)]">
              {t('project.heading')}
            </h2>
          </div>
          <div className="mt-3 h-px bg-[var(--color-hairline)]" aria-hidden />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {selectMode && <th className="w-9 px-2 py-3" />}
                  <th className="px-2 py-3 eyebrow">{t('project.col.title')}</th>
                  <th className="px-2 py-3 eyebrow text-right">{t('project.col.msgs')}</th>
                  <th className="px-2 py-3 eyebrow text-right">{t('project.col.errors')}</th>
                  <th className="px-2 py-3 eyebrow text-right">{t('project.col.last')}</th>
                  <th className="px-2 py-3 eyebrow text-right">{t('project.col.size')}</th>
                  <th className="px-2 py-3 eyebrow">{t('project.col.status')}</th>
                </tr>
              </thead>
              <motion.tbody
                initial="hidden"
                animate="show"
                variants={staggerParent}
                className="border-t border-[var(--color-hairline)]"
              >
                {sessions.map((s) => {
                  const isSel = selected.has(s.id);
                  const displayTitle = s.customTitle ?? s.title;
                  return (
                    <motion.tr
                      key={s.id}
                      variants={fadeUpItem}
                      data-active={isSel && selectMode ? 'true' : undefined}
                      className={
                        'ribbon-row border-b border-[var(--color-hairline)] transition-colors ' +
                        (isSel && selectMode
                          ? 'bg-[var(--color-accent-soft)]/40'
                          : 'hover:bg-[var(--color-sunken)]')
                      }
                    >
                      {selectMode && (
                        <td className="px-2 py-3 align-top">
                          <input
                            type="checkbox"
                            aria-label={displayTitle}
                            checked={isSel}
                            onChange={() => toggle(s.id)}
                            disabled={bulkProgress !== null}
                            className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed"
                          />
                        </td>
                      )}
                      <td className="px-2 py-3 align-top">
                        <Link
                          to={`/projects/${encodeURIComponent(id)}/sessions/${s.id}`}
                          className="block max-w-md truncate font-medium text-[var(--color-fg-primary)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
                          title={displayTitle}
                        >
                          {displayTitle}
                        </Link>
                        <div className="mt-1 truncate font-mono text-[10.5px] tracking-[0.04em] text-[var(--color-fg-faint)]">
                          {s.id}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right align-top font-mono tabular-nums text-[var(--color-fg-secondary)]">
                        {s.messageCount.toLocaleString()}
                      </td>
                      <td className="px-2 py-3 text-right align-top font-mono tabular-nums">
                        {s.errorCount > 0 ? (
                          <span className="text-[var(--color-danger)]">{s.errorCount.toLocaleString()}</span>
                        ) : (
                          <span className="text-[var(--color-fg-faint)]">0</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right align-top font-mono text-[12.5px] text-[var(--color-fg-secondary)]">
                        {formatRelativeTime(s.lastAt)}
                      </td>
                      <td
                        className="px-2 py-3 text-right align-top font-mono tabular-nums text-[var(--color-fg-secondary)]"
                        title={breakdown(s)}
                      >
                        {formatBytes(totalBytes(s))}
                      </td>
                      <td className="px-2 py-3 align-top">
                        <StatusDot session={s} />
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        </div>
      )}

      {showExport && (
        <ExportDialog
          projectId={id}
          sessions={sessionsToExport}
          onClose={() => setShowExport(false)}
        />
      )}
    </section>
  );
}

function totalBytes(s: SessionSummary): number {
  const r = s.relatedBytes;
  return r.jsonl + r.subdir + r.fileHistory + r.sessionEnv;
}

function breakdown(s: SessionSummary): string {
  const r = s.relatedBytes;
  return [
    `jsonl ${formatBytes(r.jsonl)}`,
    `subdir ${formatBytes(r.subdir)}`,
    `file-history ${formatBytes(r.fileHistory)}`,
    `session-env ${formatBytes(r.sessionEnv)}`,
  ].join(' · ');
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M5.5 6l1.1 13.2A1.5 1.5 0 0 0 8.1 20.5h7.8a1.5 1.5 0 0 0 1.5-1.3L18.5 6" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M8 12.2l3 3 5.5-6" />
    </svg>
  );
}

interface BulkBarProps {
  selectMode: boolean;
  selectedCount: number;
  totalCount: number;
  progress: BulkProgress | null;
  outcome: BulkOutcome | null;
  detailOpen: boolean;
  onToggleAll: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onToggleDetail: () => void;
  onDismiss: () => void;
  t: (key: Parameters<ReturnType<typeof useT>>[0], params?: Record<string, string | number>) => string;
}

function BulkBar({
  selectMode,
  selectedCount,
  totalCount,
  progress,
  outcome,
  detailOpen,
  onToggleAll,
  onDelete,
  onCancel,
  onToggleDetail,
  onDismiss,
  t,
}: BulkBarProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const isBusy = progress !== null;
  return (
    // sticky 顶部：被外层 card 的 padding 抵消；用 -mx-6 让条目贴齐 card 边缘
    <div className="sticky top-2 z-30 mb-4">
      {selectMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-input)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-4 py-2.5 shadow-[var(--shadow-rise)]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-primary)]">
              {isBusy
                ? t('project.bulk.deletePending', {
                    i: progress!.index,
                    total: progress!.total,
                  })
                : t('project.bulk.selectedCount', { n: selectedCount })}
            </span>
            <button
              type="button"
              onClick={onToggleAll}
              disabled={isBusy}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {allSelected ? t('common.deselectAll') : t('common.selectAll')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isBusy}
              className="rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isBusy || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-danger)] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-white shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <TrashIcon />
              {t('project.bulk.deleteCta')}
            </button>
          </div>
        </div>
      )}
      {!selectMode && outcome && (
        <BulkOutcomeRibbon
          outcome={outcome}
          detailOpen={detailOpen}
          onToggleDetail={onToggleDetail}
          onDismiss={onDismiss}
          t={t}
        />
      )}
    </div>
  );
}

interface BulkOutcomeRibbonProps {
  outcome: BulkOutcome;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onDismiss: () => void;
  t: BulkBarProps['t'];
}

function BulkOutcomeRibbon({
  outcome,
  detailOpen,
  onToggleDetail,
  onDismiss,
  t,
}: BulkOutcomeRibbonProps) {
  // 整体观感：成功为主时走 moss；有失败/跳过时走 accent
  const hasIssue = outcome.skipped.length + outcome.failed.length > 0;
  const tone = hasIssue
    ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]'
    : 'border-[var(--color-moss)]/40 bg-[var(--color-moss-soft)]';
  const detailToggleable = hasIssue;
  return (
    <div className={`rounded-[var(--radius-input)] border ${tone} px-4 py-2.5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-fg-primary)]">
          <span className="font-medium">
            {t('project.bulk.resultOk', { ok: outcome.ok.length })}
          </span>
          {outcome.skipped.length > 0 && (
            <span className="font-mono text-[12px] text-[var(--color-fg-secondary)]">
              · {t('project.bulk.resultSkipped', { n: outcome.skipped.length })}
            </span>
          )}
          {outcome.failed.length > 0 && (
            <span className="font-mono text-[12px] text-[var(--color-danger)]">
              · {t('project.bulk.resultFailed', { n: outcome.failed.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {detailToggleable && (
            <button
              type="button"
              onClick={onToggleDetail}
              className="rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]"
            >
              {detailOpen ? t('project.bulk.hideDetail') : t('project.bulk.viewDetail')}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]"
          >
            {t('project.bulk.dismiss')}
          </button>
        </div>
      </div>
      {detailOpen && detailToggleable && (
        <div className="mt-3 space-y-2">
          {outcome.skipped.length > 0 && (
            <div>
              <div className="eyebrow text-[var(--color-fg-muted)]">
                {t('project.bulk.detailSkipped')}
              </div>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-[var(--color-fg-secondary)]">
                {outcome.skipped.map((s) => (
                  <li key={s.sessionId}>
                    <span className="text-[var(--color-fg-primary)]">{s.title}</span>
                    <span className="ml-2 text-[var(--color-fg-faint)]">{s.sessionId}</span>
                    <span className="ml-2">— {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {outcome.failed.length > 0 && (
            <div>
              <div className="eyebrow text-[var(--color-danger)]">
                {t('project.bulk.detailFailed')}
              </div>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-[var(--color-fg-secondary)]">
                {outcome.failed.map((s) => (
                  <li key={s.sessionId}>
                    <span className="text-[var(--color-fg-primary)]">{s.title}</span>
                    <span className="ml-2 text-[var(--color-fg-faint)]">{s.sessionId}</span>
                    <span className="ml-2 text-[var(--color-danger)]">— {s.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4a1.5 1.5 0 0 1 1.06.44l1.1 1.1a1.5 1.5 0 0 0 1.06.44H19.5A1.5 1.5 0 0 1 21 9.48" />
      <path d="M3.2 9.5h17.6a1 1 0 0 1 .98 1.2l-1.5 7.5a1.5 1.5 0 0 1-1.47 1.2H5.2a1.5 1.5 0 0 1-1.47-1.2l-1.5-7.5A1 1 0 0 1 3.2 9.5z" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4.5a3 3 0 0 0-3 3v.4a3 3 0 0 0-1.5 5.2A3 3 0 0 0 6 18.5a3 3 0 0 0 6 0V4.5a3 3 0 0 0-3 0z" />
      <path d="M15 4.5a3 3 0 0 1 3 3v.4a3 3 0 0 1 1.5 5.2A3 3 0 0 1 18 18.5a3 3 0 0 1-6 0" />
    </svg>
  );
}
