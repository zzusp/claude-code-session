import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.tsx';
import StatCard from '../components/StatCard.tsx';
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

  const totalBytes = projects.data?.reduce((acc, p) => acc + p.totalBytes, 0) ?? 0;
  const totalSessions = projects.data?.reduce((acc, p) => acc + p.sessionCount, 0) ?? 0;
  const lastActive = projects.data
    ?.map((p) => p.lastActiveAt)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1) ?? null;

  return (
    <section>
      <PageHeader
        eyebrow={
          <span>
            {t('projects.eyebrow')} · {health.data?.platform ?? '…'}
          </span>
        }
        title={
          <>
            {t('projects.title')}
            <span className="text-[var(--color-accent)]">.</span>
          </>
        }
        tagline={t('projects.tagline')}
      />

      {health.data && !health.data.claudeRootExists && (
        <Admonition tone="warn" className="mt-6">
          {t('projects.warn.rootMissing', { root: health.data.claudeRoot })}
        </Admonition>
      )}

      {projects.data && projects.data.length > 0 && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <StatCard
            accent
            label={t('projects.stat.projects')}
            value={projects.data.length}
            trail={t('projects.stat.resolved', {
              n: projects.data.filter((p) => p.cwdResolved).length,
            })}
          />
          <StatCard
            label={t('projects.stat.sessions')}
            value={totalSessions.toLocaleString()}
            trail={t('projects.stat.acrossProjects')}
          />
          <StatCard
            label={t('projects.stat.onDisk')}
            value={formatBytes(totalBytes).split(' ')[0]}
            unit={formatBytes(totalBytes).split(' ')[1]}
            trail={t('projects.stat.lastTouch', { ago: formatRelativeTime(lastActive) })}
          />
        </div>
      )}

      <div className="mt-12 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
          {t('projects.indexHeading')}
        </h2>
        {projects.data && (
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
            {projects.data.length}{' '}
            {projects.data.length === 1 ? t('common.entry') : t('common.entries')}
          </span>
        )}
      </div>
      <div className="rule-dotted mt-3" aria-hidden />

      {projects.isLoading && (
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('common.scanning')}
        </p>
      )}
      {projects.error && (
        <Admonition tone="danger" className="mt-6">
          {t('common.failedProjects')}: {(projects.error as Error).message}
        </Admonition>
      )}
      {projects.data && projects.data.length === 0 && (
        <p className="mt-8 text-sm text-[var(--color-fg-muted)]">{t('common.noProjects')}</p>
      )}

      {projects.data && projects.data.length > 0 && (
        <motion.ul
          initial="hidden"
          animate="show"
          variants={staggerParent}
          className="mt-6 grid gap-3 md:grid-cols-2"
        >
          {projects.data.map((p, i) => (
            <motion.li key={p.id} variants={fadeUpItem}>
              <ProjectCard project={p} index={i} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}

function ProjectCard({ project, index }: { project: ProjectSummary; index: number }) {
  const t = useT();
  const cwd = project.decodedCwd;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.slice(-2).join('/');
  const head = parts.slice(0, -2).join('/');

  return (
    <Link
      to={`/projects/${encodeURIComponent(project.id)}`}
      className="ribbon-row relative block overflow-hidden rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-hairline-strong)] hover:shadow-[var(--shadow-rise)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="eyebrow flex items-center gap-2">
            <span className="font-mono normal-case tracking-[0.05em] text-[var(--color-fg-faint)]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="h-px w-6 bg-[var(--color-hairline-strong)]" />
            {t('projects.card.eyebrow')}
          </span>
          <div
            className="mt-2 truncate font-mono text-[13px] text-[var(--color-fg-primary)]"
            title={cwd}
          >
            {head && <span className="text-[var(--color-fg-faint)]">{head}/</span>}
            <span>{tail}</span>
          </div>
        </div>
        {!project.cwdResolved && (
          <span className="shrink-0 rounded-full border border-[var(--color-hairline-strong)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
            {t('common.missing')}
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4">
        <CardStat label={t('projects.card.sessions')} value={project.sessionCount.toString()} />
        <CardStat label={t('projects.card.onDisk')} value={formatBytes(project.totalBytes)} />
        <CardStat label={t('projects.card.lastSeen')} value={formatRelativeTime(project.lastActiveAt)} />
      </dl>
    </Link>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-display text-lg font-light tabular-nums text-[var(--color-fg-primary)]">
        {value}
      </dd>
    </div>
  );
}

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
    <div className={`rounded-[10px] border px-4 py-3 text-sm ${colors} ${className}`}>{children}</div>
  );
}
