import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import DeleteProjectDialog from '../components/DeleteProjectDialog.tsx';
import { MetaItem, Sep } from '../components/PageHeader.tsx';
import { api, type HealthResponse, type ProjectSummary } from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

export default function ProjectsList() {
  const t = useT();
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const health = useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => api<HealthResponse>('/api/health'),
  });

  const projects = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => api<ProjectSummary[]>('/api/projects'),
  });

  const list = projects.data ?? [];
  const totalBytes = list.reduce((acc, p) => acc + p.totalBytes, 0);
  const totalSessions = list.reduce((acc, p) => acc + p.sessionCount, 0);
  const lastActive = list
    .map((p) => p.lastActiveAt)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1) ?? null;

  return (
    <section>
      <div className="surface-card p-6">
        <Masthead
          title={t('projects.title')}
          tagline={t('projects.tagline')}
          stats={
            list.length > 0
              ? { totalBytes, totalSessions, projectCount: list.length, lastActive }
              : null
          }
        />
      </div>

      {health.data && !health.data.claudeRootExists && (
        <Admonition tone="warn" className="mt-6">
          {t('projects.warn.rootMissing', { root: health.data.claudeRoot })}
        </Admonition>
      )}

      {projects.isLoading && (
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('common.scanning')}
        </p>
      )}
      {projects.error && (
        <Admonition tone="danger" className="mt-6">
          {t('common.failedProjects')}: {(projects.error as Error).message}
        </Admonition>
      )}
      {projects.data && projects.data.length === 0 && (
        <p className="mt-10 text-sm text-[var(--color-fg-muted)]">{t('common.noProjects')}</p>
      )}

      {list.length > 0 && (
        <div className="surface-card mt-6 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
              {t('projects.indexHeading')}
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] tabular-nums text-[var(--color-fg-muted)]">
              {String(list.length).padStart(2, '0')}{' '}
              {list.length === 1 ? t('common.entry') : t('common.entries')}
            </span>
          </div>
          <div className="rule-dotted mt-3" aria-hidden />
          <Ledger projects={list} onRequestDelete={(p) => setPendingDelete(p)} />
        </div>
      )}

      {pendingDelete && (
        <DeleteProjectDialog
          project={pendingDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function Masthead({
  title,
  tagline,
  stats,
}: {
  title: string;
  tagline: string;
  stats: {
    totalBytes: number;
    totalSessions: number;
    projectCount: number;
    lastActive: string | null;
  } | null;
}) {
  const t = useT();
  return (
    <header className="relative">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-[clamp(1.75rem,3.5vw,2.25rem)] font-light leading-[1.1] tracking-[-0.02em] text-[var(--color-fg-primary)]">
          {title}
          <span className="text-[var(--color-accent)]">.</span>
        </h1>
        <p className="min-w-0 flex-1 font-display text-[13px] italic leading-snug text-[var(--color-fg-muted)]">
          {tagline}
        </p>
      </div>
      {stats && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
          <MetaItem label={t('projects.stat.onDisk')} value={formatBytes(stats.totalBytes)} />
          <Sep />
          <MetaItem label={t('projects.stat.projects')} value={stats.projectCount} />
          <Sep />
          <MetaItem label={t('projects.stat.sessions')} value={stats.totalSessions.toLocaleString()} />
          <Sep />
          <MetaItem label={t('projects.card.lastSeen')} value={formatRelativeTime(stats.lastActive)} />
        </div>
      )}
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function Ledger({
  projects,
  onRequestDelete,
}: {
  projects: ProjectSummary[];
  onRequestDelete: (p: ProjectSummary) => void;
}) {
  const t = useT();
  return (
    <motion.ol
      initial="hidden"
      animate="show"
      variants={staggerParent}
      className="mt-4"
    >
      <li
        aria-hidden
        className="grid grid-cols-[2.5rem_minmax(0,1fr)_5rem_5.5rem_5rem_3.5rem] items-center gap-x-4 border-b border-[var(--color-hairline)] py-3 sm:grid-cols-[3rem_minmax(0,1fr)_6rem_6rem_6rem_4rem]"
      >
        <span className="eyebrow text-right">№</span>
        <span className="eyebrow">{t('projects.card.eyebrow')}</span>
        <span className="eyebrow text-right">{t('projects.card.sessions')}</span>
        <span className="eyebrow text-right">{t('projects.card.onDisk')}</span>
        <span className="eyebrow text-right">{t('projects.card.lastSeen')}</span>
        <span className="eyebrow" />
      </li>

      {projects.map((p, i) => (
        <motion.li key={p.id} variants={fadeUpItem}>
          <LedgerRow project={p} index={i} onRequestDelete={onRequestDelete} />
        </motion.li>
      ))}
    </motion.ol>
  );
}

function LedgerRow({
  project,
  index,
  onRequestDelete,
}: {
  project: ProjectSummary;
  index: number;
  onRequestDelete: (p: ProjectSummary) => void;
}) {
  const t = useT();
  const cwd = project.decodedCwd;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.slice(-2).join('/');
  const head = parts.slice(0, -2).join('/');

  return (
    <div className="ribbon-row group relative grid grid-cols-[2.5rem_minmax(0,1fr)_5rem_5.5rem_5rem_3.5rem] items-center gap-x-4 border-b border-[var(--color-hairline)] py-3 pl-3 transition-colors hover:bg-[var(--color-sunken)] sm:grid-cols-[3rem_minmax(0,1fr)_6rem_6rem_6rem_4rem]">
      <Link
        to={`/projects/${encodeURIComponent(project.id)}`}
        aria-label={cwd}
        className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
      >
        <span className="sr-only">{cwd}</span>
      </Link>

      <span className="pointer-events-none text-right font-mono text-[11px] uppercase tracking-[0.16em] tabular-nums text-[var(--color-fg-faint)] group-hover:text-[var(--color-accent)]">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="pointer-events-none min-w-0">
        <div
          className="flex items-baseline gap-2 truncate font-mono text-[13px] text-[var(--color-fg-primary)]"
          title={cwd}
        >
          {head && <span className="text-[var(--color-fg-faint)]">{head}/</span>}
          <span className="font-medium">{tail}</span>
          {!project.cwdResolved && (
            <span className="ml-1 shrink-0 rounded-full border border-[var(--color-hairline-strong)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
              {t('common.missing')}
            </span>
          )}
        </div>
      </div>

      <span className="pointer-events-none text-right font-mono text-sm tabular-nums text-[var(--color-fg-primary)]">
        {project.sessionCount.toLocaleString()}
      </span>
      <span className="pointer-events-none text-right font-mono text-sm tabular-nums text-[var(--color-fg-secondary)]">
        {formatBytes(project.totalBytes)}
      </span>
      <span className="pointer-events-none text-right font-mono text-[12.5px] tabular-nums text-[var(--color-fg-secondary)]">
        {formatRelativeTime(project.lastActiveAt)}
      </span>

      <div className="relative z-[2] flex items-center justify-end gap-1 pr-1">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRequestDelete(project);
          }}
          aria-label={t('deleteProject.row.action')}
          title={t('deleteProject.row.action')}
          className="rounded-md border border-transparent p-1.5 text-[var(--color-fg-faint)] transition-colors hover:border-[var(--color-danger)]/40 hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
        >
          <TrashIcon />
        </button>
        <span
          aria-hidden
          className="pointer-events-none text-[var(--color-fg-faint)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
        >
          <ChevronRight />
        </span>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M5.5 6l1.1 13.2A1.5 1.5 0 0 0 8.1 20.5h7.8a1.5 1.5 0 0 0 1.5-1.3L18.5 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
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
  children: React.ReactNode;
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
