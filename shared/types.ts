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
  bytes: number;
  relatedBytes: RelatedBytes;
  isLivePid: boolean;
  isRecentlyActive: boolean;
  livePid: number | null;
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
