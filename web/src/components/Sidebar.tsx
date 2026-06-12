import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { HOTKEY_HINT } from '../lib/hotkeys.ts';
import { api, type SessionSummary } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';
import DeleteDialog from './DeleteDialog.tsx';
import LocaleToggle from './LocaleToggle.tsx';
import StatusDot from './StatusDot.tsx';
import ThemeToggle from './ThemeToggle.tsx';
import VersionNotice, { useVersionInfo } from './VersionNotice.tsx';

interface NavItem {
  to: string;
  labelKey: 'nav.projects' | 'nav.disk' | 'nav.import';
  icon: ReactNode;
  match: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  {
    to: '/',
    labelKey: 'nav.projects',
    icon: <FolderIcon />,
    match: (p) => p === '/' || p.startsWith('/projects/'),
  },
  {
    to: '/disk',
    labelKey: 'nav.disk',
    icon: <DiskIcon />,
    match: (p) => p === '/disk' || p.startsWith('/disk/'),
  },
  {
    to: '/import',
    labelKey: 'nav.import',
    icon: <ImportIcon />,
    match: (p) => p === '/import' || p.startsWith('/import/'),
  },
];

const COLLAPSE_KEY = 'sidebar-collapsed';

// Desktop collapse state (Claude-style "Close sidebar"). Persisted to localStorage
// so the choice survives reloads; mobile uses the separate `open` drawer state.
function useCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setCollapsed = (v: boolean) => {
    setState(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
      /* storage might be blocked — fall back to in-memory */
    }
  };
  return [collapsed, setCollapsed];
}

// Current session id from the URL, so the matching Recents row can highlight.
function activeSessionId(pathname: string): string | null {
  const m = pathname.match(/\/sessions\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export default function Sidebar({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const t = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useCollapsed(); // desktop collapse
  const hasUpdate = useVersionInfo().data?.hasUpdate ?? false;

  useEffect(() => {
    const handler = () => setOpen(false);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <>
      <div className="topbar-glass sticky top-0 z-40 flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-3 lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {onSearchOpen && (
            <button
              type="button"
              onClick={onSearchOpen}
              aria-label={t('search.action.open')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-hairline)] text-[var(--color-fg-secondary)] hover:border-[var(--color-hairline-strong)] hover:text-[var(--color-accent)]"
            >
              <SearchIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t('nav.toggleNav')}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-hairline)] text-[var(--color-fg-secondary)] hover:border-[var(--color-hairline-strong)]"
          >
            <MenuIcon open={open} />
            {hasUpdate && !open && (
              <span
                aria-hidden
                className="absolute right-1 top-1 inline-flex h-2 w-2"
                title={t('version.modal.eyebrowUpdate')}
              >
                <span className="absolute inset-0 rounded-full bg-[var(--color-danger)] pulse-danger" />
                <span className="absolute inset-0 rounded-full bg-[var(--color-danger)]" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Desktop reopen handle — floats over the page only while the sidebar is
          collapsed (lg+). On mobile the topbar hamburger already covers this. */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={t('nav.openSidebar')}
          title={t('nav.openSidebar')}
          className="fixed left-3 top-3 z-40 hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-fg-secondary)] shadow-[var(--shadow-rise)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] lg:inline-flex"
        >
          <PanelLeftIcon />
        </button>
      )}

      {open && (
        <button
          type="button"
          aria-label={t('nav.closeNav')}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-[var(--color-canvas)]/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-sunken)] transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ' +
          (open ? 'translate-x-0 ' : '-translate-x-full ') +
          (collapsed ? 'lg:hidden' : '')
        }
      >
        <div className="flex h-[68px] items-center justify-between px-5">
          <Brand />
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label={t('nav.closeSidebar')}
            title={t('nav.closeSidebar')}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-fg-primary)] lg:inline-flex"
          >
            <PanelLeftIcon />
          </button>
        </div>

        {onSearchOpen && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSearchOpen();
              }}
              aria-label={t('search.action.open')}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-input)] border border-[var(--color-hairline)] px-3 py-2.5 text-left transition hover:border-[var(--color-hairline-strong)] hover:bg-[var(--sidebar-hover)]"
            >
              <SearchIcon className="text-[var(--color-fg-muted)]" />
              <span className="flex-1 truncate text-[13px] text-[var(--color-fg-muted)]">
                {t('search.action.open')}
              </span>
              <kbd className="rounded border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
                {HOTKEY_HINT}
              </kbd>
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-4 py-3">
          <p className="eyebrow px-2 pb-2">{t('nav.workspace')}</p>
          <ul className="space-y-1">
            {NAV.map((item) => {
              const isActive = item.match(pathname);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={
                      'group flex items-center gap-3 rounded-[var(--radius-input)] px-3.5 py-2.5 text-sm transition ' +
                      (isActive
                        ? 'bg-[var(--sidebar-active)] font-medium text-[var(--color-fg-primary)]'
                        : 'text-[var(--color-fg-secondary)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--color-fg-primary)]')
                    }
                  >
                    <span
                      className={
                        'transition-colors ' +
                        (isActive
                          ? 'text-[var(--color-fg-primary)]'
                          : 'text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg-secondary)]')
                      }
                    >
                      {item.icon}
                    </span>
                    <span className="font-medium tracking-tight">{t(item.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <RecentsSection
            activeId={activeSessionId(pathname)}
            onNavigate={() => setOpen(false)}
          />
        </nav>

        <div className="surface-card mx-4 mb-4 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{t('nav.language')}</span>
            <LocaleToggle />
          </div>
          <div className="flex items-center justify-between">
            <span className="eyebrow">{t('nav.theme')}</span>
            <ThemeToggle />
          </div>
          <VersionNotice />
          <p className="font-mono text-[10px] leading-snug text-[var(--color-fg-faint)]">
            {t('app.brand.footnote')}
          </p>
        </div>
      </aside>
    </>
  );
}

// Recent sessions across every project — the Claude-style "Recents" list. Polls
// briefly while any listed session is live/recent so the activity dots stay live;
// the poll self-terminates once everything goes idle.
function RecentsSection({
  activeId,
  onNavigate,
}: {
  activeId: string | null;
  onNavigate: () => void;
}) {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.recentSessions(),
    queryFn: () => api<SessionSummary[]>('/api/sessions/recent?limit=10'),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => s.isLivePid || s.isRecentlyActive) ? 5000 : false,
  });
  const recents = data ?? [];
  // Deletion path from the sidebar (Claude-style Recents hover action). The dialog
  // is portaled to <body>: rendered inside the <aside> its `transform` would trap
  // the fixed overlay. DeleteDialog already invalidates the recents query on success.
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null);

  return (
    <div className="mt-6">
      <p className="eyebrow px-2 pb-2">{t('nav.recents')}</p>
      {isLoading && recents.length === 0 ? (
        <p className="px-2 py-1 font-mono text-[11px] text-[var(--color-fg-faint)]">
          {t('recents.loading')}
        </p>
      ) : recents.length === 0 ? (
        <p className="px-2 py-1 text-[12px] leading-snug text-[var(--color-fg-faint)]">
          {t('recents.empty')}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {recents.map((s) => (
            <li key={s.id}>
              <RecentRow
                session={s}
                active={s.id === activeId}
                onNavigate={onNavigate}
                onDelete={() => setToDelete(s)}
              />
            </li>
          ))}
        </ul>
      )}

      {toDelete &&
        createPortal(
          <DeleteDialog
            projectId={toDelete.projectId}
            selected={[toDelete]}
            onClose={() => setToDelete(null)}
            onDeleted={() => setToDelete(null)}
          />,
          document.body,
        )}
    </div>
  );
}

function RecentRow({
  session,
  active,
  onNavigate,
  onDelete,
}: {
  session: SessionSummary;
  active: boolean;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const title = session.customTitle ?? session.title;
  return (
    <div className="group relative">
      <Link
        to={`/projects/${encodeURIComponent(session.projectId)}/sessions/${encodeURIComponent(session.id)}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        title={title}
        className={
          'flex items-center gap-2.5 rounded-[var(--radius-input)] py-2 pl-2.5 pr-8 text-[13px] transition ' +
          (active
            ? 'bg-[var(--sidebar-active)] font-medium text-[var(--color-fg-primary)]'
            : 'text-[var(--color-fg-secondary)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--color-fg-primary)]')
        }
      >
        <span className="shrink-0">
          <StatusDot session={session} withLabel={false} />
        </span>
        <span className="min-w-0 flex-1 truncate tracking-tight">{title}</span>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('session.action.delete')}
        title={t('session.action.delete')}
        className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-fg-faint)] opacity-0 transition hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)] focus:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon />
      </button>
    </div>
  );
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

function Brand() {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center rounded-[0.7rem] bg-[var(--color-accent)] text-[var(--color-surface)] shadow-[var(--shadow-rise)]"
      >
        <Glyph />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-display text-[17px] font-medium tracking-[-0.01em] text-[var(--color-fg-primary)]">
          {t('app.brand.title')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('app.brand.subtitle')}
        </span>
      </span>
    </div>
  );
}

// Anthropic-style starburst mark — twelve radiating spokes of alternating length
// converging on a common core, the dense solid burst Claude uses, rendered with
// round-capped strokes so it stays crisp inside the 18px brand square.
function Glyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      {/* long spokes (every 60°) */}
      <path d="M13.8 12 L21.4 12" />
      <path d="M12.9 10.44 L16.7 3.86" />
      <path d="M11.1 10.44 L7.3 3.86" />
      <path d="M10.2 12 L2.6 12" />
      <path d="M11.1 13.56 L7.3 20.14" />
      <path d="M12.9 13.56 L16.7 20.14" />
      {/* short spokes interleaved (every 60°, offset 30°) */}
      <path d="M13.56 11.1 L17.89 8.6" />
      <path d="M12 10.2 L12 5.2" />
      <path d="M10.44 11.1 L6.11 8.6" />
      <path d="M10.44 12.9 L6.11 15.4" />
      <path d="M12 13.8 L12 18.8" />
      <path d="M13.56 12.9 L17.89 15.4" />
    </svg>
  );
}

// panel-left toggle, shared by "Close sidebar" (inside) and "Open sidebar" (float).
function PanelLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9 4.5v15" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2a1.5 1.5 0 0 1 1.05.43l1.34 1.32A1.5 1.5 0 0 0 12.14 7.2H19.5A1.5 1.5 0 0 1 21 8.7v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
    </svg>
  );
}

function DiskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="12" cy="6.5" rx="8" ry="2.5" />
      <path d="M4 6.5v5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-5" />
      <path d="M4 11.5v5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-5" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 14V3" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
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

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h12" />
        </>
      )}
    </svg>
  );
}
