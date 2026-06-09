import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type {
  ModifiedFileOperation,
  ModifiedFileSummary,
  ModifiedFileToolName,
} from '../lib/api.ts';
import { formatDateTime, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { Loading } from './Loading.tsx';

/** Lookup from a tool_use id → the issuing tool's name + raw input, built from the
 *  already-loaded session messages. Lets the detail pane render the actual edit
 *  content (Write body / Edit diff) without a second backend round-trip. */
export type EditLookup = Map<string, { name: string; input: unknown }>;

interface Props {
  files: ModifiedFileSummary[];
  cwd: string | null;
  editLookup: EditLookup;
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  /** Jump to the message that issued an op, then close the drawer. */
  onFocusMessage: (messageUuid: string) => void;
  /** Open the real file on disk in the OS default app. */
  onOpenFile: (filePath: string) => void;
}

export default function ModifiedFilesDrawer({
  files,
  cwd,
  editLookup,
  loading,
  error,
  onClose,
  onFocusMessage,
  onOpenFile,
}: Props) {
  const t = useT();
  const tree = useMemo(() => buildTree(files), [files]);

  // 选中文件路径（明细对象用 filePath 作为稳定 key）。打开时自动选第一个，
  // 避免右侧空白；files 变化后若当前选中已不在则回落到第一个。
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected((prev) =>
      prev && files.some((f) => f.filePath === prev) ? prev : files[0]?.filePath ?? null,
    );
  }, [files]);

  const selectedFile = useMemo(
    () => files.find((f) => f.filePath === selected) ?? null,
    [files, selected],
  );

  // 折叠的文件夹集合（默认全展开——修改文件清单通常不长，铺开更利于一眼扫）。
  const allFolders = useMemo(() => collectFolderPaths(tree), [tree]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFolder = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // 文件树 / 内容之间可拖拽的分割线：railWidth 是树栏像素宽，拖动时实时改。
  const splitRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [railWidth, setRailWidth] = useState(300);
  function onSplitterDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
  }
  function onSplitterMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    // 下限 200px、上限留给内容区至少 320px。
    const max = Math.max(200, rect.width - 320);
    setRailWidth(Math.min(max, Math.max(200, e.clientX - rect.left)));
  }
  function onSplitterUp(e: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Esc 关闭 + 背景滚动锁。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function jump(uuid: string) {
    onFocusMessage(uuid);
    onClose();
  }

  const count = files.length;
  const countLabel =
    count === 1
      ? t('session.modified.count', { n: count })
      : t('session.modified.countPlural', { n: count });

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[55] bg-[oklch(0.16_0.006_85_/_0.5)] backdrop-blur-[2px]"
        aria-hidden
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label={t('session.modified.title')}
        className="fixed inset-0 z-[60] flex w-full flex-col bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-[var(--color-accent)]">
              <TreeGlyph />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[17px] font-light tracking-tight text-[var(--color-fg-primary)]">
                {t('session.modified.title')}
              </h2>
              {cwd && (
                <p
                  className="truncate font-mono text-[10.5px] tracking-[0.02em] text-[var(--color-fg-faint)]"
                  title={cwd}
                >
                  {cwd}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {count > 0 && (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] tabular-nums text-[var(--color-fg-muted)]">
                {countLabel}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('session.modified.close')}
              className="rounded-[var(--radius-control)] p-1.5 text-[var(--color-fg-muted)] transition hover:bg-[var(--color-sunken)] hover:text-[var(--color-fg-primary)]"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {loading && <Loading label={t('session.modified.loading')} className="m-6" />}

        {error && !loading && (
          <p className="m-5 rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {t('session.modified.failed')}: {error.message}
          </p>
        )}

        {!loading && !error && count === 0 && (
          <p className="m-6 text-sm italic text-[var(--color-fg-muted)]">
            {t('session.modified.empty')}
          </p>
        )}

        {!loading && !error && count > 0 && (
          <div ref={splitRef} className="flex min-h-0 flex-1">
            {/* Tree rail */}
            <div className="flex shrink-0 flex-col" style={{ width: railWidth }}>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-hairline)] px-3 py-1.5">
                <span className="eyebrow">{t('session.modified.col.file')}</span>
                {allFolders.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) =>
                        prev.size === 0 ? new Set(allFolders) : new Set(),
                      )
                    }
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-muted)] transition hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
                  >
                    {collapsed.size === 0
                      ? t('session.modified.collapseAll')
                      : t('session.modified.expandAll')}
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto py-1.5">
                <ul role="tree" className="w-max min-w-full select-none">
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
              </div>
            </div>

            {/* Draggable splitter */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={onSplitterDown}
              onPointerMove={onSplitterMove}
              onPointerUp={onSplitterUp}
              className="relative w-px shrink-0 cursor-col-resize touch-none bg-[var(--color-hairline)] transition-colors hover:bg-[var(--color-accent)]"
            >
              {/* 加宽命中区，但不挤占布局。 */}
              <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
            </div>

            {/* Detail pane */}
            <div className="min-w-0 flex-1 overflow-auto">
              {selectedFile ? (
                <FileDetail
                  key={selectedFile.filePath}
                  file={selectedFile}
                  cwd={cwd}
                  editLookup={editLookup}
                  onJump={jump}
                  onOpenFile={onOpenFile}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6">
                  <p className="text-center text-sm italic text-[var(--color-fg-muted)]">
                    {t('session.modified.selectFile')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.aside>
    </>
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
        <FileIcon errored={f.errorCount > 0} />
        <span
          className={
            'whitespace-nowrap font-mono text-[12px] ' +
            (isSelected ? 'font-medium' : 'text-[var(--color-fg-primary)]')
          }
        >
          {node.name}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1 pl-1 pr-2">
        {f.errorCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" />}
        <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)] group-hover:hidden">
          {f.totalCount}
        </span>
        <button
          type="button"
          onClick={() => onOpenFile(f.filePath)}
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
  cwd,
  editLookup,
  onJump,
  onOpenFile,
}: {
  file: ModifiedFileSummary;
  cwd: string | null;
  editLookup: EditLookup;
  onJump: (messageUuid: string) => void;
  onOpenFile: (filePath: string) => void;
}) {
  const t = useT();
  const display = file.relativePath ?? file.filePath;
  const tail = display.split(/[\\/]+/).pop() ?? display;
  void cwd;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-[var(--color-hairline)] bg-[var(--color-surface)]/95 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <FileIcon errored={file.errorCount > 0} />
          <h3 className="min-w-0 flex-1 truncate font-mono text-[13.5px] font-medium text-[var(--color-fg-primary)]" title={file.filePath}>
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
          <span className="ml-auto font-mono text-[10.5px] tabular-nums text-[var(--color-fg-muted)]" title={file.lastAt ? formatDateTime(file.lastAt) : undefined}>
            {formatRelativeTime(file.lastAt)}
          </span>
        </div>
      </div>

      <ol className="flex flex-col gap-4 px-5 py-4">
        {file.operations.map((op, idx) => (
          <OperationCard
            key={op.toolUseId || `${idx}-${op.ts ?? ''}`}
            op={op}
            index={idx + 1}
            lookup={editLookup.get(op.toolUseId)}
            onJump={onJump}
          />
        ))}
      </ol>
    </div>
  );
}

function OperationCard({
  op,
  index,
  lookup,
  onJump,
}: {
  op: ModifiedFileOperation;
  index: number;
  lookup: { name: string; input: unknown } | undefined;
  onJump: (messageUuid: string) => void;
}) {
  const t = useT();
  const tone = op.errored
    ? 'border-[var(--color-danger)]/40'
    : op.pending
      ? 'border-[var(--color-accent)]/40'
      : 'border-[var(--color-hairline)]';

  return (
    <li className={`overflow-hidden rounded-xl border ${tone} bg-[var(--color-sunken)]`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <span className="font-mono text-[10.5px] tabular-nums text-[var(--color-fg-muted)]">
          #{index.toString().padStart(2, '0')}
        </span>
        <span className="rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-fg-secondary)]">
          {op.toolName}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-secondary)]">
          {op.ts ? formatDateTime(op.ts) : '—'}
        </span>
        {op.errored && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-danger)]">
            · {t('session.modified.opErrored')}
          </span>
        )}
        {op.pending && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]">
            · {t('session.modified.opPending')}
          </span>
        )}
        {op.messageUuid && (
          <button
            type="button"
            onClick={() => onJump(op.messageUuid!)}
            className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-fg-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
          >
            {t('session.modified.jump')} <ArrowIcon />
          </button>
        )}
      </div>
      <div className="border-t border-[var(--color-hairline)] bg-[var(--color-surface)]">
        <OperationBody toolName={op.toolName} input={lookup?.input} hasLookup={!!lookup} />
      </div>
    </li>
  );
}

function OperationBody({
  toolName,
  input,
  hasLookup,
}: {
  toolName: ModifiedFileToolName;
  input: unknown;
  hasLookup: boolean;
}) {
  const t = useT();
  if (!hasLookup) {
    return (
      <p className="px-3 py-2.5 text-[12px] italic text-[var(--color-fg-muted)]">
        {t('session.modified.contentUnavailable')}
      </p>
    );
  }
  const rec = asRecord(input);

  if (toolName === 'Write') {
    const content = typeof rec.content === 'string' ? rec.content : '';
    return <CodeBlock label={t('session.modified.newContent')} text={content} />;
  }

  if (toolName === 'NotebookEdit') {
    const source = typeof rec.new_source === 'string' ? rec.new_source : '';
    const cellType = typeof rec.cell_type === 'string' ? rec.cell_type : null;
    return (
      <CodeBlock
        label={cellType ? `${t('session.modified.newContent')} · ${cellType}` : t('session.modified.newContent')}
        text={source}
      />
    );
  }

  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(rec.edits) ? rec.edits : [];
    if (edits.length === 0) return <EmptyBody />;
    return (
      <div className="flex flex-col divide-y divide-[var(--color-hairline)]">
        {edits.map((e, i) => {
          const er = asRecord(e);
          return (
            <div key={i} className="px-3 py-2.5">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
                {t('session.modified.editN', { n: i + 1 })}
              </p>
              <DiffView
                oldStr={typeof er.old_string === 'string' ? er.old_string : ''}
                newStr={typeof er.new_string === 'string' ? er.new_string : ''}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Edit
  return (
    <div className="px-3 py-2.5">
      <DiffView
        oldStr={typeof rec.old_string === 'string' ? rec.old_string : ''}
        newStr={typeof rec.new_string === 'string' ? rec.new_string : ''}
      />
    </div>
  );
}

/** 行级 split diff：左栏=修改前、右栏=修改后，逐行对齐着色（git split view 风格）。 */
type LineKind = 'equal' | 'del' | 'add' | 'empty';
interface SplitRow {
  left: string | null;
  right: string | null;
  leftNo: number | null;
  rightNo: number | null;
  leftKind: LineKind;
  rightKind: LineKind;
}

function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const t = useT();
  const rows = useMemo(() => buildSplitRows(oldStr, newStr), [oldStr, newStr]);
  if (oldStr.length === 0 && newStr.length === 0) return <EmptyBody />;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-hairline)]">
      <div className="grid grid-cols-2 divide-x divide-[var(--color-hairline)] border-b border-[var(--color-hairline)] bg-[var(--color-sunken)]">
        <span className="px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-danger)]">
          − {t('session.modified.before')}
        </span>
        <span className="px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-moss)]">
          + {t('session.modified.after')}
        </span>
      </div>
      {/* 两栏各自横向滚动；行数与行高一致，纵向自然对齐。 */}
      <div className="grid grid-cols-2 divide-x divide-[var(--color-hairline)]">
        <DiffPane rows={rows} side="left" />
        <DiffPane rows={rows} side="right" />
      </div>
    </div>
  );
}

function DiffPane({ rows, side }: { rows: SplitRow[]; side: 'left' | 'right' }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="w-max min-w-full">
        {rows.map((r, i) => (
          <DiffLine
            key={i}
            no={side === 'left' ? r.leftNo : r.rightNo}
            text={side === 'left' ? r.left : r.right}
            kind={side === 'left' ? r.leftKind : r.rightKind}
          />
        ))}
      </div>
    </div>
  );
}

function DiffLine({ no, text, kind }: { no: number | null; text: string | null; kind: LineKind }) {
  const bg =
    kind === 'del'
      ? 'bg-[var(--color-danger-soft)]'
      : kind === 'add'
        ? 'bg-[var(--color-moss-soft)]'
        : kind === 'empty'
          ? 'bg-[var(--color-sunken)]'
          : 'bg-[var(--color-surface)]';
  const marker = kind === 'del' ? '−' : kind === 'add' ? '+' : '';
  const markerColor =
    kind === 'del'
      ? 'text-[var(--color-danger)]'
      : kind === 'add'
        ? 'text-[var(--color-moss)]'
        : 'text-transparent';
  return (
    <div className={`flex leading-[1.65] ${bg}`}>
      <span className="sticky left-0 z-[1] w-[2.75em] shrink-0 select-none border-r border-[var(--color-hairline)] bg-[inherit] px-1.5 text-right font-mono text-[10px] tabular-nums text-[var(--color-fg-faint)]">
        {no ?? ' '}
      </span>
      <span className={`w-4 shrink-0 select-none text-center font-mono text-[11.5px] ${markerColor}`}>
        {marker}
      </span>
      <div className="whitespace-pre pr-3 font-mono text-[11.5px] text-[var(--color-fg-primary)]">
        {text == null || text === '' ? ' ' : text}
      </div>
    </div>
  );
}

function CodeBlock({ label, text }: { label: string; text: string }) {
  if (text.length === 0) return <EmptyBody />;
  return (
    <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-[var(--color-fg-primary)]">
      <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
        {label}
      </span>
      {text}
    </pre>
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

function buildSplitRows(oldStr: string, newStr: string): SplitRow[] {
  // 空串视为 0 行（而非 ['']），避免纯新增/纯删除时出现一个幻影空行。
  const ops = diffOps(oldStr === '' ? [] : oldStr.split('\n'), newStr === '' ? [] : newStr.split('\n'));
  const rows: SplitRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  let i = 0;
  while (i < ops.length) {
    const op = ops[i]!;
    if (op.type === 'equal') {
      leftNo++;
      rightNo++;
      rows.push({ left: op.text, right: op.text, leftNo, rightNo, leftKind: 'equal', rightKind: 'equal' });
      i++;
      continue;
    }
    // 收集相邻的一段 del / add，左右配对成同一行（git split view 习惯）。
    const dels: string[] = [];
    const adds: string[] = [];
    while (i < ops.length && ops[i]!.type !== 'equal') {
      const cur = ops[i]!;
      if (cur.type === 'del') dels.push(cur.text);
      else adds.push(cur.text);
      i++;
    }
    const max = Math.max(dels.length, adds.length);
    for (let x = 0; x < max; x++) {
      const hasL = x < dels.length;
      const hasR = x < adds.length;
      if (hasL) leftNo++;
      if (hasR) rightNo++;
      rows.push({
        left: hasL ? dels[x]! : null,
        right: hasR ? adds[x]! : null,
        leftNo: hasL ? leftNo : null,
        rightNo: hasR ? rightNo : null,
        leftKind: hasL ? 'del' : 'empty',
        rightKind: hasR ? 'add' : 'empty',
      });
    }
  }
  return rows;
}

interface DiffOp {
  type: 'equal' | 'del' | 'add';
  text: string;
}

// 经典 LCS 行级 diff：dp[i][j] = a[i:] 与 b[j:] 的最长公共子序列长度，
// 回溯得到 equal / del / add 操作序列。编辑片段通常很短，O(n·m) 足够。
function diffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
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

function FileIcon({ errored }: { errored?: boolean }) {
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
      className={'shrink-0 ' + (errored ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-muted)]')}
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function TreeGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h7l2 2h9" />
      <path d="M3 5v14h18V9" />
      <path d="M8 13h8M8 16h5" opacity="0.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
