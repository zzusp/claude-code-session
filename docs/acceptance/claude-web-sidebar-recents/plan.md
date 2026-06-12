# 验收方案：侧栏 Recents + Close sidebar + 会话详情简化

## 需求

续仿 Claude web 聊天页（#65 之后）：① 左侧菜单支持 “Close sidebar”；② 左侧菜单新增 “Recents”，活跃会话有活跃效果；③ 会话详情页仿 chat 详情简化。

## 方案

见 [`docs/spec/claude-web-sidebar-recents.md`](../../spec/claude-web-sidebar-recents.md)。一句话：纯表现层 + 一个只读接口 `GET /api/sessions/recent`；会话详情的实时轮询/跟随尾部/窗口化/URL-focus 逻辑原样保留，只删 sticky-follower 测量这块表现层。

## 改动

| 文件 | 改动 |
|---|---|
| `server/lib/scan.ts` | 抽 `buildSessionSummary`（`listSessionsForProject` 与新 `listRecentSessions` 共用）；`listRecentSessions(limit)` 先 mtime 选候选再解析、active map 只建一次 |
| `server/routes/sessions.ts` | 新增 `GET /recent`（注册在通配段前，`?limit=` 1–50 默认 12） |
| `web/src/lib/query-keys.ts` | 新增 `recentSessions()` key |
| `web/src/components/Sidebar.tsx` | `useCollapsed`（localStorage）+ Close/Open sidebar；`RecentsSection`/`RecentRow`（复用 `StatusDot`，5s 条件轮询，当前会话高亮） |
| `web/src/routes/SessionDetail.tsx` | 删 masthead + sticky-follower 测量；`max-w-4xl` 居中；`ChatHeader`+`FilterRow` 单一不透明 sticky 容器；`MetaLine` 随滚动移出 |
| `web/src/components/DeleteDialog.tsx`、`web/src/routes/ProjectDetail.tsx` | 删除后 invalidate `recentSessions` |
| `README.md` | Session detail / 侧栏段落 + HTTP API 表同步 |

## 验证手段

- `npm run typecheck` / `npm test` / `npm run build`。
- `curl /api/sessions/recent?limit=5` 看 live/working/recent 标志。
- Playwright 真机截图（`scripts/shot.mjs`），生产构建读真实 `~/.claude`。

状态以 [`matrix.csv`](matrix.csv) 为准；证据见 [`round-1.md`](round-1.md)。
