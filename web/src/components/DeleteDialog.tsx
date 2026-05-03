import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  api,
  type DeleteRequestItem,
  type DeleteResult,
  type SessionSummary,
} from '../lib/api.ts';
import { RECENT_ACTIVITY_WINDOW_MIN } from '../lib/constants.ts';
import { formatBytes } from '../lib/format.ts';
import { queryKeys } from '../lib/query-keys.ts';

interface Props {
  projectId: string;
  selected: SessionSummary[];
  onClose: () => void;
}

export default function DeleteDialog({ projectId, selected, onClose }: Props) {
  const queryClient = useQueryClient();

  const willSkip = selected.filter((s) => s.isLivePid || s.isRecentlyActive);
  const willDelete = selected.filter((s) => !s.isLivePid && !s.isRecentlyActive);
  const totalFree = willDelete.reduce(
    (acc, s) =>
      acc +
      s.relatedBytes.jsonl +
      s.relatedBytes.subdir +
      s.relatedBytes.fileHistory +
      s.relatedBytes.sessionEnv,
    0,
  );

  const mutation = useMutation({
    mutationFn: (items: DeleteRequestItem[]) =>
      api<DeleteResult>('/api/sessions', {
        method: 'DELETE',
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSessions(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.diskUsage() });
    },
  });

  const isPendingRef = useRef(mutation.isPending);
  isPendingRef.current = mutation.isPending;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPendingRef.current) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const result = mutation.data;
  const showResult = !!result;

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-neutral-900/40 px-4 py-12"
      onClick={() => !mutation.isPending && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              {showResult ? 'Delete result' : 'Delete sessions'}
            </h2>
            {!showResult && (
              <p className="mt-1 text-sm text-neutral-600">
                {willDelete.length} will be removed · {willSkip.length} will be skipped ·
                ~{formatBytes(totalFree)} to free
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        {!showResult && (
          <div className="mt-4 max-h-[50vh] space-y-2 overflow-auto pr-1">
            {willDelete.map((s) => (
              <div
                key={s.id}
                className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs"
              >
                <div className="font-medium text-neutral-900">{s.title}</div>
                <div className="mt-0.5 truncate font-mono text-neutral-500">{s.id}</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-neutral-600 sm:grid-cols-4">
                  <span>jsonl {formatBytes(s.relatedBytes.jsonl)}</span>
                  <span>subdir {formatBytes(s.relatedBytes.subdir)}</span>
                  <span>file-history {formatBytes(s.relatedBytes.fileHistory)}</span>
                  <span>session-env {formatBytes(s.relatedBytes.sessionEnv)}</span>
                </div>
              </div>
            ))}
            {willSkip.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
                <div className="mb-1 font-medium text-amber-900">
                  These {willSkip.length} will be skipped:
                </div>
                <ul className="space-y-0.5">
                  {willSkip.map((s) => (
                    <li key={s.id} className="font-mono text-amber-800">
                      {s.id} — {skipReason(s)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {showResult && result && (
          <div className="mt-4 max-h-[50vh] space-y-3 overflow-auto pr-1 text-sm">
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
              Deleted {result.deleted.length} session(s) ·{' '}
              {formatBytes(result.deleted.reduce((a, d) => a + d.freedBytes, 0))} freed ·{' '}
              {result.historyLinesRemoved} history lines removed
            </div>
            {result.skipped.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
                <div className="mb-1 font-medium text-amber-900">
                  Skipped {result.skipped.length}:
                </div>
                <ul className="space-y-0.5">
                  {result.skipped.map((s) => (
                    <li key={s.sessionId} className="font-mono text-amber-800">
                      {s.sessionId} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {mutation.error && (
          <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {(mutation.error as Error).message}
          </p>
        )}

        <footer className="mt-5 flex justify-end gap-2">
          {!showResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  mutation.mutate(
                    selected.map((s) => ({ projectId, sessionId: s.id })),
                  )
                }
                disabled={mutation.isPending || willDelete.length === 0}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutation.isPending
                  ? 'Deleting…'
                  : `Delete ${willDelete.length} session${willDelete.length === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Done
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function skipReason(s: SessionSummary): string {
  if (s.isLivePid) return `live PID ${s.livePid}`;
  if (s.isRecentlyActive) return `modified within last ${RECENT_ACTIVITY_WINDOW_MIN} minutes`;
  return 'unknown';
}
