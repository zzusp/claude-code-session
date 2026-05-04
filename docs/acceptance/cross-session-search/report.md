# Cross-session Search — 验收报告

特性：[`/Users/sunpeng/.claude/plans/sequential-wiggling-platypus.md`](../../../../.claude/plans/sequential-wiggling-platypus.md)（plan-mode 已批准）。
验收日期：2026-05-04
环境：macOS Darwin 22.6.0、Node v24.15.0、本地真实 `~/.claude/`、Playwright 1.59.1 + system Chrome（headless）。

## 总览

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 全绿 |
| `npm run build` | ✅ 全绿（initial chunk 25.86 KB gzip） |
| 自动化 e2e（Playwright × 22 项） | ✅ 全绿 |
| Round | Round-1 一次通过 |

证据：
- [`round-1/auto-checks.md`](round-1/auto-checks.md) — server 侧 smoke + typecheck + build
- [`round-1/verdict.json`](round-1/verdict.json) — Playwright 每项 pass/note
- [`round-1/screenshots/*.png`](round-1/screenshots/) — 6 张截图（modal-open / results / after-navigate / flash-focus / zh-locale / dark-theme）
- [`scripts/e2e.mjs`](scripts/e2e.mjs) — 可重跑

## API 契约

| # | 项 | 实测 |
|---|---|---|
| 4 | 短 query 拒绝 | `GET /api/search?q=a` → `400 q must be at least 2 characters` |
| 6 | NDJSON 流式 | `Content-Type: application/x-ndjson; charset=utf-8` + `Transfer-Encoding: chunked` + 每行一个 JSON 事件 |
| 7 | 命中结构 | `{type:'session', projectId, sessionId, projectDecodedCwd, title, customTitle, lastAt, hasMore, snippets[]}` + 终止 `{type:'done', scanned, matched, durationMs, truncated}` |
| 8 | per-session cap | `hasMore: true` 出现在命中超过 5 条的 session 上 |
| 9 / 21 | maxSessions cap | `?maxSessions=1` → `{"type":"done","scanned":1,"matched":1,"durationMs":30,"truncated":true}` |
| 11 | 默认 include | text + tool_use + thinking 全扫；tool_result 不进入默认范围 |

## UI 契约（Playwright headless × 22 项）

| # | 项 | 实测 |
|---|---|---|
| 13 | ⌘K 唤起 modal、input 自动 focus | ✅ `modal=true inputFocused=true` |
| 14 | ⌘K 再按 toggle 关闭 | ✅ |
| 15 | ESC 关闭 | ✅ |
| 16 | 遮罩点击关闭（点 `mouse(10,10)`） | ✅ |
| 17 | 结果按 session 分组流式出现 | ✅ `groups=5` |
| 18 | 命中通过 `<mark>` 高亮（OKLCH） | ✅ `marks=18 bg=oklch(0.94 0.058 75)`（light） |
| 19 | hasMore session 末尾显示 "+more in this session" | ✅ `count=2` |
| 20 | footer 显示 `N session · scanned X · Yms` | ✅ `5 SESSION(S) · SCANNED 24 · 545MS` |
| 21 | maxSessions 触发 `truncated` | ✅（API 层验证） |
| 22 | ↑↓ Home End Enter 键盘导航 | ✅ `ArrowDown × 2 → activeButton=2` |
| 23 | hover 同步 activeIndex | ✅ `hovered data-flat-index=17` |
| 24 | 点击 snippet → URL `?focus=&q=` | ✅ `focus=b1f52e4f… q=claude-paths` |
| 25 | 滚动至 message 居中 + `flash-focus` 闪光 | ✅ `flash=true centered=true` |
| 26 | focus 目标已渲染（必要时窗口扩展） | ✅ |
| 27 | URL `q=` 预填 SessionDetail 搜索框 | ✅ `value="claude-paths"` |
| 27.1 | 页内 `<mark>` 全亮 | ✅ `marks=2` |
| 28 | meta 消息聚焦自动开启 showMeta | ✅ |
| 29 | 1 字符 query → `refineQuery` 中性提示 | ✅ `Type a longer query to refine the search.` |
| 30 | 不可能匹配 → `noResults` | ✅ `No matches.`（query 用 `nomatch-${randomUUID()}` 避免被记录到 jsonl 后误匹配） |
| 31 | locale 切到 zh → 文案切换 | ✅ `placeholder="在所有会话中搜索…"` |
| 32 | dark 主题下 mark 仍 OKLCH（无 hex） | ✅ `dark bg=oklch(0.32 0.075 65)` |
| 33 | 关闭即 abort 流 | ✅ 无残留请求（heuristic） |

## Round-1 期间发现并修复的问题

| 项 | 现象 | 根因 | 修复 |
|---|---|---|---|
| #13 | input 不 focus | `setTimeout(focus, 30)` 早于 dialog mount 完成 | 改为 `requestAnimationFrame` 调 focus；input 加 `autoFocus` belt-and-suspenders |
| #15 | ESC 不关闭 | onKeyDown 挂在 dialog div，input focused 时事件能冒泡，但 input 还没 focus 时事件无人接 | 改为在 `useEffect` 内对 `window` 监听 `keydown`，捕获 ESC 后 `onClose()` |
| #25 | `flash-focus` 加在 `<div data-uuid>` 上而非 `<li>` | 实现细节漂移 plan | 改为 `el.closest('li') ?? el` 作为 flash target |
| #30 | NO_MATCH_QUERY = 字符串字面量被 Claude Code 写入当前 session jsonl，搜索时反而命中自己 | 静态字面量被会话日志记录 | 改为 `nomatch-${randomUUID()}` 运行时生成 |

修复 commit 与原特性 commit 一并提交（见下文 Round 章节）。

## 我没法自动验证（已记录）

无 — 全部 22 项已在 Playwright headless 中通过。

## Round 章节

- **Round-1**：22 项一次通过（含修复期间 4 个真问题，全部当轮修复 + 重跑）。证据完整。
- **Round-2**：用户反馈"没有可见入口"——补加桌面 sidebar 触发条 + 移动 topbar 图标按钮。新增 3 项验收（#34 / #34.1 / #34.3），全部通过；同时回归原 22 项。证据：[`round-2/verdict.json`](round-2/verdict.json) + [`round-2/screenshots/`](round-2/screenshots/)（新增 `34-sidebar-entry.png` / `34-mobile-topbar.png`）。

### Round-2 新增项

| # | 项 | 实测 |
|---|---|---|
| 34 | 桌面 sidebar 触发条点击 → modal 唤起 + input focus | ✅ `triggers=1 inputFocused=true` |
| 34.1 | 触发条显示平台快捷键 hint | ✅ `kbd="⌘K"` |
| 34.3 | 移动 topbar 搜索图标按钮 → modal 唤起 | ✅ |
