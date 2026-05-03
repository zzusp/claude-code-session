import { highlight } from '../lib/highlight.ts';

export default function HighlightedText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const segments = highlight(text, query);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="rounded-sm bg-[var(--color-accent-soft)] px-0.5 text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
