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
  title: string;
  firstAt: string | null;
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
  lastAt: string | null;
  messageCount: number;
  bytes: number;
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

export interface HealthResponse {
  ok: boolean;
  claudeRoot: string;
  claudeRootExists: boolean;
  platform: string;
  node: string;
  pid: number;
}
