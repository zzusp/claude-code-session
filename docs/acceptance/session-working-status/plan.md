# 会话「工作中」状态 — 方案

## 需求

会话列表的状态只有「运行中（live PID）/ 近期 / 空闲」，但**运行中 ≠ 正在工作**：一个 Claude Code 进程开着、却停在 prompt 等用户输入，也算 live。需要：

1. **会话列表**：新增「工作中」状态，与「运行中」区分开。
2. **会话详情页**：当 Claude 正在处理/思考/回复时，消息列表给一个「工作中」效果。

## 「工作中」如何判定（核心）

「工作中」= **存活进程 + 最后一轮对话未完成**。后两半分别来自 PID 探测和 jsonl 结构。

「最后一轮未完成」(`lastTurnIncomplete`)：取最后一条 `user`/`assistant` 记录（跳过尾部的 `ai-title`/`mode`/`pr-link` 等 meta 记录）——

- 末条是 `assistant` 且其**最后一个 content block 是 `tool_use`** → 工具待执行，Claude 还要继续 → 未完成。
  - 与 Anthropic 原生 `stop_reason: "tool_use"` 完全等价（实测 11583 条「末块 tool_use」全部 `stop_reason=tool_use`，0 例外）。用 block 判定免依赖 `stop_reason` 字段是否存在。
- 末条是 `user` 且**不是中断标记** → Claude 欠一个回复 → 未完成。
- 末条是 `assistant` 普通收尾（`stop_reason=end_turn`，末块是 text）→ 回合完成 → 已完成（这正是「运行中但不工作」）。

### 反证栏杆：中断标记必须排除

用户按 Esc 中止时，Claude Code 写入合成 `user` 记录 `[Request interrupted by user]` / `[Request interrupted by user for tool use]`。这表示**回合被停止**，不是 Claude 在干活。若天真地「末条是 user → 工作中」，这类会话会**误报**。

→ 用共享正则 `INTERRUPTED_MARKER_RE = /^\s*\[Request interrupted by user/`（`shared/constants.ts`）把中断标记判为「已完成」。

### 存活性门控（区分列表 vs 详情）

- **列表**（`SessionSummary.isWorking`，后端算）：`isLivePid && isRecentlyActive && lastTurnIncomplete`。live PID 这一关把「中途崩溃、文件冻结在 user 记录」挡在外面；5 分钟新鲜度把「中断后停留几分钟」收敛掉。
- **详情页**（前端每 2s 轮询消息算）：`isWithinLiveWindow(lastAt) && lastTurnIncomplete(messages)`。沿用已有 live-tail 的近期窗口口径，旧会话天然被 `isLive=false` 排除，指示器随轮询实时出现/消失。

## 改动清单

### 后端 / 协议
- `shared/constants.ts` — 新增 `INTERRUPTED_MARKER_RE`（server/web 共享）。
- `shared/types.ts` — `SessionSummary` 加 `isWorking: boolean`（wire 变更，server/web 同步）。
- `server/lib/constants.ts` — re-export `INTERRUPTED_MARKER_RE`。
- `server/lib/parse-jsonl.ts` — 扫描时追踪最后一条 user/assistant 记录，产出 `JsonlMeta.lastTurnIncomplete`；新增 `endsWithToolUse()` 辅助。
- `server/lib/scan.ts` — `listSessionsForProject` 组合出 `isWorking`。

### 前端
- `web/src/lib/constants.ts` — re-export `INTERRUPTED_MARKER_RE`。
- `web/src/components/StatusDot.tsx` — 新增最高优先级 `working` 变体（行进三点动画 `loading-dots`，区别于「运行中」的脉冲点）。
- `web/src/routes/ProjectDetail.tsx` — 新增 `workingCount`；「运行中」计数改为排除工作中，三态互斥；meta 行加「工作中」项。
- `web/src/routes/SessionDetail.tsx` — 前端 `lastTurnIncomplete()` + `isWorking`；masthead 徽章工作中优先于实时；消息列表尾部新增 `WorkingIndicator`（「Claude 正在处理…」）。
- `web/src/lib/i18n.ts` — `status.working`/`session.working*`/`project.meta.working` 中英文案。

### 文档
- `README.md` — 状态徽章列表加 `working`；详情页补一句工作中指示。

## 验证方式

1. `npm run typecheck`、`npm test`、`npm run build`。
2. `scripts/verify-working.mts` — 真实 `~/.claude` 数据下 `listSessionsForProject` 的 `isWorking`。
3. `scripts/verify-interrupt.mts` — 全量会话 `lastTurnIncomplete` 与独立 oracle 对比，重点验中断标记。
4. HTTP smoke：起 `npm run start`，`/api/projects/:id/sessions` 确认 wire 带 `isWorking`。

证据见 `report.md`。
