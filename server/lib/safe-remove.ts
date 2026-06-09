import fs from 'node:fs';
import { isUnderClaudeRoot } from './claude-paths.ts';

/**
 * ~/.claude/ 下所有删除的唯一入口：先过 isUnderClaudeRoot 路径校验，再真正 rm。
 *
 * deleteSessions（5 处级联）和 deleteOrphan（孤儿目录）共用这一份"路径校验 + 实际 rm"，
 * 把"目标必须落在 ~/.claude 子树内"这条安全网集中到一处——以后改删除约束
 * （加路径校验、改 rm 行为、加新防护）只改这里，不会两边各写一份、改一边漏一边。
 *
 * 文件和目录都走 recursive: true（对文件无副作用），所以单一入口能覆盖两种形态。
 *
 * @returns 是否真的删了东西（目标不存在 → false）
 * @throws 目标逃出 ~/.claude 子树 —— 最后一道兜底，绝不 silently 删 root 外的东西。
 *         调用方应在更早处用 isUnderClaudeRoot 做 graceful 预检并给出跳过原因，
 *         走到这里抛错说明前置校验漏了，是 bug 不是正常流程。
 */
export function safeRemove(target: string): boolean {
  if (!isUnderClaudeRoot(target)) {
    throw new Error(`refuse to remove path outside ~/.claude: ${target}`);
  }
  if (!fs.existsSync(target)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}
