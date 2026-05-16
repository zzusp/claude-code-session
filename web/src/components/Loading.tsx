type LoadingProps = {
  label: string;
  className?: string;
};

export function Loading({ label, className }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={['flex flex-col gap-2.5', className].filter(Boolean).join(' ')}
    >
      <span className="eyebrow tabular-nums">{label}</span>
      <span aria-hidden className="loading-rule" />
    </div>
  );
}

export function LoadingDots({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={['loading-dots', className].filter(Boolean).join(' ')}
    >
      <span />
      <span />
      <span />
    </span>
  );
}

export default Loading;
