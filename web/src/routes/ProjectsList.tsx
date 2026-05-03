import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type HealthResponse, type ProjectSummary } from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { queryKeys } from '../lib/query-keys.ts';

export default function ProjectsList() {
  const health = useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => api<HealthResponse>('/api/health'),
  });

  const projects = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => api<ProjectSummary[]>('/api/projects'),
  });

  const totalBytes = projects.data?.reduce((acc, p) => acc + p.totalBytes, 0) ?? 0;
  const totalSessions =
    projects.data?.reduce((acc, p) => acc + p.sessionCount, 0) ?? 0;

  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Projects</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Claude Code sessions grouped by working directory.
          </p>
        </div>
        {projects.data && (
          <div className="text-right text-sm text-neutral-600">
            <div>
              <span className="font-mono text-neutral-900">{projects.data.length}</span> projects
              {' · '}
              <span className="font-mono text-neutral-900">{totalSessions}</span> sessions
            </div>
            <div>
              <span className="font-mono text-neutral-900">{formatBytes(totalBytes)}</span> on disk
            </div>
          </div>
        )}
      </header>

      {health.data && !health.data.claudeRootExists && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Claude root <span className="font-mono">{health.data.claudeRoot}</span> doesn't exist on
          this machine — nothing to display.
        </div>
      )}

      {projects.isLoading && (
        <p className="mt-6 text-sm text-neutral-500">Scanning ~/.claude/projects/…</p>
      )}
      {projects.error && (
        <p className="mt-6 text-sm text-red-600">
          Failed to load projects: {(projects.error as Error).message}
        </p>
      )}

      {projects.data && projects.data.length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No projects found.</p>
      )}

      {projects.data && projects.data.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {projects.data.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${encodeURIComponent(p.id)}`}
                className="block rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 hover:shadow-sm"
              >
                <div
                  className="truncate font-mono text-sm text-neutral-900"
                  title={p.decodedCwd}
                >
                  {p.decodedCwd}
                </div>
                {!p.cwdResolved && (
                  <div className="mt-0.5 text-xs text-amber-600">
                    path may not exist anymore
                  </div>
                )}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-neutral-600">
                  <div>
                    <dt className="text-neutral-500">Sessions</dt>
                    <dd className="font-mono text-neutral-900">{p.sessionCount}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">On disk</dt>
                    <dd className="font-mono text-neutral-900">{formatBytes(p.totalBytes)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Last active</dt>
                    <dd className="font-mono text-neutral-900">
                      {formatRelativeTime(p.lastActiveAt)}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
