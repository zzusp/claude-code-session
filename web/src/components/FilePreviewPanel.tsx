import { useMemo } from 'react';
import { rowsFromStrings, type UnifiedRow } from '../lib/diff.ts';
import type { FilePreviewTarget } from '../lib/file-preview.ts';
import { useT } from '../lib/i18n.ts';
import FileThumb from './FileThumb.tsx';
import { SplitDiff } from './SplitDiff.tsx';

// 正文（Read 快照 / Write 写入内容）最多渲染的行数——超出折叠成「还有 n 行」，
// 避免一次几千行的整文件把面板 DOM 撑爆。
const MAX_CONTENT_LINES = 2000;

/** 右侧文件预览面板：把一次文件操作（tool_use）的内容铺在会话流右栏。
 *  Read/Write/NotebookEdit 显示文件正文，Edit/MultiEdit 显示左右对照 diff。
 *  全部数据来自已加载的会话消息，不发二次请求。 */
export default function FilePreviewPanel({
  target,
  readContent,
  onClose,
}: {
  target: FilePreviewTarget;
  /** 该 tool_use 对应 tool_result 的正文，仅 Read 用得上；其余传 null。 */
  readContent: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const tail = fileName(target.path);
  const ext = fileExt(target.path);
  const body = useMemo(
    () => buildBody(target.name, target.input, readContent),
    [target.name, target.input, readContent],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--color-hairline)] px-3.5 py-2">
        <span className="text-[var(--color-fg-muted)]">
          <FileThumb size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[13px] font-medium leading-tight text-[var(--color-fg-primary)]"
            title={target.path}
          >
            {tail}
          </h3>
          <p className="truncate font-mono text-[10.5px] leading-tight text-[var(--color-fg-faint)]" title={target.path}>
            {target.name}
            {ext && <span className="opacity-50"> · </span>}
            {ext}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('session.preview.close')}
          title={t('session.preview.close')}
          className="shrink-0 rounded-[var(--radius-control)] p-1.5 text-[var(--color-fg-muted)] transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto [contain:paint]">
        <div className="px-3.5 py-3">
          <PreviewBody body={body} />
        </div>
        {/* 底部留白，正文最后一行不贴边。 */}
        <div className="h-4" aria-hidden />
      </div>
    </div>
  );
}

/* ── body 构建 + 渲染 ─────────────────────────────────────────────────────── */

type Body =
  | { kind: 'content'; text: string; label: string }
  | { kind: 'diff'; rows: UnifiedRow[] }
  | { kind: 'multidiff'; sections: UnifiedRow[][] }
  | { kind: 'empty'; messageKey: 'session.preview.noResult' | 'session.modified.noContent' };

function buildBody(name: string, rawInput: unknown, readContent: string | null): Body {
  const input = asRecord(rawInput);
  switch (name) {
    case 'Read':
      return readContent && readContent.trim() !== ''
        ? { kind: 'content', text: readContent, label: 'read' }
        : { kind: 'empty', messageKey: 'session.preview.noResult' };
    case 'Write':
      return { kind: 'content', text: strOf(input.content), label: 'write' };
    case 'NotebookEdit':
      return { kind: 'content', text: strOf(input.new_source), label: 'write' };
    case 'Edit':
      return {
        kind: 'diff',
        rows: rowsFromStrings(strOf(input.old_string), strOf(input.new_string)),
      };
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? input.edits : [];
      return {
        kind: 'multidiff',
        sections: edits.map((e) => {
          const er = asRecord(e);
          return rowsFromStrings(strOf(er.old_string), strOf(er.new_string));
        }),
      };
    }
    default:
      return { kind: 'empty', messageKey: 'session.modified.noContent' };
  }
}

function PreviewBody({ body }: { body: Body }) {
  const t = useT();
  if (body.kind === 'empty') {
    return (
      <p className="px-1 py-2 text-[12px] italic text-[var(--color-fg-muted)]">
        {t(body.messageKey)}
      </p>
    );
  }
  if (body.kind === 'content') {
    const label =
      body.label === 'read' ? t('session.preview.readSnapshot') : t('session.preview.writtenContent');
    return <CodeListing text={body.text} label={label} />;
  }
  if (body.kind === 'diff') {
    return <SplitDiff rows={body.rows} />;
  }
  return (
    <div className="space-y-3">
      {body.sections.map((rows, i) => (
        <SplitDiff key={i} rows={rows} label={t('session.modified.editN', { n: i + 1 })} />
      ))}
    </div>
  );
}

/** 行号网格的文件正文。Claude Code 的 Read 结果每行自带 `   12→…` 行号，这里把它
 *  解析进网格栏（避免再叠一层重复号）；无前缀的写入内容则按序号补齐。 */
function CodeListing({ text, label }: { text: string; label: string }) {
  const t = useT();
  const lines = useMemo(() => {
    const all = text.split('\n');
    // text 以 \n 收尾时 split 会多出一个空尾元素，去掉它免得多一行空行号。
    if (all.length > 1 && all[all.length - 1] === '') all.pop();
    return all;
  }, [text]);

  const shown = lines.length > MAX_CONTENT_LINES ? lines.slice(0, MAX_CONTENT_LINES) : lines;
  const omitted = lines.length - shown.length;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-hairline)]">
      <div className="border-b border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
        {label}
      </div>
      <div className="overflow-x-auto">
        <div className="w-max min-w-full font-mono text-[11.5px] leading-[1.65]">
          {shown.map((raw, i) => {
            const m = /^(\s*)(\d+)→(.*)$/.exec(raw);
            const no = m ? m[2]! : String(i + 1);
            const content = m ? m[3]! : raw;
            return (
              <div key={i} className="flex">
                <span className="w-[3.5em] shrink-0 select-none border-r border-[var(--color-hairline)] bg-[var(--color-sunken)]/40 px-2 text-right tabular-nums text-[var(--color-fg-faint)]">
                  {no}
                </span>
                <span className="whitespace-pre px-3 text-[var(--color-fg-primary)]">
                  {content === '' ? ' ' : content}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {omitted > 0 && (
        <p className="border-t border-[var(--color-hairline)] px-3 py-1 font-mono text-[10px] italic text-[var(--color-fg-faint)]">
          {t('tool.moreLines', { n: omitted })}
        </p>
      )}
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function strOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
}

function fileName(p: string): string {
  const segs = p.split(/[\\/]+/).filter(Boolean);
  return segs[segs.length - 1] || p;
}

function fileExt(p: string): string {
  const base = fileName(p);
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toUpperCase();
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
