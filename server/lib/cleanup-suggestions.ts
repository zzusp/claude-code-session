import fs from 'node:fs';
import path from 'node:path';
import { isUnderClaudeRoot, PATHS } from './claude-paths.ts';
import { dirSize } from './fs-size.ts';
import { isSafeId } from './safe-id.ts';
import { safeRemove } from './safe-remove.ts';
import { scanProjectsForDisk } from './scan.ts';
import type {
  DiskCleanupLargeSession,
  DiskCleanupOrphan,
  DiskCleanupSuggestions,
} from '../types.ts';

const TOP_N_SESSIONS = 10;
const JSONL_EXT = '.jsonl';

/**
 * 扫描所有 projects/<encoded>/*.jsonl 收集 sid 全集——后面 file-history/<sid>/、
 * session-env/<sid>/ 与该集合做差，剩下的就是孤儿。
 */
function collectKnownSessionIds(): Set<string> {
  const known = new Set<string>();
  if (!fs.existsSync(PATHS.projects)) return known;
  for (const proj of fs.readdirSync(PATHS.projects, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue;
    const projectDir = path.join(PATHS.projects, proj.name);
    if (!isUnderClaudeRoot(projectDir)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith(JSONL_EXT)) {
        known.add(ent.name.slice(0, -JSONL_EXT.length));
      } else if (ent.isDirectory()) {
        // projects/<encoded>/<sid>/ 子目录也是 session 主体的一部分（即使 jsonl 已被外部删），
        // 也算"已知"，不当孤儿处理。
        known.add(ent.name);
      }
    }
  }
  return known;
}

/**
 * 扫 file-history/ 或 session-env/ 下的子目录，过滤掉已知 sid，剩下的就是孤儿。
 * 每条返回大小（用 fs-size.dirSize 复用统一 du 逻辑）。
 */
function scanOrphans(rootDir: string, known: Set<string>): DiskCleanupOrphan[] {
  if (!fs.existsSync(rootDir)) return [];
  const out: DiskCleanupOrphan[] = [];
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const sid = ent.name;
    if (!isSafeId(sid)) continue;
    if (known.has(sid)) continue;
    const full = path.join(rootDir, sid);
    if (!isUnderClaudeRoot(full)) continue;
    out.push({ sessionId: sid, sizeBytes: dirSize(full) });
  }
  out.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return out;
}

export async function computeCleanupSuggestions(): Promise<DiskCleanupSuggestions> {
  const projects = await scanProjectsForDisk();

  // 大会话：扫每个项目的会话，按总占用排序取 top 10
  const flat: DiskCleanupLargeSession[] = [];
  for (const p of projects) {
    for (const s of p.sessions) {
      const r = s.relatedBytes;
      const total = r.jsonl + r.subdir + r.fileHistory + r.sessionEnv;
      if (total <= 0) continue;
      flat.push({
        sessionId: s.id,
        projectId: p.id,
        projectPath: p.decodedCwd,
        title: s.title,
        customTitle: s.customTitle,
        sizeBytes: total,
        lastActivity: s.lastAt,
      });
    }
  }
  flat.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const largeSessions = flat.slice(0, TOP_N_SESSIONS);

  // 孤儿：file-history/<sid>/ 或 session-env/<sid>/ 但 sid 不在任何 .jsonl 中
  const known = collectKnownSessionIds();
  const orphanFileHistory = scanOrphans(PATHS.fileHistory, known);
  const orphanSessionEnv = scanOrphans(PATHS.sessionEnv, known);

  return { largeSessions, orphanFileHistory, orphanSessionEnv };
}

/**
 * 删一个孤儿目录（file-history/<sid>/ 或 session-env/<sid>/）。
 *
 * 这里不复用 deleteSessions 的主流程：那条路径以 projects/<pid>/<sid>.jsonl 为锚点，
 * jsonl + subdir 都不存在时会被 "no files for this session" 早退出，没法处理"主体已没了
 * 但侧 store 还在"的纯孤儿场景。但「路径校验 + 实际 rm」这道安全网两条删除路径必须一致，
 * 所以共用 safeRemove —— 差异只在前置判定（这里是"二次确认仍是孤儿"，deleteSessions 是
 * "跳过 live PID / 5 分钟内活跃"）。
 *
 * 调用方负责 sid 已过 isSafeId、kind 已经过白名单校验。
 */
export function deleteOrphan(
  kind: 'file-history' | 'session-env',
  sessionId: string,
): { ok: true; freedBytes: number } | { ok: false; reason: string } {
  const rootDir = kind === 'file-history' ? PATHS.fileHistory : PATHS.sessionEnv;
  const target = path.join(rootDir, sessionId);
  if (!isUnderClaudeRoot(target)) {
    return { ok: false, reason: `path escapes ~/.claude: ${target}` };
  }
  if (!fs.existsSync(target)) {
    return { ok: false, reason: 'orphan no longer exists' };
  }
  // 二次保险：确认它现在确实还是孤儿（避免并发场景下用户先点了"导入"再点"删除"）
  const known = collectKnownSessionIds();
  if (known.has(sessionId)) {
    return { ok: false, reason: 'session is no longer orphaned' };
  }
  const freedBytes = dirSize(target);
  safeRemove(target);
  return { ok: true, freedBytes };
}

