import { useLocale } from '../lib/i18n.ts';

export default function LocaleToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div
      role="group"
      aria-label="Language"
      className={
        'inline-flex h-9 items-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-sunken)] p-0.5 text-[11px] font-medium ' +
        className
      }
    >
      <Pill active={locale === 'en'} onClick={() => setLocale('en')} label="EN" />
      <Pill active={locale === 'zh'} onClick={() => setLocale('zh')} label="中" />
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'h-7 min-w-[2rem] rounded-full px-2 transition ' +
        (active
          ? 'bg-[var(--color-surface)] text-[var(--color-fg-primary)] shadow-[var(--shadow-rise)]'
          : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]')
      }
    >
      {label}
    </button>
  );
}
