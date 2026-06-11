export interface ProjectSummary {
  id: string;
  encodedCwd: string;
  decodedCwd: string;
  cwdResolved: boolean;
  sessionCount: number;
  totalBytes: number;
  lastActiveAt: string | null;
}

export interface RelatedBytes {
  jsonl: number;
  subdir: number;
  fileHistory: number;
  sessionEnv: number;
}

export interface SessionSummary {
  id: string;
  projectId: string;
  /** Auto-derived: latest `ai-title` record, falling back to first user message. */
  title: string;
  /** User-set name (Claude Code's `custom-title` record); null if never renamed. */
  customTitle: string | null;
  firstAt: string | null;
  /** Last activity: max(latest record timestamp, file mtime) — matches `claude code resume`. */
  lastAt: string | null;
  messageCount: number;
  /** Count of tool_result blocks flagged `is_error` across the whole session. */
  errorCount: number;
  bytes: number;
  relatedBytes: RelatedBytes;
  isLivePid: boolean;
  isRecentlyActive: boolean;
  livePid: number | null;
  /**
   * Claude is *actively processing this turn* right now (a stricter state than
   * `isLivePid`, which only means a Claude Code process is alive). True when the
   * session has a live PID, was touched recently, and its last conversation turn
   * is unfinished — Claude owes a reply (last record is `user`) or is mid-work
   * (last `assistant` record ends on a `tool_use`). An aborted turn (trailing
   * `[Request interrupted by user]`) counts as finished.
   */
  isWorking: boolean;
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'thinking'; text: string }
  | { type: 'image'; mediaType: string | null }
  | { type: 'unknown'; raw: unknown };

export interface Message {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant';
  ts: string | null;
  model: string | null;
  blocks: Block[];
  isMeta: boolean;
}

export interface SessionMeta {
  sessionId: string;
  projectId: string;
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  firstAt: string | null;
  /** Last activity: max(latest record timestamp, file mtime) — matches `claude code resume`. */
  lastAt: string | null;
  messageCount: number;
  bytes: number;
  /** Auto-derived: latest `ai-title` record, falling back to first user message. */
  title: string;
  /** User-set name; null if never renamed. */
  customTitle: string | null;
}

export interface SessionDetail {
  meta: SessionMeta;
  messages: Message[];
  truncated: boolean;
}

export interface DeleteRequestItem {
  projectId: string;
  sessionId: string;
}

export interface DeletedItem extends DeleteRequestItem {
  freedBytes: number;
  cleaned: string[];
  relatedBytes: RelatedBytes;
}

export interface SkippedItem extends DeleteRequestItem {
  reason: string;
}

export interface DeleteResult {
  deleted: DeletedItem[];
  skipped: SkippedItem[];
  historyLinesRemoved: number;
}

export interface DeleteProjectResult extends DeleteResult {
  /** True only when the project directory itself was removed (all sessions cleared). */
  projectDirRemoved: boolean;
}

export interface RevealProjectResult {
  ok: true;
  path: string;
}

export interface DiskUsageProjectRow {
  projectId: string;
  decodedCwd: string;
  totalBytes: number;
  sessionCount: number;
}

export interface DiskUsageMonthRow {
  month: string;
  totalBytes: number;
  sessionCount: number;
}

export interface DiskUsageTopSession {
  projectId: string;
  sessionId: string;
  title: string;
  customTitle: string | null;
  totalBytes: number;
  lastAt: string | null;
}

export interface DiskUsage {
  byProject: DiskUsageProjectRow[];
  byMonth: DiskUsageMonthRow[];
  topSessions: DiskUsageTopSession[];
  totalBytes: number;
  totalSessions: number;
}

// ── 清理建议：把"可行动"的 cleanup target 显式列出来 ──────────────────────────
//
// largeSessions：top 10 最大的会话（按 jsonl + subdir + file-history + session-env 合计）
// orphanFileHistory / orphanSessionEnv：file-history/<sid>/ 或 session-env/<sid>/ 存在，
//   但对应 sid 在 projects/*/<sid>.jsonl 全集中找不到——典型情况是会话主体已被手动删
//   掉但侧 store 没清，纯属浪费磁盘。

export interface DiskCleanupLargeSession {
  sessionId: string;
  projectId: string;
  projectPath: string;
  title: string;
  customTitle: string | null;
  sizeBytes: number;
  lastActivity: string | null;
}

export type DiskOrphanKind = 'file-history' | 'session-env';

export interface DiskCleanupOrphan {
  sessionId: string;
  sizeBytes: number;
}

export interface DiskCleanupSuggestions {
  largeSessions: DiskCleanupLargeSession[];
  orphanFileHistory: DiskCleanupOrphan[];
  orphanSessionEnv: DiskCleanupOrphan[];
}

export interface DiskOrphanDeleteResult {
  sessionId: string;
  kind: DiskOrphanKind;
  freedBytes: number;
}

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryEntry {
  filename: string;
  name: string | null;
  description: string | null;
  type: MemoryType | null;
  body: string;
  bytes: number;
  mtime: string | null;
}

export interface MemoryResponse {
  index: string | null;
  entries: MemoryEntry[];
}

export interface HealthResponse {
  ok: boolean;
  claudeRoot: string;
  claudeRootExists: boolean;
  platform: string;
  node: string;
  pid: number;
}

// ── Version check & self-update ─────────────────────────────────────────────
//
// current = package.json version (same source as `ccsm --version`).
// latest/releaseNotes/releaseUrl come from the GitHub "latest release" API; when
// that check fails (offline, rate-limited) `checkError` carries the reason and the
// UI silently degrades to showing just the current version.

export interface VersionInfo {
  current: string;
  /** Latest release tag with leading `v` stripped; null if the check failed. */
  latest: string | null;
  hasUpdate: boolean;
  /** Release title (GitHub `name`), falling back to the tag. */
  releaseName: string | null;
  /** Markdown release notes (GitHub `body`). */
  releaseNotes: string | null;
  /** Link to the GitHub release page. */
  releaseUrl: string | null;
  publishedAt: string | null;
  repositoryUrl: string;
  /** Non-null when the latest-release lookup failed. */
  checkError: string | null;
}

export interface VersionUpdateResult {
  /** True when `npm install -g …` exited 0. */
  ok: boolean;
  fromVersion: string;
  /** Target version on success; null on failure. */
  toVersion: string | null;
  /** Tail of the package-manager stdout/stderr. */
  output: string;
  /** True after a successful update — the running process still serves the old code. */
  restartRequired: boolean;
}

// ── Cross-device share: export/import bundles ───────────────────────────────
//
// A bundle is a path-INDEPENDENT folder a user copies / commits-to-git / cloud-
// syncs between devices. The structural absolute path is replaced with a sentinel
// (`placeholder`) on export and substituted with the local path on import:
//   - session `.jsonl` lines carry the project root in their `cwd` field
//   - `history.jsonl` lines carry it in their `project` field (different name!)

export const BUNDLE_KIND = 'claude-session-bundle' as const;
export const BUNDLE_SCHEMA_VERSION = 1 as const;

export interface BundleFileMeta {
  /** sha256 of the bytes as written into the bundle (sentinel form). */
  sha256: string;
  /** Line count for .jsonl / .ndjson members. */
  lines: number;
  bytes: number;
}

export interface BundleMemoryFileMeta {
  filename: string;
  /** True only for the MEMORY.md index. */
  isIndex: boolean;
  sha256: string;
  bytes: number;
}

export interface BundleMemoryInventory {
  hasIndex: boolean;
  entries: BundleMemoryFileMeta[];
}

export interface BundleSessionMeta {
  sessionId: string;
  title: string;
  customTitle: string | null;
  firstAt: string | null;
  lastAt: string | null;
  messageCount: number;
  /** True if at least one conversation line had its `cwd` replaced by the sentinel. */
  cwdRewritten: boolean;
  conversation: BundleFileMeta;
  /** Null when no history.jsonl lines matched this session. */
  history: BundleFileMeta | null;
}

export interface BundleSource {
  platform: string;
  pathSep: string;
  projectId: string;
  cwd: string;
  cwdResolvedAtExport: boolean;
}

export interface BundleManifest {
  schemaVersion: number;
  kind: typeof BUNDLE_KIND;
  exportedAt: string;
  /** The literal sentinel string standing in for the project root. */
  placeholder: string;
  source: BundleSource;
  memory: BundleMemoryInventory;
  sessions: BundleSessionMeta[];
}

export interface ExportRequest {
  projectId: string;
  /** Session ids to include; null/'all' exports every session in the project. */
  sessionIds: string[] | 'all';
  destDir: string;
}

export interface ExportResult {
  destDir: string;
  sessionsExported: number;
  memoryFilesExported: number;
  historyLinesExported: number;
  totalBytes: number;
}

export type ImportCollisionPolicy = 'skip' | 'overwrite-if-newer' | 'keep-both';

export interface ImportTargetSuggestion {
  cwd: string;
  projectId: string;
  reason: 'existing-project' | 'original-path' | 'same-basename';
  /** True if the directory currently resolves on disk. */
  resolved: boolean;
}

export interface ImportRemapPlan {
  sourceCwd: string;
  targetCwd: string;
  targetProjectId: string;
  /** True if a project dir already exists locally for the target id. */
  targetProjectExists: boolean;
}

export type ImportSessionAction = 'create' | 'skip' | 'overwrite' | 'keep-both';

export interface ImportSessionPlan {
  sessionId: string;
  title: string;
  action: ImportSessionAction;
  /** Present for skip; explains why. */
  reason?: string;
  /** For keep-both: the freshly minted session id the copy lands under. */
  newSessionId?: string;
  isLivePid: boolean;
  isRecentlyActive: boolean;
  /** Local lastAt when a same-id session already exists (drives overwrite-if-newer). */
  localLastAt: string | null;
  bundleLastAt: string | null;
}

export type ImportMemoryAction = 'create' | 'skip' | 'conflict';

export interface ImportMemoryPlan {
  filename: string;
  isIndex: boolean;
  action: ImportMemoryAction;
  /** For conflict: the alternate filename the incoming copy will be written as. */
  writtenAs?: string;
}

export interface ImportPreviewRequest {
  bundleDir: string;
  /** Omit to let the server pick the best-suggested target. */
  targetCwd?: string;
  collisionPolicy: ImportCollisionPolicy;
}

export interface ImportPreviewResult {
  source: BundleSource;
  remap: ImportRemapPlan;
  suggestions: ImportTargetSuggestion[];
  sessions: ImportSessionPlan[];
  memory: ImportMemoryPlan[];
  historyLinesToAdd: number;
}

export interface ImportCommitRequest {
  bundleDir: string;
  targetCwd: string;
  collisionPolicy: ImportCollisionPolicy;
}

export interface ImportedSession {
  sessionId: string;
  action: ImportSessionAction;
  newSessionId?: string;
}

export interface ImportResult {
  targetProjectId: string;
  targetCwd: string;
  imported: ImportedSession[];
  skipped: SkippedItem[];
  historyLinesAdded: number;
  memoryWritten: string[];
}

// ── Session: modified files ─────────────────────────────────────────────────
//
// 一个会话里"被修改过的文件" = 该会话 .jsonl 中 tool_use(Edit/Write/MultiEdit/
// NotebookEdit) 的 input.file_path / notebook_path 聚合。文件快照本身在
// ~/.claude/file-history/<sid>/<hash>@v<n>，文件名是 hash 反查不出路径，所以
// 我们以 jsonl 里的 tool_use 记录为单一事实源。
//
// errored = 该 tool_use 对应的 tool_result 标了 is_error。
// pending = 没找到对应 tool_result（截断或仍在进行中）。
// totalCount/errorCount 把这两种都算在内，UI 区分展示。

export type ModifiedFileToolName = 'Edit' | 'Write' | 'MultiEdit' | 'NotebookEdit';

/** One hunk of a structured patch, copied verbatim from Claude Code's
 *  `toolUseResult.structuredPatch`. Carries the *real* file line numbers so the
 *  UI can render a GitHub-style unified diff with accurate gutters + omitted gaps. */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Each entry prefixed with ' ' (context), '-' (removed), or '+' (added). */
  lines: string[];
}

export interface ModifiedFileOperation {
  toolUseId: string;
  toolName: ModifiedFileToolName;
  ts: string | null;
  /** uuid of the assistant message that issued this tool_use; lets the UI focus it. */
  messageUuid: string | null;
  errored: boolean;
  pending: boolean;
  /** Accurate diff from the tool_result, with real file line numbers. Empty array
   *  for a brand-new file (Write/NotebookEdit create — render input content as all-added);
   *  null when still pending or the session was truncated before the result. */
  structuredPatch: DiffHunk[] | null;
}

export interface ModifiedFileSummary {
  /** Absolute path as recorded in the tool_use input. */
  filePath: string;
  /** Path relativized against session.cwd when filePath sits under it; else null. */
  relativePath: string | null;
  editCount: number;
  writeCount: number;
  multiEditCount: number;
  notebookEditCount: number;
  totalCount: number;
  errorCount: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Operations sorted by ts asc (null ts last). */
  operations: ModifiedFileOperation[];
}

export interface ModifiedFilesResponse {
  sessionId: string;
  projectId: string;
  /** Session-recorded cwd; used for relative paths and display. */
  cwd: string | null;
  /** Files sorted by lastAt desc (no-ts entries last). */
  files: ModifiedFileSummary[];
}

/** Response of opening a session-modified file in the OS default app. */
export interface OpenFileResult {
  ok: true;
  path: string;
}

export type SearchBlockKind = 'text' | 'tool_use' | 'tool_result' | 'thinking';

export interface SearchSnippet {
  uuid: string;
  ts: string | null;
  role: 'user' | 'assistant';
  blockKind: SearchBlockKind;
  before: string;
  match: string;
  after: string;
}

export interface SearchSessionHit {
  type: 'session';
  projectId: string;
  sessionId: string;
  projectDecodedCwd: string;
  title: string;
  customTitle: string | null;
  lastAt: string | null;
  /** True if the per-session snippet cap was hit; UI shows "+more". */
  hasMore: boolean;
  snippets: SearchSnippet[];
}

export interface SearchDone {
  type: 'done';
  scanned: number;
  matched: number;
  durationMs: number;
  truncated: boolean;
}

export type SearchEvent = SearchSessionHit | SearchDone;
