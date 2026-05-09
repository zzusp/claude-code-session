# Session "last activity" / mtime 对齐 — 验收方案

特性：把 `SessionSummary.lastAt` 的语义从"jsonl 最后一条带 `timestamp` 的记录"升级为 `max(latest record timestamp, file mtime)`，使其与 `claude code resume` 显示的相对时间一致。详见 [`docs/spec/session-last-activity-mtime-design.md`](../../spec/session-last-activity-mtime-design.md)。

环境：Windows 11、Node 22+、`npm run dev` → backend 3131 / Vite 5173

## 自动可验证

| 项 | 命令 | 期望结果 |
|---|---|---|
| typecheck | `npm run typecheck` | ✅ 全绿（server + web） |
| 数据对齐 | `node docs/acceptance/session-last-activity-mtime/scripts/verify-mtime-alignment.mjs` | ✅ 每条 session 的 API `lastAt` 与本地 jsonl 文件 `mtime` ISO 完全相等（毫秒级） |

## 人工 spot-check 清单

启动：`npm run dev`

### A-01 数据接口对齐 mtime

1. `curl -s "http://127.0.0.1:3131/api/projects/D--project-claude-code-session/sessions" | jq '.[] | {id, lastAt}'`
2. 对每条 session，比对 `~/.claude/projects/D--project-claude-code-session/<sid>.jsonl` 的 `fs.statSync().mtime.toISOString()`
3. 两者应**毫秒级完全相等**（除了正在 append 的活跃 session，可能 lastAt > mtime）

判定：✅ / ❌

### A-02 列表页与 resume picker 对齐

1. 浏览器打开 http://localhost:5173/projects/D--project-claude-code-session
2. 同一台机器另起一个终端 `claude` → 输入 `/resume`，与 Claude Code 自带 picker 对照
3. 列表中每条 session 的相对时间（`X min ago` / `X h ago` / `X d ago`）应与 picker 显示一致（误差 ≤ 1 分钟，因为四舍五入边界可能错开）

判定：✅ / ❌

### A-03 rename 后立即更新

1. 在列表里挑一条 idle session，点击编辑铅笔，改名为 `tmp-rename-test`，回车
2. PATCH 成功后，列表行的相对时间应立即变成 `0s ago` / `1s ago`（rename 写入推进了 mtime）
3. 改名前在另一个终端记下 `Get-Item ...jsonl | %{$_.LastWriteTime}`，改名后再读一次确认 mtime 已推进
4. （回归）改完不影响 `firstAt` —— 详情页头部 "started" 字段应保持原值

判定：✅ / ❌

### A-04 详情页与列表页一致

1. 进入任意 session 详情页，记录页面右上角 `lastTouched` 显示
2. 退到 ProjectDetail 列表，看同一条 session 行的时间列
3. 两处显示应一致（同一条 ISO 走同一个 `formatRelativeTime`）

判定：✅ / ❌

## 失败处理

任意一项 ❌ → 在本目录新建 `round-2/` 记录证据 + 修复后的代码位置 → 修复后重测，本文件对应 A-xxx 注明 `re-verified after fix`。
