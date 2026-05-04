import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import {
  api,
  type DeleteRequestItem,
  type DeleteResult,
  type SessionSummary,
} from '../lib/api.ts';
import { RECENT_ACTIVITY_WINDOW_MIN } from '../lib/constants.ts';
import { formatBytes } from '../lib/format.ts';
import { translate, useT, type Locale } from '../lib/i18n.ts';
import { useLocale } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';

interface Props {
  projectId: string;
  selected: SessionSummary[];
  onClose: () => void;
}

export default function DeleteDialog({ projectId, selected, onClose }: Props) {
  const t = useT();
  const { locale } = useLocale();
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[oklch(0.16_0.006_85_/_0.55)] backdrop-blur-[2px] px-4 py-12"
      onClick={() => !mutation.isPending && onClose()}
    >
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-hairline)] px-6 py-5">
          <div>
            <p className="eyebrow text-[var(--color-danger)]">
              {showResult ? t('delete.eyebrow.result') : t('delete.eyebrow.confirm')}
            </p>
            <h2 className="mt-1 font-display text-2xl font-light tracking-tight text-[var(--color-fg-primary)]">
              {showResult ? t('delete.title.result') : t('delete.title.confirm')}
            </h2>
            {!showResult && (
              <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
                {t('delete.summary', {
                  n: willDelete.length,
                  skipped: willSkip.length,
                  free: formatBytes(totalFree),
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label={t('delete.close')}
            className="rounded-xl p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)] disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {!showResult && (
          <div className="max-h-[50vh] space-y-2 overflow-auto px-6 py-4">
            {willDelete.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 text-xs"
              >
                <div className="font-medium text-[var(--color-fg-primary)]">{s.title}</div>
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--color-fg-faint)]">{s.id}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--color-fg-muted)] sm:grid-cols-4">
                  <span>jsonl <span className="text-[var(--color-fg-secondary)]">{formatBytes(s.relatedBytes.jsonl)}</span></span>
                  <span>subdir <span className="text-[var(--color-fg-secondary)]">{formatBytes(s.relatedBytes.subdir)}</span></span>
                  <span>file-history <span className="text-[var(--color-fg-secondary)]">{formatBytes(s.relatedBytes.fileHistory)}</span></span>
                  <span>session-env <span className="text-[var(--color-fg-secondary)]">{formatBytes(s.relatedBytes.sessionEnv)}</span></span>
                </div>
              </div>
            ))}
            {willSkip.length > 0 && (
              <div className="rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-2.5 text-xs">
                <div className="mb-1.5 font-medium text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
                  {t('delete.skipped.heading', { n: willSkip.length })}
                </div>
                <ul className="space-y-0.5">
                  {willSkip.map((s) => (
                    <li key={s.id} className="font-mono text-[11px] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-secondary)]">
                      {s.id} — {skipReason(s, locale)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {showResult && result && (
          <div className="max-h-[50vh] space-y-3 overflow-auto px-6 py-4 text-sm">
            <div className="rounded-md border border-[var(--color-moss)]/40 bg-[var(--color-moss-soft)] px-3 py-2.5 text-[var(--color-fg-primary)]">
              {t('delete.success', {
                n: result.deleted.length,
                free: formatBytes(result.deleted.reduce((a, d) => a + d.freedBytes, 0)),
                lines: result.historyLinesRemoved,
              })}
            </div>
            {result.skipped.length > 0 && (
              <div className="rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-2.5 text-xs">
                <div className="mb-1 font-medium text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
                  {t('delete.skipped.heading', { n: result.skipped.length })}
                </div>
                <ul className="space-y-0.5">
                  {result.skipped.map((s) => (
                    <li key={s.sessionId} className="font-mono text-[11px] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-secondary)]">
                      {s.sessionId} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {mutation.error && (
          <p className="mx-6 mb-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {(mutation.error as Error).message}
          </p>
        )}

        <footer className="flex justify-end gap-2 border-t border-[var(--color-hairline)] px-6 py-4">
          {!showResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="rounded-xl border border-[var(--color-hairline-strong)] px-4 py-1.5 text-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() =>
                  mutation.mutate(
                    selected.map((s) => ({ projectId, sessionId: s.id })),
                  )
                }
                disabled={mutation.isPending || willDelete.length === 0}
                className="rounded-xl bg-[var(--color-danger)] px-4 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutation.isPending
                  ? t('delete.btn.confirmPending')
                  : t('delete.btn.confirm', {
                      n: willDelete.length,
                      label:
                        willDelete.length === 1
                          ? t('delete.label.session')
                          : t('delete.label.sessions'),
                    })}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[var(--color-fg-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-canvas)] hover:opacity-90"
            >
              {t('common.done')}
            </button>
          )}
        </footer>
      </motion.div>
    </motion.div>
  );
}

function skipReason(s: SessionSummary, locale: Locale): string {
  if (s.isLivePid) return translate(locale, 'delete.skipped.reasonLive', { pid: s.livePid ?? '?' });
  if (s.isRecentlyActive)
    return translate(locale, 'delete.skipped.reasonRecent', { n: RECENT_ACTIVITY_WINDOW_MIN });
  return translate(locale, 'delete.skipped.reasonUnknown');
}
