import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  trail?: ReactNode;
  accent?: boolean;
}

export default function StatCard({ label, value, unit, trail, accent }: Props) {
  return (
    <div
      className={
        'group relative overflow-hidden rounded-[14px] border bg-[var(--color-surface)] p-5 transition ' +
        (accent
          ? 'border-[var(--color-accent)]/40'
          : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]')
      }
    >
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[var(--color-accent-soft)] opacity-70 blur-2xl"
        />
      )}
      <div className="eyebrow">{label}</div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-light leading-none tracking-[-0.02em] tabular-nums text-[var(--color-fg-primary)]">
          {value}
        </span>
        {unit && (
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
            {unit}
          </span>
        )}
      </div>
      {trail && (
        <div className="mt-3 font-mono text-[11px] text-[var(--color-fg-muted)]">{trail}</div>
      )}
    </div>
  );
}
