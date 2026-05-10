import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Breadcrumbs, { BreadcrumbFolderIcon } from '../components/Breadcrumbs.tsx';
import PageHeader, { MetaItem, Sep } from '../components/PageHeader.tsx';
import {
  api,
  type MemoryEntry,
  type MemoryResponse,
  type MemoryType,
  type ProjectSummary,
} from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';

type GroupKey = MemoryType | 'other';

interface ParsedLink {
  title: string;
  href: string;
  hook: string;
}
interface IndexLine {
  raw: string;
  link: ParsedLink | null;
}

type Row =
  | { kind: 'entry'; entry: MemoryEntry; hook: string }
  | { kind: 'missing'; title: string; hook: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'spacer' };

const LINK_RE = /^[\s*-]*\[(?<title>[^\]]+)\]\((?<href>[^)]+)\)\s*[—–\-:]?\s*(?<hook>.*)$/;

export default function ProjectMemoryRoute() {
  const t = useT();
  const { projectId } = useParams<{ projectId: string }>();
  const id = projectId ?? '';
  const [searchParams, setSearchParams] = useSearchParams();

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

  const data = memoryQuery.data;
  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const indexLines = useMemo(() => parseIndex(data?.index ?? null), [data?.index]);

  const hookByFilename = useMemo(() => {
    const m = new Map<string, string>();
    for (const line of indexLines) {
      if (line.link) m.set(line.link.href, line.link.hook);
    }
    return m;
  }, [indexLines]);

  const { rows, orphans } = useMemo(
    () => buildRows(indexLines, entries),
    [indexLines, entries],
  );

  // URL-driven drawer state
  const drawerEntry = searchParams.get('entry');
  const drawerView = searchParams.get('view');
  const drawerOpen = drawerEntry !== null || drawerView === 'raw';

  function openEntry(filename: string) {
    const next = new URLSearchParams(searchParams);
    next.set('entry', filename);
    next.delete('view');
    setSearchParams(next);
  }
  function openRaw() {
    const next = new URLSearchParams(searchParams);
    next.set('view', 'raw');
    next.delete('entry');
    setSearchParams(next);
  }
  function closeDrawer() {
    const next = new URLSearchParams(searchParams);
    next.delete('entry');
    next.delete('view');
    setSearchParams(next);
  }

  const drawerTarget = useMemo(() => {
    if (drawerView === 'raw') return { kind: 'raw' as const };
    if (drawerEntry) {
      const entry = entries.find((e) => e.filename === drawerEntry) ?? null;
      return { kind: 'entry' as const, entry, filename: drawerEntry };
    }
    return null;
  }, [drawerEntry, drawerView, entries]);

  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const searchActive = trimmed.length > 0;

  const filteredRows: Row[] = useMemo(() => {
    if (!searchActive) return rows;
    return rows.filter((r) => r.kind === 'entry' && matchEntry(r.entry, r.hook, trimmed));
  }, [rows, searchActive, trimmed]);

  const filteredOrphans = useMemo(
    () => (searchActive ? orphans.filter((e) => matchEntry(e, '', trimmed)) : orphans),
    [orphans, searchActive, trimmed],
  );

  const totalEntries = entries.length;
  const indexAvailable = !!data?.index;
  const hasContent = totalEntries > 0 || indexAvailable;

  const totalMatched =
    filteredRows.filter((r) => r.kind === 'entry').length + filteredOrphans.length;

  const cwd = project?.decodedCwd ?? id;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.at(-1) ?? cwd;
  const head = parts.slice(0, -1).join('/');

  const lastUpdate = useMemo(() => {
    let latest: number | null = null;
    for (const e of entries) {
      if (!e.mtime) continue;
      const t = Date.parse(e.mtime);
      if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
    }
    return latest ? new Date(latest).toISOString() : null;
  }, [entries]);

  const typeCount = useMemo(() => {
    const s = new Set<GroupKey>();
    for (const e of entries) s.add((e.type ?? 'other') as GroupKey);
    return s.size;
  }, [entries]);

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: t('session.crumbProjects'), to: '/' },
          {
            label: tail,
            to: `/projects/${encodeURIComponent(id)}`,
            mono: true,
            icon: <BreadcrumbFolderIcon />,
          },
          { label: t('memory.title') },
        ]}
      />

      <div className="surface-card mt-6 p-6">
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-2">
              {head ? (
                <span className="font-mono normal-case tracking-normal">{head}/</span>
              ) : (
                t('memory.action.open')
              )}
            </span>
          }
          title={t('memory.title')}
          meta={
            data ? (
              <>
                <MetaItem label={t('memory.meta.entries')} value={totalEntries} />
                {typeCount > 0 && (
                  <>
                    <Sep />
                    <MetaItem label={t('memory.meta.types')} value={typeCount} />
                  </>
                )}
                {lastUpdate && (
                  <>
                    <Sep />
                    <MetaItem
                      label={t('memory.meta.lastUpdate')}
                      value={formatRelativeTime(lastUpdate)}
                    />
                  </>
                )}
              </>
            ) : null
          }
        />
      </div>

      {memoryQuery.isLoading && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('memory.loading')}
        </p>
      )}
      {memoryQuery.error && (
        <p className="mt-6 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {t('common.failedMemory')}: {(memoryQuery.error as Error).message}
        </p>
      )}

      {data && !hasContent && <EmptyState />}

      {data && hasContent && (
        <IndexCard
          rows={filteredRows}
          orphans={filteredOrphans}
          totalMatched={totalMatched}
          totalEntries={totalEntries}
          query={query}
          onQuery={setQuery}
          searchActive={searchActive}
          indexAvailable={indexAvailable}
          onOpenEntry={openEntry}
          onOpenRaw={openRaw}
        />
      )}

      {drawerOpen && drawerTarget && (
        <Drawer
          target={drawerTarget}
          rawIndex={data?.index ?? ''}
          hookForEntry={
            drawerTarget.kind === 'entry' && drawerTarget.entry
              ? hookByFilename.get(drawerTarget.entry.filename) ?? null
              : null
          }
          onClose={closeDrawer}
          onJumpToCover={() => {
            closeDrawer();
            requestAnimationFrame(() => {
              const cover = document.getElementById('memo-index-card');
              cover?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }}
        />
      )}
    </section>
  );
}

function IndexCard({
  rows,
  orphans,
  totalMatched,
  totalEntries,
  query,
  onQuery,
  searchActive,
  indexAvailable,
  onOpenEntry,
  onOpenRaw,
}: {
  rows: Row[];
  orphans: MemoryEntry[];
  totalMatched: number;
  totalEntries: number;
  query: string;
  onQuery: (v: string) => void;
  searchActive: boolean;
  indexAvailable: boolean;
  onOpenEntry: (filename: string) => void;
  onOpenRaw: () => void;
}) {
  const t = useT();
  const noResults = searchActive && totalMatched === 0;

  return (
    <div id="memo-index-card" className="surface-card mt-6 px-7 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="eyebrow">{t('memory.cover.title')}</div>
          <h2 className="mt-0.5 font-display text-[18px] font-medium tracking-tight text-[var(--color-fg-primary)]">
            {t('memory.cover.subtitle')}
          </h2>
        </div>
        {indexAvailable && (
          <button
            type="button"
            onClick={onOpenRaw}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
          >
            {t('memory.cover.viewRaw')} ↗
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 min-w-[14rem] items-center gap-2 border-b border-[var(--color-hairline)] py-1.5 transition focus-within:border-[var(--color-accent)]">
          <SearchIcon className="text-[var(--color-fg-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('memory.search.placeholder')}
            className="w-full bg-transparent text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-faint)] focus:outline-none"
          />
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] tabular-nums text-[var(--color-fg-faint)]">
          {searchActive
            ? t('memory.list.count', { n: totalMatched, total: totalEntries })
            : `${totalEntries} ${t('memory.meta.entries').toLowerCase()}`}
        </span>
      </div>

      <div className="rule-dotted mt-5" aria-hidden />

      {noResults ? (
        <p className="mt-6 text-sm text-[var(--color-fg-muted)]">{t('memory.list.noResults')}</p>
      ) : (
        <ul className="mt-3">
          {rows.map((row, i) => (
            <RowItem key={i} row={row} onOpenEntry={onOpenEntry} />
          ))}

          {orphans.length > 0 && (
            <>
              {!searchActive && rows.length > 0 && (
                <li aria-hidden className="h-3" />
              )}
              <li className="pt-3 pb-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-fg-faint)]">
                    {t('memory.cover.orphan')}
                  </span>
                  <span className="font-mono text-[10.5px] tabular-nums text-[var(--color-fg-faint)]">
                    · {orphans.length}
                  </span>
                  <span aria-hidden className="ml-2 h-px flex-1 bg-[var(--color-hairline)]" />
                </div>
              </li>
              {orphans.map((e) => (
                <RowItem
                  key={e.filename}
                  row={{ kind: 'entry', entry: e, hook: '' }}
                  onOpenEntry={onOpenEntry}
                />
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function RowItem({
  row,
  onOpenEntry,
}: {
  row: Row;
  onOpenEntry: (filename: string) => void;
}) {
  const t = useT();

  if (row.kind === 'spacer') {
    return <li aria-hidden className="h-2" />;
  }
  if (row.kind === 'heading') {
    return (
      <li className="pt-4 pb-1">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {row.text}
        </div>
      </li>
    );
  }
  if (row.kind === 'text') {
    return (
      <li className="px-1 py-0.5 text-[12.5px] text-[var(--color-fg-faint)] whitespace-pre-wrap break-words">
        {row.text}
      </li>
    );
  }
  if (row.kind === 'missing') {
    return (
      <li
        title={t('memory.cover.missingTooltip')}
        className="flex items-baseline gap-3 px-2 py-1.5 text-[var(--color-fg-faint)]"
      >
        <span className="text-[14px] font-medium line-through decoration-[var(--color-fg-faint)]/50">
          {row.title}
        </span>
        {row.hook && <span className="truncate text-[12px]">{row.hook}</span>}
      </li>
    );
  }

  const entry = row.entry;
  const typeKey: GroupKey = entry.type ?? 'other';
  const title = entry.name ?? entry.filename;
  const hookText = row.hook || entry.description || '';
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenEntry(entry.filename)}
        className={`memo-row memo-type-${typeKey}`}
      >
        <span aria-hidden className="memo-row-dot" />
        <div className="memo-row-content">
          <div className="memo-row-headline">
            <span className="memo-row-title">{title}</span>
            {entry.mtime && (
              <span className="memo-row-meta-inline">{formatRelativeTime(entry.mtime)}</span>
            )}
            <TypeChip k={typeKey} />
          </div>
          {hookText && <p className="memo-row-hook">{hookText}</p>}
        </div>
        <span aria-hidden className="memo-row-chevron">↗</span>
      </button>
    </li>
  );
}

function TypeChip({ k }: { k: GroupKey }) {
  const t = useT();
  const label =
    k === 'user'
      ? t('memory.type.user')
      : k === 'feedback'
        ? t('memory.type.feedback')
        : k === 'project'
          ? t('memory.type.project')
          : k === 'reference'
            ? t('memory.type.reference')
            : t('memory.type.other');
  return <span className="memo-chip">{label}</span>;
}

type DrawerTarget =
  | { kind: 'entry'; entry: MemoryEntry | null; filename: string }
  | { kind: 'raw' };

function Drawer({
  target,
  rawIndex,
  hookForEntry,
  onClose,
  onJumpToCover,
}: {
  target: DrawerTarget;
  rawIndex: string;
  hookForEntry: string | null;
  onClose: () => void;
  onJumpToCover: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const typeKey: GroupKey =
    target.kind === 'entry' ? (target.entry?.type ?? 'other') : 'reference';

  return (
    <>
      <div className="memo-drawer-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`memo-drawer-panel memo-type-${typeKey} focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-hairline)] px-7 pt-7 pb-5">
          <div className="min-w-0 flex-1">
            {target.kind === 'entry' ? (
              <>
                <TypeChip k={typeKey} />
                {target.entry ? (
                  <>
                    <h2 className="mt-3 font-display text-[24px] font-light leading-tight tracking-tight text-[var(--color-fg-primary)]">
                      {target.entry.name ?? target.entry.filename}
                    </h2>
                    <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
                      {target.entry.filename} · {formatBytes(target.entry.bytes)}
                      {target.entry.mtime ? ` · ${formatRelativeTime(target.entry.mtime)}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 font-display text-[22px] font-light leading-tight text-[var(--color-fg-primary)]">
                      {t('memory.drawer.notFound.title')}
                    </h2>
                    <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
                      {target.filename}
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="memo-chip memo-type-reference">{t('memory.cover.title')}</span>
                <h2 className="mt-3 font-display text-[24px] font-light leading-tight tracking-tight text-[var(--color-fg-primary)]">
                  {t('memory.raw.title')}
                </h2>
                <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
                  {t('memory.raw.subtitle')}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('memory.drawer.close')}
            className="rounded-md p-2 text-[var(--color-fg-muted)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {target.kind === 'entry' && target.entry ? (
            <EntryDrawerBody
              entry={target.entry}
              hookForEntry={hookForEntry}
              onJumpToCover={onJumpToCover}
            />
          ) : target.kind === 'entry' ? (
            <NotFoundDrawerBody filename={target.filename} onJumpToCover={onJumpToCover} />
          ) : (
            <RawDrawerBody source={rawIndex} />
          )}
        </div>
      </div>
    </>
  );
}

function EntryDrawerBody({
  entry,
  hookForEntry,
  onJumpToCover,
}: {
  entry: MemoryEntry;
  hookForEntry: string | null;
  onJumpToCover: () => void;
}) {
  const t = useT();
  const body = entry.body.trim();
  return (
    <div>
      {entry.description && (
        <p className="text-[14px] text-[var(--color-fg-secondary)]">{entry.description}</p>
      )}
      <pre
        className={
          'whitespace-pre-wrap break-words rounded-[var(--radius-input)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-4 py-3 font-mono text-[12.5px] leading-[1.65] text-[var(--color-fg-primary)] ' +
          (entry.description ? 'mt-5' : '')
        }
      >
        {body || '—'}
      </pre>
      {hookForEntry && (
        <div className="mt-7">
          <div className="rule-dotted" aria-hidden />
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <div className="eyebrow">{t('memory.drawer.indexHook')}</div>
            <button
              type="button"
              onClick={onJumpToCover}
              className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
            >
              {t('memory.cover.title')} ↑
            </button>
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--color-fg-secondary)]">{hookForEntry}</p>
        </div>
      )}
    </div>
  );
}

function NotFoundDrawerBody({
  filename,
  onJumpToCover,
}: {
  filename: string;
  onJumpToCover: () => void;
}) {
  const t = useT();
  return (
    <div>
      <p className="text-sm text-[var(--color-fg-secondary)]">{t('memory.drawer.notFound.body')}</p>
      <p className="mt-3 font-mono text-[12px] text-[var(--color-fg-faint)]">{filename}</p>
      <button
        type="button"
        onClick={onJumpToCover}
        className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-hairline)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] hover:border-[var(--color-hairline-strong)] hover:text-[var(--color-fg-primary)]"
      >
        {t('memory.cover.title')} ↑
      </button>
    </div>
  );
}

function RawDrawerBody({ source }: { source: string }) {
  const body = source.trim();
  return (
    <pre className="whitespace-pre-wrap break-words rounded-[var(--radius-input)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-4 py-3 font-mono text-[12.5px] leading-[1.65] text-[var(--color-fg-primary)]">
      {body || '—'}
    </pre>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="surface-card mt-6 px-8 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-sunken)] text-[var(--color-fg-muted)]">
        <BookmarkIcon />
      </div>
      <h2 className="mt-5 font-display text-[20px] font-light tracking-tight text-[var(--color-fg-primary)]">
        {t('memory.empty.title')}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--color-fg-secondary)]">
        {t('memory.empty.body')}
      </p>
    </div>
  );
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

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  );
}

function matchEntry(entry: MemoryEntry, hook: string, q: string): boolean {
  const fields = [
    entry.name ?? '',
    entry.filename,
    entry.description ?? '',
    entry.body,
    hook,
  ];
  return fields.some((f) => f.toLowerCase().includes(q));
}

function buildRows(
  indexLines: IndexLine[],
  entries: MemoryEntry[],
): { rows: Row[]; orphans: MemoryEntry[] } {
  const filenameToEntry = new Map(entries.map((e) => [e.filename, e]));
  const seen = new Set<string>();
  const rows: Row[] = [];

  for (const line of indexLines) {
    if (line.link) {
      const entry = filenameToEntry.get(line.link.href);
      if (entry) {
        rows.push({ kind: 'entry', entry, hook: line.link.hook });
        seen.add(entry.filename);
      } else {
        rows.push({ kind: 'missing', title: line.link.title, hook: line.link.hook });
      }
      continue;
    }
    const txt = line.raw.trim();
    if (!txt) {
      rows.push({ kind: 'spacer' });
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(txt);
    if (headingMatch) {
      rows.push({ kind: 'heading', text: headingMatch[2]! });
    } else {
      rows.push({ kind: 'text', text: line.raw });
    }
  }

  const orphans = entries.filter((e) => !seen.has(e.filename));
  return { rows, orphans };
}

function parseIndex(raw: string | null): IndexLine[] {
  if (!raw) return [];
  const out: IndexLine[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      const last = out[out.length - 1];
      if (last && (last.link || last.raw.trim() !== '')) {
        out.push({ raw: '', link: null });
      }
      continue;
    }
    const m = LINK_RE.exec(line);
    const title = m?.groups?.title;
    const href = m?.groups?.href;
    if (m && title && href) {
      out.push({
        raw: line,
        link: { title: title.trim(), href: href.trim(), hook: (m.groups?.hook ?? '').trim() },
      });
    } else {
      out.push({ raw: line, link: null });
    }
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last && !last.link && last.raw.trim() === '') out.pop();
    else break;
  }
  return out;
}
