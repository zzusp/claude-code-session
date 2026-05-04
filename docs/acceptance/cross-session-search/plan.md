# Cross-session Search — 验收方案

特性来源：`/Users/sunpeng/.claude/plans/sequential-wiggling-platypus.md`（plan-mode 已批准）。

## 范围

- 后端新端点 `GET /api/search`（NDJSON 流式，read-only）
- 前端 `⌘K`/`Ctrl+K` 全局唤起 SearchModal
- SessionDetail `?focus=<uuid>&q=<query>` deep-link 聚焦 + 闪光

## 验收清单

| # | 项 | 检验方式 | 期望 |
|---|---|---|---|
| 1 | typecheck | `npm run typecheck` | 全绿 |
| 2 | build | `npm run build` | 全绿，bundle 不包含 hex 字面量回退 |
| 3 | 路由健康 | `curl /api/health`、`/api/projects` | 200 |
| 4 | 短 query | `curl /api/search?q=a` | 400 `q must be at least 2 characters` |
| 5 | 长 query | 201 字符 query | 400 `q exceeds max length 200` |
| 6 | 流式 | `curl -N /api/search?q=<高频词>` | `Content-Type: application/x-ndjson; charset=utf-8`、`Transfer-Encoding: chunked`、行随时间到达 |
| 7 | 命中结构 | 同上 | 每行 JSON 含 `projectId` / `sessionId` / `projectDecodedCwd` / `customTitle` / `lastAt` / `hasMore` / `snippets[]`；最后一行 `{type:done, scanned, matched, durationMs, truncated}` |
| 8 | per-session cap | 命中 > 5 的 session | 至多 5 个 snippet + `hasMore: true` |
| 9 | maxSessions cap | 全局命中 > 50 个 session | 提前 `done`，`truncated: true` |
| 10 | 活跃 session 安全 | 在被 claude 当前写入的 .jsonl 上搜 | 命中正常返回，不报错；半行 JSON 被静默跳过（`parse-jsonl.ts:33` invariant） |
| 11 | include 默认 | 无 `include` 参数 | text + tool_use + thinking 均扫描；tool_result 跳过 |
| 12 | include override | `?include=text,tool_result` | 仅扫这两类 |
| 13 | 唤起（modal） | dev 环境 ⌘K（Mac）/ Ctrl+K（其他）任意路由按下 | modal 开启，input 自动 focus |
| 14 | toggle | 模态打开时再按 ⌘K | 关闭 |
| 15 | ESC 关闭 | 按 ESC | 关闭 |
| 16 | 遮罩点击关闭 | 点 overlay | 关闭 |
| 17 | 流式 UI | 输入高频词 | 结果按 session 分组逐组出现；header 行显示 project tail · title · 相对时间 |
| 18 | 命中高亮 | 同上 | snippet 中命中词通过 `<mark>` 高亮（OKLCH accent token） |
| 19 | "+more" 提示 | `hasMore: true` 的 session | 末尾显示 `+more in this session` |
| 20 | summary 行 | 流结束 | footer 显示 `N session(s) · scanned X · Yms` |
| 21 | maxSessions 提示 | 触发 truncated | 列表底部显示 `Showing first N sessions — refine your query.` |
| 22 | 键盘导航 | 箭头 ↑↓ / Home / End / Enter | activeIndex 移动；Enter 跳转 |
| 23 | hover 跟随 | 鼠标 hover 某 snippet | activeIndex 同步该项 |
| 24 | 跳转 URL | 点击或 Enter | URL 变为 `/projects/<pid>/sessions/<sid>?focus=<uuid>&q=<query>` |
| 25 | 聚焦目标 | SessionDetail 加载后 | 滚动至该 message 居中、外层 `<li>` 短暂 `.flash-focus` |
| 26 | window 扩展 | focus 落在 window 外（>50 条） | windowSize 自动扩到包含目标 |
| 27 | 页内高亮 | URL 带 `q` | SessionDetail 顶部搜索框预填 q，页内 `<mark>` 全部点亮 |
| 28 | meta focus | focus 命中的是 meta 消息 | showMeta 自动开启 |
| 29 | 1 字符 query | 在 modal 内输入单字符 | 显示 `refineQuery` 中性提示，无 error chrome |
| 30 | 0 命中 | 输入不可能匹配的串 | 显示 `noResults` |
| 31 | i18n | locale 切到 zh | search.* 文案全部切换 |
| 32 | 主题 | dark + light | modal、`.flash-focus` 均使用 OKLCH token，无 hex 字面量泄漏 |
| 33 | 关闭即 abort | 流中途关闭 modal | `AbortController` 中断当前 fetch（无后台残留请求） |

## 进度

按 CLAUDE.md "Round-N" 规范：

- **Round-1**：自动可验证项（1-12）+ 已知 server-side smoke 已过；UI 项 13-33 待人工 spot-check。
- **Round-2**：仅在 Round-1 发现失败时进入。

## 不在范围

参考 plan 文件 "不在本计划范围" 章节：SQLite FTS5 / 正则短语模糊 / 搜索历史 / tool_result 默认开 / 命令面板扩展 / 复制按钮。
