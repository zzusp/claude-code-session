import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.tsx';
import DeleteDialog from '../components/DeleteDialog.tsx';
import PageHeader, { MetaItem } from '../components/PageHeader.tsx';
import StatusDot from '../components/StatusDot.tsx';
import { api, type ProjectSummary, type SessionSummary } from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

export default function ProjectDetail() {
  const t = useT();
  const { projectId } = useParams<{ projectId: string }>();
  const id = projectId ?? '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDialog, setShowDialog] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.projectSessions(id),
    queryFn: () => api<SessionSummary[]>(`/api/projects/${encodeURIComponent(id)}/sessions`),
    enabled: !!id,
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => api<ProjectSummary[]>('/api/projects'),
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
  const projectBytes = useMemo(() => sessions.reduce((a, s) => a + totalBytes(s), 0), [sessions]);
  const liveCount = useMemo(() => sessions.filter((s) => s.isLivePid).length, [sessions]);
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

  const cwd = project?.decodedCwd ?? id;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.at(-1) ?? cwd;
  const head = parts.slice(0, -1).join('/');

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: t('session.crumbProjects'), to: '/' },
          { label: tail, mono: true },
        ]}
      />

      <div className="mt-4">
        <PageHeader
          eyebrow={
            head ? (
              <span className="font-mono normal-case tracking-normal">{head}/</span>
            ) : (
              t('project.eyebrow')
            )
          }
          title={<span className="font-mono">{tail}</span>}
          tagline={
            project?.cwdResolved === false
              ? t('project.tagline.missing')
              : t('project.tagline.default')
          }
          actions={
            <button
              type="button"
              onClick={() => setShowDialog(true)}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-danger)] transition hover:border-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <TrashIcon /> {t('project.action.delete', { n: selected.size })}
            </button>
          }
          meta={
            sessions.length > 0 ? (
              <>
                <MetaItem label={t('project.meta.sessions')} value={sessions.length} />
                <MetaItem label={t('project.meta.onDisk')} value={formatBytes(projectBytes)} />
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
                <MetaItem label={t('project.meta.recent')} value={recentCount} />
              </>
            ) : null
          }
        />
      </div>

      {sessionsQuery.isLoading && (
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('common.readingSessions')}
        </p>
      )}
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
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
              {t('project.heading')}
            </h2>
            <button
              type="button"
              onClick={toggleAll}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]"
            >
              {selected.size === sessions.length ? t('common.deselectAll') : t('common.selectAll')}
            </button>
          </div>
          <div className="rule-dotted mt-3" aria-hidden />

          <div className="mt-4 -mx-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="w-9 px-2 py-3" />
                  <th className="px-2 py-3 eyebrow">{t('project.col.title')}</th>
                  <th className="px-2 py-3 eyebrow text-right">{t('project.col.msgs')}</th>
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
                  return (
                    <motion.tr
                      key={s.id}
                      variants={fadeUpItem}
                      data-active={isSel ? 'true' : undefined}
                      className={
                        'ribbon-row border-b border-[var(--color-hairline)] transition-colors ' +
                        (isSel
                          ? 'bg-[var(--color-accent-soft)]/40'
                          : 'hover:bg-[var(--color-sunken)]')
                      }
                    >
                      <td className="px-2 py-3 align-top">
                        <input
                          type="checkbox"
                          aria-label={s.title}
                          checked={isSel}
                          onChange={() => toggle(s.id)}
                          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
                        />
                      </td>
                      <td className="px-2 py-3 align-top">
                        <Link
                          to={`/projects/${encodeURIComponent(id)}/sessions/${s.id}`}
                          className="block max-w-md truncate font-medium text-[var(--color-fg-primary)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
                          title={s.title}
                        >
                          {s.title}
                        </Link>
                        <div className="mt-1 truncate font-mono text-[10.5px] tracking-[0.04em] text-[var(--color-fg-faint)]">
                          {s.id}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right align-top font-mono tabular-nums text-[var(--color-fg-secondary)]">
                        {s.messageCount.toLocaleString()}
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

      {showDialog && (
        <DeleteDialog
          projectId={id}
          selected={selectedSessions}
          onClose={() => {
            setShowDialog(false);
            setSelected(new Set());
          }}
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
