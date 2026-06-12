import { useMemo, useState, type ReactNode } from 'react';
import type { Block } from '../lib/api.ts';
import { rowsFromStrings, type UnifiedRow } from '../lib/diff.ts';
import { useT } from '../lib/i18n.ts';
import FileThumb from './FileThumb.tsx';
import HighlightedText from './HighlightedText.tsx';

const PREVIEW_CHARS = 280;

// Edit/Write 展开体最多渲染的 diff 行数——超出折叠成「还有 n 行」，避免一次
// Write 几千行内容把消息流 DOM 撑爆。
const MAX_DIFF_ROWS = 160;

/* ── tool_use ───────────────────────────────────────────────────────────── */

export function ToolUseBlock({
  block,
  query,
}: {
  block: Extract<Block, { type: 'tool_use' }>;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const input = asRecord(block.input);
  // 「读用富渲染，搜用原文高亮」：query 非空＝搜索态，展开体退回 JSON 原文 +
  // HighlightedText（同 main），保证 haystack 命中的内容在 UI 上一定能看到高亮；
  // 否则走分工具的富展开体（diff / checklist / 命令块）。
  const searching = query.length > 0;

  // 展开体两种头部共用：搜索态 JSON 原文，否则分工具富展开体。
  const body = open && (
    <div className="border-t border-[var(--color-hairline)] bg-[var(--color-surface)]">
      {searching ? (
        <JsonDump input={input} query={query} />
      ) : (
        <ToolUseBody name={block.name} input={input} />
      )}
    </div>
  );

  // 文件操作工具（Read/Write/Edit/…）的折叠头渲染成 claude.ai 风「文件卡」：
  // 倾斜纸张缩略图 + 文件名标题 + 「操作 · 扩展名」副标题，展开仍是原 diff 体。
  const fileOp = fileOpOf(block.name, input);
  if (fileOp) {
    const ext = fileExt(fileOp.path);
    return (
      <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-hairline)] text-sm transition-colors hover:border-[var(--color-hairline-strong)]">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={fileOp.path}
          className="group/file flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-[var(--color-sunken)]"
        >
          <FileThumb />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-tight text-[var(--color-fg-primary)]">
              {fileName(fileOp.path)}
            </span>
            <span className="block truncate text-[11px] leading-tight text-[var(--color-fg-muted)]">
              {block.name}
              {ext && <span className="opacity-50"> · </span>}
              {ext}
            </span>
          </span>
          <Caret open={open} />
        </button>
        {body}
      </div>
    );
  }

  const summary = toolSummary(block.name, input);
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] text-sm transition-colors hover:border-[var(--color-hairline-strong)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition hover:bg-[var(--color-sunken)]"
      >
        {/* Accent-tinted tool glyph chip — makes tool calls scannable in the
            timeline (claude.ai tints its tool affordances the same way). */}
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
          <Glyph kind="tool" />
        </span>
        <span className="shrink-0 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-fg-secondary)]">
          {block.name}
        </span>
        {summary && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-fg-muted)]">
            <HighlightedText text={summary} query={query} />
          </span>
        )}
        <span className="ml-auto shrink-0">
          <Caret open={open} />
        </span>
      </button>
      {body}
    </div>
  );
}

/** 文件操作工具 → 文件路径；非文件工具返回 null（仍走通用折叠行）。Read 也算
 *  文件展示，纳入卡片；其展开体维持原样（输入 JSON）。 */
function fileOpOf(name: string, input: Record<string, unknown>): { path: string } | null {
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit': {
      const p = strOf(input.file_path);
      return p ? { path: p } : null;
    }
    case 'NotebookEdit': {
      const p = strOf(input.notebook_path);
      return p ? { path: p } : null;
    }
    default:
      return null;
  }
}

/** 路径末段当文件名标题；扩展名大写当副标题（claude.ai 用「Document · MD」）。 */
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

/** 富展开体按工具特化：Edit/Write 走与「修改的文件」弹窗同语言的 −/+ diff 行，
 *  TodoWrite 走 checklist，Bash 走命令块；其余保留原始 JSON。仅在非搜索态渲染，
 *  故不接 query（高亮由搜索态的 JsonDump 负责）。rows 用 useMemo 防 live 轮询重算。 */
function ToolUseBody({ name, input }: { name: string; input: Record<string, unknown> }) {
  const t = useT();
  const body = useMemo(() => buildToolBody(name, input), [name, input]);
  switch (body.kind) {
    case 'diff':
      return (
        <>
          <FilePathLine path={body.filePath}>
            {body.replaceAll && (
              <span className="rounded-sm border border-[var(--color-hairline-strong)] px-1 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
                {t('tool.replaceAll')}
              </span>
            )}
          </FilePathLine>
          <DiffRows rows={body.rows} />
        </>
      );
    case 'multidiff':
      return (
        <>
          <FilePathLine path={body.filePath} />
          {body.sections.map((rows, i) => (
            <div key={i}>
              {i > 0 && <div className="rule-dotted mx-3 my-1" aria-hidden />}
              <DiffRows rows={rows} />
            </div>
          ))}
        </>
      );
    case 'bash':
      return <BashBody command={body.command} description={body.description} />;
    case 'todo':
      return <TodoList todos={body.todos} />;
    default:
      return <JsonDump input={input} />;
  }
}

/** 折叠 / 展开都要的 diff 结构在一处算好（useMemo 缓存），按工具分流。 */
type ToolBody =
  | { kind: 'diff'; filePath: string; rows: UnifiedRow[]; replaceAll: boolean }
  | { kind: 'multidiff'; filePath: string; sections: UnifiedRow[][] }
  | { kind: 'bash'; command: string; description: string }
  | { kind: 'todo'; todos: TodoItem[] }
  | { kind: 'json' };

function buildToolBody(name: string, input: Record<string, unknown>): ToolBody {
  switch (name) {
    case 'Edit':
      return {
        kind: 'diff',
        filePath: strOf(input.file_path),
        rows: rowsFromStrings(strOf(input.old_string), strOf(input.new_string)),
        replaceAll: input.replace_all === true,
      };
    case 'Write':
      return {
        kind: 'diff',
        filePath: strOf(input.file_path),
        rows: rowsFromStrings('', strOf(input.content)),
        replaceAll: false,
      };
    case 'NotebookEdit':
      return {
        kind: 'diff',
        filePath: strOf(input.notebook_path),
        rows: rowsFromStrings('', strOf(input.new_source)),
        replaceAll: false,
      };
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? input.edits : [];
      return {
        kind: 'multidiff',
        filePath: strOf(input.file_path),
        sections: edits.map((e) => {
          const er = asRecord(e);
          return rowsFromStrings(strOf(er.old_string), strOf(er.new_string));
        }),
      };
    }
    case 'Bash':
      return { kind: 'bash', command: strOf(input.command), description: strOf(input.description) };
    case 'TodoWrite': {
      const todos = todosOf(input);
      return todos.length > 0 ? { kind: 'todo', todos } : { kind: 'json' };
    }
    default:
      return { kind: 'json' };
  }
}

/** 折叠头部的一行摘要：让消息流不展开也能看出这次调用动了什么。 */
function toolSummary(name: string, input: Record<string, unknown>): string | null {
  switch (name) {
    case 'Bash':
      return firstLine(strOf(input.description) || strOf(input.command));
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'Read':
      return pathTail(strOf(input.file_path));
    case 'NotebookEdit':
      return pathTail(strOf(input.notebook_path));
    case 'Glob':
    case 'Grep':
      return strOf(input.pattern) || null;
    case 'Task':
    case 'Agent':
      return strOf(input.description) || null;
    case 'WebFetch':
      return strOf(input.url) || null;
    case 'WebSearch':
      return strOf(input.query) || null;
    case 'Skill':
      return strOf(input.skill) || null;
    case 'TodoWrite': {
      const todos = todosOf(input);
      if (todos.length === 0) return null;
      const done = todos.filter((x) => x.status === 'completed').length;
      const active = todos.find((x) => x.status === 'in_progress');
      const label = active ? active.activeForm || active.content : '';
      return `${done}/${todos.length}${label ? ` · ${label}` : ''}`;
    }
    default: {
      // 未知工具：取第一个非空字符串字段当摘要，聊胜于无。
      for (const v of Object.values(input)) {
        if (typeof v === 'string' && v.trim()) return firstLine(v);
      }
      return null;
    }
  }
}

interface TodoItem {
  content: string;
  status: string;
  activeForm: string;
}

function todosOf(input: Record<string, unknown>): TodoItem[] {
  if (!Array.isArray(input.todos)) return [];
  return input.todos.map((x) => {
    const r = asRecord(x);
    return { content: strOf(r.content), status: strOf(r.status), activeForm: strOf(r.activeForm) };
  });
}

function TodoList({ todos }: { todos: TodoItem[] }) {
  return (
    <ul className="space-y-1 px-3 py-2">
      {todos.map((todo, i) => {
        const isDone = todo.status === 'completed';
        const isActive = todo.status === 'in_progress';
        const text = isActive && todo.activeForm ? todo.activeForm : todo.content;
        return (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
            <span
              aria-hidden
              className={
                'mt-px w-3.5 shrink-0 text-center font-mono text-[12px] ' +
                (isDone
                  ? 'text-[var(--color-moss)]'
                  : isActive
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-fg-faint)]')
              }
            >
              {isDone ? '✓' : isActive ? '●' : '○'}
            </span>
            <span
              className={
                isDone
                  ? 'text-[var(--color-fg-muted)] line-through decoration-[var(--color-hairline-strong)]'
                  : isActive
                    ? 'font-medium text-[var(--color-fg-primary)]'
                    : 'text-[var(--color-fg-secondary)]'
              }
            >
              {text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BashBody({ command, description }: { command: string; description: string }) {
  return (
    <div className="px-3 py-2">
      {description && (
        <p className="mb-1.5 text-[12.5px] text-[var(--color-fg-muted)]">{description}</p>
      )}
      <div className="group/cmd relative rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-sunken)]">
        <span className="absolute right-1 top-1 opacity-0 transition group-hover/cmd:opacity-100">
          <CopyButton text={command} />
        </span>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11.5px] leading-[1.6] text-[var(--color-fg-primary)]">
          {command}
        </pre>
      </div>
    </div>
  );
}

/** JSON 原文体。搜索态传 query 走 HighlightedText（haystack 命中可见）；
 *  非搜索态（未知工具兜底）不传，纯文本即可。 */
function JsonDump({ input, query }: { input: Record<string, unknown>; query?: string }) {
  const json = JSON.stringify(input, null, 2);
  return (
    <pre className="overflow-x-auto px-3 py-2 font-mono text-[11.5px] text-[var(--color-fg-primary)]">
      {query ? <HighlightedText text={json} query={query} /> : json}
    </pre>
  );
}

function FilePathLine({ path, children }: { path: string; children?: ReactNode }) {
  if (!path) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
      <span className="min-w-0 break-all font-mono text-[10.5px] text-[var(--color-fg-faint)]">
        {path}
      </span>
      {children}
    </div>
  );
}

/** 消息流里的紧凑 unified diff：−/+ 着色 + 字内高亮，与弹窗 SplitDiff 同一套
 *  算法（lib/diff），不带行号（old/new 串 diff 没有真实文件行号，标了反而误导）。 */
function DiffRows({ rows }: { rows: UnifiedRow[] }) {
  const t = useT();
  if (rows.length === 0) return null;
  const shown = rows.length > MAX_DIFF_ROWS ? rows.slice(0, MAX_DIFF_ROWS) : rows;
  const omitted = rows.length - shown.length;
  return (
    <div className="overflow-x-auto pb-1.5">
      <div className="w-max min-w-full font-mono text-[11.5px] leading-[1.65]">
        {shown.map((row, i) => (
          <DiffRowLine key={i} row={row} />
        ))}
      </div>
      {omitted > 0 && (
        <p className="px-3 pt-1 font-mono text-[10px] italic text-[var(--color-fg-faint)]">
          {t('tool.moreLines', { n: omitted })}
        </p>
      )}
    </div>
  );
}

function DiffRowLine({ row }: { row: UnifiedRow }) {
  if (row.kind === 'gap') return null; // rowsFromStrings 不产 gap 行
  const bg =
    row.kind === 'del'
      ? 'bg-[var(--color-danger-soft)]'
      : row.kind === 'add'
        ? 'bg-[var(--color-moss-soft)]'
        : '';
  const marker = row.kind === 'del' ? '−' : row.kind === 'add' ? '+' : '';
  const markerColor =
    row.kind === 'del'
      ? 'text-[var(--color-danger)]'
      : row.kind === 'add'
        ? 'text-[var(--color-moss)]'
        : 'text-transparent';
  // 改动 token 的强调底色：在整行 -soft 底色上再叠一层更饱和的同色（同弹窗）。
  const hl = row.kind === 'del' ? 'bg-[var(--color-danger)]/25' : 'bg-[var(--color-moss)]/30';
  return (
    <div className={`flex ${bg}`}>
      <span className={`w-5 shrink-0 select-none text-center ${markerColor}`}>{marker}</span>
      <span className="whitespace-pre pr-3 text-[var(--color-fg-primary)]">
        {row.segs && row.segs.length > 0
          ? row.segs.map((s, i) =>
              s.changed ? (
                <span key={i} className={hl}>
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )
          : row.text === null || row.text === ''
            ? ' '
            : row.text}
      </span>
    </div>
  );
}

/* ── tool_result ────────────────────────────────────────────────────────── */

export function ToolResultBlock({
  block,
  query,
  toolName,
}: {
  block: Extract<Block, { type: 'tool_result' }>;
  query: string;
  /** 发起方工具名（由调用方用 toolUseId 反查），有则标在头部：「工具返回 · Bash」。 */
  toolName?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const long = block.content.length > PREVIEW_CHARS;
  const visible = open || !long ? block.content : block.content.slice(0, PREVIEW_CHARS) + '…';

  const tone = block.isError
    ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
    : 'border-[var(--color-hairline)] bg-[var(--color-sunken)] text-[var(--color-fg-primary)]';

  return (
    <div className={`overflow-hidden rounded-xl border text-sm ${tone}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em]">
          <Glyph kind={block.isError ? 'error' : 'result'} />
          {block.isError ? t('tool.error') : t('tool.result')}
          {toolName && (
            <span className={block.isError ? 'opacity-70' : 'text-[var(--color-fg-muted)]'}>
              · {toolName}
            </span>
          )}
        </span>
        {long && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="font-mono text-[10.5px] uppercase tracking-[0.16em] underline-offset-2 hover:underline"
          >
            {open ? t('common.collapse') : t('common.expand')}
          </button>
        )}
      </div>
      <pre className={`overflow-x-auto whitespace-pre-wrap break-words border-t px-3 py-2 font-mono text-[11.5px] ${block.isError ? 'border-[var(--color-danger)]/30' : 'border-[var(--color-hairline)] bg-[var(--color-surface)]'}`}>
        <HighlightedText text={visible} query={query} />
      </pre>
    </div>
  );
}

/* ── thinking ───────────────────────────────────────────────────────────── */

export function ThinkingBlock({
  block,
  query,
}: {
  block: Extract<Block, { type: 'thinking' }>;
  query: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const hasText = block.text.trim() !== '';
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-sunken)] text-sm text-[var(--color-fg-secondary)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em]">
          <Glyph kind="thinking" /> {t('tool.thinking')}
        </span>
        <Caret open={open} />
      </button>
      {open && (
        hasText ? (
          <div className="whitespace-pre-wrap break-words border-t border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-fg-secondary)]">
            <HighlightedText text={block.text} query={query} />
          </div>
        ) : (
          <p className="border-t border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-3 py-2 text-[12px] italic text-[var(--color-fg-muted)]">
            {t('tool.thinkingEncrypted')}
          </p>
        )
      )}
    </div>
  );
}

/* ── shared bits ────────────────────────────────────────────────────────── */

/** 悬浮复制按钮：markdown 代码块与 Bash 命令块共用。 */
export function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? t('tool.copied') : t('tool.copy')}
      title={copied ? t('tool.copied') : t('tool.copy')}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={
        'inline-flex items-center justify-center rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-rise)] transition ' +
        (copied
          ? 'text-[var(--color-moss)]'
          : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]')
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function strOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
}

function firstLine(s: string): string | null {
  const line = s.split('\n', 1)[0]!.trim();
  return line || null;
}

/** 路径尾部最多两段（`lib/diff.ts`），足够认出文件又不挤爆一行。 */
function pathTail(p: string): string | null {
  if (!p) return null;
  const segs = p.split(/[\\/]+/).filter(Boolean);
  return segs.slice(-2).join('/') || null;
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--color-fg-muted)] transition-transform"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

function Glyph({ kind }: { kind: 'tool' | 'result' | 'error' | 'thinking' }) {
  const common = {
    width: 11,
    height: 11,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'tool') {
    return (
      <svg {...common}>
        <path d="M14.7 5.3a3 3 0 1 0 4 4l-2.5 2.5 5 5-2.7 2.7-5-5-2.5 2.5a3 3 0 1 0-4-4z" />
      </svg>
    );
  }
  if (kind === 'result') {
    return (
      <svg {...common}>
        <path d="M5 12h13" />
        <path d="M13 7l5 5-5 5" />
      </svg>
    );
  }
  if (kind === 'error') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4.5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.6 1.1 2.7v.5h5v-.5c0-1.1.3-2.1 1.1-2.7A6 6 0 0 0 12 3z" />
    </svg>
  );
}
