import { useCallback, useEffect, useState } from 'react';

export type Locale = 'en' | 'zh';

const STORAGE_KEY = 'locale';

const DICT = {
  en: {
    'app.brand.title': 'Claude Sessions',
    'app.brand.subtitle': 'local archive',
    'app.brand.footnote': 'local · read-only by default',
    'nav.workspace': 'Workspace',
    'nav.projects': 'Projects',
    'nav.disk': 'Disk usage',
    'nav.theme': 'Theme',
    'nav.language': 'Language',
    'nav.toggleNav': 'Toggle navigation',
    'nav.closeNav': 'Close navigation',

    'common.loading': 'loading',
    'common.scanning': 'scanning ~/.claude/projects/…',
    'common.computing': 'computing…',
    'common.readingSessions': 'reading sessions…',
    'common.loadingSession': 'loading session…',
    'common.noData': 'no data',
    'common.entries': 'entries',
    'common.entry': 'entry',
    'common.selectAll': 'select all',
    'common.deselectAll': 'deselect all',
    'common.cancel': 'Cancel',
    'common.done': 'Done',
    'common.expand': 'expand',
    'common.collapse': 'collapse',
    'common.system': 'system',
    'common.onlyUser': 'only me',
    'common.missing': 'missing',
    'common.noSessions': 'No sessions in this project.',
    'common.noProjects': 'No projects found.',
    'common.noMessagesMatch': 'No messages match.',
    'common.failedProjects': 'Failed to load projects',
    'common.failedSessions': 'Failed to load sessions',
    'common.failedSession': 'Failed to load',
    'common.failedMemory': 'Failed to load memory',
    'common.failed': 'Failed',
    'common.searchPlaceholder': 'Search this session…',
    'common.loadEarlier': 'Load earlier (+{{n}})',
    'common.scrollToTop': 'Jump to top',
    'common.scrollToBottom': 'Jump to bottom',

    'projects.title': 'Projects',
    'projects.tagline':
      "Every directory you've touched with Claude Code, sorted by recency. Open one to inspect or prune its sessions.",
    'projects.indexHeading': 'Index',
    'projects.stat.projects': 'Projects',
    'projects.stat.sessions': 'Sessions',
    'projects.stat.onDisk': 'On disk',
    'projects.card.eyebrow': 'project',
    'projects.card.sessions': 'Sessions',
    'projects.card.onDisk': 'On disk',
    'projects.card.lastSeen': 'Last seen',
    'projects.warn.rootMissing':
      "Claude root {{root}} doesn't exist on this machine — nothing to display.",

    'project.eyebrow': 'Project',
    'project.warn.missingDir': 'Directory missing on disk',
    'project.action.delete': 'Delete · {{n}}',
    'project.meta.sessions': 'Sessions',
    'project.meta.onDisk': 'On disk',
    'project.meta.live': 'Live',
    'project.meta.recent': 'Recent',
    'project.heading': 'Sessions',
    'project.col.title': 'Title',
    'project.col.msgs': 'Msgs',
    'project.col.last': 'Last',
    'project.col.size': 'Size',
    'project.col.status': 'Status',

    'session.crumbProjects': 'Projects',
    'session.tagline':
      'Started {{started}} · last touched {{lastTouched}}{{branchPart}}',
    'session.tagline.branch': ' · branch {{branch}}',
    'session.meta.messages': 'Messages',
    'session.meta.size': 'Size',
    'session.meta.version': 'Version',
    'session.meta.started': 'Started',
    'session.truncated': 'Session truncated to first {{n}} messages.',
    'session.shown': '{{shown}} / {{total}}',

    'message.role.you': 'You',
    'message.role.claude': 'Claude',
    'message.role.tool': 'Tool',
    'message.role.system': 'system',

    'tool.use': 'tool',
    'tool.result': 'tool result',
    'tool.error': 'tool error',
    'tool.thinking': 'thinking',
    'tool.thinkingEncrypted': 'Content is encrypted, no readable text.',
    'tool.image': 'image',

    'status.live': 'live · pid {{pid}}',
    'status.recent': 'recent',
    'status.idle': 'idle',
    'status.tooltip.live': 'PID {{pid}} is alive and registered for this session',
    'status.tooltip.recent': 'jsonl modified within the last {{n}} minutes',
    'status.tooltip.idle': 'idle — safe to delete',

    'disk.tagline':
      "How `~/.claude/` is using your disk: which projects carry the most weight, and which sessions are heaviest.",
    'disk.title': 'Disk usage',
    'disk.meta.total': 'Total',
    'disk.meta.projects': 'Projects',
    'disk.meta.sessions': 'Sessions',
    'disk.stat.total': 'Total on disk',
    'disk.stat.acrossProjects': 'across {{n}} projects',
    'disk.stat.sessions': 'Sessions',
    'disk.stat.largest': 'largest {{size}}',
    'disk.stat.months': 'Months tracked',
    'disk.composition.title': 'Composition',
    'disk.composition.subtitle': 'bytes per project',
    'disk.composition.total': 'Total',
    'disk.cadence.title': 'Cadence',
    'disk.cadence.subtitle': 'MB per month',
    'disk.heaviest.title': 'Heaviest sessions',
    'disk.heaviest.top': 'top {{n}}',
    'disk.col.num': '#',
    'disk.col.title': 'Title',
    'disk.col.project': 'Project',
    'disk.col.last': 'Last',
    'disk.col.size': 'Size',

    'memory.title': 'Memory',
    'memory.empty': 'No memory recorded yet for this project.',
    'memory.action.open': 'Memory',
    'memory.meta.entries': 'Entries',
    'memory.type.user': 'User',
    'memory.type.feedback': 'Feedback',
    'memory.type.project': 'Project',
    'memory.type.reference': 'Reference',
    'memory.type.other': 'Other',
    'memory.loading': 'reading memory…',
    'memory.search.placeholder': 'Search title, hook, or body…',
    'memory.filter.all': 'All',
    'memory.sort.label': 'Sort',
    'memory.sort.index': 'MEMORY.md order',
    'memory.sort.recent': 'Recent first',
    'memory.sort.name': 'Name A→Z',
    'memory.sort.size': 'Largest first',
    'memory.list.noResults': 'No entries match.',
    'memory.list.count': '{{n}} of {{total}}',
    'memory.index.pseudoTitle': 'MEMORY.md',
    'memory.index.pseudoHook': 'Curated index — table of contents',
    'memory.index.empty': 'No MEMORY.md index in this project.',
    'memory.index.missing': 'No matching entry file',
    'memory.reader.appearsAs': 'Appears in MEMORY.md as',
    'memory.reader.noSelection': 'Select an entry on the left.',
    'memory.reader.back': '← Back to list',

    'delete.eyebrow.confirm': 'Confirm deletion',
    'delete.eyebrow.result': 'Result',
    'delete.title.confirm': 'Delete sessions',
    'delete.title.result': 'Sessions removed',
    'delete.summary':
      '{{n}} will be removed · {{skipped}} skipped · ~{{free}} to free',
    'delete.skipped.heading': 'These {{n}} will be skipped:',
    'delete.skipped.reasonLive': 'live PID {{pid}}',
    'delete.skipped.reasonRecent': 'modified within last {{n}} minutes',
    'delete.skipped.reasonUnknown': 'unknown',
    'delete.success':
      'Deleted {{n}} session(s). {{free}} freed · {{lines}} history lines removed',
    'delete.btn.confirm': 'Delete {{n}} {{label}}',
    'delete.btn.confirmPending': 'Deleting…',
    'delete.label.session': 'session',
    'delete.label.sessions': 'sessions',
    'delete.close': 'Close',

    'search.action.open': 'Search sessions',
    'search.placeholder': 'Search across all sessions…',
    'search.empty': 'Type at least 2 characters to search across every session on disk.',
    'search.refineQuery': 'Type a longer query to refine the search.',
    'search.scanning': 'scanning…',
    'search.noResults': 'No matches.',
    'search.error': 'Search failed: {{msg}}',
    'search.moreInSession': '+more in this session',
    'search.moreSessions': 'Showing first {{n}} sessions — refine your query for more.',
    'search.summary': '{{matched}} session(s) · scanned {{scanned}} · {{ms}}ms',
    'search.shortcut': '{{hint}} to open',
    'search.escapeHint': 'esc to close',
    'search.kindText': 'text',
    'search.kindToolUse': 'tool',
    'search.kindToolResult': 'tool result',
    'search.kindThinking': 'thinking',
    'search.role.user': 'You',
    'search.role.assistant': 'Claude',
  },

  zh: {
    'app.brand.title': 'Claude 会话',
    'app.brand.subtitle': '本地归档',
    'app.brand.footnote': '本地 · 默认只读',
    'nav.workspace': '工作区',
    'nav.projects': '项目',
    'nav.disk': '磁盘占用',
    'nav.theme': '主题',
    'nav.language': '语言',
    'nav.toggleNav': '切换导航',
    'nav.closeNav': '关闭导航',

    'common.loading': '加载中',
    'common.scanning': '正在扫描 ~/.claude/projects/…',
    'common.computing': '统计中…',
    'common.readingSessions': '读取会话中…',
    'common.loadingSession': '加载会话中…',
    'common.noData': '暂无数据',
    'common.entries': '项',
    'common.entry': '项',
    'common.selectAll': '全选',
    'common.deselectAll': '取消全选',
    'common.cancel': '取消',
    'common.done': '完成',
    'common.expand': '展开',
    'common.collapse': '收起',
    'common.system': '系统',
    'common.onlyUser': '仅我',
    'common.missing': '已不存在',
    'common.noSessions': '该项目下暂无会话。',
    'common.noProjects': '未发现项目。',
    'common.noMessagesMatch': '没有匹配的消息。',
    'common.failedProjects': '加载项目失败',
    'common.failedSessions': '加载会话列表失败',
    'common.failedSession': '加载失败',
    'common.failedMemory': '加载记忆失败',
    'common.failed': '失败',
    'common.searchPlaceholder': '在此会话中搜索…',
    'common.loadEarlier': '加载更早 (+{{n}})',
    'common.scrollToTop': '回到顶部',
    'common.scrollToBottom': '回到底部',

    'projects.title': '项目',
    'projects.tagline':
      '所有曾用 Claude Code 的工作目录，按最近活跃度排序。点击进入查看或清理其会话。',
    'projects.indexHeading': '索引',
    'projects.stat.projects': '项目数',
    'projects.stat.sessions': '会话数',
    'projects.stat.onDisk': '占用',
    'projects.card.eyebrow': '项目',
    'projects.card.sessions': '会话',
    'projects.card.onDisk': '占用',
    'projects.card.lastSeen': '最近',
    'projects.warn.rootMissing':
      'Claude 根目录 {{root}} 在本机不存在 — 无可显示内容。',

    'project.eyebrow': '项目',
    'project.warn.missingDir': '目录已从磁盘删除',
    'project.action.delete': '删除 · {{n}}',
    'project.meta.sessions': '会话',
    'project.meta.onDisk': '占用',
    'project.meta.live': '运行中',
    'project.meta.recent': '近期',
    'project.heading': '会话',
    'project.col.title': '标题',
    'project.col.msgs': '消息',
    'project.col.last': '最近',
    'project.col.size': '大小',
    'project.col.status': '状态',

    'session.crumbProjects': '项目',
    'session.tagline': '开始于 {{started}} · 最后触达 {{lastTouched}}{{branchPart}}',
    'session.tagline.branch': ' · 分支 {{branch}}',
    'session.meta.messages': '消息数',
    'session.meta.size': '大小',
    'session.meta.version': '版本',
    'session.meta.started': '开始时间',
    'session.truncated': '会话已截断至前 {{n}} 条消息。',
    'session.shown': '{{shown}} / {{total}}',

    'message.role.you': '我',
    'message.role.claude': 'Claude',
    'message.role.tool': '工具',
    'message.role.system': '系统',

    'tool.use': '工具',
    'tool.result': '工具返回',
    'tool.error': '工具错误',
    'tool.thinking': '思考',
    'tool.thinkingEncrypted': '内容被加密，无可读文本。',
    'tool.image': '图片',

    'status.live': '运行中 · pid {{pid}}',
    'status.recent': '近期',
    'status.idle': '空闲',
    'status.tooltip.live': 'PID {{pid}} 仍在运行并绑定此会话',
    'status.tooltip.recent': 'jsonl 在过去 {{n}} 分钟内被修改',
    'status.tooltip.idle': '空闲 — 可安全删除',

    'disk.tagline':
      '`~/.claude/` 占用磁盘的全貌：哪些项目最沉，哪些会话最大。',
    'disk.title': '磁盘占用',
    'disk.meta.total': '总计',
    'disk.meta.projects': '项目',
    'disk.meta.sessions': '会话',
    'disk.stat.total': '总占用',
    'disk.stat.acrossProjects': '覆盖 {{n}} 个项目',
    'disk.stat.sessions': '会话',
    'disk.stat.largest': '最大 {{size}}',
    'disk.stat.months': '月份覆盖',
    'disk.composition.title': '构成',
    'disk.composition.subtitle': '按项目占用',
    'disk.composition.total': '合计',
    'disk.cadence.title': '节奏',
    'disk.cadence.subtitle': '每月 MB',
    'disk.heaviest.title': '最沉的会话',
    'disk.heaviest.top': '前 {{n}}',
    'disk.col.num': '#',
    'disk.col.title': '标题',
    'disk.col.project': '项目',
    'disk.col.last': '最近',
    'disk.col.size': '大小',

    'memory.title': '记忆',
    'memory.empty': '该项目尚未沉淀任何记忆。',
    'memory.action.open': '记忆',
    'memory.meta.entries': '条目数',
    'memory.type.user': '用户',
    'memory.type.feedback': '反馈',
    'memory.type.project': '项目',
    'memory.type.reference': '外链',
    'memory.type.other': '其他',
    'memory.loading': '读取记忆中…',
    'memory.search.placeholder': '搜索标题、摘要或正文…',
    'memory.filter.all': '全部',
    'memory.sort.label': '排序',
    'memory.sort.index': 'MEMORY.md 顺序',
    'memory.sort.recent': '最近修改',
    'memory.sort.name': '名称 A→Z',
    'memory.sort.size': '体积大→小',
    'memory.list.noResults': '没有匹配的条目。',
    'memory.list.count': '{{n}} / {{total}}',
    'memory.index.pseudoTitle': 'MEMORY.md',
    'memory.index.pseudoHook': '精选索引 —— 目录',
    'memory.index.empty': '该项目没有 MEMORY.md 索引。',
    'memory.index.missing': '未找到对应条目文件',
    'memory.reader.appearsAs': '在 MEMORY.md 中的呈现',
    'memory.reader.noSelection': '从左侧选一条查看。',
    'memory.reader.back': '← 返回列表',

    'delete.eyebrow.confirm': '确认删除',
    'delete.eyebrow.result': '结果',
    'delete.title.confirm': '删除会话',
    'delete.title.result': '已删除会话',
    'delete.summary': '将删除 {{n}} 项 · 跳过 {{skipped}} 项 · 释放约 {{free}}',
    'delete.skipped.heading': '将跳过这 {{n}} 项：',
    'delete.skipped.reasonLive': '运行中 PID {{pid}}',
    'delete.skipped.reasonRecent': '过去 {{n}} 分钟内有修改',
    'delete.skipped.reasonUnknown': '未知',
    'delete.success': '已删除 {{n}} 个会话。释放 {{free}} · 清理 {{lines}} 条历史记录',
    'delete.btn.confirm': '删除 {{n}} {{label}}',
    'delete.btn.confirmPending': '删除中…',
    'delete.label.session': '个会话',
    'delete.label.sessions': '个会话',
    'delete.close': '关闭',

    'search.action.open': '搜索会话',
    'search.placeholder': '在所有会话中搜索…',
    'search.empty': '至少输入 2 个字符，将在磁盘上的所有会话中搜索。',
    'search.refineQuery': '请输入更长的关键词以缩小范围。',
    'search.scanning': '扫描中…',
    'search.noResults': '没有匹配项。',
    'search.error': '搜索失败：{{msg}}',
    'search.moreInSession': '该会话中还有更多',
    'search.moreSessions': '仅显示前 {{n}} 个会话 — 请细化关键词。',
    'search.summary': '{{matched}} 个会话 · 扫描 {{scanned}} 项 · {{ms}}ms',
    'search.shortcut': '{{hint}} 唤起',
    'search.escapeHint': 'esc 关闭',
    'search.kindText': '文本',
    'search.kindToolUse': '工具',
    'search.kindToolResult': '工具返回',
    'search.kindThinking': '思考',
    'search.role.user': '我',
    'search.role.assistant': 'Claude',
  },
} as const;

type Key = keyof (typeof DICT)['en'];

function readInitial(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    /* fall through */
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let _locale: Locale = typeof window !== 'undefined' ? readInitial() : 'en';
const listeners = new Set<(l: Locale) => void>();

export function getLocale(): Locale {
  return _locale;
}

export function setLocale(next: Locale) {
  if (next === _locale) return;
  _locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage might be blocked */
  }
  document.documentElement.setAttribute('lang', next);
  listeners.forEach((fn) => fn(next));
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void; toggle: () => void } {
  const [locale, setLocaleState] = useState(_locale);

  useEffect(() => {
    const handler = (l: Locale) => setLocaleState(l);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const setNext = useCallback((l: Locale) => {
    setLocale(l);
  }, []);

  const toggle = useCallback(() => {
    setLocale(_locale === 'en' ? 'zh' : 'en');
  }, []);

  return { locale, setLocale: setNext, toggle };
}

export function useT(): (key: Key, params?: Record<string, string | number>) => string {
  const { locale } = useLocale();
  return useCallback(
    (key: Key, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
}

export function translate(
  locale: Locale,
  key: Key,
  params?: Record<string, string | number>,
): string {
  const dict = DICT[locale];
  let str: string = dict[key] ?? DICT.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return str;
}
