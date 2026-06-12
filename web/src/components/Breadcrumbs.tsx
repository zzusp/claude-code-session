import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
  mono?: boolean;
  icon?: ReactNode;
}

const ITEM_BASE = 'inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5';

// Plain inline breadcrumb — claude.ai keeps these unboxed, muted, on the canvas.
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="inline-flex max-w-full items-center gap-0.5 overflow-hidden text-[13px]"
    >
      {items.map((c, i) => {
        const last = i === items.length - 1;
        const family = c.mono ? 'font-mono' : 'font-sans';
        const tone = last
          ? 'text-[var(--color-fg-primary)]'
          : 'text-[var(--color-fg-muted)]';
        const inner = (
          <>
            {c.icon && <span className="shrink-0 text-[var(--color-fg-faint)]">{c.icon}</span>}
            <span className="truncate">{c.label}</span>
          </>
        );
        return (
          <Fragment key={`${c.label}-${i}`}>
            {c.to && !last ? (
              <Link
                to={c.to}
                className={`${ITEM_BASE} ${family} ${tone} transition-colors duration-150 hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]`}
              >
                {inner}
              </Link>
            ) : (
              <span
                className={`${ITEM_BASE} ${family} ${tone}`}
                aria-current={last ? 'page' : undefined}
              >
                {inner}
              </span>
            )}
            {!last && <ChevronSep />}
          </Fragment>
        );
      })}
    </nav>
  );
}

function ChevronSep() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[var(--color-fg-faint)]"
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function BreadcrumbFolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2a1.5 1.5 0 0 1 1.05.43l1.34 1.32A1.5 1.5 0 0 0 12.14 7.2H19.5A1.5 1.5 0 0 1 21 8.7v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
    </svg>
  );
}
