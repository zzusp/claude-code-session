import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { api, type HealthResponse, type ProjectSummary } from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

export default function ProjectsList() {
  const t = useT();
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
  const resolvedCount = list.filter((p) => p.cwdResolved).length;
  const lastActive = list
    .map((p) => p.lastActiveAt)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1) ?? null;

  return (
    <section>
      <Masthead
        platform={health.data?.platform ?? null}
        nodeVersion={health.data?.node ?? null}
        title={t('projects.title')}
        eyebrow={t('projects.eyebrow')}
        tagline={t('projects.tagline')}
      />

      {health.data && !health.data.claudeRootExists && (
        <Admonition tone="warn" className="mt-8">
          {t('projects.warn.rootMissing', { root: health.data.claudeRoot })}
        </Admonition>
      )}

      {list.length > 0 && (
        <HeroFigures
          totalBytes={totalBytes}
          totalSessions={totalSessions}
          projectCount={list.length}
          resolvedCount={resolvedCount}
          lastActive={lastActive}
        />
      )}

      <div className="mt-16 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[26px] font-light leading-none tracking-[-0.012em] text-[var(--color-fg-primary)]">
          {t('projects.indexHeading')}
          <span className="ml-2 align-[0.18em] font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-faint)]">
            §
          </span>
        </h2>
        <div className="flex flex-1 items-center gap-3 px-4">
          <span className="rule-dotted h-px flex-1" aria-hidden />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] tabular-nums text-[var(--color-fg-muted)]">
          {String(list.length).padStart(2, '0')}{' '}
          {list.length === 1 ? t('common.entry') : t('common.entries')}
        </span>
      </div>

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

      {list.length > 0 && <Ledger projects={list} />}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function Masthead({
  platform,
  nodeVersion,
  title,
  eyebrow,
  tagline,
}: {
  platform: string | null;
  nodeVersion: string | null;
  title: string;
  eyebrow: string;
  tagline: string;
}) {
  const today = new Date();
  const dateline = today
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase()
    .replace(/,/g, ' ·');

  const sigil =
    platform && nodeVersion
      ? `${platform.toUpperCase()} / ${nodeVersion}`
      : platform
        ? platform.toUpperCase()
        : '—';

  return (
    <header className="relative">
      <div className="flex items-center justify-between gap-4 border-y border-[var(--color-hairline-strong)] py-2">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          <span className="text-[var(--color-accent)]">●</span>
          <span>VOL · 0.1</span>
          <span className="hidden h-3 w-px bg-[var(--color-hairline-strong)] sm:inline-block" />
          <span className="hidden sm:inline">{eyebrow.toUpperCase()}</span>
          <span className="hidden h-3 w-px bg-[var(--color-hairline-strong)] md:inline-block" />
          <span className="hidden md:inline tabular-nums">{sigil}</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] tabular-nums text-[var(--color-fg-muted)]">
          {dateline}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 pt-10 pb-2 lg:grid-cols-12">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[clamp(3.4rem,9vw,6.5rem)] font-light leading-[0.95] tracking-[-0.035em] text-[var(--color-fg-primary)] lg:col-span-8"
        >
          {title}
          <span className="text-[var(--color-accent)]">.</span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-4 lg:pt-3"
        >
          <p className="border-l-2 border-[var(--color-accent)] pl-4 font-display text-[15px] italic leading-[1.55] text-[var(--color-fg-secondary)]">
            {tagline}
          </p>
        </motion.div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function HeroFigures({
  totalBytes,
  totalSessions,
  projectCount,
  resolvedCount,
  lastActive,
}: {
  totalBytes: number;
  totalSessions: number;
  projectCount: number;
  resolvedCount: number;
  lastActive: string | null;
}) {
  const t = useT();
  const formatted = formatBytes(totalBytes);
  const [diskValue, diskUnit] = formatted.split(' ');

  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={staggerParent}
      className="mt-12 grid grid-cols-1 gap-y-8 border-t border-[var(--color-hairline-strong)] pt-10 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-0"
      aria-label="Workspace summary"
    >
      <motion.div
        variants={fadeUpItem}
        className="relative lg:col-span-7 lg:border-r lg:border-[var(--color-hairline)] lg:pr-10"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -left-6 -top-6 h-40 w-40 rounded-full bg-[var(--color-accent-soft)] opacity-60 blur-3xl"
        />
        <div className="eyebrow flex items-center gap-3">
          <span>{t('projects.stat.onDisk')}</span>
          <span className="h-px w-8 bg-[var(--color-hairline-strong)]" />
          <span className="font-mono lowercase tracking-[0.05em] text-[var(--color-fg-faint)]">
            ~/.claude
          </span>
        </div>
        <div className="mt-4 flex items-end gap-3">
          <span className="font-display text-[clamp(4.5rem,12vw,8rem)] font-light leading-[0.85] tracking-[-0.04em] tabular-nums text-[var(--color-fg-primary)]">
            {diskValue}
          </span>
          <span className="pb-3 font-mono text-sm uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            {diskUnit}
          </span>
        </div>
        <p className="mt-4 max-w-md font-display text-[14px] italic leading-snug text-[var(--color-fg-muted)]">
          {t('projects.stat.lastTouch', { ago: formatRelativeTime(lastActive) })}.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-6 lg:col-span-5 lg:grid-cols-1 lg:gap-y-8">
        <motion.div variants={fadeUpItem}>
          <div className="eyebrow">{t('projects.stat.projects')}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[clamp(2.5rem,5vw,3.6rem)] font-light leading-[0.9] tracking-[-0.02em] tabular-nums text-[var(--color-fg-primary)]">
              {projectCount}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-faint)]">
              ct
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-[var(--color-fg-muted)]">
            {t('projects.stat.resolved', { n: resolvedCount })}
          </p>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <div className="eyebrow">{t('projects.stat.sessions')}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[clamp(2.5rem,5vw,3.6rem)] font-light leading-[0.9] tracking-[-0.02em] tabular-nums text-[var(--color-fg-primary)]">
              {totalSessions.toLocaleString()}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-faint)]">
              ct
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-[var(--color-fg-muted)]">
            {t('projects.stat.acrossProjects')}
          </p>
        </motion.div>
      </div>
    </motion.section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function Ledger({ projects }: { projects: ProjectSummary[] }) {
  const t = useT();
  return (
    <motion.ol
      initial="hidden"
      animate="show"
      variants={staggerParent}
      className="mt-8 border-t border-[var(--color-hairline-strong)]"
    >
      <li
        aria-hidden
        className="grid grid-cols-[2.5rem_minmax(0,1fr)_5rem_5.5rem_5rem_1.5rem] items-center gap-x-4 border-b border-[var(--color-hairline)] py-2 sm:grid-cols-[3rem_minmax(0,1fr)_6rem_6rem_6rem_2rem]"
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
          <LedgerRow project={p} index={i} />
        </motion.li>
      ))}
    </motion.ol>
  );
}

function LedgerRow({ project, index }: { project: ProjectSummary; index: number }) {
  const t = useT();
  const cwd = project.decodedCwd;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.slice(-2).join('/');
  const head = parts.slice(0, -2).join('/');

  return (
    <Link
      to={`/projects/${encodeURIComponent(project.id)}`}
      className="ribbon-row group relative grid grid-cols-[2.5rem_minmax(0,1fr)_5rem_5.5rem_5rem_1.5rem] items-center gap-x-4 border-b border-[var(--color-hairline)] py-4 pl-3 transition-colors hover:bg-[var(--color-sunken)] sm:grid-cols-[3rem_minmax(0,1fr)_6rem_6rem_6rem_2rem]"
    >
      <span className="text-right font-mono text-[11px] uppercase tracking-[0.16em] tabular-nums text-[var(--color-fg-faint)] group-hover:text-[var(--color-accent)]">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="min-w-0">
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

      <span className="text-right font-display text-[18px] font-light leading-none tabular-nums text-[var(--color-fg-primary)]">
        {project.sessionCount}
      </span>
      <span className="text-right font-display text-[18px] font-light leading-none tabular-nums text-[var(--color-fg-secondary)]">
        {formatBytes(project.totalBytes)}
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
        {formatRelativeTime(project.lastActiveAt)}
      </span>

      <span
        aria-hidden
        className="text-[var(--color-fg-faint)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
      >
        <ChevronRight />
      </span>
    </Link>
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
