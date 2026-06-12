import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.tsx';
import {
  api,
  type ImportCollisionPolicy,
  type ImportPreviewResult,
  type ImportResult,
  type ImportSessionAction,
} from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { queryKeys } from '../lib/query-keys.ts';

const POLICIES: ImportCollisionPolicy[] = ['skip', 'overwrite-if-newer', 'keep-both'];

const POLICY_KEY = {
  skip: 'import.policy.skip',
  'overwrite-if-newer': 'import.policy.overwrite-if-newer',
  'keep-both': 'import.policy.keep-both',
} as const;

const ACTION_KEY = {
  create: 'import.action.create',
  overwrite: 'import.action.overwrite',
  'keep-both': 'import.action.keep-both',
  skip: 'import.action.skip',
} as const;

const SUGGEST_KEY = {
  'existing-project': 'import.suggestion.existing-project',
  'original-path': 'import.suggestion.original-path',
  'same-basename': 'import.suggestion.same-basename',
} as const;

const MEM_KEY = {
  create: 'import.memory.create',
  skip: 'import.memory.skip',
  conflict: 'import.memory.conflict',
} as const;

function actionTone(action: ImportSessionAction): string {
  switch (action) {
    case 'create':
      return 'border-[var(--color-moss)]/40 bg-[var(--color-moss-soft)] text-[var(--color-fg-primary)]';
    case 'overwrite':
      return 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)]';
    case 'keep-both':
      return 'border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]';
    default:
      return 'border-[var(--color-hairline-strong)] bg-[var(--color-sunken)] text-[var(--color-fg-muted)]';
  }
}

export default function ImportPage() {
  const t = useT();
  const queryClient = useQueryClient();

  const [bundleDir, setBundleDir] = useState('');
  const [targetCwd, setTargetCwd] = useState('');
  const [policy, setPolicy] = useState<ImportCollisionPolicy>('skip');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);

  const previewMutation = useMutation({
    mutationFn: (vars: { targetCwd?: string; collisionPolicy: ImportCollisionPolicy }) =>
      api<ImportPreviewResult>('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          bundleDir: bundleDir.trim(),
          targetCwd: vars.targetCwd,
          collisionPolicy: vars.collisionPolicy,
        }),
      }),
    onSuccess: (data) => {
      setPreview(data);
      setTargetCwd(data.remap.targetCwd);
    },
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      api<ImportResult>('/api/import', {
        method: 'POST',
        body: JSON.stringify({
          bundleDir: bundleDir.trim(),
          targetCwd: targetCwd.trim(),
          collisionPolicy: policy,
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSessions(data.targetProjectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMemory(data.targetProjectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.diskUsage() });
    },
  });

  function loadBundle() {
    if (bundleDir.trim() === '') return;
    setPreview(null);
    commitMutation.reset();
    previewMutation.mutate({ targetCwd: undefined, collisionPolicy: policy });
  }

  function recheck(nextTarget: string, nextPolicy: ImportCollisionPolicy) {
    commitMutation.reset();
    previewMutation.mutate({
      targetCwd: nextTarget.trim() || undefined,
      collisionPolicy: nextPolicy,
    });
  }

  function changePolicy(p: ImportCollisionPolicy) {
    setPolicy(p);
    if (preview) recheck(targetCwd, p);
  }

  const result = commitMutation.data;
  const busy = previewMutation.isPending;

  return (
    <section>
      <div className="mt-2">
        <PageHeader eyebrow={t('nav.import')} title={t('import.title')} />
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-fg-muted)]">
          {t('import.tagline')}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={bundleDir}
            onChange={(e) => setBundleDir(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadBundle()}
            placeholder={t('import.bundlePlaceholder')}
            spellCheck={false}
            aria-label={t('import.bundleLabel')}
            className="min-w-0 flex-1 rounded-[var(--radius-input)] border border-[var(--color-hairline-strong)] bg-[var(--color-canvas)] px-3 py-2 font-mono text-sm text-[var(--color-fg-primary)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={loadBundle}
            disabled={bundleDir.trim() === '' || busy}
            className="rounded-[var(--radius-control)] bg-[var(--color-fg-primary)] px-4 py-2 text-sm font-medium text-[var(--color-canvas)] shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('import.btn.loading') : preview ? t('import.btn.recheck') : t('import.btn.load')}
          </button>
        </div>

        {previewMutation.error && (
          <p className="mt-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {(previewMutation.error as Error).message}
          </p>
        )}

        {!preview && !previewMutation.error && (
          <p className="mt-4 text-sm text-[var(--color-fg-muted)]">{t('import.empty')}</p>
        )}
      </div>

      {preview && (
        <div className="mt-8 space-y-6">
          <p className="break-all font-mono text-xs text-[var(--color-fg-muted)]">
            {t('import.source', { platform: preview.source.platform, cwd: preview.source.cwd })}
          </p>

          {/* target */}
          <div>
            <span className="eyebrow">{t('import.targetLabel')}</span>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={targetCwd}
                onChange={(e) => setTargetCwd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && recheck(targetCwd, policy)}
                spellCheck={false}
                aria-label={t('import.targetLabel')}
                className="min-w-0 flex-1 rounded-[var(--radius-input)] border border-[var(--color-hairline-strong)] bg-[var(--color-canvas)] px-3 py-2 font-mono text-sm text-[var(--color-fg-primary)] outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={() => recheck(targetCwd, policy)}
                disabled={busy}
                className="rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] px-4 py-2 text-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-sunken)] disabled:opacity-50"
              >
                {t('import.btn.recheck')}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-fg-muted)]">{t('import.targetHint')}</p>
            <p className="mt-1 font-mono text-[11px] text-[var(--color-fg-faint)]">
              {t('import.targetId', { id: preview.remap.targetProjectId })}
            </p>

            {preview.suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="eyebrow mr-1">{t('import.suggestions')}</span>
                {preview.suggestions.map((s) => (
                  <button
                    key={s.projectId}
                    type="button"
                    onClick={() => {
                      setTargetCwd(s.cwd);
                      recheck(s.cwd, policy);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-fg-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
                    title={t(SUGGEST_KEY[s.reason])}
                  >
                    <span className="max-w-[20rem] truncate">{s.cwd}</span>
                    <span className="text-[var(--color-fg-faint)]">· {t(SUGGEST_KEY[s.reason])}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* policy */}
          <div>
            <span className="eyebrow">{t('import.policyLabel')}</span>
            <div className="mt-1.5 inline-flex flex-wrap gap-1 rounded-[var(--radius-input)] border border-[var(--color-hairline)] bg-[var(--color-sunken)] p-1">
              {POLICIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => changePolicy(p)}
                  aria-pressed={policy === p}
                  className={
                    'rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium transition ' +
                    (policy === p
                      ? 'bg-[var(--color-surface)] text-[var(--color-fg-primary)] shadow-[var(--shadow-rise)]'
                      : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]')
                  }
                >
                  {t(POLICY_KEY[p])}
                </button>
              ))}
            </div>
          </div>

          {/* sessions */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">{t('import.sessions.heading')}</span>
              <span className="font-mono text-[11px] text-[var(--color-fg-faint)]">
                {t('import.history', { n: preview.historyLinesToAdd })}
              </span>
            </div>
            {preview.sessions.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
                {t('import.sessions.empty')}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {preview.sessions.map((s) => (
                  <li
                    key={s.sessionId}
                    className="flex items-center gap-3 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2"
                  >
                    <span
                      className={
                        'shrink-0 rounded-[var(--radius-control)] border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ' +
                        actionTone(s.action)
                      }
                    >
                      {t(ACTION_KEY[s.action])}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--color-fg-primary)]">
                        {s.title}
                      </span>
                      <span className="block truncate font-mono text-[10.5px] text-[var(--color-fg-faint)]">
                        {s.newSessionId ?? s.sessionId}
                      </span>
                    </span>
                    {s.reason && (
                      <span className="shrink-0 text-[11px] text-[var(--color-fg-muted)]">
                        {s.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* memory */}
          {preview.memory.length > 0 && (
            <div>
              <span className="eyebrow">{t('import.memory.heading')}</span>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {preview.memory.map((m) => (
                  <li
                    key={m.filename}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-fg-secondary)]"
                  >
                    <span className="text-[var(--color-fg-primary)]">{m.filename}</span>
                    <span className="text-[var(--color-fg-faint)]">
                      ·{' '}
                      {m.action === 'conflict'
                        ? t('import.memory.conflict', { name: m.writtenAs ?? '' })
                        : t(MEM_KEY[m.action])}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {commitMutation.error && (
            <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {(commitMutation.error as Error).message}
            </p>
          )}

          {result ? (
            <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-moss)]/40 bg-[var(--color-moss-soft)] px-4 py-3">
              <p className="font-display text-lg font-light text-[var(--color-fg-primary)]">
                {t('import.result.title')}
              </p>
              <p className="text-sm text-[var(--color-fg-secondary)]">
                {t('import.result.summary', {
                  n: result.imported.length,
                  skipped: result.skipped.length,
                  memory: result.memoryWritten.length,
                  lines: result.historyLinesAdded,
                })}
              </p>
              <Link
                to={`/projects/${encodeURIComponent(result.targetProjectId)}`}
                className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-fg-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-canvas)] hover:opacity-90"
              >
                {t('import.result.viewProject')}
              </Link>
            </div>
          ) : (
            <div className="flex justify-end border-t border-[var(--color-hairline)] pt-4">
              <button
                type="button"
                onClick={() => commitMutation.mutate()}
                disabled={targetCwd.trim() === '' || busy || commitMutation.isPending}
                className="rounded-[var(--radius-control)] bg-[var(--color-fg-primary)] px-5 py-2 text-sm font-medium text-[var(--color-canvas)] shadow-[var(--shadow-rise)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {commitMutation.isPending ? t('import.btn.committing') : t('import.btn.commit')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
