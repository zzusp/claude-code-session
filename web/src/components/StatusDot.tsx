import type { SessionSummary } from '../lib/api.ts';
import { RECENT_ACTIVITY_WINDOW_MIN } from '../lib/constants.ts';
import { useT } from '../lib/i18n.ts';

type Variant = 'working' | 'live' | 'recent' | 'idle';

function variantOf(s: SessionSummary): Variant {
  if (s.isWorking) return 'working';
  if (s.isLivePid) return 'live';
  if (s.isRecentlyActive) return 'recent';
  return 'idle';
}

export function StatusDot({ session, withLabel = true }: { session: SessionSummary; withLabel?: boolean }) {
  const t = useT();
  const v = variantOf(session);
  const title =
    v === 'working'
      ? t('status.tooltip.working')
      : v === 'live'
        ? t('status.tooltip.live', { pid: session.livePid ?? '?' })
        : v === 'recent'
          ? t('status.tooltip.recent', { n: RECENT_ACTIVITY_WINDOW_MIN })
          : t('status.tooltip.idle');

  const label =
    v === 'working'
      ? t('status.working')
      : v === 'live'
        ? t('status.live', { pid: session.livePid ?? '?' })
        : v === 'recent'
          ? t('status.recent')
          : t('status.idle');

  // working + live share the accent ink; recent stays secondary; idle is faintest.
  const labelClass =
    v === 'idle'
      ? 'text-[var(--color-fg-faint)]'
      : v === 'recent'
        ? 'text-[var(--color-fg-secondary)]'
        : 'text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]';

  return (
    <span title={title} className="inline-flex items-center gap-2 text-xs">
      <Dot variant={v} />
      {withLabel && (
        <span className={'font-mono uppercase tracking-[0.14em] ' + labelClass}>{label}</span>
      )}
    </span>
  );
}

function Dot({ variant }: { variant: Variant }) {
  if (variant === 'working') {
    // Marching three-dot breather — reads as "actively doing something", distinct
    // from the live pulse (idle-but-alive).
    return (
      <span aria-hidden className="loading-dots text-[var(--color-accent)]">
        <span />
        <span />
        <span />
      </span>
    );
  }
  if (variant === 'live') {
    return (
      <span aria-hidden className="relative inline-flex h-2.5 w-2.5">
        <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] pulse-amber" />
        <span className="absolute inset-0 rounded-full bg-[var(--color-accent)]" />
      </span>
    );
  }
  if (variant === 'recent') {
    return (
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--color-hairline-strong)]"
    />
  );
}

export default StatusDot;
