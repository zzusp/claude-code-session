import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
  mono?: boolean;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        const cls =
          (c.mono ? 'font-mono ' : 'font-sans ') +
          (last
            ? 'text-[var(--color-fg-secondary)]'
            : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]');
        return (
          <Fragment key={`${c.label}-${i}`}>
            {c.to && !last ? (
              <Link to={c.to} className={cls + ' max-w-[18rem] truncate transition'}>
                {c.label}
              </Link>
            ) : (
              <span className={cls + ' max-w-[24rem] truncate'} aria-current={last ? 'page' : undefined}>
                {c.label}
              </span>
            )}
            {!last && (
              <span aria-hidden className="font-display text-[var(--color-fg-faint)] italic">
                /
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
