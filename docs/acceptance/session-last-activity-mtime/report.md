# Session "last activity" / mtime 对齐 — 验收结果

特性：把 `SessionSummary.lastAt` 升级为 `max(latest record timestamp, file mtime)`，与 `claude code resume` 对齐。

环境：Windows 11、Node 22、`npm run dev:server` 起 backend at `127.0.0.1:3131`。

验收方案：[`plan.md`](./plan.md)
设计文档：[`docs/spec/session-last-activity-mtime-design.md`](../../spec/session-last-activity-mtime-design.md)

## Round 1 结果

| 项 | 结果 |
|---|---|
| `npm run typecheck`（server + web） | ✅ |
| `node docs/acceptance/session-last-activity-mtime/scripts/verify-mtime-alignment.mjs` | ✅（5/5 session drift=0ms，含 1 个 live session） |
| `/projects/<id>` 页面 render（Playwright + screenshot）| ✅ 无 console error |

详细数据：[`round-1/alignment.md`](./round-1/alignment.md)、截图：[`round-1/project-sessions.png`](./round-1/project-sessions.png)

## 关键回归点已覆盖

- 之前最严重的 `3fe89855`（偏差 ~22h）：`API lastAt = fs mtime = 2026-05-08T14:18:22.044Z` ✓
- 活跃 session `071dbad3`：API 与 fs 同步推进，drift 0ms ✓
- 列表页（ProjectDetail）+ 详情页（SessionDetail）共用同一份 `lastAt`，单一升级覆盖两处 ✓

## Round-2 预留

如未来再发现 `lastAt` 与 mtime 偏差，新建 `round-2/` 记录证据 + 修复点，本文件标 "re-verified after round-2"。
