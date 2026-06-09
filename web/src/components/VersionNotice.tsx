import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, type VersionInfo, type VersionUpdateResult } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';

const UPDATE_COMMAND = 'npm install -g @zzusp/ccsm@latest';

/** Shared version query — deduped by query key, so the sidebar badge and the
 *  mobile hamburger dot read the same cached result. */
export function useVersionInfo() {
  return useQuery({
    queryKey: queryKeys.version(),
    queryFn: () => api<VersionInfo>('/api/version'),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Sidebar footer row: current version, or an amber "new version" pill with a
 *  red notification dot. Opens the modal. */
export default function VersionNotice() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data } = useVersionInfo();

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
              <span className="absolute inset-0 rounded-full bg-[var(--color-danger)] pulse-danger" />
              <span className="absolute inset-0 rounded-full bg-[var(--color-danger)]" />
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <VersionChip label={t('version.current')} value={`v${info.current}`} />
              {hasUpdate && info.latest && (
                <>
                  <span aria-hidden className="font-mono text-sm text-[var(--color-fg-faint)]">→</span>
                  <VersionChip label={t('version.latest')} value={`v${info.latest}`} accent />
                </>
              )}
            </div>
            {(published || info.checkError) && (
              <p className="mt-2 font-mono text-[11px] text-[var(--color-fg-faint)]">
                {published && t('version.published', { date: published })}
                {info.checkError && (published ? ` · ${t('version.checkFailed')}` : t('version.checkFailed'))}
              </p>
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
              <p className="eyebrow mb-2">{t('version.notes')}</p>
              {notes ? (
                <div className="max-h-72 overflow-y-auto rounded-[var(--radius-input)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-4 py-3.5">
                  <ReleaseNotes source={notes} />
                </div>
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

/** A labelled version pill: small uppercase label + mono version number. */
function VersionChip({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <span
      className={
        'inline-flex items-baseline gap-1.5 rounded-[var(--radius-control)] border px-2.5 py-1 font-mono ' +
        (accent
          ? 'border-[var(--color-accent)]/45 bg-[var(--color-accent-soft)]'
          : 'border-[var(--color-hairline)] bg-[var(--color-surface)]')
      }
    >
      <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-fg-faint)]">{label}</span>
      <span
        className={
          'text-[13px] ' +
          (accent
            ? 'text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]'
            : 'text-[var(--color-fg-primary)]')
        }
      >
        {value}
      </span>
    </span>
  );
}

/** Minimal, dependency-free Markdown for GitHub release notes. Renders a safe
 *  subset (headings, lists, code, links, emphasis) as React nodes — never raw
 *  HTML, so notes can't inject markup. */
function ReleaseNotes({ source }: { source: string }) {
  return (
    <div className="space-y-2.5 text-[13px] leading-[1.65] text-[var(--color-fg-primary)]">
      {renderBlocks(source)}
    </div>
  );
}

function isBlockStart(l: string): boolean {
  return (
    /^\s*```/.test(l) ||
    /^(#{1,6})\s+/.test(l) ||
    /^\s*([-*+]|\d+\.)\s+/.test(l) ||
    /^\s*([-*_])\1{2,}\s*$/.test(l)
  );
}

function renderBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const at = (n: number) => lines[n] ?? '';
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = at(i);

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(at(i))) {
        buf.push(at(i));
        i++;
      }
      i++; // skip closing fence
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[12px] leading-[1.6] text-[var(--color-fg-secondary)]"
        >
          {buf.join('\n')}
        </pre>,
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = (h[1] ?? '').length;
      out.push(
        <p
          key={key++}
          className={
            'font-display font-medium tracking-tight text-[var(--color-fg-primary)] ' +
            (level <= 2 ? 'text-[15px]' : 'text-[13.5px]')
          }
        >
          {renderInline(h[2] ?? '')}
        </p>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(<hr key={key++} className="border-[var(--color-hairline)]" />);
      i++;
      continue;
    }

    // List (consecutive items)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(at(i))) {
        const text = at(i).replace(/^\s*([-*+]|\d+\.)\s+/, '');
        items.push(<li key={items.length}>{renderInline(text)}</li>);
        i++;
      }
      const cls =
        'ml-4 space-y-1 marker:text-[var(--color-fg-faint)] ' + (ordered ? 'list-decimal' : 'list-disc');
      out.push(
        ordered ? (
          <ol key={key++} className={cls}>
            {items}
          </ol>
        ) : (
          <ul key={key++} className={cls}>
            {items}
          </ul>
        ),
      );
      continue;
    }

    // Paragraph (consecutive plain lines)
    const para: string[] = [line];
    i++;
    while (i < lines.length && at(i).trim() && !isBlockStart(at(i))) {
      para.push(at(i));
      i++;
    }
    out.push(<p key={key++}>{renderInline(para.join(' '))}</p>);
  }

  return out;
}

const INLINE_RE =
  /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0] ?? '';
    if (m[1]) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-[var(--color-surface)] px-1 py-0.5 font-mono text-[12px] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      nodes.push(
        <a
          key={key++}
          href={lm[2] ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-accent-ink)] underline decoration-[var(--color-hairline-strong)] underline-offset-2 hover:decoration-[var(--color-accent)] dark:text-[var(--color-accent)]"
        >
          {lm[1] ?? ''}
        </a>,
      );
    } else if (m[3]) {
      nodes.push(
        <strong key={key++} className="font-semibold text-[var(--color-fg-primary)]">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      // m[4] or m[5]: emphasis
      nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
