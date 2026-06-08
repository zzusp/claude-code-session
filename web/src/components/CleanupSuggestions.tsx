import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type DiskCleanupOrphan,
  type DiskCleanupSuggestions,
  type DiskOrphanDeleteResult,
  type DiskOrphanKind,
} from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';
import { Loading } from './Loading.tsx';

/**
 * "清理建议" 区块：从 /api/disk-cleanup/suggestions 拉取最大的会话 + 两类孤儿目录，
 * 用户逐条确认后通过 DELETE /api/disk-cleanup/orphan/:kind/:sid 单条清理。
 * 不做批量、不做自动清理。
 */
export default function CleanupSuggestions() {
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.diskCleanupSuggestions(),
    queryFn: () => api<DiskCleanupSuggestions>('/api/disk-cleanup/suggestions'),
  });

  return (
    <section className="surface-card mt-12 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
          {t('cleanup.title')}
        </h2>
        <p className="min-w-0 flex-1 font-display text-[13px] italic leading-snug text-[var(--color-fg-muted)]">
          {t('cleanup.tagline')}
        </p>
      </header>
      <div className="rule-dotted mt-3" aria-hidden />

      {isLoading && <Loading label={t('common.computing')} className="mt-6" />}
      {error && (
        <p className="mt-6 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {t('cleanup.failed', { msg: (error as Error).message })}
        </p>
      )}

      {data && (
        <div className="mt-6 space-y-8">
          <LargeSessionsTable data={data.largeSessions} />
          <OrphanTable
            kind="file-history"
            title={t('cleanup.section.orphanFileHistory')}
            hint={t('cleanup.section.orphanFileHistory.hint')}
            rows={data.orphanFileHistory}
          />
          <OrphanTable
            kind="session-env"
            title={t('cleanup.section.orphanSessionEnv')}
            hint={t('cleanup.section.orphanSessionEnv.hint')}
            rows={data.orphanSessionEnv}
          />
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-[var(--radius-input)] bg-[var(--color-sunken)] px-3 py-2"
    >
      <h3 className="font-display text-[15px] font-light tracking-tight text-[var(--color-fg-primary)]">
        {title}
      </h3>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
        {hint}
      </span>
    </div>
  );
}

function LargeSessionsTable({
  data,
}: {
  data: DiskCleanupSuggestions['largeSessions'];
}) {
  const t = useT();
  return (
    <div>
      <SectionHeader
        title={t('cleanup.section.largeSessions')}
        hint={t('cleanup.section.largeSessions.hint', { n: data.length || 10 })}
      />
      {data.length === 0 ? (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('cleanup.empty.largeSessions')}
        </p>
      ) : (
        <div className="mt-3 -mx-6 overflow-x-auto px-6">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-[20rem]" />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-20" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th className="px-2 py-2 eyebrow">{t('cleanup.col.session')}</th>
                <th className="px-2 py-2 eyebrow">{t('cleanup.col.project')}</th>
                <th className="px-2 py-2 eyebrow text-right">{t('cleanup.col.last')}</th>
                <th className="px-2 py-2 eyebrow text-right">{t('cleanup.col.size')}</th>
                <th className="px-2 py-2 eyebrow text-right">{t('cleanup.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="border-t border-[var(--color-hairline)]">
              {data.map((row) => {
                const display = row.customTitle ?? row.title;
                return (
                  <tr
                    key={`${row.projectId}/${row.sessionId}`}
                    className="ribbon-row border-b border-[var(--color-hairline)] hover:bg-[var(--color-sunken)]"
                  >
                    <td className="px-2 py-2.5 align-top">
                      <div
                        className="truncate font-medium text-[var(--color-fg-primary)]"
                        title={display}
                      >
                        {display}
                      </div>
                      <div
                        className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--color-fg-faint)]"
                        title={row.sessionId}
                      >
                        {row.sessionId}
                      </div>
                    </td>
                    <td
                      className="px-2 py-2.5 align-top font-mono text-[12px] text-[var(--color-fg-muted)]"
                    >
                      <Link
                        to={`/projects/${encodeURIComponent(row.projectId)}`}
                        className="block truncate hover:text-[var(--color-fg-primary)]"
                        title={row.projectPath}
                      >
                        {shortCwd(row.projectPath)}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right align-top font-mono text-[12px] text-[var(--color-fg-secondary)]">
                      {formatRelativeTime(row.lastActivity)}
                    </td>
                    <td className="px-2 py-2.5 text-right align-top font-mono tabular-nums text-[var(--color-fg-primary)]">
                      {formatBytes(row.sizeBytes)}
                    </td>
                    <td className="px-2 py-2.5 text-right align-top">
                      <Link
                        to={`/projects/${encodeURIComponent(row.projectId)}/sessions/${row.sessionId}`}
                        className="inline-block rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
                      >
                        {t('cleanup.action.view')}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrphanTable({
  kind,
  title,
  hint,
  rows,
}: {
  kind: DiskOrphanKind;
  title: string;
  hint: string;
  rows: DiskCleanupOrphan[];
}) {
  const t = useT();
  const [confirming, setConfirming] = useState<DiskCleanupOrphan | null>(null);
  return (
    <div>
      <SectionHeader title={title} hint={hint} />
      {rows.length === 0 ? (
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('cleanup.empty.orphan')}
        </p>
      ) : (
        <div className="mt-3 -mx-6 overflow-x-auto px-6">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th className="px-2 py-2 eyebrow">{t('cleanup.col.sid')}</th>
                <th className="px-2 py-2 eyebrow text-right">{t('cleanup.col.size')}</th>
                <th className="px-2 py-2 eyebrow text-right">{t('cleanup.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="border-t border-[var(--color-hairline)]">
              {rows.map((row) => (
                <tr
                  key={row.sessionId}
                  className="ribbon-row border-b border-[var(--color-hairline)] hover:bg-[var(--color-sunken)]"
                >
                  <td
                    className="px-2 py-2.5 align-top font-mono text-[12px] text-[var(--color-fg-secondary)]"
                    title={row.sessionId}
                  >
                    <span className="block truncate">{row.sessionId}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right align-top font-mono tabular-nums text-[var(--color-fg-primary)]">
                    {formatBytes(row.sizeBytes)}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top">
                    <button
                      type="button"
                      onClick={() => setConfirming(row)}
                      className="inline-block rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                    >
                      {t('cleanup.action.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirming && (
        <OrphanConfirmDialog
          kind={kind}
          orphan={confirming}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function OrphanConfirmDialog({
  kind,
  orphan,
  onClose,
}: {
  kind: DiskOrphanKind;
  orphan: DiskCleanupOrphan;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api<DiskOrphanDeleteResult>(
        `/api/disk-cleanup/orphan/${kind}/${encodeURIComponent(orphan.sessionId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diskCleanupSuggestions() });
      queryClient.invalidateQueries({ queryKey: queryKeys.diskUsage() });
      onClose();
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
        className="w-full max-w-md overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[var(--color-hairline)] px-6 py-5">
          <p className="eyebrow text-[var(--color-danger)]">{t('delete.eyebrow.confirm')}</p>
          <h2 className="mt-1 font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
            {t('cleanup.confirm.title')}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            {t('cleanup.confirm.body', {
              kind,
              sid: orphan.sessionId,
              size: formatBytes(orphan.sizeBytes),
            })}
          </p>
        </header>
        {mutation.error && (
          <p className="mx-6 mt-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {(mutation.error as Error).message}
          </p>
        )}
        <footer className="flex justify-end gap-2 border-t border-[var(--color-hairline)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] px-4 py-1.5 text-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] disabled:opacity-50"
          >
            {t('cleanup.confirm.cancel')}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-[var(--radius-control)] bg-[var(--color-danger)] px-4 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? t('cleanup.action.deleting') : t('cleanup.confirm.confirm')}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function shortCwd(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return cwd;
  return '…/' + parts.slice(-2).join('/');
}
