import { motion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  DiffHunk,
  Message,
  ModifiedFileOperation,
  ModifiedFileSummary,
  ModifiedFileToolName,
} from '../lib/api.ts';
import { formatDateTime, formatRelativeTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { Loading } from './Loading.tsx';
import MessageBubble, { WorkingIndicator } from './MessageBubble.tsx';

// 三栏布局的最小内容区宽度：拖动任一分割线时，给中间文件内容栏保底的像素宽。
const CONTENT_MIN_PX = 320;

// 对话栏初始只渲染最新的这么多条消息（默认落点在底部最新一条），更早的折叠在
// 顶部「显示更早」后按这个步长逐批展开——会话动辄上百条，全量渲染既慢又埋没最新动态。
const CONV_INITIAL_VISIBLE = 20;
const CONV_LOAD_STEP = 40;

// 对话栏「贴底跟随」阈值：滚动位置离底部小于这个像素时，视作用户在追看最新动态——
// 实时轮询追加新消息（或 Claude 开始处理）后自动滚到底；超过则认为在往上翻历史，不打断。
const CONV_BOTTOM_STICK_PX = 120;

/** Lookup from a tool_use id → the issuing tool's name + raw input, built from the
 *  already-loaded session messages. Lets the detail pane render the actual edit
 *  content (Write body / Edit diff) without a second backend round-trip. */
export type EditLookup = Map<string, { name: string; input: unknown }>;

interface Props {
  files: ModifiedFileSummary[];
  cwd: string | null;
  editLookup: EditLookup;
  /** Session conversation, rendered in the drawer's left column so edits can be
   *  read alongside the dialogue that drove them. Already meta-filtered upstream. */
  messages: Message[];
  /** Active search query, forwarded to MessageBubble for in-message highlight. */
  query: string;
  /** Live poll says Claude is mid-turn — append the working indicator to the
   *  conversation column's tail, mirroring the session timeline. */
  isWorking: boolean;
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  /** Sync ?focus=<uuid> to the page underneath so closing the drawer lands on the
   *  same message. The drawer itself scrolls its own conversation column. */
  onFocusMessage: (messageUuid: string) => void;
  /** Open the real file on disk in the OS default app. */
  onOpenFile: (filePath: string) => void;
}

export default function ModifiedFilesDrawer({
  files,
  cwd,
  editLookup,
  messages,
  query,
  isWorking,
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

  // 三栏（对话 | 内容 | 文件树）的两条可拖拽分割线：对话栏与文件树栏各持一个像素
  // 宽度，中间内容栏吃掉剩余空间。拖动时实时改、并各自给内容区留 CONTENT_MIN_PX 保底。
  const splitRef = useRef<HTMLDivElement>(null);
  const convScrollRef = useRef<HTMLDivElement>(null);
  const [convWidth, setConvWidth] = useState(420);
  const [railWidth, setRailWidth] = useState(280);

  // 对话栏可见消息：默认只展示尾部最新 CONV_INITIAL_VISIBLE 条，更早的折叠。
  const [visibleCount, setVisibleCount] = useState(CONV_INITIAL_VISIBLE);
  const startIndex = Math.max(0, messages.length - visibleCount);
  const visibleMessages = useMemo(() => messages.slice(startIndex), [messages, startIndex]);
  const hiddenCount = startIndex;

  // 展开更早消息 / 跳转命中折叠区时，需要在重排后修正滚动位置：
  //  - restoreFromBottom：展开时保持「离底部的距离」不变，避免视口往上跳。
  //  - jumpUuid：跳转目标在折叠区时先全量展开，渲染后再滚到该消息。
  const restoreFromBottom = useRef<number | null>(null);
  const pendingJump = useRef<string | null>(null);

  // 实时跟随状态：用户是否停在对话栏底部（决定要不要追新），以及上一次的消息数 /
  // 处理中标志（只在「真有新消息到达」或「刚开始处理」时才追，避免每次轮询都滚动）。
  const stickToBottom = useRef(true);
  const prevMsgCount = useRef(messages.length);
  const prevIsWorking = useRef(isWorking);

  // 打开抽屉时把对话栏滚到底——最新一条消息就是落点。messages 已就绪，commit 后
  // scrollHeight 即为准确值，用 layout effect 在绘制前定位，避免可见的跳动。
  useLayoutEffect(() => {
    const el = convScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // 只在首次挂载（抽屉打开）时落到底部。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // visibleCount 变化（展开更早 / 跳转触发的全量展开）后修正滚动位置。
  useLayoutEffect(() => {
    const el = convScrollRef.current;
    if (!el) return;
    if (pendingJump.current) {
      scrollToMessage(pendingJump.current);
      pendingJump.current = null;
      restoreFromBottom.current = null;
      return;
    }
    if (restoreFromBottom.current != null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current;
      restoreFromBottom.current = null;
    }
  }, [visibleCount]);

  // 滚动时记录是否停在底部，供下面的实时跟随判断「该不该追新」。
  function onConvScroll() {
    const el = convScrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < CONV_BOTTOM_STICK_PX;
  }

  // 实时轮询追加了新消息、或 Claude 刚开始处理（WorkingIndicator 出现）时，若用户停在
  // 底部就跟随到最新——和会话时间线的自动跟随同义。展开更早 / 跳转触发的重排由上面的
  // visibleCount layout effect 负责，这里用 pendingJump / restoreFromBottom 让位，避免互相打架。
  useLayoutEffect(() => {
    const grew = messages.length > prevMsgCount.current;
    const startedWorking = isWorking && !prevIsWorking.current;
    prevMsgCount.current = messages.length;
    prevIsWorking.current = isWorking;
    if (!grew && !startedWorking) return;
    if (pendingJump.current || restoreFromBottom.current != null) return;
    if (!stickToBottom.current) return;
    const el = convScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isWorking]);

  function showEarlier() {
    const el = convScrollRef.current;
    restoreFromBottom.current = el ? el.scrollHeight - el.scrollTop : null;
    setVisibleCount((c) => Math.min(messages.length, c + CONV_LOAD_STEP));
  }

  // 在对话栏里滚到某条消息并闪烁高亮。命中折叠区时返回 false，由调用方先展开。
  function scrollToMessage(uuid: string): boolean {
    const root = convScrollRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-uuid="${CSS.escape(uuid)}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const flashTarget = el.closest('li') ?? el;
    flashTarget.classList.add('flash-focus');
    window.setTimeout(() => flashTarget.classList.remove('flash-focus'), 1300);
    return true;
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

  // 跳转：在抽屉左侧对话栏里滚到该消息并高亮；同时把 ?focus 推给底层页面，关闭后
  // 落点一致。不再关闭抽屉——三栏布局下「边看改动边看对话」才是这里的价值所在。
  function jump(uuid: string) {
    onFocusMessage(uuid);
    // 目标若落在折叠区（startIndex 之前），先全量展开，渲染后再由 layout effect 滚过去。
    const idx = messages.findIndex((m) => m.uuid === uuid);
    if (idx >= 0 && idx < startIndex) {
      pendingJump.current = uuid;
      setVisibleCount(messages.length);
      return;
    }
    scrollToMessage(uuid);
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
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[55] bg-[oklch(0.16_0.006_85_/_0.5)] backdrop-blur-[2px]"
        aria-hidden
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
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
            {/* ① 对话栏：左侧，入场时从左缘滑入——读作「对话流进了弹窗」。 */}
            <motion.div
              initial={{ opacity: 0, x: -32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
              className="flex shrink-0 flex-col border-r border-[var(--color-hairline)]"
              style={{ width: convWidth }}
            >
              <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] px-4 py-1.5">
                <span className="eyebrow">{t('session.modified.col.conversation')}</span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)]">
                  {messages.length}
                </span>
              </div>
              <div
                ref={convScrollRef}
                onScroll={onConvScroll}
                className="min-h-0 flex-1 overflow-auto px-4 py-2"
              >
                {messages.length === 0 && !isWorking ? (
                  <p className="px-1 py-3 text-sm italic text-[var(--color-fg-muted)]">
                    {t('common.noMessagesMatch')}
                  </p>
                ) : (
                  <>
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={showEarlier}
                        className="mb-1 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-input)] border border-dashed border-[var(--color-hairline-strong)] py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-fg-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)] dark:hover:text-[var(--color-accent)]"
                      >
                        {t('session.modified.showEarlier', { n: hiddenCount })}
                      </button>
                    )}
                    <ol>
                      {visibleMessages.map((m, i) => (
                        <li key={m.uuid || m.ts || String(startIndex + i)} className="py-3">
                          <MessageBubble message={m} query={query} />
                        </li>
                      ))}
                      {isWorking && <WorkingIndicator />}
                    </ol>
                  </>
                )}
              </div>
            </motion.div>

            <Splitter
              getRect={() => splitRef.current?.getBoundingClientRect() ?? null}
              onResize={(clientX, rect) =>
                setConvWidth(clampWidth(clientX - rect.left, rect.width - railWidth))
              }
            />

            {/* ② 文件内容栏：中间，吃掉剩余空间。 */}
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

            <Splitter
              getRect={() => splitRef.current?.getBoundingClientRect() ?? null}
              onResize={(clientX, rect) =>
                setRailWidth(clampWidth(rect.right - clientX, rect.width - convWidth))
              }
            />

            {/* ③ 文件树栏：右侧，入场时从右缘滑入。 */}
            <motion.div
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
              className="flex shrink-0 flex-col border-l border-[var(--color-hairline)]"
              style={{ width: railWidth }}
            >
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
            </motion.div>
          </div>
        )}
      </motion.aside>
    </>
  );
}

/* ── Draggable column splitter ──────────────────────────────────────────── */

// 竖向分割线：拖动时把指针的 clientX 连同容器矩形回传，由调用方换算出该侧栏宽度。
// 用 setPointerCapture 锁住指针，拖出分割线也不丢事件。
function Splitter({
  getRect,
  onResize,
}: {
  getRect: () => DOMRect | null;
  onResize: (clientX: number, rect: DOMRect) => void;
}) {
  const dragging = useRef(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        const rect = getRect();
        if (rect) onResize(e.clientX, rect);
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLDivElement>) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      className="relative w-px shrink-0 cursor-col-resize touch-none bg-[var(--color-hairline)] transition-colors hover:bg-[var(--color-accent)]"
    >
      {/* 加宽命中区，但不挤占布局。 */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
    </div>
  );
}

// 把某侧栏宽夹在 [220px, available − 内容保底] 之间。available = 容器宽 − 另一侧栏宽。
function clampWidth(value: number, available: number): number {
  const min = 220;
  const max = Math.max(min, available - CONTENT_MIN_PX);
  return Math.min(max, Math.max(min, value));
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
  const changeType = fileChangeType(file);
  void cwd;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-[var(--color-hairline)] bg-[var(--color-surface)]/95 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <FileIcon errored={file.errorCount > 0} tone={changeType} />
          <h3
            className={
              'min-w-0 flex-1 truncate font-mono text-[13.5px] font-medium ' +
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
        <OperationBody
          toolName={op.toolName}
          input={lookup?.input}
          hasLookup={!!lookup}
          patch={op.structuredPatch}
        />
      </div>
    </li>
  );
}

function OperationBody({
  toolName,
  input,
  hasLookup,
  patch,
}: {
  toolName: ModifiedFileToolName;
  input: unknown;
  hasLookup: boolean;
  patch: DiffHunk[] | null;
}) {
  const t = useT();

  // 首选：tool_result 里的 structuredPatch——带真实文件行号的 hunk，未改动区自然省略。
  if (patch && patch.length > 0) {
    return (
      <div className="px-3 py-2.5">
        <SplitDiff rows={rowsFromHunks(patch)} />
      </div>
    );
  }

  if (!hasLookup) {
    return (
      <p className="px-3 py-2.5 text-[12px] italic text-[var(--color-fg-muted)]">
        {t('session.modified.contentUnavailable')}
      </p>
    );
  }
  const rec = asRecord(input);

  // 全新文件（create，structuredPatch 为空）或结果尚未落地：整段按新增（全绿）渲染。
  if (toolName === 'Write') {
    const content = typeof rec.content === 'string' ? rec.content : '';
    return (
      <div className="px-3 py-2.5">
        <SplitDiff rows={rowsFromStrings('', content)} label={t('session.modified.newContent')} />
      </div>
    );
  }

  if (toolName === 'NotebookEdit') {
    const source = typeof rec.new_source === 'string' ? rec.new_source : '';
    const cellType = typeof rec.cell_type === 'string' ? rec.cell_type : null;
    return (
      <div className="px-3 py-2.5">
        <SplitDiff
          rows={rowsFromStrings('', source)}
          label={cellType ? `${t('session.modified.newContent')} · ${cellType}` : t('session.modified.newContent')}
        />
      </div>
    );
  }

  // MultiEdit / Edit 尚无 structuredPatch（仍 pending）→ 从 old/new 文本兜底，
  // 行号是片段内的相对值（结果落地后会被上面的 structuredPatch 分支取代为真实行号）。
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
              <SplitDiff
                rows={rowsFromStrings(
                  typeof er.old_string === 'string' ? er.old_string : '',
                  typeof er.new_string === 'string' ? er.new_string : '',
                )}
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
      <SplitDiff
        rows={rowsFromStrings(
          typeof rec.old_string === 'string' ? rec.old_string : '',
          typeof rec.new_string === 'string' ? rec.new_string : '',
        )}
      />
    </div>
  );
}

/** 行内 word-level 片段：changed=该 token 仅存在于本侧（GitHub 行内高亮）。 */
interface Seg {
  text: string;
  changed: boolean;
}

/** 统一视图的一行：context=两侧都在的未改动行；del/add=删除/新增行；
 *  gap=被折叠省略的未改动区间（只显示省略了多少行，不渲染正文）。 */
type RowKind = 'context' | 'del' | 'add' | 'gap';
interface UnifiedRow {
  oldNo: number | null;
  newNo: number | null;
  kind: RowKind;
  text: string | null;
  /** 仅 gap 行有值：被折叠省略的行数。 */
  gap?: number;
  /** 仅在「删除 ↔ 新增」配对行上有值，用于行内高亮；其余为 null（整行着色）。 */
  segs: Seg[] | null;
}

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
function SplitDiff({ rows, label }: { rows: UnifiedRow[]; label?: string }) {
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
        <span className="sticky left-0 z-[1] w-[3em] shrink-0 select-none border-r border-[var(--color-hairline)] bg-[inherit] px-1.5 text-center font-mono text-[11px]">
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
      <span className="sticky left-0 z-[1] w-[3em] shrink-0 select-none border-r border-[var(--color-hairline)] bg-[inherit] px-1.5 text-right font-mono text-[10px] tabular-nums text-[var(--color-fg-faint)]">
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

/** structuredPatch（带真实行号的 hunk）→ 统一视图行。hunk 之间的未改动区折叠成一行 gap。 */
function rowsFromHunks(hunks: DiffHunk[]): UnifiedRow[] {
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
function rowsFromStrings(oldStr: string, newStr: string): UnifiedRow[] {
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
