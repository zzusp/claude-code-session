# Claude web 续仿：侧栏 Recents + Close sidebar + 会话详情简化

延续 #65（仿 Claude 桌面端）的视觉/布局工作，把三处对齐 Claude web 聊天页：

1. **左侧菜单支持 “Close sidebar”** —— 桌面端可一键收起侧栏，腾出整宽阅读区；收起后左上角浮出一个再展开的 handle。选择记到 `localStorage`，刷新保持。
2. **左侧菜单新增 “Recents”** —— 列出跨全部项目最近活跃的会话；活跃会话有活跃效果（working 走三点行进动画 / live 走脉冲点 / recent 实心点 / idle 空心点），当前打开的会话高亮。
3. **会话详情页仿 chat 详情简化** —— 去掉重型 editorial masthead（大标题 + facts 网格 + tagline 栏）与 sticky follower 测量逻辑，换成一条精简 chat 风 sticky header（状态 + 可改标题 + Modified files + Delete）+ 其下精简搜索/过滤行 + 居中消息流。

## 纯表现层 + 一个只读接口

- **不动**任何删除 / 导出 / 导入安全网、ID 校验、`PATHS` 路径假设、wire 协议字段语义。
- 会话详情那套**实时轮询 / 实时跟随尾部 / URL focus 闪烁 / 窗口化加载**逻辑原样保留，只删掉「sticky follower 测量」这一块表现层（`pinTop/stuck/railRef/followerRef` + 两个测量 effect），简化即收益。
- 唯一新增接口：`GET /api/sessions/recent`（只读）。

## 后端：`GET /api/sessions/recent`

- 复用 `SessionSummary` 作为返回类型（前端 `StatusDot` 直接吃，类型零新增）。
- `server/lib/scan.ts`：把原 `listSessionsForProject` 循环体抽成 `buildSessionSummary(projectId, id, activeMap)`，`listSessionsForProject` 与新 `listRecentSessions(limit)` 共用。
- `listRecentSessions`：先用廉价 `statSync` 取每条 jsonl 的 mtime 选出最近 `limit` 条候选，**只对这批**解析 jsonl meta + 算字节，避免全盘解析；active map **全局只建一次**（Windows 下 = 一次 `tasklist` spawn，见 scan.ts 既有注释——按项目各建是磁盘页慢的主因，这里规避）。
- 路由 `GET /recent` 注册在 `/:projectId/:sessionId` 等通配段之前；`?limit=` 1–50，默认 12。

## 前端

- `web/src/lib/query-keys.ts`：新增 `recentSessions()` key。删除 / 重命名会话后 invalidate（`DeleteDialog`、`ProjectDetail` 批量删、`SessionDetail` 重命名三处），让侧栏 Recents 同步。
- `Sidebar.tsx`：
  - `useCollapsed()`（`localStorage: sidebar-collapsed`，镜像 `theme.ts` 写法）。桌面端 collapsed → `aside` 加 `lg:hidden`（退出 flex 流，主区自动占满），并浮出固定再展开按钮；header 内加 “Close sidebar”（panel-left 图标）。移动端 drawer 的 `open` 状态与 collapsed 互不干扰。
  - `RecentsSection`：`useQuery(recentSessions)`，有 live/recent 会话时 5s 短轮询、全 idle 自动停。复用 `StatusDot withLabel={false}` 出活跃点；当前会话（从 `pathname` 的 `/sessions/<id>` 解析）高亮。
- `SessionDetail.tsx`：`section` 收窄到 `max-w-4xl mx-auto`；非 sticky 的 `MetaLine`（tagline + facts + sid）随滚动移出；一个 **单一** sticky 容器内含 `ChatHeader` + `FilterRow`（不再用两段 sticky + pin 数学），背景用不透明 `--color-surface` 以保证钉住时文字清晰。

## 验证

- `npm run typecheck` ✓、`npm test` ✓（9 files / 61 tests，安全网未受影响）、`npm run build` ✓。
- `GET /api/sessions/recent?limit=5` 实测返回跨项目 5 条，live/working/recent 标志正确填充。
- 真机截图（Playwright，生产构建 + `npm run start` 读真实 `~/.claude`）：home（侧栏 + Recents）light/dark、collapsed、会话详情 light/dark、滚动后 sticky header。见 `docs/acceptance/claude-web-sidebar-recents/round-1/`。
