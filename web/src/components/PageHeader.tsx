import type { ReactNode } from 'react';

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  tagline?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}

export default function PageHeader({ eyebrow, title, tagline, actions, meta }: Props) {
  return (
    <header className="relative">
      {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[clamp(2rem,4.2vw,3rem)] font-light leading-[1.05] tracking-[-0.02em] text-[var(--color-fg-primary)]">
            {title}
          </h1>
          {tagline && (
            <p className="mt-2 max-w-2xl font-display text-[15px] italic text-[var(--color-fg-muted)]">
              {tagline}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {meta && (
        <>
          <div className="rule-dotted mt-6" aria-hidden />
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs">
            {meta}
          </div>
        </>
      )}
    </header>
  );
}

export function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-[var(--color-fg-primary)]">{value}</span>
    </div>
  );
}
