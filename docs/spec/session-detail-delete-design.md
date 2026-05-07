# Session 详情页删除按钮 — 实施方案

## 一、需求边界

### 1.1 用户场景

用户进入 `/projects/:projectId/sessions/:sessionId` 阅读完一条会话内容后，判断这条会话不再需要保留。当前必须返回 `/projects/:projectId` 列表页 → 勾选 → 触发批量删除对话框，多了一次返回操作。

新增需求：在详情页 masthead 暴露一个 *Delete* 入口，点击后复用列表页已有的 `DeleteDialog`（同样的 5 处级联清理 + 确认弹窗 + skip 安全网），删除成功后自动跳回该 session 所属项目的列表页。

### 1.2 范围

- **In scope**：详情页右上角新增 Delete 按钮；接入既有 `DeleteDialog`；删除成功后 navigate 回 `/projects/:projectId`。
- **Out of scope**：后端删除接口与级联清理（已有，不动）；列表页删除入口（保持不变）；新增"软删除/回收站"语义；不修改 `DeleteDialog` 的视觉与文案。

### 1.3 非目标

- 不为详情页设计独立的"单条快速删除"接口，继续走 `DELETE /api/sessions { items: [...] }`。
- 不在 `SessionMeta` wire 协议里新增 `isLivePid` / `relatedBytes` 字段，避免与列表页 `SessionSummary` 出现两份"是否安全删除"的真相源。

## 二、数据库设计

不涉及数据库 / 文件结构变更。删除流程沿用 `server/lib/delete.ts` 的 5 处级联清理（`.jsonl`、subdir、`file-history/`、`session-env/`、`history.jsonl` 行过滤 + 仅当 PID 已退出时清理 `sessions/<pid>.json`）。

## 三、接口规范

不新增也不修改后端 API。

- 复用 `DELETE /api/sessions`，请求体 `{ items: [{ projectId, sessionId }] }`，单条 session 时 `items.length === 1`。
- 复用 `GET /api/projects/:id/sessions` 拿到当前 session 在列表语境下的 `SessionSummary`（包含 `isLivePid`、`isRecentlyActive`、`relatedBytes`），供 `DeleteDialog` 渲染 skip 提示与字节明细。

## 四、架构与设计规则

### 4.1 为什么不在 SessionDetail 复用既有数据，而要再拉一次列表

`SessionDetail.meta` 不含 `isLivePid` / `isRecentlyActive` / `relatedBytes`，而 `DeleteDialog` 的 willSkip / willDelete 划分以及"释放约 X bytes"的预估都依赖这些字段。两条路径：

- **A. 在详情页 fire `queryKeys.projectSessions(pid)` 查询**：用户从列表点入详情时该 query 已在缓存里，命中 0 网络往返；直接打开详情 URL 时多一次轻量 `GET /api/projects/:id/sessions`。优点：零 wire 协议改动，零后端工作。
- **B. 给 `SessionMeta` 加 `isLivePid` 等字段**：让详情页自给自足。代价：wire 协议出现两份"实时活跃状态"的真相源，未来字段漂移风险大。

选 **A**。代价仅是详情页冷启动多 1 次 API 调用（接口已有，已并发安全），换一致的真相源。

### 4.2 找不到对应 SessionSummary 时的降级

理论上有竞态：用户进入详情页 → `projectSessions` 查询返回的列表不包含当前 sid（如：另一个 tab 已删、或 sid 不在该 project 下）。处理：

- 列表正在加载 → Delete 按钮显示 disabled，title="loading"。
- 列表加载完但找不到当前 sid → Delete 按钮 disabled，title="session not in this project"。
- 列表加载报错 → Delete 按钮 disabled，title="failed to load session metadata"。

不弹 dialog 也不 fallback 调接口，避免让用户看到一个"释放约 0 bytes"的迷惑预览。

### 4.3 删除成功后的导航

`DeleteDialog` 现有完成态：用户点 *Done* → `onClose` 触发。新增可选回调 `onDeleted?: (deletedSessionIds: string[]) => void`，在 mutation 成功且 `result.deleted` 非空时调用一次。

详情页传入 `onDeleted`，若返回的 `deletedSessionIds` 包含当前 sid 则 `navigate(`/projects/${pid}`, { replace: true })`，避免后退键回到一个已 404 的详情页。若当前 sid 不在 `deletedSessionIds` 里（被 skip 了），保持详情页不动，让用户从 dialog 的 result 视图看到 skip 原因。

### 4.4 按钮放置

`SessionMasthead` 顶部 row 当前结构：
```
[● § SESSION  <sid>  <branch>]            [<dateline>]
```

在 dateline 右侧追加 Delete 按钮，使用与 `ProjectDetail` 一致的 danger-soft pill 样式（`border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)]`），保持视觉一致。

```
[● § SESSION  <sid>  <branch>]   [<dateline>]  [🗑 Delete]
```

按钮上不显示数字 badge（不像列表页要展示选中数）。

### 4.5 i18n

新增两条 key：
- `session.action.delete` — 按钮文案，en `Delete`，zh `删除`。
- `session.action.deleteTooltipBlocked` — disabled 时的 title，en `Session metadata not available yet`，zh `暂无法获取该会话状态`。

`DeleteDialog` 内部文案不动，因为它已有 `delete.label.session`（单数）/`delete.label.sessions`（复数）的分支。

## 五、代码地图

### 5.1 前端

| 文件 | 改动 |
|---|---|
| `web/src/routes/SessionDetail.tsx` | 在 `SessionDetailRoute` 内：新增 `useNavigate`；新增 `projectSessionsQuery`（key `queryKeys.projectSessions(pid)`）；从中 `find` 当前 sid 的 `SessionSummary`；新增 `showDeleteDialog` state；给 `SessionMasthead` 传 `onDelete` 回调与 `canDelete` 标志；条件渲染 `<DeleteDialog>`，传 `onDeleted` 回调判断是否 navigate。 |
| `web/src/routes/SessionDetail.tsx` 内 `SessionMasthead` | 顶部 row 增加可选的 `onDelete?: () => void` + `deleteDisabled?: boolean` + `deleteTooltip?: string` props；在 dateline 右侧渲染 Delete 按钮（danger-soft pill + 与 `TrashIcon` 同款 svg）。 |
| `web/src/components/DeleteDialog.tsx` | Props 新增可选 `onDeleted?: (deletedSessionIds: string[]) => void`；mutation `onSuccess` 时调用 `onDeleted?.(data.deleted.map((d) => d.sessionId))`；不影响列表页调用方（不传则不触发）。 |
| `web/src/lib/i18n.ts` | en/zh 各加 `session.action.delete`、`session.action.deleteTooltipBlocked`。 |

### 5.2 后端

无改动。

### 5.3 文档

| 文件 | 改动 |
|---|---|
| `README.md` | 第 13 行 *Session detail* 描述末尾追加一句"Inline *Delete* removes the session and returns to the project list."（中英对照视 README 当前语言而定，README 主体为英文，按英文写）。 |

## 六、任务状态

| 编号 | 内容 | 优先级 | 状态 |
|---|---|---|---|

（T-01 ~ T-06 已全部完成并通过验收，依规范从表中清理。提交记录可在 git log 中追溯。）

## 七、验收项

| 编号 | 接口 | 验证点 | 状态 |
|---|---|---|---|
| A-01 | UI（Playwright） | idle session 详情页 masthead 顶部右上出现 Delete 红色 pill 按钮且 enabled。证据：`docs/acceptance/session-detail-delete/round-1/a01-idle-button.png` | ✅ 通过 |
| A-02 | UI（Playwright） | 点 Delete → 弹出 DeleteDialog，标题"Delete sessions"/"删除会话"、jsonl+file-history 字节明细、底部"Delete 1 session"/"删除 1 个会话" 三项断言全 true。证据：`round-1/a02-idle-dialog.png` | ✅ 通过 |
| A-03 | UI（Playwright + mocked DELETE） | 点确认 → 拦截到 `DELETE /api/sessions`，请求体 `{"items":[{"projectId":"D--project-hiq-project","sessionId":"7dfaf7cf-..."}]}`；mock 返回 deleted 包含该 sid → 详情页自动跳转回 `/projects/<pid>`；后退键不再回到详情页（验证 `replace:true`）。证据：`round-1/a03-after-navigate.png`、`a03-after-back.png`。注：实现采用"删除成功立即跳转"，不展示 Result 视图（user 设计意图：自动跳转最少打断） | ✅ 通过 |
| A-04 | UI（Playwright） | live session（当前 Claude Code 进程持有的 e6e5cbad）→ 点 Delete → dialog 显示 willSkip 区域 + 底部 Delete 按钮 disabled。证据：`round-1/a04-live-skipped.png` | ✅ 通过 |
| A-05 | UI（Playwright） | URL 含不存在的 sid（`00000000-...`）→ session detail fetch 失败 → masthead 不渲染 → Delete 按钮根本不出现，无任何破坏性入口暴露。证据：`round-1/a05-bad-sid.png` | ✅ 通过 |
| A-06 | 推断 | 列表页删除入口未改动；DeleteDialog 内 `queryClient.invalidateQueries({ queryKey: queryKeys.projectSessions(projectId) })` 仍在 onSuccess 触发；同源 SPA 任何 list-page 实例 refetch 后该 session 即消失。新增的 onDeleted 回调附加在该路径之后（不替代）。未做端到端真删验证以避免触动用户数据 | ✅ 推断通过 |
| A-07 | typecheck + build | `npm run typecheck` 全绿 · `npm run build` 全绿（dist 产物 26.70 KB gzipped 主 bundle，与改动前规模持平） | ✅ 通过 |

## 八、附录

### 8.1 文件路径索引

- `web/src/routes/SessionDetail.tsx` — 详情页主组件 + masthead
- `web/src/components/DeleteDialog.tsx` — 复用的删除确认弹窗
- `web/src/routes/ProjectDetail.tsx` — 列表页（参考既有 delete 入口实现）
- `web/src/lib/query-keys.ts` — TanStack Query key 注册
- `web/src/lib/i18n.ts` — 文案字典
- `shared/types.ts` — `SessionSummary` / `DeleteResult` wire 协议
- `server/lib/delete.ts` — 后端级联清理（不改）
- `server/routes/sessions.ts` — `DELETE /api/sessions` 路由（不改）
- `README.md` — 第 13 行 *Session detail* 行需补一句

### 8.2 相关现有 spec

- `docs/spec/session-manager-design.md` — 主方案，定义了 5 处级联清理与 DeleteDialog 雏形
- `docs/spec/session-rename-design.md` — 详情页 inline 编辑入口的先例（同样在 masthead 上加交互按钮）
