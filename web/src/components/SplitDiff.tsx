import type { Seg, UnifiedRow } from '../lib/diff.ts';
import { useT } from '../lib/i18n.ts';

/** 分屏（左右两栏）一侧的一行。kind=empty 时本侧无对应行（对侧是纯增 / 纯删），
 *  渲染成留白占位行，保证两栏行高一一对齐。 */
interface SplitCell {
  no: number | null;
  kind: 'context' | 'del' | 'add' | 'empty';
  text: string | null;
  segs: Seg[] | null;
}
/** 分屏一行：pair=左右各一格；gap=折叠的未改动区间，两栏同高同文。 */
interface SplitRow {
  kind: 'pair' | 'gap';
  gap?: number;
  left?: SplitCell;
  right?: SplitCell;
}

/** 统一视图行 → 分屏行。rowsFrom* 在一个改动块里先发全部 del 再发全部 add，
 *  这里按序号把 del[x]↔add[x] 配成一行（多出的一侧用 empty 占位），未改动行左右同文。 */
function toSplitRows(rows: UnifiedRow[]): SplitRow[] {
  const out: SplitRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i]!;
    if (r.kind === 'gap') {
      out.push({ kind: 'gap', gap: r.gap ?? 0 });
      i++;
      continue;
    }
    if (r.kind === 'context') {
      out.push({
        kind: 'pair',
        left: { no: r.oldNo, kind: 'context', text: r.text, segs: null },
        right: { no: r.newNo, kind: 'context', text: r.text, segs: null },
      });
      i++;
      continue;
    }
    const dels: UnifiedRow[] = [];
    const adds: UnifiedRow[] = [];
    while (i < rows.length && rows[i]!.kind === 'del') dels.push(rows[i++]!);
    while (i < rows.length && rows[i]!.kind === 'add') adds.push(rows[i++]!);
    const max = Math.max(dels.length, adds.length);
    for (let x = 0; x < max; x++) {
      const d = dels[x];
      const a = adds[x];
      out.push({
        kind: 'pair',
        left: d
          ? { no: d.oldNo, kind: 'del', text: d.text, segs: d.segs }
          : { no: null, kind: 'empty', text: null, segs: null },
        right: a
          ? { no: a.newNo, kind: 'add', text: a.text, segs: a.segs }
          : { no: null, kind: 'empty', text: null, segs: null },
      });
    }
  }
  return out;
}

/** GitHub 风格的分屏 diff：左栏旧（含删除），右栏新（含新增），两栏行级对齐。
 *  两栏各自横向滚动；因每行 whitespace-pre 恒为一行高、左右行数相同，纵向天然对齐。 */
export function SplitDiff({ rows, label }: { rows: UnifiedRow[]; label?: string }) {
  if (rows.length === 0) return <EmptyBody />;
  const split = toSplitRows(rows);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-hairline)]">
      {label && (
        <div className="border-b border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
          {label}
        </div>
      )}
      <div className="flex">
        <div className="w-1/2 overflow-x-auto border-r border-[var(--color-hairline)]">
          <div className="w-max min-w-full">
            {split.map((r, i) => (
              <SplitLine key={i} row={r} side="left" />
            ))}
          </div>
        </div>
        <div className="w-1/2 overflow-x-auto">
          <div className="w-max min-w-full">
            {split.map((r, i) => (
              <SplitLine key={i} row={r} side="right" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitLine({ row, side }: { row: SplitRow; side: 'left' | 'right' }) {
  const t = useT();
  if (row.kind === 'gap') {
    return (
      <div className="flex bg-[var(--color-sunken)] leading-[1.65] text-[var(--color-fg-faint)]">
        <span className="w-[3em] shrink-0 select-none border-r border-[var(--color-hairline)] bg-[inherit] px-1.5 text-center font-mono text-[11px]">
          ⋯
        </span>
        <span className="whitespace-nowrap px-3 font-mono text-[10px] italic tracking-[0.04em]">
          {t('session.modified.linesOmitted', { n: row.gap ?? 0 })}
        </span>
      </div>
    );
  }
  const cell = side === 'left' ? row.left! : row.right!;
  const bg =
    cell.kind === 'del'
      ? 'bg-[var(--color-danger-soft)]'
      : cell.kind === 'add'
        ? 'bg-[var(--color-moss-soft)]'
        : cell.kind === 'empty'
          ? 'bg-[var(--color-sunken)]/40'
          : 'bg-[var(--color-surface)]';
  const marker = cell.kind === 'del' ? '−' : cell.kind === 'add' ? '+' : '';
  const markerColor =
    cell.kind === 'del'
      ? 'text-[var(--color-danger)]'
      : cell.kind === 'add'
        ? 'text-[var(--color-moss)]'
        : 'text-transparent';
  // 改动 token 的强调底色：在整行 -soft 底色上再叠一层更饱和的同色（GitHub 行内高亮）。
  const hl = cell.kind === 'del' ? 'bg-[var(--color-danger)]/25' : 'bg-[var(--color-moss)]/30';
  return (
    <div className={`flex leading-[1.65] ${bg}`}>
      <span className="w-[3em] shrink-0 select-none border-r border-[var(--color-hairline)] bg-[inherit] px-1.5 text-right font-mono text-[10px] tabular-nums text-[var(--color-fg-faint)]">
        {cell.no ?? ''}
      </span>
      <span className={`w-4 shrink-0 select-none text-center font-mono text-[11.5px] ${markerColor}`}>
        {marker}
      </span>
      <div className="whitespace-pre pr-3 font-mono text-[11.5px] text-[var(--color-fg-primary)]">
        {cell.segs && cell.segs.length > 0
          ? cell.segs.map((s, i) =>
              s.changed ? (
                <span key={i} className={hl}>
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )
          : cell.text == null || cell.text === ''
            ? ' '
            : cell.text}
      </div>
    </div>
  );
}

function EmptyBody() {
  const t = useT();
  return (
    <p className="px-3 py-2.5 text-[12px] italic text-[var(--color-fg-muted)]">
      {t('session.modified.noContent')}
    </p>
  );
}
