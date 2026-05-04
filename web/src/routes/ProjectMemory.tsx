import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
import { queryKeys } from '../lib/query-keys.ts';

const PSEUDO_INDEX = '__index__';

type GroupKey = MemoryType | 'other';
type TypeFilter = 'all' | GroupKey;
type SortMode = 'index' | 'recent' | 'name' | 'size';

interface ParsedLink {
  title: string;
  href: string;
  hook: string;
}
interface IndexLine {
  raw: string;
  link: ParsedLink | null;
}

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

  // Index helpers: hook + curated order keyed by filename
  const hookByFilename = useMemo(() => {
    const m = new Map<string, string>();
    for (const line of indexLines) {
      if (line.link) m.set(line.link.href, line.link.hook);
    }
    return m;
  }, [indexLines]);
  const orderByFilename = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const line of indexLines) {
      if (line.link && !m.has(line.link.href)) m.set(line.link.href, i++);
    }
    return m;
  }, [indexLines]);

  // URL-synced selection. null === list view (mobile) / default index pane (md+)
  const selectedKey = searchParams.get('entry');
  const setSelected = (key: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (key === null) next.delete('entry');
    else next.set('entry', key);
    setSearchParams(next);
  };
  const effectiveKey = selectedKey ?? PSEUDO_INDEX;

  // Local UI state — search/filter/sort are session-scoped, not deep-linked
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('index');

  const counts = useMemo(() => {
    const c: Record<TypeFilter, number> = {
      all: entries.length, user: 0, feedback: 0, project: 0, reference: 0, other: 0,
    };
    for (const e of entries) {
      const k: GroupKey = e.type ?? 'other';
      c[k] += 1;
    }
    return c;
  }, [entries]);

  const visibleEntries = useMemo(() => {
    let list: MemoryEntry[] = entries;
    if (typeFilter !== 'all') {
      list = list.filter((e) => (e.type ?? 'other') === typeFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const fields = [
          e.name ?? '',
          e.filename,
          e.description ?? '',
          e.body,
          hookByFilename.get(e.filename) ?? '',
        ];
        return fields.some((f) => f.toLowerCase().includes(q));
      });
    }
    return [...list].sort(comparator(sortMode, orderByFilename));
  }, [entries, query, typeFilter, sortMode, hookByFilename, orderByFilename]);

  const knownFilenames = useMemo(
    () => new Set(entries.map((e) => e.filename)),
    [entries],
  );

  const isIndexSelected = effectiveKey === PSEUDO_INDEX;
  const selectedEntry = useMemo(() => {
    if (isIndexSelected) return null;
    return entries.find((e) => e.filename === effectiveKey) ?? null;
  }, [isIndexSelected, effectiveKey, entries]);

  const cwd = project?.decodedCwd ?? id;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.at(-1) ?? cwd;
  const head = parts.slice(0, -1).join('/');
  const totalEntries = entries.length;
  const indexAvailable = !!data?.index;
  const hasContent = totalEntries > 0 || indexAvailable;

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: t('session.crumbProjects'), to: '/' },
          { label: tail, to: `/projects/${encodeURIComponent(id)}`, mono: true },
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
            data ? <MetaItem label={t('memory.meta.entries')} value={totalEntries} /> : null
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

      {data && !hasContent && (
        <p className="mt-6 text-sm text-[var(--color-fg-muted)]">{t('memory.empty')}</p>
      )}

      {data && hasContent && (
        <>
          <Toolbar
            query={query}
            onQuery={setQuery}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
            counts={counts}
            sortMode={sortMode}
            onSortMode={setSortMode}
          />

          <div className="mt-6 md:grid md:gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <aside className={(selectedKey !== null ? 'hidden ' : '') + 'md:block'}>
              <div className="surface-card p-6">
                <EntryList
                  indexAvailable={indexAvailable}
                  visibleEntries={visibleEntries}
                  totalEntries={totalEntries}
                  selectedKey={effectiveKey}
                  hookByFilename={hookByFilename}
                  onSelect={setSelected}
                />
              </div>
            </aside>

            <main className={(selectedKey === null ? 'hidden ' : '') + 'md:block'}>
              <div className="surface-card p-6">
                <ReaderPane
                  isIndex={isIndexSelected}
                  entry={selectedEntry}
                  indexLines={indexLines}
                  indexAvailable={indexAvailable}
                  knownFilenames={knownFilenames}
                  hookForSelected={
                    selectedEntry ? hookByFilename.get(selectedEntry.filename) ?? null : null
                  }
                  onSelect={setSelected}
                  onBack={() => setSelected(null)}
                />
              </div>
            </main>
          </div>
        </>
      )}
    </section>
  );
}

function Toolbar({
  query,
  onQuery,
  typeFilter,
  onTypeFilter,
  counts,
  sortMode,
  onSortMode,
}: {
  query: string;
  onQuery: (v: string) => void;
  typeFilter: TypeFilter;
  onTypeFilter: (v: TypeFilter) => void;
  counts: Record<TypeFilter, number>;
  sortMode: SortMode;
  onSortMode: (v: SortMode) => void;
}) {
  const t = useT();
  const allPills: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: t('memory.filter.all') },
    { key: 'user', label: t('memory.type.user') },
    { key: 'feedback', label: t('memory.type.feedback') },
    { key: 'project', label: t('memory.type.project') },
    { key: 'reference', label: t('memory.type.reference') },
    { key: 'other', label: t('memory.type.other') },
  ];
  const pills = allPills.filter((p) => p.key === 'all' || counts[p.key] > 0);

  return (
    <div className="sticky top-2 z-30 mt-6 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 sm:px-5 py-2.5 shadow-[var(--shadow-rise)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-1 min-w-[14rem] items-center gap-2 border-b border-[var(--color-hairline)] py-1 transition focus-within:border-[var(--color-accent)]">
          <SearchIcon className="text-[var(--color-fg-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('memory.search.placeholder')}
            className="w-full bg-transparent text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-faint)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {pills.map((p) => {
            const active = typeFilter === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onTypeFilter(p.key)}
                className={
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]'
                    : 'border-[var(--color-hairline)] text-[var(--color-fg-secondary)] hover:border-[var(--color-hairline-strong)]')
                }
              >
                <span>{p.label}</span>
                <span className="font-mono text-[10px] tabular-nums opacity-70">{counts[p.key]}</span>
              </button>
            );
          })}
        </div>

        <SortMenu value={sortMode} onChange={onSortMode} />
      </div>
    </div>
  );
}

function EntryList({
  indexAvailable,
  visibleEntries,
  totalEntries,
  selectedKey,
  hookByFilename,
  onSelect,
}: {
  indexAvailable: boolean;
  visibleEntries: MemoryEntry[];
  totalEntries: number;
  selectedKey: string;
  hookByFilename: Map<string, string>;
  onSelect: (key: string) => void;
}) {
  const t = useT();
  const noResults = visibleEntries.length === 0;
  const indexActive = selectedKey === PSEUDO_INDEX;

  return (
    <div>
      {indexAvailable && (
        <button
          type="button"
          onClick={() => onSelect(PSEUDO_INDEX)}
          data-active={indexActive ? 'true' : undefined}
          className="ribbon-row -mx-6 block w-[calc(100%+3rem)] px-6 py-2.5 text-left transition-colors hover:bg-[var(--color-sunken)] focus:bg-[var(--color-sunken)] focus:outline-none data-[active=true]:bg-[var(--color-sunken)]"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-[14px] font-medium tracking-tight text-[var(--color-fg-primary)]">
              {t('memory.index.pseudoTitle')}
            </span>
            <span className="rounded-full border border-[var(--color-hairline)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              index
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--color-fg-secondary)]">
            {t('memory.index.pseudoHook')}
          </p>
        </button>
      )}

      <div className="mt-4 mb-2 flex items-baseline justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
        <span>{t('memory.meta.entries')}</span>
        <span className="tabular-nums">
          {t('memory.list.count', { n: visibleEntries.length, total: totalEntries })}
        </span>
      </div>
      <div className="rule-dotted" aria-hidden />

      {noResults ? (
        <p className="mt-4 text-sm text-[var(--color-fg-muted)]">{t('memory.list.noResults')}</p>
      ) : (
        <ol className="mt-2">
          {visibleEntries.map((e) => {
            const active = selectedKey === e.filename;
            const hook = hookByFilename.get(e.filename);
            const description = hook || e.description || '';
            const title = e.name ?? e.filename;
            const typeKey: GroupKey = e.type ?? 'other';
            return (
              <li key={e.filename}>
                <button
                  type="button"
                  onClick={() => onSelect(e.filename)}
                  data-active={active ? 'true' : undefined}
                  className="ribbon-row -mx-6 block w-[calc(100%+3rem)] px-6 py-2.5 text-left transition-colors hover:bg-[var(--color-sunken)] focus:bg-[var(--color-sunken)] focus:outline-none data-[active=true]:bg-[var(--color-sunken)]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-display text-[14px] font-medium tracking-tight text-[var(--color-fg-primary)]">
                      {title}
                    </span>
                    <TypeTag k={typeKey} />
                  </div>
                  {description && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--color-fg-secondary)]">
                      {description}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ReaderPane({
  isIndex,
  entry,
  indexLines,
  indexAvailable,
  knownFilenames,
  hookForSelected,
  onSelect,
  onBack,
}: {
  isIndex: boolean;
  entry: MemoryEntry | null;
  indexLines: IndexLine[];
  indexAvailable: boolean;
  knownFilenames: Set<string>;
  hookForSelected: string | null;
  onSelect: (key: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  return (
    <article>
      <button
        type="button"
        onClick={onBack}
        className="md:hidden mb-4 inline-flex items-center font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]"
      >
        {t('memory.reader.back')}
      </button>

      {isIndex ? (
        <IndexBody
          indexLines={indexLines}
          indexAvailable={indexAvailable}
          knownFilenames={knownFilenames}
          onSelect={onSelect}
        />
      ) : entry ? (
        <EntryBody entry={entry} hookFromIndex={hookForSelected} />
      ) : (
        <p className="text-sm text-[var(--color-fg-muted)]">{t('memory.reader.noSelection')}</p>
      )}
    </article>
  );
}

function IndexBody({
  indexLines,
  indexAvailable,
  knownFilenames,
  onSelect,
}: {
  indexLines: IndexLine[];
  indexAvailable: boolean;
  knownFilenames: Set<string>;
  onSelect: (key: string) => void;
}) {
  const t = useT();
  if (!indexAvailable || indexLines.length === 0) {
    return <p className="text-sm text-[var(--color-fg-muted)]">{t('memory.index.empty')}</p>;
  }
  return (
    <div>
      <h2 className="font-display text-2xl font-light tracking-tight text-[var(--color-fg-primary)]">
        {t('memory.index.pseudoTitle')}
      </h2>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
        {t('memory.index.pseudoHook')}
      </p>
      <div className="rule-dotted mt-5" aria-hidden />
      <ol className="mt-5 space-y-1">
        {indexLines.map((line, i) => {
          if (!line.link) {
            const text = line.raw.trim();
            if (!text) return <li key={i} aria-hidden className="h-2" />;
            return (
              <li
                key={i}
                className="whitespace-pre-wrap break-words font-mono text-[12px] text-[var(--color-fg-faint)]"
              >
                {line.raw}
              </li>
            );
          }
          const link = line.link;
          const known = knownFilenames.has(link.href);
          if (!known) {
            return (
              <li
                key={i}
                title={t('memory.index.missing')}
                className="cursor-not-allowed py-1"
              >
                <div className="text-[14px] font-medium text-[var(--color-fg-faint)] line-through decoration-[var(--color-fg-faint)]/50">
                  {link.title}
                </div>
                {link.hook && (
                  <div className="mt-0.5 text-[12px] text-[var(--color-fg-faint)]">{link.hook}</div>
                )}
              </li>
            );
          }
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(link.href)}
                className="-mx-6 block w-[calc(100%+3rem)] px-6 py-1.5 text-left transition-colors hover:bg-[var(--color-sunken)] focus:bg-[var(--color-sunken)] focus:outline-none"
              >
                <div className="text-[14px] font-medium text-[var(--color-fg-primary)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]">
                  {link.title}
                </div>
                {link.hook && (
                  <div className="mt-0.5 text-[12px] text-[var(--color-fg-secondary)]">
                    {link.hook}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EntryBody({
  entry,
  hookFromIndex,
}: {
  entry: MemoryEntry;
  hookFromIndex: string | null;
}) {
  const t = useT();
  const typeKey: GroupKey = entry.type ?? 'other';
  const title = entry.name ?? entry.filename;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-2xl font-light tracking-tight text-[var(--color-fg-primary)]">
          {title}
        </h2>
        <TypeTag k={typeKey} />
      </div>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
        {entry.filename} · {formatBytes(entry.bytes)}
        {entry.mtime ? ` · ${formatRelativeTime(entry.mtime)}` : ''}
      </p>
      {entry.description && (
        <p className="mt-3 text-[14px] text-[var(--color-fg-secondary)]">{entry.description}</p>
      )}
      {hookFromIndex && (
        <div className="mt-5 rounded-md bg-[var(--color-sunken)] px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
            {t('memory.reader.appearsAs')}
          </div>
          <div className="mt-1 font-mono text-[12px] text-[var(--color-fg-primary)]">
            — [{title}]({entry.filename}){hookFromIndex ? ` — ${hookFromIndex}` : ''}
          </div>
        </div>
      )}
      <div className="rule-dotted mt-6" aria-hidden />
      <pre className="mt-5 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-sunken)] px-4 py-3 font-mono text-[12.5px] text-[var(--color-fg-primary)]">
        {entry.body.trim() || '—'}
      </pre>
    </div>
  );
}

function TypeTag({ k }: { k: GroupKey }) {
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
  return (
    <span className="shrink-0 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
      {label}
    </span>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (v: SortMode) => void;
}) {
  const t = useT();
  const options: { key: SortMode; label: string }[] = [
    { key: 'index', label: t('memory.sort.index') },
    { key: 'recent', label: t('memory.sort.recent') },
    { key: 'name', label: t('memory.sort.name') },
    { key: 'size', label: t('memory.sort.size') },
  ];
  const current = options.find((o) => o.key === value) ?? options[0]!;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.key === value)),
  );

  function commit(key: SortMode) {
    onChange(key);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openWith(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [open]);

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openWith(Math.max(0, options.findIndex((o) => o.key === value)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openWith(options.length - 1);
    }
  }

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) commit(opt.key);
    } else if (e.key === 'Tab') {
      setOpen(false); // let Tab move on naturally
    }
  }

  // Focus the menu when it opens so keyboard nav lands on it
  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openWith(Math.max(0, options.findIndex((o) => o.key === value))))}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('memory.sort.label')}
        title={t('memory.sort.label')}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] py-1.5 pl-3 pr-2.5 font-mono text-[11px] tracking-[0.02em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-hairline-strong)] hover:text-[var(--color-fg-primary)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        <SortIcon className="text-[var(--color-fg-muted)]" />
        <span>{current.label}</span>
        <ChevronDownIcon
          className={
            'text-[var(--color-fg-muted)] transition-transform ' + (open ? 'rotate-180' : '')
          }
        />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          aria-label={t('memory.sort.label')}
          aria-activedescendant={`sort-opt-${options[activeIndex]?.key ?? ''}`}
          className="absolute right-0 top-full z-20 mt-1.5 min-w-[12rem] rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-pop)] focus:outline-none"
        >
          {options.map((opt, i) => {
            const selected = opt.key === value;
            const active = i === activeIndex;
            return (
              <div
                key={opt.key}
                id={`sort-opt-${opt.key}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  // mousedown so click-outside doesn't fire first
                  e.preventDefault();
                  commit(opt.key);
                }}
                className={
                  'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[12.5px] transition-colors ' +
                  (active ? 'bg-[var(--color-sunken)] ' : '') +
                  (selected
                    ? 'text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]'
                    : 'text-[var(--color-fg-primary)]')
                }
              >
                <span>{opt.label}</span>
                {selected && <CheckIcon className="text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]" />}
              </div>
            );
          })}
        </div>
      )}
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

function SortIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7 4v16M3 8l4-4 4 4" />
      <path d="M17 20V4M13 16l4 4 4-4" />
    </svg>
  );
}

function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 12l5 5 11-12" />
    </svg>
  );
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

function comparator(
  mode: SortMode,
  orderByFilename: Map<string, number>,
): (a: MemoryEntry, b: MemoryEntry) => number {
  switch (mode) {
    case 'index': {
      // index-listed first (in index order), then non-indexed by filename
      const big = Number.POSITIVE_INFINITY;
      return (a, b) => {
        const oa = orderByFilename.get(a.filename) ?? big;
        const ob = orderByFilename.get(b.filename) ?? big;
        if (oa !== ob) return oa - ob;
        return a.filename.localeCompare(b.filename);
      };
    }
    case 'recent': {
      return (a, b) => {
        const ta = a.mtime ? Date.parse(a.mtime) : 0;
        const tb = b.mtime ? Date.parse(b.mtime) : 0;
        if (tb !== ta) return tb - ta;
        return a.filename.localeCompare(b.filename);
      };
    }
    case 'name': {
      return (a, b) => {
        const na = (a.name ?? a.filename).toLowerCase();
        const nb = (b.name ?? b.filename).toLowerCase();
        return na.localeCompare(nb);
      };
    }
    case 'size': {
      return (a, b) => {
        if (b.bytes !== a.bytes) return b.bytes - a.bytes;
        return a.filename.localeCompare(b.filename);
      };
    }
  }
}

