import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type VersionInfo, type VersionUpdateResult } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';

const UPDATE_COMMAND = 'npm install -g @zzusp/ccsm@latest';

/** Sidebar footer row: current version, or an amber "new version" pill. Opens the modal. */
export default function VersionNotice() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: queryKeys.version(),
    queryFn: () => api<VersionInfo>('/api/version'),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!data) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="eyebrow">{t('version.label')}</span>
        {data.hasUpdate ? (
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-accent)]/45 bg-[var(--color-accent-soft)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
            <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] pulse-amber" />
              <span className="absolute inset-0 rounded-full bg-[var(--color-accent)]" />
            </span>
            {t('version.badge.new', { v: `v${data.latest}` })}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-[var(--color-fg-faint)] transition-colors group-hover:text-[var(--color-fg-secondary)]">
            v{data.current}
          </span>
        )}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && <VersionModal info={data} onClose={() => setOpen(false)} />}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function VersionModal({ info, onClose }: { info: VersionInfo; onClose: () => void }) {
  const t = useT();
  const mutation = useMutation({
    mutationFn: () => api<VersionUpdateResult>('/api/version/update', { method: 'POST' }),
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
  const hasUpdate = info.hasUpdate;
  const notes = info.releaseNotes?.trim();
  const published = info.publishedAt ? new Date(info.publishedAt).toLocaleDateString() : null;
  const updateDone = !!result?.ok;
  // After a successful update the page should stop offering it; a failure keeps "retry" available.
  const showUpdateAction = hasUpdate && !updateDone;

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
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-hairline)] px-6 py-5">
          <div className="min-w-0">
            <p className="eyebrow text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
              {hasUpdate ? t('version.modal.eyebrowUpdate') : t('version.modal.eyebrowLatest')}
            </p>
            <h2 className="mt-1 font-display text-2xl font-light tracking-tight text-[var(--color-fg-primary)]">
              {hasUpdate ? t('version.modal.titleUpdate') : t('version.modal.titleLatest')}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-[var(--color-fg-muted)]">
              <span>
                {t('version.current')} <span className="text-[var(--color-fg-primary)]">v{info.current}</span>
              </span>
              {hasUpdate && info.latest && (
                <>
                  <span aria-hidden className="text-[var(--color-fg-faint)]">→</span>
                  <span>
                    {t('version.latest')}{' '}
                    <span className="text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
                      v{info.latest}
                    </span>
                  </span>
                </>
              )}
              {published && <span className="text-[var(--color-fg-faint)]">· {t('version.published', { date: published })}</span>}
            </div>
            {info.checkError && (
              <p className="mt-1.5 text-xs text-[var(--color-fg-faint)]">{t('version.checkFailed')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label={t('version.btn.close')}
            className="shrink-0 rounded-xl p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)] disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {result ? (
            <UpdateOutcome result={result} />
          ) : (
            <section>
              <p className="eyebrow mb-1.5">{t('version.notes')}</p>
              {notes ? (
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-input)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-4 py-3 font-mono text-[12.5px] leading-[1.65] text-[var(--color-fg-primary)]">
                  {notes}
                </pre>
              ) : (
                <p className="text-sm text-[var(--color-fg-muted)]">{t('version.notesEmpty')}</p>
              )}
            </section>
          )}

          {mutation.error && (
            <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {(mutation.error as Error).message}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[var(--color-hairline)] px-6 py-4">
          <div className="flex items-center gap-1">
            {info.releaseUrl && (
              <ExternalLink href={info.releaseUrl} label={t('version.btn.releasePage')} />
            )}
            <ExternalLink href={info.repositoryUrl} label={t('version.btn.repo')} />
          </div>
          <div className="flex items-center gap-2">
            {showUpdateAction ? (
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
                  disabled={mutation.isPending}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-fg-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-canvas)] shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mutation.isPending && <Spinner />}
                  {mutation.isPending ? t('version.btn.updating') : t('version.btn.update')}
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
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function UpdateOutcome({ result }: { result: VersionUpdateResult }) {
  const t = useT();
  if (result.ok) {
    return (
      <section className="space-y-3">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-moss)]/40 bg-[var(--color-moss-soft)] px-3 py-2.5 text-sm text-[var(--color-fg-primary)]">
          <p className="font-medium">{t('version.update.successTitle')}</p>
          <p className="mt-0.5 text-[var(--color-fg-secondary)]">
            {t('version.update.success', { v: `v${result.toVersion ?? ''}` })}
          </p>
        </div>
        {result.output && <OutputBlock output={result.output} />}
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2.5 text-sm">
        <p className="font-medium text-[var(--color-danger)]">{t('version.update.failTitle')}</p>
        <p className="mt-0.5 text-[var(--color-fg-secondary)]">{t('version.update.fail')}</p>
      </div>
      <CommandHint />
      {result.output && <OutputBlock output={result.output} />}
    </section>
  );
}

function CommandHint() {
  const t = useT();
  return (
    <div>
      <p className="eyebrow mb-1.5">{t('version.update.command')}</p>
      <div className="flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[var(--color-fg-primary)]">
          {UPDATE_COMMAND}
        </code>
        <CopyButton text={UPDATE_COMMAND} />
      </div>
    </div>
  );
}

function OutputBlock({ output }: { output: string }) {
  const t = useT();
  return (
    <div>
      <p className="eyebrow mb-1.5">{t('version.update.output')}</p>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-input)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-[11.5px] leading-[1.6] text-[var(--color-fg-muted)]">
        {output}
      </pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard may be blocked */
        }
      }}
      className="shrink-0 rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] px-2 py-1 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg-primary)]"
      aria-label="copy"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 6" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 17L17 7" />
        <path d="M8 7h9v9" />
      </svg>
    </a>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
