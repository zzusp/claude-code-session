import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  api,
  type ModifiedFileOperation,
  type ModifiedFileSummary,
  type ModifiedFileToolName,
  type ModifiedFilesResponse,
} from '../lib/api.ts';
import { formatDateTime, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';
import { Loading } from './Loading.tsx';

interface Props {
  projectId: string;
  sessionId: string;
  /** Pushed onto the URL as ?focus=<uuid> by the parent route when a row is clicked. */
  onFocusMessage: (messageUuid: string) => void;
}

export default function ModifiedFilesPanel({ projectId, sessionId, onFocusMessage }: Props) {
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.sessionModifiedFiles(projectId, sessionId),
    queryFn: () =>
      api<ModifiedFilesResponse>(
        `/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}/modified-files`,
      ),
    enabled: !!projectId && !!sessionId,
  });

  // 默认展开（信息密度不算大，且这是页面里一个明确动作入口）。
  // 用户折叠后再切换 session 时不强行展开。
  const [collapsed, setCollapsed] = useState(false);
  const count = data?.files.length ?? 0;
  const countLabel =
    count === 1
      ? t('session.modified.count', { n: count })
      : t('session.modified.countPlural', { n: count });

  return (
    <section className="surface-card mt-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-light tracking-tight text-[var(--color-fg-primary)]">
            {t('session.modified.title')}
          </h2>
          <p className="mt-1 max-w-2xl font-display text-[13px] italic leading-snug text-[var(--color-fg-secondary)]">
            {t('session.modified.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {data && (
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] tabular-nums text-[var(--color-fg-muted)]">
              {countLabel}
            </span>
          )}
          {data && count > 0 && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
            >
              {collapsed ? t('session.modified.expand') : t('session.modified.collapse')}
            </button>
          )}
        </div>
      </header>

      <div className="rule-dotted mt-3" aria-hidden />

      {isLoading && <Loading label={t('session.modified.loading')} className="mt-6" />}

      {error && !isLoading && (
        <p className="mt-6 rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {t('session.modified.failed')}: {(error as Error).message}
        </p>
      )}

      {data && count === 0 && (
        <p className="mt-6 text-sm italic text-[var(--color-fg-muted)]">
          {t('session.modified.empty')}
        </p>
      )}

      {data && count > 0 && !collapsed && (
        <FileTable files={data.files} onFocusMessage={onFocusMessage} />
      )}
    </section>
  );
}

function FileTable({
  files,
  onFocusMessage,
}: {
  files: ModifiedFileSummary[];
  onFocusMessage: (messageUuid: string) => void;
}) {
  const t = useT();
  return (
    <div className="mt-4 -mx-6 overflow-x-auto px-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="px-2 py-3 eyebrow">{t('session.modified.col.file')}</th>
            <th className="px-2 py-3 eyebrow">{t('session.modified.col.ops')}</th>
            <th className="px-2 py-3 eyebrow text-right">{t('session.modified.col.range')}</th>
            <th className="px-2 py-3 eyebrow text-right">
              <span className="sr-only">{t('session.modified.col.jump')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="border-t border-[var(--color-hairline)]">
          {files.map((f) => (
            <FileRow key={f.filePath} file={f} onFocusMessage={onFocusMessage} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileRow({
  file,
  onFocusMessage,
}: {
  file: ModifiedFileSummary;
  onFocusMessage: (messageUuid: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const displayPath = file.relativePath ?? file.filePath;
  const tail = displayPath.split(/[\\/]+/).pop() ?? displayPath;
  // dir 只是把 tail 前的部分回显出来，便于一行扫
  const dir = displayPath.slice(0, displayPath.length - tail.length).replace(/[\\/]+$/, '');

  const firstOpWithUuid = file.operations.find((o) => !!o.messageUuid);
  const canJump = !!firstOpWithUuid?.messageUuid;

  const opCountLabel =
    file.totalCount === 1
      ? t('session.modified.opSummary', { n: file.totalCount })
      : t('session.modified.opSummaryPlural', { n: file.totalCount });

  return (
    <>
      <tr
        className="ribbon-row border-b border-[var(--color-hairline)] cursor-pointer transition-colors hover:bg-[var(--color-sunken)]"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-2 py-3 align-top">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                // tr 的 onClick 也会触发同一切换；阻止冒泡避免开-关-开循环
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              aria-expanded={open}
              aria-label={
                (open ? t('session.modified.collapse') : t('session.modified.expand')) +
                ' ' +
                (file.relativePath ?? file.filePath)
              }
              className="-m-1 rounded-[var(--radius-control)] p-1 text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
            >
              <Caret open={open} />
            </button>
            <div className="min-w-0">
              {dir && (
                <div
                  className="truncate font-mono text-[10.5px] tracking-[0.04em] text-[var(--color-fg-faint)]"
                  title={file.filePath}
                >
                  {dir}/
                </div>
              )}
              <div
                className="truncate font-mono text-[12.5px] font-medium text-[var(--color-fg-primary)]"
                title={file.filePath}
              >
                {tail}
              </div>
              {!file.relativePath && (
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
                  {t('session.modified.absolutePath')}
                </div>
              )}
            </div>
          </div>
        </td>

        <td className="px-2 py-3 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11.5px] tabular-nums text-[var(--color-fg-secondary)]">
              {opCountLabel}
            </span>
            {file.editCount > 0 && <ToolChip name="Edit" count={file.editCount} />}
            {file.writeCount > 0 && <ToolChip name="Write" count={file.writeCount} />}
            {file.multiEditCount > 0 && (
              <ToolChip name="MultiEdit" count={file.multiEditCount} />
            )}
            {file.notebookEditCount > 0 && (
              <ToolChip name="NotebookEdit" count={file.notebookEditCount} />
            )}
            {file.errorCount > 0 && (
              <span className="rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-danger)]">
                {t('session.modified.errorBadge', { n: file.errorCount })}
              </span>
            )}
          </div>
        </td>

        <td className="px-2 py-3 align-top text-right font-mono text-[11.5px] tabular-nums text-[var(--color-fg-secondary)]">
          <div title={file.firstAt ? formatDateTime(file.firstAt) : undefined}>
            {formatRelativeTime(file.firstAt)}
          </div>
          {file.lastAt && file.firstAt !== file.lastAt && (
            <div
              className="text-[var(--color-fg-muted)]"
              title={formatDateTime(file.lastAt)}
            >
              → {formatRelativeTime(file.lastAt)}
            </div>
          )}
        </td>

        <td className="px-2 py-3 align-top text-right">
          {canJump && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFocusMessage(firstOpWithUuid!.messageUuid!);
              }}
              aria-label={t('session.modified.jumpAria', { file: tail })}
              className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
            >
              {t('session.modified.jump')} <ArrowIcon />
            </button>
          )}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-[var(--color-hairline)] bg-[var(--color-sunken)]/40">
          <td colSpan={4} className="px-2 py-3">
            <OperationList operations={file.operations} onFocusMessage={onFocusMessage} />
          </td>
        </tr>
      )}
    </>
  );
}

function OperationList({
  operations,
  onFocusMessage,
}: {
  operations: ModifiedFileOperation[];
  onFocusMessage: (messageUuid: string) => void;
}) {
  const t = useT();
  return (
    <ol className="flex flex-col gap-1.5">
      {operations.map((op, idx) => {
        const tone = op.errored
          ? 'border-[var(--color-danger)]/40 text-[var(--color-danger)]'
          : op.pending
            ? 'border-[var(--color-accent)]/40 text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]'
            : 'border-[var(--color-hairline)] text-[var(--color-fg-secondary)]';
        const canJump = !!op.messageUuid;
        return (
          <li
            key={op.toolUseId || `${idx}-${op.ts ?? ''}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11.5px]"
          >
            <span className="font-mono text-[10.5px] tabular-nums text-[var(--color-fg-muted)]">
              #{(idx + 1).toString().padStart(2, '0')}
            </span>
            <span
              className={`rounded-[var(--radius-control)] border px-2 py-0.5 text-[10.5px] uppercase tracking-[0.1em] ${tone}`}
            >
              {op.toolName}
            </span>
            <span className="tabular-nums text-[var(--color-fg-secondary)]">
              {op.ts ? formatDateTime(op.ts) : '—'}
            </span>
            {op.errored && (
              <span className="text-[var(--color-danger)]">
                · {t('session.modified.opErrored')}
              </span>
            )}
            {op.pending && (
              <span className="text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
                · {t('session.modified.opPending')}
              </span>
            )}
            {canJump && (
              <button
                type="button"
                onClick={() => onFocusMessage(op.messageUuid!)}
                className="text-[var(--color-fg-muted)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
              >
                → {t('session.modified.jump')}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ToolChip({ name, count }: { name: ModifiedFileToolName; count: number }) {
  return (
    <span className="rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-fg-secondary)]">
      {name}
      <span className="ml-1 tabular-nums text-[var(--color-fg-muted)]">×{count}</span>
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        'shrink-0 text-[var(--color-fg-muted)] transition-transform ' +
        (open ? 'rotate-90' : '')
      }
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}
