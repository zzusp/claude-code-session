import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useT } from '../lib/i18n.ts';
import LocaleToggle from './LocaleToggle.tsx';
import ThemeToggle from './ThemeToggle.tsx';

interface NavItem {
  to: string;
  labelKey: 'nav.projects' | 'nav.disk';
  end?: boolean;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { to: '/', end: true, labelKey: 'nav.projects', icon: <FolderIcon /> },
  { to: '/disk', labelKey: 'nav.disk', icon: <DiskIcon /> },
];

export default function Sidebar() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(false);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={t('nav.toggleNav')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-hairline)] text-[var(--color-fg-secondary)] hover:border-[var(--color-hairline-strong)]"
        >
          <MenuIcon open={open} />
        </button>
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
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)] transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="flex h-16 items-center border-b border-[var(--color-hairline)] px-5">
          <Brand />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="eyebrow px-2 pb-2">{t('nav.workspace')}</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    'group relative flex items-center gap-3 rounded-md px-2 py-2 text-sm transition ' +
                    (isActive
                      ? 'bg-[var(--color-sunken)] text-[var(--color-fg-primary)]'
                      : 'text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden
                        className={
                          'absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm bg-[var(--color-accent)] transition-transform duration-200 origin-top ' +
                          (isActive ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-100')
                        }
                      />
                      <span className="text-[var(--color-fg-muted)] group-hover:text-[var(--color-accent)]">
                        {item.icon}
                      </span>
                      <span className="font-medium tracking-tight">{t(item.labelKey)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-[var(--color-hairline)] px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{t('nav.language')}</span>
            <LocaleToggle />
          </div>
          <div className="flex items-center justify-between">
            <span className="eyebrow">{t('nav.theme')}</span>
            <ThemeToggle />
          </div>
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--color-hairline-strong)] bg-[var(--color-sunken)] text-[var(--color-accent)]"
      >
        <Glyph />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-display text-[15px] font-medium tracking-tight text-[var(--color-fg-primary)]">
          {t('app.brand.title')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('app.brand.subtitle')}
        </span>
      </span>
    </div>
  );
}

function Glyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M19 7.5A8 8 0 1 0 19 16.5" />
      <path d="M15.5 9.5a4.5 4.5 0 1 0 0 5" opacity="0.45" />
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
