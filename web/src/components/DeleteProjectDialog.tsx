import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import {
  api,
  type DeleteProjectResult,
  type ProjectSummary,
  type SessionSummary,
} from '../lib/api.ts';
import { formatBytes } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';

interface Props {
  project: ProjectSummary;
  onClose: () => void;
}

export default function DeleteProjectDialog({ project, onClose }: Props) {
  const t = useT();
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: queryKeys.projectSessions(project.id),
    queryFn: () =>
      api<SessionSummary[]>(`/api/projects/${encodeURIComponent(project.id)}/sessions`),
  });
  const sessions = sessionsQuery.data ?? [];
  const blockers = sessions.filter((s) => s.isLivePid || s.isRecentlyActive);
  const hasBlockers = blockers.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      api<DeleteProjectResult>(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSessions(project.id) });
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
  const totalDeletedBytes = result?.deleted.reduce((a, d) => a + d.freedBytes, 0) ?? 0;

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
          <div className="min-w-0">
            <p className="eyebrow text-[var(--color-danger)]">
              {showResult ? t('deleteProject.eyebrow.result') : t('deleteProject.eyebrow.confirm')}
            </p>
            <h2 className="mt-1 font-display text-2xl font-light tracking-tight text-[var(--color-fg-primary)]">
              {showResult ? t('deleteProject.title.result') : t('deleteProject.title.confirm')}
            </h2>
            <p className="mt-1.5 truncate font-mono text-[12px] text-[var(--color-fg-muted)]" title={project.decodedCwd}>
              {project.decodedCwd}
            </p>
            {!showResult && (
              <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
                {t('deleteProject.summary', {
                  n: project.sessionCount,
                  free: formatBytes(project.totalBytes),
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
          <div className="space-y-3 px-6 py-4 text-sm">
            <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2.5 text-[var(--color-danger)]">
              {t('deleteProject.warning', { cwd: project.decodedCwd })}
            </p>
            {hasBlockers && (
              <div className="rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-2.5 text-xs">
                <div className="mb-1.5 font-medium text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
                  {t('deleteProject.blocked.heading', { n: blockers.length })}
                </div>
                <ul className="space-y-0.5">
                  {blockers.map((s) => (
                    <li key={s.id} className="font-mono text-[11px] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-secondary)]">
                      {s.id} — {s.isLivePid ? `live PID ${s.livePid ?? '?'}` : 'recent'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {showResult && result && (
          <div className="max-h-[50vh] space-y-3 overflow-auto px-6 py-4 text-sm">
            {result.projectDirRemoved ? (
              <div className="rounded-md border border-[var(--color-moss)]/40 bg-[var(--color-moss-soft)] px-3 py-2.5 text-[var(--color-fg-primary)]">
                {t('deleteProject.success', {
                  n: result.deleted.length,
                  free: formatBytes(totalDeletedBytes),
                  lines: result.historyLinesRemoved,
                })}
              </div>
            ) : result.deleted.length > 0 ? (
              <div className="rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-2.5 text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
                {t('deleteProject.successKept', {
                  n: result.deleted.length,
                  free: formatBytes(totalDeletedBytes),
                  lines: result.historyLinesRemoved,
                })}
              </div>
            ) : null}
            {result.skipped.length > 0 && (
              <div className="rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-2.5 text-xs">
                <div className="mb-1 font-medium text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
                  {t('deleteProject.blocked.heading', { n: result.skipped.length })}
                </div>
                <ul className="space-y-0.5">
                  {result.skipped.map((s) => (
                    <li key={`${s.sessionId}-${s.reason}`} className="font-mono text-[11px] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-secondary)]">
                      {s.sessionId || '(project)'} — {s.reason}
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
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || sessionsQuery.isLoading || hasBlockers}
                className="rounded-xl bg-[var(--color-danger)] px-4 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutation.isPending
                  ? t('deleteProject.btn.confirmPending')
                  : t('deleteProject.btn.confirm')}
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
