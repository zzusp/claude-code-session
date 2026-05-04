import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchBlockKind, SearchDone, SearchSessionHit, SearchSnippet } from '../lib/api.ts';
import { formatRelativeTime } from '../lib/format.ts';
import { HOTKEY_HINT } from '../lib/hotkeys.ts';
import { useT } from '../lib/i18n.ts';
import { streamSearch } from '../lib/search-stream.ts';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 220;

interface FlatItem {
  hit: SearchSessionHit;
  snippet: SearchSnippet;
  hitIndex: number;
  snippetIndex: number;
  flatIndex: number;
}

export default function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchSessionHit[]>([]);
  const [done, setDone] = useState<SearchDone | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const flatItems: FlatItem[] = useMemo(() => {
    const out: FlatItem[] = [];
    let flat = 0;
    hits.forEach((hit, hitIndex) => {
      hit.snippets.forEach((snippet, snippetIndex) => {
        out.push({ hit, snippet, hitIndex, snippetIndex, flatIndex: flat++ });
      });
    });
    return out;
  }, [hits]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      runSearch(trimmedQuery);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [hits.length]);

  useEffect(() => {
    if (!open) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setQuery('');
      setHits([]);
      setDone(null);
      setError(null);
      setLoading(false);
      setActiveIndex(0);
      return;
    }
    // Focus input on open. requestAnimationFrame ensures the dialog is in the DOM.
    let raf = 0;
    raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    function onWindowKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onWindowKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onWindowKey);
    };
  }, [open, onClose]);

  const runSearch = useCallback((q: string) => {
    controllerRef.current?.abort();
    if (q.length < MIN_QUERY) {
      setHits([]);
      setDone(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setHits([]);
    setDone(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        for await (const event of streamSearch({ query: q, signal: controller.signal })) {
          if (controller.signal.aborted) return;
          if (event.type === 'session') {
            setHits((prev) => [...prev, event]);
          } else if (event.type === 'done') {
            setDone(event);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
  }, []);

  const navigateToSnippet = useCallback(
    (hit: SearchSessionHit, snippet: SearchSnippet) => {
      const params = new URLSearchParams({ focus: snippet.uuid, q: trimmedQuery });
      navigate(
        `/projects/${encodeURIComponent(hit.projectId)}/sessions/${encodeURIComponent(hit.sessionId)}?${params.toString()}`,
      );
      onClose();
    },
    [navigate, onClose, trimmedQuery],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Escape is handled at window level (works regardless of focus).
    if (flatItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(flatItems.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) navigateToSnippet(item.hit, item.snippet);
    }
  }

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-flat-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const showEmpty = trimmedQuery.length === 0;
  const showRefine = !showEmpty && trimmedQuery.length < MIN_QUERY;
  const showNoResults = !loading && !error && trimmedQuery.length >= MIN_QUERY && hits.length === 0 && done !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] sm:px-6">
      <button
        type="button"
        aria-label={t('delete.close')}
        onClick={onClose}
        className="fixed inset-0 bg-[var(--color-canvas)]/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.action.open')}
        className="relative z-10 w-full max-w-2xl rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
        onKeyDown={onKeyDown}
      >
        <header className="flex items-center gap-3 border-b border-[var(--color-hairline)] px-5 py-4">
          <SearchIcon className="text-[var(--color-fg-muted)]" />
          <input
            ref={inputRef}
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent text-[15px] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-faint)] focus:outline-none"
          />
          {loading && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              {t('search.scanning')}
            </span>
          )}
        </header>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto px-1 py-2">
          {showEmpty && (
            <Hint>{t('search.empty')}</Hint>
          )}
          {showRefine && (
            <Hint>{t('search.refineQuery')}</Hint>
          )}
          {error && (
            <Hint tone="danger">{t('search.error', { msg: error })}</Hint>
          )}
          {showNoResults && (
            <Hint>{t('search.noResults')}</Hint>
          )}

          {hits.map((hit, hitIndex) => (
            <SessionGroup
              key={`${hit.projectId}/${hit.sessionId}`}
              hit={hit}
              hitIndex={hitIndex}
              flatItems={flatItems}
              activeIndex={activeIndex}
              query={trimmedQuery}
              onPick={navigateToSnippet}
              onHover={setActiveIndex}
            />
          ))}

          {done?.truncated && (
            <Hint>{t('search.moreSessions', { n: done.matched })}</Hint>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--color-hairline)] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          <span>{t('search.shortcut', { hint: HOTKEY_HINT })} · {t('search.escapeHint')}</span>
          {done && hits.length > 0 && (
            <span>
              {t('search.summary', {
                matched: done.matched,
                scanned: done.scanned,
                ms: done.durationMs,
              })}
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}

function SessionGroup({
  hit,
  hitIndex,
  flatItems,
  activeIndex,
  query,
  onPick,
  onHover,
}: {
  hit: SearchSessionHit;
  hitIndex: number;
  flatItems: FlatItem[];
  activeIndex: number;
  query: string;
  onPick: (hit: SearchSessionHit, snippet: SearchSnippet) => void;
  onHover: (flatIndex: number) => void;
}) {
  const t = useT();
  const title = hit.customTitle ?? hit.title;
  const projectTail = useMemo(() => {
    const parts = hit.projectDecodedCwd.split(/[\\/]+/).filter(Boolean);
    return parts.at(-1) ?? hit.projectDecodedCwd;
  }, [hit.projectDecodedCwd]);

  return (
    <div className="px-2 pb-1 pt-3">
      <div className="flex items-baseline justify-between gap-3 px-2">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {projectTail}
          </span>
          <span className="truncate font-display text-[13px] text-[var(--color-fg-primary)]">
            {title}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)]">
          {formatRelativeTime(hit.lastAt)}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {hit.snippets.map((snippet, i) => {
          const item = flatItems.find(
            (f) => f.hitIndex === hitIndex && f.snippetIndex === i,
          );
          const flat = item?.flatIndex ?? -1;
          const active = flat === activeIndex;
          return (
            <li key={`${snippet.uuid}-${i}`}>
              <button
                type="button"
                data-flat-index={flat}
                onMouseEnter={() => onHover(flat)}
                onClick={() => onPick(hit, snippet)}
                className={
                  'block w-full rounded-[var(--radius-control)] px-3 py-2 text-left transition ' +
                  (active
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]'
                    : 'text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)]')
                }
              >
                <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
                  <span>{t(`search.role.${snippet.role}` as const)}</span>
                  <span>·</span>
                  <span>{kindLabel(snippet.blockKind, t)}</span>
                </div>
                <p className="mt-1 truncate text-[13px] leading-relaxed">
                  <span className="text-[var(--color-fg-faint)]">{snippet.before}</span>
                  <mark className="rounded-sm bg-[var(--color-accent-soft)] px-0.5 font-medium text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
                    {snippet.match}
                  </mark>
                  <span className="text-[var(--color-fg-faint)]">{snippet.after}</span>
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      {hit.hasMore && (
        <p className="px-3 pt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
          {t('search.moreInSession')}
        </p>
      )}
    </div>
  );
}

function kindLabel(
  kind: SearchBlockKind,
  t: ReturnType<typeof useT>,
): string {
  switch (kind) {
    case 'text':
      return t('search.kindText');
    case 'tool_use':
      return t('search.kindToolUse');
    case 'tool_result':
      return t('search.kindToolResult');
    case 'thinking':
      return t('search.kindThinking');
  }
}

function Hint({
  children,
  tone = 'normal',
}: {
  children: React.ReactNode;
  tone?: 'normal' | 'danger';
}) {
  const cls =
    tone === 'danger'
      ? 'text-[var(--color-danger)]'
      : 'text-[var(--color-fg-muted)]';
  return (
    <p className={`px-5 py-6 text-center text-sm ${cls}`}>{children}</p>
  );
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
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
