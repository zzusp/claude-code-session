import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DeleteDialog from '../components/DeleteDialog.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import { api, type SessionSummary } from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { queryKeys } from '../lib/query-keys.ts';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = projectId ?? '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDialog, setShowDialog] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.projectSessions(id),
    queryFn: () => api<SessionSummary[]>(`/api/projects/${encodeURIComponent(id)}/sessions`),
    enabled: !!id,
  });

  const sessions = data ?? [];
  const selectedSessions = useMemo(
    () => sessions.filter((s) => selected.has(s.id)),
    [sessions, selected],
  );

  function toggle(sid: string) {
    const next = new Set(selected);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === sessions.length) setSelected(new Set());
    else setSelected(new Set(sessions.map((s) => s.id)));
  }

  return (
    <section>
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← All projects
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="break-all font-mono text-base text-neutral-900">{id}</h1>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDialog(true)}
            disabled={selected.size === 0}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {isLoading && <p className="mt-6 text-sm text-neutral-500">Reading sessions…</p>}
      {error && (
        <p className="mt-6 text-sm text-red-600">
          Failed to load sessions: {(error as Error).message}
        </p>
      )}
      {data && data.length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No sessions in this project.</p>
      )}

      {sessions.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Toggle all"
                    checked={selected.size === sessions.length && sessions.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Messages</th>
                <th className="px-3 py-2 font-medium">Last activity</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  className={selected.has(s.id) ? 'bg-blue-50/50' : 'hover:bg-neutral-50'}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${s.title}`}
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/projects/${encodeURIComponent(id)}/sessions/${s.id}`}
                      className="block max-w-md truncate font-medium text-neutral-900 hover:underline"
                      title={s.title}
                    >
                      {s.title}
                    </Link>
                    <div className="mt-0.5 truncate font-mono text-xs text-neutral-400">
                      {s.id}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-neutral-700">{s.messageCount}</td>
                  <td className="px-3 py-2 font-mono text-neutral-700">
                    {formatRelativeTime(s.lastAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-neutral-700" title={breakdown(s)}>
                    {formatBytes(totalBytes(s))}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge session={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDialog && (
        <DeleteDialog
          projectId={id}
          selected={selectedSessions}
          onClose={() => {
            setShowDialog(false);
            setSelected(new Set());
          }}
        />
      )}
    </section>
  );
}

function totalBytes(s: SessionSummary): number {
  const r = s.relatedBytes;
  return r.jsonl + r.subdir + r.fileHistory + r.sessionEnv;
}

function breakdown(s: SessionSummary): string {
  const r = s.relatedBytes;
  return [
    `jsonl ${formatBytes(r.jsonl)}`,
    `subdir ${formatBytes(r.subdir)}`,
    `file-history ${formatBytes(r.fileHistory)}`,
    `session-env ${formatBytes(r.sessionEnv)}`,
  ].join(' · ');
}
