import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.tsx';
import PageHeader, { MetaItem } from '../components/PageHeader.tsx';
import {
  api,
  type MemoryEntry,
  type MemoryResponse,
  type MemoryType,
  type ProjectSummary,
} from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { fadeUpItem, staggerParent } from '../lib/motion.ts';
import { queryKeys } from '../lib/query-keys.ts';

const TYPE_ORDER: ReadonlyArray<MemoryType> = ['user', 'feedback', 'project', 'reference'];

type GroupKey = MemoryType | 'other';

export default function ProjectMemoryRoute() {
  const t = useT();
  const { projectId } = useParams<{ projectId: string }>();
  const id = projectId ?? '';

  const memoryQuery = useQuery({
    queryKey: queryKeys.projectMemory(id),
    queryFn: () => api<MemoryResponse>(`/api/projects/${encodeURIComponent(id)}/memory`),
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

  const grouped = useMemo(() => {
    const map = new Map<GroupKey, MemoryEntry[]>();
    for (const entry of memoryQuery.data?.entries ?? []) {
      const key: GroupKey = entry.type ?? 'other';
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    const keys: GroupKey[] = [...TYPE_ORDER, 'other'];
    return keys
      .map((k) => ({ key: k, items: map.get(k) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [memoryQuery.data]);

  const cwd = project?.decodedCwd ?? id;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.at(-1) ?? cwd;
  const totalEntries = memoryQuery.data?.entries.length ?? 0;

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: t('session.crumbProjects'), to: '/' },
          { label: tail, to: `/projects/${encodeURIComponent(id)}`, mono: true },
          { label: t('memory.title') },
        ]}
      />

      <div className="mt-4">
        <PageHeader
          eyebrow={t('memory.action.open')}
          title={t('memory.title')}
          tagline={t('memory.tagline')}
          meta={
            memoryQuery.data ? (
              <MetaItem label={t('memory.meta.entries')} value={totalEntries} />
            ) : null
          }
        />
      </div>

      {memoryQuery.isLoading && (
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('memory.loading')}
        </p>
      )}
      {memoryQuery.error && (
        <p className="mt-10 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {t('common.failedMemory')}: {(memoryQuery.error as Error).message}
        </p>
      )}

      {memoryQuery.data && totalEntries === 0 && !memoryQuery.data.index && (
        <p className="mt-10 text-sm text-[var(--color-fg-muted)]">{t('memory.empty')}</p>
      )}

      {grouped.length > 0 && (
        <div className="mt-10 space-y-10">
          {grouped.map((group) => (
            <div key={group.key}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
                  {labelForGroup(t, group.key)}
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
                  {group.items.length}
                </span>
              </div>
              <div className="rule-dotted mt-3" aria-hidden />
              <motion.div
                initial="hidden"
                animate="show"
                variants={staggerParent}
                className="mt-4 space-y-3"
              >
                {group.items.map((entry) => (
                  <motion.div key={entry.filename} variants={fadeUpItem}>
                    <MemoryCard entry={entry} />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          ))}
        </div>
      )}

      {memoryQuery.data?.index && (
        <div className="mt-10">
          <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
            {t('memory.heading.index')}
          </h2>
          <div className="rule-dotted mt-3" aria-hidden />
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-4 py-3 font-mono text-[12.5px] text-[var(--color-fg-primary)]">
            {memoryQuery.data.index}
          </pre>
        </div>
      )}
    </section>
  );
}

function MemoryCard({ entry }: { entry: MemoryEntry }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const title = entry.name ?? entry.filename;
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[0_1px_0_0_var(--color-hairline)]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] font-medium tracking-tight text-[var(--color-fg-primary)]">
            {title}
          </h3>
          {entry.description && (
            <p className="mt-1 text-sm text-[var(--color-fg-secondary)]">{entry.description}</p>
          )}
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
            {entry.filename} · {formatBytes(entry.bytes)}
            {entry.mtime ? ` · ${formatRelativeTime(entry.mtime)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-fg-secondary)] underline-offset-2 hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)] hover:underline"
        >
          {open ? t('common.collapse') : t('common.expand')}
        </button>
      </header>
      {open && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-[var(--color-hairline)] bg-[var(--color-sunken)] px-4 py-3 font-mono text-[12.5px] text-[var(--color-fg-primary)]">
          {entry.body.trim() || '—'}
        </pre>
      )}
    </article>
  );
}

function labelForGroup(
  t: ReturnType<typeof useT>,
  key: GroupKey,
): string {
  switch (key) {
    case 'user':
      return t('memory.type.user');
    case 'feedback':
      return t('memory.type.feedback');
    case 'project':
      return t('memory.type.project');
    case 'reference':
      return t('memory.type.reference');
    default:
      return t('memory.type.other');
  }
}
