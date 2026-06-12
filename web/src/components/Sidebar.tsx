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
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-canvas)] px-4 py-3 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          {onSearchOpen && (
            <button
              type="button"
              onClick={onSearchOpen}
              aria-label={t('search.action.open')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
            >
              <SearchIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t('nav.toggleNav')}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
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
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-canvas)] transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        {/* Brand row — serif wordmark + search affordance, claude.ai style */}
        <div className="flex h-14 items-center justify-between pl-4 pr-3">
          <Brand />
          {onSearchOpen && (
            <button
              type="button"
              onClick={onSearchOpen}
              aria-label={t('search.action.open')}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-fg-muted)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)] lg:inline-flex"
            >
              <SearchIcon />
            </button>
          )}
        </div>

        {/* Prominent search row — the app's primary action, styled like "New chat" */}
        {onSearchOpen && (
          <div className="px-2 pb-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSearchOpen();
              }}
              aria-label={t('search.action.open')}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] text-[var(--color-fg-secondary)] transition-colors hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-hairline-strong)] text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg-primary)]">
                <SearchIcon className="!h-3.5 !w-3.5" />
              </span>
              <span className="flex-1 truncate">{t('search.action.open')}</span>
              <kbd className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-faint)]">
                {HOTKEY_HINT}
              </kbd>
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-medium text-[var(--color-fg-muted)]">
            {t('nav.workspace')}
          </p>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const isActive = item.match(pathname);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={
                      'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] transition-colors ' +
                      (isActive
                        ? 'bg-[var(--color-sunken)] font-medium text-[var(--color-fg-primary)]'
                        : 'text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]')
                    }
                  >
                    <span
                      className={
                        'transition-colors ' +
                        (isActive
                          ? 'text-[var(--color-fg-primary)]'
                          : 'text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg-primary)]')
                      }
                    >
                      {item.icon}
                    </span>
                    <span>{t(item.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom — flat account-style strip (claude.ai puts the user row here) */}
        <div className="mt-auto border-t border-[var(--color-hairline)] px-3 py-3">
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[12px] text-[var(--color-fg-muted)]">{t('nav.language')}</span>
            <LocaleToggle />
          </div>
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[12px] text-[var(--color-fg-muted)]">{t('nav.theme')}</span>
            <ThemeToggle />
          </div>
          <div className="px-1.5 pt-1.5">
            <VersionNotice />
          </div>
        </div>
      </aside>
    </>
  );
}

function Brand() {
  const t = useT();
  return (
    <Link to="/" className="flex items-center gap-2" aria-label={t('app.brand.title')}>
      <span aria-hidden className="text-[var(--color-accent)]">
        <Glyph />
      </span>
      <span className="font-display text-[19px] font-medium leading-none tracking-[-0.01em] text-[var(--color-fg-primary)]">
        {t('app.brand.title')}
      </span>
    </Link>
  );
}

// Clay sunburst mark — echoes claude.ai's home glyph; radiating spokes.
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
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2a1.5 1.5 0 0 1 1.05.43l1.34 1.32A1.5 1.5 0 0 0 12.14 7.2H19.5A1.5 1.5 0 0 1 21 8.7v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
    </svg>
  );
}

function DiskIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="12" cy="6.5" rx="8" ry="2.5" />
      <path d="M4 6.5v5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-5" />
      <path d="M4 11.5v5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-5" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
