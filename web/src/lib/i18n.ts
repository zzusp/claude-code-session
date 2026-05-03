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
    'common.missing': 'missing',
    'common.noSessions': 'No sessions in this project.',
    'common.noProjects': 'No projects found.',
    'common.noMessagesMatch': 'No messages match.',
    'common.failedProjects': 'Failed to load projects',
    'common.failedSessions': 'Failed to load sessions',
    'common.failedSession': 'Failed to load',
    'common.failed': 'Failed',
    'common.searchPlaceholder': 'Search this session…',

    'projects.eyebrow': 'Workspace',
    'projects.title': 'Projects',
    'projects.tagline':
      "Every directory you've touched with Claude Code, sorted by recency. Open one to inspect or prune its sessions.",
    'projects.indexHeading': 'Index',
    'projects.stat.projects': 'Projects',
    'projects.stat.sessions': 'Sessions',
    'projects.stat.onDisk': 'On disk',
    'projects.stat.resolved': '{{n}} resolved on disk',
    'projects.stat.acrossProjects': 'across all projects',
    'projects.stat.lastTouch': 'last touch {{ago}}',
    'projects.card.eyebrow': 'project',
    'projects.card.sessions': 'Sessions',
    'projects.card.onDisk': 'On disk',
    'projects.card.lastSeen': 'Last seen',
    'projects.warn.rootMissing':
      "Claude root {{root}} doesn't exist on this machine — nothing to display.",

    'project.eyebrow': 'Project',
    'project.tagline.default': 'Session history captured for this working directory.',
    'project.tagline.missing':
      'This directory no longer exists on disk — sessions remain archived.',
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
    'message.role.system': 'system',

    'tool.use': 'tool',
    'tool.result': 'tool result',
    'tool.error': 'tool error',
    'tool.thinking': 'thinking',
    'tool.image': 'image',

    'status.live': 'live · pid {{pid}}',
    'status.recent': 'recent',
    'status.idle': 'idle',
    'status.tooltip.live': 'PID {{pid}} is alive and registered for this session',
    'status.tooltip.recent': 'jsonl modified within the last {{n}} minutes',
    'status.tooltip.idle': 'idle — safe to delete',

    'disk.eyebrow': 'Forensics',
    'disk.title': 'Disk usage',
    'disk.tagline':
      'Where the bytes live: which projects swell, which months were busiest, which sessions are heaviest.',
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
    'common.missing': '已不存在',
    'common.noSessions': '该项目下暂无会话。',
    'common.noProjects': '未发现项目。',
    'common.noMessagesMatch': '没有匹配的消息。',
    'common.failedProjects': '加载项目失败',
    'common.failedSessions': '加载会话列表失败',
    'common.failedSession': '加载失败',
    'common.failed': '失败',
    'common.searchPlaceholder': '在此会话中搜索…',

    'projects.eyebrow': '工作区',
    'projects.title': '项目',
    'projects.tagline':
      '所有曾用 Claude Code 的工作目录，按最近活跃度排序。点击进入查看或清理其会话。',
    'projects.indexHeading': '索引',
    'projects.stat.projects': '项目数',
    'projects.stat.sessions': '会话数',
    'projects.stat.onDisk': '占用',
    'projects.stat.resolved': '{{n}} 个目录仍存在',
    'projects.stat.acrossProjects': '所有项目合计',
    'projects.stat.lastTouch': '最近活动 {{ago}}',
    'projects.card.eyebrow': '项目',
    'projects.card.sessions': '会话',
    'projects.card.onDisk': '占用',
    'projects.card.lastSeen': '最近',
    'projects.warn.rootMissing':
      'Claude 根目录 {{root}} 在本机不存在 — 无可显示内容。',

    'project.eyebrow': '项目',
    'project.tagline.default': '该工作目录下捕获的会话历史。',
    'project.tagline.missing': '此目录已从磁盘删除 — 会话仍保留为归档。',
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
    'message.role.system': '系统',

    'tool.use': '工具',
    'tool.result': '工具返回',
    'tool.error': '工具错误',
    'tool.thinking': '思考',
    'tool.image': '图片',

    'status.live': '运行中 · pid {{pid}}',
    'status.recent': '近期',
    'status.idle': '空闲',
    'status.tooltip.live': 'PID {{pid}} 仍在运行并绑定此会话',
    'status.tooltip.recent': 'jsonl 在过去 {{n}} 分钟内被修改',
    'status.tooltip.idle': '空闲 — 可安全删除',

    'disk.eyebrow': '取证',
    'disk.title': '磁盘占用',
    'disk.tagline': '字节都在哪儿：哪些项目膨胀、哪些月份最忙、哪些会话最沉。',
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
