import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api, type ExportResult, type SessionSummary } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';

interface Props {
  projectId: string;
  sessions: SessionSummary[];
  onClose: () => void;
}

export default function ExportDialog({ projectId, sessions, onClose }: Props) {
  const t = useT();
  const [destDir, setDestDir] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api<ExportResult>(`/api/projects/${encodeURIComponent(projectId)}/export`, {
        method: 'POST',
        body: JSON.stringify({ sessionIds: sessions.map((s) => s.id), destDir: destDir.trim() }),
      }),
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
  const canSubmit = destDir.trim() !== '' && !mutation.isPending;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[oklch(0.16_0.006_85_/_0.55)] px-4 py-12 backdrop-blur-[2px]"
      onClick={() => !mutation.isPending && onClose()}
    >
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-hairline)] px-6 py-5">
          <div>
            <p className="eyebrow text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
              {showResult ? t('export.eyebrow.result') : t('export.eyebrow.confirm')}
            </p>
            <h2 className="mt-1 font-display text-2xl font-light tracking-tight text-[var(--color-fg-primary)]">
              {showResult ? t('export.title.result') : t('export.title.confirm')}
            </h2>
            {!showResult && (
              <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
                {t('export.summary', { n: sessions.length })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label={t('export.close')}
            className="rounded-xl p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)] disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {!showResult && (
          <div className="space-y-4 px-6 py-5">
            <label className="block">
              <span className="eyebrow">{t('export.destLabel')}</span>
              <input
                type="text"
                value={destDir}
                onChange={(e) => setDestDir(e.target.value)}
                placeholder={t('export.destPlaceholder')}
                spellCheck={false}
                autoFocus
                className="mt-1.5 w-full rounded-[var(--radius-input)] border border-[var(--color-hairline-strong)] bg-[var(--color-canvas)] px-3 py-2 font-mono text-sm text-[var(--color-fg-primary)] outline-none focus:border-[var(--color-accent)]"
              />
              <span className="mt-1.5 block text-xs text-[var(--color-fg-muted)]">
                {t('export.destHint')}
              </span>
            </label>

            <p className="rounded-[var(--radius-card)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-accent-ink)] dark:text-[var(--color-fg-secondary)]">
              {t('export.privacy')}
            </p>
          </div>
        )}

        {showResult && result && (
          <div className="space-y-3 px-6 py-5 text-sm">
            <div className="rounded-[var(--radius-card)] border border-[var(--color-moss)]/40 bg-[var(--color-moss-soft)] px-3 py-2.5 text-[var(--color-fg-primary)]">
              {t('export.success', {
                sessions: result.sessionsExported,
                memory: result.memoryFilesExported,
                lines: result.historyLinesExported,
              })}
            </div>
            <p className="break-all font-mono text-xs text-[var(--color-fg-muted)]">
              {t('export.successDest', { dest: result.destDir })}
            </p>
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
                className="rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] px-4 py-1.5 text-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={!canSubmit}
                className="rounded-[var(--radius-control)] bg-[var(--color-fg-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-canvas)] shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutation.isPending ? t('export.btn.pending') : t('export.btn.confirm')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-control)] bg-[var(--color-fg-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-canvas)] hover:opacity-90"
            >
              {t('common.done')}
            </button>
          )}
        </footer>
      </motion.div>
    </motion.div>
  );
}
