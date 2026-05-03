import type { SessionSummary } from '../lib/api.ts';
import { RECENT_ACTIVITY_WINDOW_MIN } from '../lib/constants.ts';

export default function StatusBadge({ session }: { session: SessionSummary }) {
  if (session.isLivePid) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700"
        title={`PID ${session.livePid} is alive and registered for this session`}
      >
        live · pid {session.livePid}
      </span>
    );
  }
  if (session.isRecentlyActive) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700"
        title={`jsonl modified within the last ${RECENT_ACTIVITY_WINDOW_MIN} minutes — could still be in use`}
      >
        recently active
      </span>
    );
  }
  return <span className="text-xs text-neutral-400">idle</span>;
}
