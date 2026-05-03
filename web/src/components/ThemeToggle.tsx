import { useTheme } from '../lib/theme.ts';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light' : 'Dark'}
      className={
        'group inline-flex h-9 w-16 items-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-1 transition hover:border-[var(--color-hairline-strong)] ' +
        className
      }
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-fg-secondary)] shadow-[var(--shadow-rise)] transition-transform duration-300"
        style={{ transform: isDark ? 'translateX(28px)' : 'translateX(0)' }}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.5 14.4A8.5 8.5 0 1 1 9.6 3.5a7 7 0 0 0 10.9 10.9z" />
    </svg>
  );
}
