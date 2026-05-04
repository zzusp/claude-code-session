import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageHeader, { MetaItem, Sep } from '../components/PageHeader.tsx';
import StatCard from '../components/StatCard.tsx';
import { api, type DiskUsage } from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

const PALETTE_VARS = [
  '--color-accent',
  '--color-moss',
  '--color-iris',
  '--color-fg-secondary',
  '--color-accent-ink',
  '--color-fg-muted',
];

const CHART_VARS = [
  '--color-accent',
  '--color-fg-muted',
  '--color-hairline',
  '--color-surface',
  '--color-fg-primary',
] as const;

// Resolve a list of CSS variables on <html> and re-resolve whenever the
// theme class flips. Recharts needs concrete colors; CSS vars don't traverse SVG cleanly.
function useThemeColors<T extends readonly string[]>(vars: T): Record<T[number], string> {
  const [snapshot, setSnapshot] = useState(() => readVars(vars));
  useEffect(() => {
    const observer = new MutationObserver(() => setSnapshot(readVars(vars)));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [vars]);
  return snapshot;
}

function readVars<T extends readonly string[]>(vars: T): Record<T[number], string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<T[number], string>;
  for (const v of vars) (out as Record<string, string>)[v] = cs.getPropertyValue(v).trim() || '#888';
  return out;
}

export default function DiskUsageRoute() {
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.diskUsage(),
    queryFn: () => api<DiskUsage>('/api/disk-usage'),
  });

  const colors = useThemeColors(CHART_VARS);
  const accent = colors['--color-accent'];
  const muted = colors['--color-fg-muted'];
  const hairline = colors['--color-hairline'];
  const surface = colors['--color-surface'];
  const fgPrimary = colors['--color-fg-primary'];

  const palette = useThemeColors(PALETTE_VARS);
  const resolvedPalette = useMemo(() => PALETTE_VARS.map((v) => palette[v]), [palette]);

  const pieData = useMemo(() => {
    if (!data) return [];
    return data.byProject.map((p) => ({
      name: shortCwd(p.decodedCwd),
      value: p.totalBytes,
      sessions: p.sessionCount,
    }));
  }, [data]);

  const monthData = useMemo(() => {
    if (!data) return [];
    return data.byMonth.map((m) => ({ month: m.month, MB: +(m.totalBytes / 1_048_576).toFixed(2) }));
  }, [data]);

  return (
    <section>
      <PageHeader
        eyebrow={t('disk.eyebrow')}
        title={
          <>
            {t('disk.title')}
            <span className="text-[var(--color-accent)]">.</span>
          </>
        }
        meta={
          data ? (
            <>
              <MetaItem label={t('disk.meta.total')} value={formatBytes(data.totalBytes)} />
              <Sep />
              <MetaItem label={t('disk.meta.projects')} value={data.byProject.length} />
              <Sep />
              <MetaItem label={t('disk.meta.sessions')} value={data.totalSessions.toLocaleString()} />
            </>
          ) : null
        }
      />

      {isLoading && (
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('common.computing')}
        </p>
      )}
      {error && (
        <p className="mt-10 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {t('common.failed')}: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerParent}
            className="mt-8 grid gap-3 sm:grid-cols-3"
          >
            <motion.div variants={fadeUpItem}>
              <StatCard
                accent
                label={t('disk.stat.total')}
                value={formatBytes(data.totalBytes).split(' ')[0]}
                unit={formatBytes(data.totalBytes).split(' ')[1]}
                trail={t('disk.stat.acrossProjects', { n: data.byProject.length })}
              />
            </motion.div>
            <motion.div variants={fadeUpItem}>
              <StatCard
                label={t('disk.stat.sessions')}
                value={data.totalSessions.toLocaleString()}
                trail={
                  data.topSessions[0]
                    ? t('disk.stat.largest', { size: formatBytes(data.topSessions[0].totalBytes) })
                    : undefined
                }
              />
            </motion.div>
            <motion.div variants={fadeUpItem}>
              <StatCard
                label={t('disk.stat.months')}
                value={data.byMonth.length}
                trail={
                  data.byMonth[0]
                    ? `${data.byMonth[0].month} → ${data.byMonth.at(-1)?.month ?? data.byMonth[0].month}`
                    : undefined
                }
              />
            </motion.div>
          </motion.div>

          <div className="mt-12 grid gap-8 lg:grid-cols-5">
            <Card
              title={t('disk.composition.title')}
              subtitle={t('disk.composition.subtitle')}
              className="lg:col-span-3"
            >
              {pieData.length === 0 ? (
                <Empty />
              ) : (
                <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
                  <div className="relative mx-auto aspect-square w-full max-w-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="58%"
                          outerRadius="92%"
                          paddingAngle={1.5}
                          stroke={surface}
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={resolvedPalette[i % resolvedPalette.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle(surface, hairline, fgPrimary)}
                          formatter={(value: number) => formatBytes(value)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="eyebrow">{t('disk.composition.total')}</span>
                      <span className="mt-1 font-mono text-2xl font-light tabular-nums text-[var(--color-fg-primary)]">
                        {formatBytes(data.totalBytes)}
                      </span>
                    </div>
                  </div>
                  <ol className="space-y-1.5 text-sm">
                    {pieData.slice(0, 8).map((p, i) => {
                      const pct = ((p.value / data.totalBytes) * 100).toFixed(1);
                      return (
                        <li key={i} className="grid grid-cols-[14px_1fr_auto] items-baseline gap-2">
                          <span
                            aria-hidden
                            className="block h-2.5 w-2.5 self-center rounded-sm"
                            style={{ background: resolvedPalette[i % resolvedPalette.length] }}
                          />
                          <span className="truncate font-mono text-xs text-[var(--color-fg-secondary)]" title={p.name}>
                            {p.name}
                          </span>
                          <span className="font-mono tabular-nums text-xs text-[var(--color-fg-primary)]">
                            {pct}% <span className="text-[var(--color-fg-faint)]">· {formatBytes(p.value)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </Card>

            <Card
              title={t('disk.cadence.title')}
              subtitle={t('disk.cadence.subtitle')}
              className="lg:col-span-2"
            >
              {monthData.length === 0 ? (
                <Empty />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthData} margin={{ top: 10, right: 8, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="cadenceFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: muted, fontFamily: 'var(--font-mono)' }}
                        tickLine={false}
                        axisLine={{ stroke: hairline }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: muted, fontFamily: 'var(--font-mono)' }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle(surface, hairline, fgPrimary)}
                        formatter={(value: number) => `${value.toFixed(2)} MB`}
                        cursor={{ stroke: hairline, strokeDasharray: '2 3' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="MB"
                        stroke={accent}
                        strokeWidth={1.6}
                        fill="url(#cadenceFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="surface-card mt-12 p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
                {t('disk.heaviest.title')}
              </h2>
              {data.topSessions.length > 0 && (
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
                  {t('disk.heaviest.top', { n: data.topSessions.length })}
                </span>
              )}
            </div>
            <div className="rule-dotted mt-3" aria-hidden />
            {data.topSessions.length === 0 ? (
              <Empty className="mt-6" />
            ) : (
              <div className="mt-4 -mx-6 overflow-x-auto px-6">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-10" />
                    <col />
                    <col className="w-[22rem]" />
                    <col className="w-24" />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr className="text-left">
                      <th className="px-2 py-3 eyebrow">{t('disk.col.num')}</th>
                      <th className="px-2 py-3 eyebrow">{t('disk.col.title')}</th>
                      <th className="px-2 py-3 eyebrow">{t('disk.col.project')}</th>
                      <th className="px-2 py-3 eyebrow text-right">{t('disk.col.last')}</th>
                      <th className="px-2 py-3 eyebrow text-right">{t('disk.col.size')}</th>
                    </tr>
                  </thead>
                  <tbody className="border-t border-[var(--color-hairline)]">
                    {data.topSessions.map((s, i) => {
                      const displayTitle = s.customTitle ?? s.title;
                      return (
                      <tr
                        key={`${s.projectId}/${s.sessionId}`}
                        className="ribbon-row border-b border-[var(--color-hairline)] hover:bg-[var(--color-sunken)]"
                      >
                        <td className="px-2 py-3 align-top font-mono text-[11px] text-[var(--color-fg-faint)]">
                          {String(i + 1).padStart(2, '0')}
                        </td>
                        <td className="px-2 py-3 align-top">
                          <Link
                            to={`/projects/${encodeURIComponent(s.projectId)}/sessions/${s.sessionId}`}
                            className="block truncate font-medium text-[var(--color-fg-primary)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
                            title={displayTitle}
                          >
                            {displayTitle}
                          </Link>
                        </td>
                        <td className="px-2 py-3 align-top font-mono text-[12px] text-[var(--color-fg-muted)]">
                          <Link
                            to={`/projects/${encodeURIComponent(s.projectId)}`}
                            className="block truncate hover:text-[var(--color-fg-primary)]"
                            title={s.projectId}
                          >
                            {projectCwdLabel(data, s.projectId)}
                          </Link>
                        </td>
                        <td className="px-2 py-3 text-right align-top font-mono text-[12.5px] text-[var(--color-fg-secondary)]">
                          {formatRelativeTime(s.lastAt)}
                        </td>
                        <td className="px-2 py-3 text-right align-top font-mono tabular-nums text-[var(--color-fg-primary)]">
                          {formatBytes(s.totalBytes)}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function tooltipStyle(surface: string, hairline: string, fg: string): React.CSSProperties {
  return {
    background: surface,
    border: `1px solid ${hairline}`,
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: fg,
    boxShadow: 'var(--shadow-pop)',
  };
}

function projectCwdLabel(data: DiskUsage, projectId: string): string {
  const p = data.byProject.find((row) => row.projectId === projectId);
  return p ? shortCwd(p.decodedCwd) : projectId;
}

function shortCwd(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return cwd;
  return '…/' + parts.slice(-2).join('/');
}

function Card({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card p-5 ${className}`}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-light tracking-tight text-[var(--color-fg-primary)]">
          {title}
        </h3>
        {subtitle && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ className = '' }: { className?: string }) {
  const t = useT();
  return (
    <p className={`font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)] ${className}`}>
      {t('common.noData')}
    </p>
  );
}
