import { listProjects, listSessionsForProject } from './scan.ts';
import type {
  DiskUsage,
  DiskUsageMonthRow,
  DiskUsageProjectRow,
  DiskUsageTopSession,
  SessionSummary,
} from '../types.ts';

const TOP_N = 20;

export async function computeDiskUsage(): Promise<DiskUsage> {
  const projects = await listProjects();

  const byProject: DiskUsageProjectRow[] = [];
  const monthMap = new Map<string, { bytes: number; count: number }>();
  const flat: Array<{
    projectId: string;
    sessionId: string;
    title: string;
    customTitle: string | null;
    bytes: number;
    lastAt: string | null;
  }> = [];

  for (const p of projects) {
    const sessions = await listSessionsForProject(p.id);
    byProject.push({
      projectId: p.id,
      decodedCwd: p.decodedCwd,
      totalBytes: p.totalBytes,
      sessionCount: p.sessionCount,
    });

    for (const s of sessions) {
      const total = sessionTotal(s);
      const month = s.lastAt ? s.lastAt.slice(0, 7) : 'unknown';
      const acc = monthMap.get(month) ?? { bytes: 0, count: 0 };
      acc.bytes += total;
      acc.count += 1;
      monthMap.set(month, acc);
      flat.push({
        projectId: p.id,
        sessionId: s.id,
        title: s.title,
        customTitle: s.customTitle,
        bytes: total,
        lastAt: s.lastAt,
      });
    }
  }

  byProject.sort((a, b) => b.totalBytes - a.totalBytes);

  const byMonth: DiskUsageMonthRow[] = [...monthMap.entries()]
    .map(([month, v]) => ({ month, totalBytes: v.bytes, sessionCount: v.count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const topSessions: DiskUsageTopSession[] = flat
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, TOP_N)
    .map((f) => ({
      projectId: f.projectId,
      sessionId: f.sessionId,
      title: f.title,
      customTitle: f.customTitle,
      totalBytes: f.bytes,
      lastAt: f.lastAt,
    }));

  return {
    byProject,
    byMonth,
    topSessions,
    totalBytes: byProject.reduce((acc, r) => acc + r.totalBytes, 0),
    totalSessions: flat.length,
  };
}

function sessionTotal(s: SessionSummary): number {
  const r = s.relatedBytes;
  return r.jsonl + r.subdir + r.fileHistory + r.sessionEnv;
}
