import { useEffect, useMemo, useState } from 'react';
import type {
  ModifiedFileSummary,
  ModifiedFileToolName,
} from '../lib/api.ts';
import {
  rowsFromHunks,
  rowsFromStrings,
  type UnifiedRow,
} from '../lib/diff.ts';
import { useT } from '../lib/i18n.ts';
import { Loading } from './Loading.tsx';
import { SplitDiff } from './SplitDiff.tsx';

/** Lookup from a tool_use id → the issuing tool's name + raw input, built from the
 *  already-loaded session messages. Lets the detail view render the actual edit
 *  content (Write body / Edit diff) without a second backend round-trip. */
export type EditLookup = Map<string, { name: string; input: unknown }>;

interface Props {
  files: ModifiedFileSummary[];
  cwd: string | null;
  editLookup: EditLookup;
  loading: boolean;
  error: Error | null;
  /** 收起整个面板（会话页右栏的 ✕ / Esc 都走它）。 */
  onClose: () => void;
  /** Open the real file on disk in the OS default app. */
  onOpenFile: (filePath: string) => void;
}

/** 「修改的文件」右栏面板：和会话流里的文件预览同栖于内容区右侧拆分栏，单列 master-detail。
 *  列表态铺变更文件树，点某个文件切到明细态（左旧右新合并 diff），返回键回到列表。
 *  全部数据来自已加载的会话消息 + 一次 modified-files 扫描，不发二次请求。 */
export default function ModifiedFilesPanel({
  files,
  cwd,
  editLookup,
  loading,
  error,
  onClose,
  onOpenFile,
}: Props) {
  const t = useT();
  const tree = useMemo(() => buildTree(files), [files]);
  const allFolders = useMemo(() => collectFolderPaths(tree), [tree]);

  // 折叠的文件夹集合（默认全展开——修改文件清单通常不长，铺开更利于一眼扫）。
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFolder = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // 当前查看的文件路径：null = 列表态，非空 = 明细态。
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (selected && !files.some((f) => f.filePath === selected)) setSelected(null);
  }, [files, selected]);
  const selectedFile = useMemo(
    () => files.find((f) => f.filePath === selected) ?? null,
    [files, selected],
  );

  const count = files.length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--color-hairline)] px-3.5 py-2">
        {selectedFile ? (
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label={t('session.modified.backToList')}
            title={t('session.modified.backToList')}
            className="shrink-0 rounded-[var(--radius-control)] p-1 text-[var(--color-fg-muted)] transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
          >
            <BackIcon />
          </button>
        ) : (
          <span className="shrink-0 text-[var(--color-accent)]">
            <TreeGlyph />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-medium leading-tight text-[var(--color-fg-primary)]">
            {t('session.modified.title')}
          </h3>
          {cwd && (
            <p
              className="truncate font-mono text-[10.5px] leading-tight text-[var(--color-fg-faint)]"
              title={cwd}
            >
              {cwd}
            </p>
          )}
        </div>
        {!selectedFile && count > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-1.5 font-mono text-[10px] tabular-nums text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
            {count}
          </span>
        )}
        {!selectedFile && allFolders.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed((prev) => (prev.size === 0 ? new Set(allFolders) : new Set()))}
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-fg-muted)] transition hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
          >
            {collapsed.size === 0 ? t('session.modified.collapseAll') : t('session.modified.expandAll')}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('session.modified.close')}
          title={t('session.modified.close')}
          className="shrink-0 rounded-[var(--radius-control)] p-1.5 text-[var(--color-fg-muted)] transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto [contain:paint]">
        {loading ? (
          <Loading label={t('session.modified.loading')} className="m-6" />
        ) : error ? (
          <p className="m-4 rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger)]">
            {t('session.modified.failed')}: {error.message}
          </p>
        ) : count === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] italic text-[var(--color-fg-muted)]">
            {t('session.modified.empty')}
          </p>
        ) : selectedFile ? (
          <FileDetail
            key={selectedFile.filePath}
            file={selectedFile}
            editLookup={editLookup}
            onOpenFile={onOpenFile}
          />
        ) : (
          <ul role="tree" className="w-max min-w-full select-none py-1.5">
            {tree.map((node) => (
              <TreeRow
                key={nodeKey(node)}
                node={node}
                depth={0}
                collapsed={collapsed}
                onToggleFolder={toggleFolder}
                selected={selected}
                onSelectFile={setSelected}
                onOpenFile={onOpenFile}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── File tree ──────────────────────────────────────────────────────────── */

interface FolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}
interface FileNode {
  kind: 'file';
  name: string;
  file: ModifiedFileSummary;
}
type TreeNode = FolderNode | FileNode;

function nodeKey(node: TreeNode): string {
  return node.kind === 'folder' ? `d:${node.path}` : `f:${node.file.filePath}`;
}

/** 本会话内对该文件的「变更类型」，仅用于文件名着色（Git 习惯：A 绿 / M 琥珀）。
 *  added = 本会话首个操作就是「创建」（Write/NotebookEdit 且 structuredPatch 为空数组，
 *  这是 Claude Code 记录全新文件的信号）；否则一律按 modified。本工具集没有删除语义，故无 deleted。 */
type FileChangeType = 'added' | 'modified';
function fileChangeType(file: ModifiedFileSummary): FileChangeType {
  const first = file.operations[0];
  const created =
    !!first &&
    (first.toolName === 'Write' || first.toolName === 'NotebookEdit') &&
    Array.isArray(first.structuredPatch) &&
    first.structuredPatch.length === 0;
  return created ? 'added' : 'modified';
}

/** 变更类型 → 文件名/图标的前景色 token。errored 在调用处优先用 danger，不走这里。 */
function changeToneClass(type: FileChangeType): string {
  return type === 'added'
    ? 'text-[var(--color-moss)]'
    : 'text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]';
}

// 把扁平文件列表按目录段建成树。displayPath = relativePath ?? filePath，
// 末段是文件名，其余是文件夹。文件夹内：文件夹优先、各自字母序。
// 最后把"只有一个子文件夹"的单链折叠成 a/b 一行（IDE 习惯，省纵深）。
function buildTree(files: ModifiedFileSummary[]): TreeNode[] {
  interface Building {
    folders: Map<string, Building>;
    files: { name: string; file: ModifiedFileSummary }[];
    path: string;
  }
  const root: Building = { folders: new Map(), files: [], path: '' };

  for (const file of files) {
    const display = file.relativePath ?? file.filePath;
    const segs = display.split(/[\\/]+/).filter(Boolean);
    const name = segs.pop() ?? display;
    let cur = root;
    for (const seg of segs) {
      let next = cur.folders.get(seg);
      if (!next) {
        next = { folders: new Map(), files: [], path: cur.path ? `${cur.path}/${seg}` : seg };
        cur.folders.set(seg, next);
      }
      cur = next;
    }
    cur.files.push({ name, file });
  }

  function materialize(b: Building): TreeNode[] {
    const folders: FolderNode[] = [];
    for (const [name, child] of b.folders) {
      folders.push(collapseChain({ kind: 'folder', name, path: child.path, children: materialize(child) }));
    }
    folders.sort((a, z) => a.name.localeCompare(z.name, undefined, { sensitivity: 'base' }));
    const fileNodes: FileNode[] = b.files
      .map((f) => ({ kind: 'file' as const, name: f.name, file: f.file }))
      .sort((a, z) => a.name.localeCompare(z.name, undefined, { sensitivity: 'base' }));
    return [...folders, ...fileNodes];
  }

  // a → (only child folder b) ⇒ "a/b"
  function collapseChain(folder: FolderNode): FolderNode {
    let node = folder;
    while (node.children.length === 1 && node.children[0]!.kind === 'folder') {
      const only = node.children[0] as FolderNode;
      node = { kind: 'folder', name: `${node.name}/${only.name}`, path: only.path, children: only.children };
    }
    return node;
  }

  return materialize(root);
}

function collectFolderPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.kind === 'folder') {
        out.push(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggleFolder,
  selected,
  onSelectFile,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
  selected: string | null;
  onSelectFile: (path: string) => void;
  onOpenFile: (filePath: string) => void;
}) {
  const t = useT();
  const indent = { paddingLeft: `${depth * 14 + 10}px` };

  if (node.kind === 'folder') {
    const isCollapsed = collapsed.has(node.path);
    return (
      <li role="treeitem" aria-expanded={!isCollapsed}>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          style={indent}
          className="flex w-full items-center gap-1.5 py-1 pr-2 text-left transition hover:bg-[var(--color-sunken)]"
        >
          <Caret open={!isCollapsed} />
          <FolderIcon open={!isCollapsed} />
          <span className="whitespace-nowrap font-mono text-[12px] text-[var(--color-fg-secondary)]">
            {node.name}
          </span>
        </button>
        {!isCollapsed && (
          <ul role="group">
            {node.children.map((child) => (
              <TreeRow
                key={nodeKey(child)}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggleFolder={onToggleFolder}
                selected={selected}
                onSelectFile={onSelectFile}
                onOpenFile={onOpenFile}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const f = node.file;
  const isSelected = selected === f.filePath;
  const openLabel = t('session.modified.openFile');
  const changeType = fileChangeType(f);
  // 文件名/图标着色按变更类型走；errored 是另一根轴，红点单独标，不抢文件名的语义色。
  const nameTone = changeToneClass(changeType);
  return (
    <li
      role="treeitem"
      aria-selected={isSelected}
      className={
        'group flex w-full items-center transition ' +
        (isSelected
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]'
          : 'hover:bg-[var(--color-sunken)]')
      }
    >
      {/* flex-1 但不加 min-w-0：min-width:auto 保证按钮不缩到内容以下，
          文件名 whitespace-nowrap 撑宽行 → 外层 ul(w-max) 横向出滚动条。 */}
      <button
        type="button"
        onClick={() => onSelectFile(f.filePath)}
        style={indent}
        title={f.filePath}
        className="flex flex-1 items-center gap-1.5 py-1 pr-2 text-left"
      >
        <span className="w-[11px] shrink-0" aria-hidden />
        <FileIcon errored={f.errorCount > 0} tone={changeType} />
        <span
          className={
            'whitespace-nowrap font-mono text-[12px] ' +
            nameTone +
            (isSelected ? ' font-medium' : '')
          }
        >
          {node.name}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1 pl-1 pr-2">
        {f.errorCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" />}
        <span
          className={`font-mono text-[10px] font-semibold leading-none ${nameTone}`}
          title={t(changeType === 'added' ? 'session.modified.added' : 'session.modified.modified')}
        >
          {changeType === 'added' ? 'A' : 'M'}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)] group-hover:hidden">
          {f.totalCount}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFile(f.filePath);
          }}
          title={openLabel}
          aria-label={openLabel}
          className="hidden rounded-[var(--radius-control)] p-0.5 text-[var(--color-fg-muted)] transition hover:text-[var(--color-accent-ink)] group-hover:inline-flex dark:hover:text-[var(--color-accent)]"
        >
          <ExternalIcon />
        </button>
      </span>
    </li>
  );
}

/* ── File detail (operations + content) ─────────────────────────────────── */

function FileDetail({
  file,
  editLookup,
  onOpenFile,
}: {
  file: ModifiedFileSummary;
  editLookup: EditLookup;
  onOpenFile: (filePath: string) => void;
}) {
  const t = useT();
  const display = file.relativePath ?? file.filePath;
  const tail = display.split(/[\\/]+/).pop() ?? display;
  const changeType = fileChangeType(file);
  const { rows, newFile } = useMemo(() => buildFileRows(file, editLookup), [file, editLookup]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2">
          <FileIcon errored={file.errorCount > 0} tone={changeType} />
          <h3
            className={
              'min-w-0 flex-1 truncate font-mono text-[13px] font-medium ' +
              (file.errorCount > 0 ? 'text-[var(--color-danger)]' : changeToneClass(changeType))
            }
            title={file.filePath}
          >
            {tail}
          </h3>
          <button
            type="button"
            onClick={() => onOpenFile(file.filePath)}
            title={t('session.modified.openFile')}
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
          >
            <ExternalIcon />
            {t('session.modified.openFile')}
          </button>
        </div>
        <p className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--color-fg-faint)]" title={file.filePath}>
          {file.relativePath ?? `${t('session.modified.absolutePath')} · ${file.filePath}`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {file.editCount > 0 && <ToolChip name="Edit" count={file.editCount} />}
          {file.writeCount > 0 && <ToolChip name="Write" count={file.writeCount} />}
          {file.multiEditCount > 0 && <ToolChip name="MultiEdit" count={file.multiEditCount} />}
          {file.notebookEditCount > 0 && <ToolChip name="NotebookEdit" count={file.notebookEditCount} />}
          {file.errorCount > 0 && (
            <span className="rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-danger)]">
              {t('session.modified.errorBadge', { n: file.errorCount })}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        <SplitDiff rows={rows} label={newFile ? t('session.modified.newContent') : undefined} />
      </div>
    </div>
  );
}

const strOf = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 把一个文件在本会话里的全部操作合并成「单文件」统一视图行：左旧右新。
 *  首选带真实文件行号的 structuredPatch——把各次操作的 hunk 全收齐、按新文件行号排序，
 *  交给 rowsFromHunks 渲染（hunk 间的未改动区折叠成一行 gap），于是同一文件的多次改动
 *  拼成一份连贯的左右对照。注意：各次操作的行号是「该次操作落地后」坐标，跨操作不共享
 *  同一坐标系；同一处被多次改写会按操作先后逐次呈现（中间态），这是只有 diff、没有整文件
 *  快照时能做到的最忠实拼接。
 *  完全没有 structuredPatch（全新文件 create / 结果尚未落地的 pending）时，退回用 tool
 *  输入的原文按操作顺序拼接；newFile=本会话全程只有 Write/NotebookEdit 的创建写入。 */
function buildFileRows(
  file: ModifiedFileSummary,
  editLookup: EditLookup,
): { rows: UnifiedRow[]; newFile: boolean } {
  const hunks = file.operations.flatMap((op) => op.structuredPatch ?? []);
  if (hunks.length > 0) {
    const sorted = [...hunks].sort((a, b) => a.newStart - b.newStart);
    return { rows: rowsFromHunks(sorted), newFile: false };
  }

  const rows: UnifiedRow[] = [];
  let newFile = true;
  for (const op of file.operations) {
    const rec = asRecord(editLookup.get(op.toolUseId)?.input);
    if (op.toolName === 'Write') {
      rows.push(...rowsFromStrings('', strOf(rec.content)));
    } else if (op.toolName === 'NotebookEdit') {
      rows.push(...rowsFromStrings('', strOf(rec.new_source)));
    } else if (op.toolName === 'MultiEdit') {
      newFile = false;
      const edits = Array.isArray(rec.edits) ? rec.edits : [];
      for (const e of edits) {
        const er = asRecord(e);
        rows.push(...rowsFromStrings(strOf(er.old_string), strOf(er.new_string)));
      }
    } else {
      newFile = false;
      rows.push(...rowsFromStrings(strOf(rec.old_string), strOf(rec.new_string)));
    }
  }
  return { rows, newFile };
}

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
}

function ToolChip({ name, count }: { name: ModifiedFileToolName; count: number }) {
  return (
    <span className="rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-secondary)]">
      {name}
      <span className="ml-1 tabular-nums text-[var(--color-fg-muted)]">×{count}</span>
    </span>
  );
}

/* ── Icons ──────────────────────────────────────────────────────────────── */

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={'shrink-0 text-[var(--color-fg-muted)] transition-transform ' + (open ? 'rotate-90' : '')}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-accent)]" aria-hidden>
      {open ? (
        <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v1H6.5a2 2 0 0 0-1.9 1.4L3 18z" />
      ) : (
        <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      )}
    </svg>
  );
}

function FileIcon({ errored, tone }: { errored?: boolean; tone?: FileChangeType }) {
  const color = errored
    ? 'text-[var(--color-danger)]'
    : tone
      ? changeToneClass(tone)
      : 'text-[var(--color-fg-muted)]';
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={'shrink-0 ' + color}
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function TreeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h7l2 2h9" />
      <path d="M3 5v14h18V9" />
      <path d="M8 13h8M8 16h5" opacity="0.5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
