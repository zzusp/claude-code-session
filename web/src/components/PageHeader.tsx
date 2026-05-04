import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  /** Plain-text version of the title used as the input's initial value during edit. */
  editableValue?: string;
  /** When provided, an edit affordance appears next to the title. */
  onTitleEdit?: (next: string) => Promise<void>;
}

export default function PageHeader({
  eyebrow,
  title,
  actions,
  meta,
  editableValue,
  onTitleEdit,
}: Props) {
  return (
    <header className="relative">
      {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <TitleSlot
            title={title}
            editableValue={editableValue}
            onTitleEdit={onTitleEdit}
          />
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {meta && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
          {meta}
        </div>
      )}
    </header>
  );
}

const TITLE_CLASS =
  'font-display text-[clamp(1.375rem,2.4vw,1.75rem)] font-light leading-[1.15] tracking-[-0.015em] text-[var(--color-fg-primary)]';

function TitleSlot({
  title,
  editableValue,
  onTitleEdit,
}: {
  title: ReactNode;
  editableValue?: string;
  onTitleEdit?: Props['onTitleEdit'];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editableValue ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing && editableValue !== undefined) setDraft(editableValue);
  }, [editing, editableValue]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!onTitleEdit) {
    return <h1 className={TITLE_CLASS}>{title}</h1>;
  }

  function startEdit() {
    setDraft(editableValue ?? '');
    setError(null);
    setEditing(true);
  }

  async function commit() {
    const next = draft.trim();
    if (!onTitleEdit || !next || next === (editableValue ?? '')) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onTitleEdit(next);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (editing) {
    return (
      <div>
        <input
          ref={inputRef}
          value={draft}
          disabled={submitting}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
              setError(null);
            }
          }}
          onBlur={() => {
            if (!submitting) {
              setEditing(false);
              setError(null);
            }
          }}
          maxLength={200}
          className={
            TITLE_CLASS +
            ' w-full bg-transparent border-b border-[var(--color-accent)] outline-none focus:outline-none disabled:opacity-60'
          }
        />
        {error && (
          <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3">
      <h1 className={TITLE_CLASS}>{title}</h1>
      <button
        type="button"
        onClick={startEdit}
        aria-label="Rename"
        title="Rename"
        className="flex-shrink-0 rounded-xl p-1.5 text-[var(--color-fg-muted)] opacity-0 transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)] focus:opacity-100 group-hover:opacity-100"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-[var(--color-fg-primary)]">{value}</span>
    </span>
  );
}

export function Sep() {
  return <span aria-hidden className="text-[var(--color-fg-faint)]">·</span>;
}
