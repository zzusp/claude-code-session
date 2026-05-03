import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, type DiskUsage } from '../lib/api.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { queryKeys } from '../lib/query-keys.ts';

const PIE_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export default function DiskUsageRoute() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.diskUsage(),
    queryFn: () => api<DiskUsage>('/api/disk-usage'),
  });

  const pieData = useMemo(() => {
    if (!data) return [];
    return data.byProject.map((p) => ({
      name: shortCwd(p.decodedCwd),
      value: p.totalBytes,
    }));
  }, [data]);

  const monthData = useMemo(() => {
    if (!data) return [];
    return data.byMonth.map((m) => ({ month: m.month, MB: m.totalBytes / 1_048_576 }));
  }, [data]);

  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Disk usage</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Bytes per project, per month, and largest sessions.
      </p>

      {isLoading && <p className="mt-6 text-sm text-neutral-500">Computing…</p>}
      {error && (
        <p className="mt-6 text-sm text-red-600">
          Failed: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Total" value={formatBytes(data.totalBytes)} />
            <Stat label="Projects" value={String(data.byProject.length)} />
            <Stat label="Sessions" value={String(data.totalSessions)} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="By project">
              {pieData.length === 0 ? (
                <Empty />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={100}
                        label={(entry) => entry.name}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatBytes(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="By month (MB)">
              {monthData.length === 0 ? (
                <Empty />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthData}>
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => `${value.toFixed(2)} MB`} />
                      <Bar dataKey="MB" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card title="Largest sessions" className="mt-6">
            {data.topSessions.length === 0 ? (
              <Empty />
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Project</th>
                    <th className="px-3 py-2 font-medium">Last activity</th>
                    <th className="px-3 py-2 font-medium text-right">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.topSessions.map((s) => (
                    <tr key={`${s.projectId}/${s.sessionId}`} className="hover:bg-neutral-50">
                      <td className="px-3 py-2">
                        <Link
                          to={`/projects/${encodeURIComponent(s.projectId)}/sessions/${s.sessionId}`}
                          className="block max-w-md truncate font-medium text-neutral-900 hover:underline"
                          title={s.title}
                        >
                          {s.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate font-mono text-xs text-neutral-500">
                        <Link
                          to={`/projects/${encodeURIComponent(s.projectId)}`}
                          className="hover:underline"
                          title={s.projectId}
                        >
                          {projectCwdLabel(data, s.projectId)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-neutral-700">
                        {formatRelativeTime(s.lastAt)}
                      </td>
                      <td className="px-3 py-2 font-mono text-neutral-700 text-right">
                        {formatBytes(s.totalBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </section>
  );
}

function projectCwdLabel(data: DiskUsage, projectId: string): string {
  const p = data.byProject.find((row) => row.projectId === projectId);
  return p ? shortCwd(p.decodedCwd) : projectId;
}

function shortCwd(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return cwd;
  return '…/' + parts.slice(-2).join('/');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 font-mono text-lg text-neutral-900">{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-neutral-200 bg-white p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-medium text-neutral-700">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-neutral-500">No data.</p>;
}
