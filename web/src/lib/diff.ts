import type { DiffHunk } from './api.ts';

// 行级 + 字内 diff 的纯函数集。「修改的文件」弹窗（split 视图）与消息流的
// ToolBlock（Edit 展开体）共用同一套算法，保证两处的 −/+ 着色与字内高亮一致。

/** 行内 word-level 片段：changed=该 token 仅存在于本侧（GitHub 行内高亮）。 */
export interface Seg {
  text: string;
  changed: boolean;
}

/** 统一视图的一行：context=两侧都在的未改动行；del/add=删除/新增行；
 *  gap=被折叠省略的未改动区间（只显示省略了多少行，不渲染正文）。 */
export type RowKind = 'context' | 'del' | 'add' | 'gap';
export interface UnifiedRow {
  oldNo: number | null;
  newNo: number | null;
  kind: RowKind;
  text: string | null;
  /** 仅 gap 行有值：被折叠省略的行数。 */
  gap?: number;
  /** 仅在「删除 ↔ 新增」配对行上有值，用于行内高亮；其余为 null（整行着色）。 */
  segs: Seg[] | null;
}

/** structuredPatch（带真实行号的 hunk）→ 统一视图行。hunk 之间的未改动区折叠成一行 gap。 */
export function rowsFromHunks(hunks: DiffHunk[]): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  let prevNewEnd = 0; // 上一 hunk 结束时的新文件行号（0=文件开头）
  for (const h of hunks) {
    const gap = h.newStart - prevNewEnd - 1;
    if (gap > 0) rows.push({ oldNo: null, newNo: null, kind: 'gap', text: null, gap, segs: null });
    let oldNo = h.oldStart;
    let newNo = h.newStart;
    const lines = h.lines;
    let i = 0;
    while (i < lines.length) {
      const c = lines[i]![0];
      if (c === '-' || c === '+') {
        // 收集相邻的一段删除 + 新增，按序号配对做行内高亮（GitHub 习惯）。
        const dels: string[] = [];
        const adds: string[] = [];
        const delStart = oldNo;
        const addStart = newNo;
        while (i < lines.length && lines[i]![0] === '-') {
          dels.push(lines[i]!.slice(1));
          oldNo++;
          i++;
        }
        while (i < lines.length && lines[i]![0] === '+') {
          adds.push(lines[i]!.slice(1));
          newNo++;
          i++;
        }
        for (let x = 0; x < dels.length; x++) {
          const paired = x < adds.length ? wordSegments(dels[x]!, adds[x]!) : null;
          rows.push({ oldNo: delStart + x, newNo: null, kind: 'del', text: dels[x]!, segs: paired?.left ?? null });
        }
        for (let x = 0; x < adds.length; x++) {
          const paired = x < dels.length ? wordSegments(dels[x]!, adds[x]!) : null;
          rows.push({ oldNo: null, newNo: addStart + x, kind: 'add', text: adds[x]!, segs: paired?.right ?? null });
        }
      } else {
        // 上下文行（前导空格）；异常前缀（如 "\ No newline at end of file"）并入上下文不影响对齐。
        rows.push({ oldNo, newNo, kind: 'context', text: lines[i]!.slice(1), segs: null });
        oldNo++;
        newNo++;
        i++;
      }
    }
    prevNewEnd = newNo - 1;
  }
  return rows;
}

/** old/new 原文 → 统一视图行（行号从 1 起、无真实文件行号，用于 create 全新内容
 *  或结果尚未落地的兜底；一旦 structuredPatch 到位即被真实行号版本取代）。 */
export function rowsFromStrings(oldStr: string, newStr: string): UnifiedRow[] {
  // 空串视为 0 行（而非 ['']），避免纯新增 / 纯删除时出现一个幻影空行。
  const ops = diffOps(oldStr === '' ? [] : oldStr.split('\n'), newStr === '' ? [] : newStr.split('\n'));
  const rows: UnifiedRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let i = 0;
  while (i < ops.length) {
    const op = ops[i]!;
    if (op.type === 'equal') {
      oldNo++;
      newNo++;
      rows.push({ oldNo, newNo, kind: 'context', text: op.text, segs: null });
      i++;
      continue;
    }
    const dels: string[] = [];
    const adds: string[] = [];
    while (i < ops.length && ops[i]!.type !== 'equal') {
      const cur = ops[i]!;
      if (cur.type === 'del') dels.push(cur.text);
      else adds.push(cur.text);
      i++;
    }
    for (let x = 0; x < dels.length; x++) {
      const paired = x < adds.length ? wordSegments(dels[x]!, adds[x]!) : null;
      oldNo++;
      rows.push({ oldNo, newNo: null, kind: 'del', text: dels[x]!, segs: paired?.left ?? null });
    }
    for (let x = 0; x < adds.length; x++) {
      const paired = x < dels.length ? wordSegments(dels[x]!, adds[x]!) : null;
      newNo++;
      rows.push({ oldNo: null, newNo, kind: 'add', text: adds[x]!, segs: paired?.right ?? null });
    }
  }
  return rows;
}

// token 粒度：连续空白 / 连续单词字符 / 连续标点各成一段，贴近 GitHub 的行内分词。
const WORD_RE = /\s+|\w+|[^\w\s]+/g;

/** 一行内的 word-level diff：复用 diffOps（行级 LCS）在 token 上再跑一次。
 *  返回左右两侧的 token 段（changed=仅本侧独有）。两行毫无公共 token、空行或过长行时返回 null（退回整行着色）。 */
function wordSegments(oldLine: string, newLine: string): { left: Seg[]; right: Seg[] } | null {
  const a = oldLine.match(WORD_RE) ?? [];
  const b = newLine.match(WORD_RE) ?? [];
  if (a.length === 0 || b.length === 0) return null;
  if (a.length * b.length > 20000) return null; // O(n·m) 兜底，避免超长/压缩行卡顿
  const ops = diffOps(a, b);
  const left: Seg[] = [];
  const right: Seg[] = [];
  for (const op of ops) {
    if (op.type === 'equal') {
      pushSeg(left, op.text, false);
      pushSeg(right, op.text, false);
    } else if (op.type === 'del') {
      pushSeg(left, op.text, true);
    } else {
      pushSeg(right, op.text, true);
    }
  }
  // 两侧全是 changed → 没有公共 token，高亮等于整行，没意义，退回整行着色。
  if (left.every((s) => s.changed) && right.every((s) => s.changed)) return null;
  return { left, right };
}

function pushSeg(arr: Seg[], text: string, changed: boolean): void {
  const last = arr[arr.length - 1];
  if (last && last.changed === changed) last.text += text;
  else arr.push({ text, changed });
}

interface DiffOp {
  type: 'equal' | 'del' | 'add';
  text: string;
}

// 规模上限：n·m 超过此值跳过 LCS 对齐，整体「全删 + 全增」。DP 是 O(n·m) 时间
// + 内存，~2000×2000 行的巨型 Edit 会分配 ~32MB 并阻塞主线程数百 ms；超限直接
// 退化能保证 UI 不卡死（代价是这种罕见的超大改动失去行级对齐）。
const LCS_CELL_CAP = 1_000_000;

// 经典 LCS 行级 diff：dp[i][j] = a[i:] 与 b[j:] 的最长公共子序列长度，
// 回溯得到 equal / del / add 操作序列。编辑片段通常很短，O(n·m) 足够。
function diffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  if (n * m > LCS_CELL_CAP) {
    return [
      ...a.map((text): DiffOp => ({ type: 'del', text })),
      ...b.map((text): DiffOp => ({ type: 'add', text })),
    ];
  }
  const dp: number[][] = [];
  for (let i = 0; i <= n; i++) dp.push(new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'del', text: a[i]! });
      i++;
    } else {
      ops.push({ type: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++]! });
  while (j < m) ops.push({ type: 'add', text: b[j++]! });
  return ops;
}
