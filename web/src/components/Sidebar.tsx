import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HOTKEY_HINT } from '../lib/hotkeys.ts';
import { useT } from '../lib/i18n.ts';
import LocaleToggle from './LocaleToggle.tsx';
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

export default function Sidebar({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const t = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
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
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="flex h-[68px] items-center px-5">
          <Brand />
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
              className="surface-card is-interactive flex w-full items-center gap-2.5 px-3 py-3 text-left"
              style={{ borderRadius: 'var(--radius-input)' }}
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
                      'group flex items-center gap-3 rounded-[var(--radius-input)] border px-3.5 py-2.5 text-sm transition ' +
                      (isActive
                        ? 'border-transparent bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]'
                        : 'border-transparent text-[var(--color-fg-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg-primary)]')
                    }
                  >
                    <span
                      className={
                        'transition-colors ' +
                        (isActive
                          ? 'text-[var(--color-accent)]'
                          : 'text-[var(--color-fg-muted)] group-hover:text-[var(--color-accent)]')
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

// Claude-style sunburst mark — radiating spokes of alternating length, evoking
// the Anthropic starburst without copying it.
function Glyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <g>
        <path d="M12 3.5v4.2" />
        <path d="M12 16.3v4.2" />
        <path d="M3.5 12h4.2" />
        <path d="M16.3 12h4.2" />
      </g>
      <g opacity="0.6">
        <path d="M6.3 6.3l2.6 2.6" />
        <path d="M15.1 15.1l2.6 2.6" />
        <path d="M6.3 17.7l2.6-2.6" />
        <path d="M15.1 8.9l2.6-2.6" />
      </g>
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
