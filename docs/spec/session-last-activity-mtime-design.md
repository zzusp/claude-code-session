# Session "last activity" 时间对齐 `claude code resume` — 实施方案

## Context

用户对照 `/resume` picker 检查 `http://localhost:5173/projects/D--project-claude-code-session` 的 session 列表，发现"时间"列与 Claude Code 自带的相对时间不一致，最严重的一条偏差约 22 小时。

实测数据（本机 2026-05-09 21:40 左右）：

| sessionId 前缀 | 文件 mtime（本地） | 修复前 `lastAt`（jsonl 内最后一条 `timestamp`，本地） | resume 显示 | 偏差 |
|---|---|---|---|---|
| `8e19e851` | 2026-05-09 21:32:15 | 2026-05-09 21:32:15 | 3 min ago | ~0 |
| `575e9779` | 2026-05-08 23:24:11 | 2026-05-08 23:21:00 | 22h ago | 3 min |
| **`3fe89855`** | **2026-05-08 22:18:22** | **2026-05-07 23:49:54** | **23h ago** | **~22h** |
| `e6e5cbad` | 2026-05-08 00:38:09 | 2026-05-08 00:37:06 | 1d ago | ~1 min |

## 根因

`server/lib/parse-jsonl.ts` 把 `lastAt` 取作 jsonl 中"最后一条带 `timestamp` 字段的记录"。但 jsonl 末尾常驻几类 meta 记录**不带 `timestamp` 字段**：

- `ai-title`：Claude Code 每轮重写的 AI 标题
- `custom-title` / `agent-name`：本仓库 `server/lib/rename-session.ts:62-64` rename 时追加
- `last-prompt`、`permission-mode`、`file-history-snapshot`：Claude Code 维护

实测 `3fe89855` 的尾部记录：

```
270: system          ts=2026-05-07T15:49:54Z  ← 最后一条带 ts 的记录
271: system          ts=2026-05-07T15:49:54Z
272: last-prompt     ts=
273: ai-title        ts=
274: custom-title    ts=
275: agent-name      ts=
```

之后 Claude Code 在 5/8 22:18 又 rotate 了 ai-title / 触发了 rename，文件 mtime 推进到 5/8 22:18，但因为新增的全是无 ts 行，`lastAt` 仍然停在 5/7 15:49（UTC），UI 因此把这条 session 渲染成 "2d ago"。

`claude code resume` 取的是文件 mtime（或等价的"任何写入都计入"信号），不会漏更新，所以两边显示不一致。

## 拒绝过的备选方案

| 方案 | 拒绝原因 |
|---|---|
| 给 ai-title / rename / last-prompt 等记录补 `timestamp` 字段 | 写入未拥有的 wire 格式（CLAUDE.md 原则 6 / 4），Claude Code 自身写入路径不含 ts，无法保证一致性 |
| 在前端按 mtime 排序 | mtime 不在 wire 协议中，需要每行都补字段；分层职责错位（filesystem 信号属于 server 层） |
| 新加 `mtime` 字段，UI 切换数据源 | 增加 wire 字段、改前端多处显示和排序 —— 而 `lastAt` 的语义本就该等同"最近活动时间"，单一字段升级语义比双字段并存更干净 |

## 数据语义

- `SessionSummary.lastAt` / `SessionMeta.lastAt`：**最近活动时间** = `max(jsonl 内最大 timestamp 值, 文件 mtime)`，与 `claude code resume` 对齐
- `firstAt`：保持原语义（首条带 ts 的记录），不动

## 关键改动

### Shared types — `shared/types.ts`
- `SessionSummary.lastAt` / `SessionMeta.lastAt` 注释更新为 "max(latest record timestamp, file mtime) — matches `claude code resume`."

### Server — `server/lib/parse-jsonl.ts`
- 末尾 `return` 前 `fs.statSync(filePath)` 取 `mtime`，与扫描得到的 `lastAt` 取较大者后再返回
- 已有 `import fs from 'node:fs'`，无新增 import

### Server — `server/lib/load-session.ts`
- 已有的 `fs.statSync(jsonlPath)` 顺手扩展为同时拿 `mtime`
- 主循环结束后将 `meta.lastAt` 与 `mtime.toISOString()` 取大者
- 与 `parseJsonlMeta` 保持同一份语义，避免列表页与详情页时间不一致

### 不需要改的地方

- `server/lib/scan.ts` / `server/lib/disk-usage.ts` / `server/lib/search-all.ts`：直接消费 `lastAt`，语义升级后自动受益
- `web/src/lib/format.ts` / 各路由组件：消费 `lastAt`，无须改动
- `parse-jsonl.ts` 的 `firstAt`：首条用户消息时间，不动

## 安全 / 边界

- **空 session（无任何 ts 记录）**：原本 `lastAt=null`，现在 `lastAt=mtime` —— 比 null 更有用，列表也不再排序到底部。
- **Live session 实时 append**：mtime 与最后一条 ts 几乎相等（差 <1s），表现稳定。
- **跨平台**：`fs.Stats.mtime` 在 Windows / Linux / macOS 上一致返回 Date；`toISOString()` 统一为 UTC ISO，与 jsonl 内时间戳同格式可字典序比较。

## 不做

- 不引入新的 `mtime` wire 字段
- 不改 `firstAt` 语义
- 不修 `parse-jsonl.ts:42` 的 `lastAt = ts` 单调性问题（实测当前数据严格递增，不踩坑；改了反而破坏既有行为）

## 验收

详见 [`docs/acceptance/session-last-activity-mtime/`](../acceptance/session-last-activity-mtime/)。
