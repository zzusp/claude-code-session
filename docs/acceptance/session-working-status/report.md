# 会话「工作中」状态 — 验收报告（全绿）

实跑环境：Windows 11 / Node v22.13.0 / PowerShell 7 / worktree `worktree-worktree-working-status`，对真实 `~/.claude`（146 个会话 jsonl）验证。

## 1. 静态闸门

| 检查 | 命令 | 结果 |
|---|---|---|
| 全仓 typecheck | `npm run typecheck`（`tsc -b` server+web） | ✅ 0 error |
| server 单元测试 | `npm test` | ✅ 9 files / **60 passed** |
| 生产构建 | `npm run build` | ✅ `built in 8.68s` |

## 2. 真实数据：`isWorking` 计算（`scripts/verify-working.mts`）

```
live-pid sessions: 6   working sessions: 1

  27de8c47  live=true  recent=true  WORKING=true  age=0.1min
  61283a8c  live=true  recent=false WORKING=false age=8.0min
  55a0f98b  live=true  recent=false WORKING=false age=51.8min
  ca1e0fbd  live=true  recent=false WORKING=false age=55.8min
  bdf2f861  live=true  recent=false WORKING=false age=57.6min
  e8077dd8  live=true  recent=false WORKING=false age=61.3min
```

- 6 个运行中、仅 1 个工作中 —— 正是需求要的区分。
- `27de8c47`（正在实跑本任务的会话，末记录 `user(tool_result)`，0.1min）→ WORKING=true ✅
- 4 个 live 但 51–61min 闲置、末记录 `assistant→done` → WORKING=false = **运行中但不工作** ✅✅✅
- `61283a8c` 从 0.1min 闲置到 8min 后 `recent=false` → 不再工作，证明 5min 新鲜度门控能正确做 working→idle 过渡。

## 3. 反证：中断标记排除（`scripts/verify-interrupt.mts`）

全量 146 会话，`lastTurnIncomplete` 与独立 oracle 对比 **0 误判**：

```
lastTurnIncomplete by last-record class:
  (none)               incomplete=true:0  false:6
  assistant→done       incomplete=true:0  false:121
  assistant→tool_use   incomplete=true:1  false:0
  user(interrupted)    incomplete=true:0  false:5
  user(tool_result)    incomplete=true:1  false:0
  user(typed)          incomplete=true:12  false:0

mismatches vs expectation: 0
```

- `user(interrupted)`(5) 全部 `incomplete=false` ✅ —— 反证栏杆生效，5 个 `[Request interrupted by user]` 会话不会误报工作中。
- `assistant→done`(121) 全 false、`assistant→tool_use`/`user(tool_result)`/`user(typed)` 全 true，符合预期。

## 4. HTTP wire（`npm run start` @ 127.0.0.1:3132）

`GET /api/projects/:id/sessions` 对每个会话都带 `isWorking` 字段：

```
id        hasField isLivePid isWorking
27de8c47  True     True      True
61283a8c  True     True      False
55a0f98b  True     True      False
ca1e0fbd  True     True      False
e8077dd8  True     True      False

field present on all: True
```

`isWorking` 在 wire 上对所有会话存在且取值正确（live 会话仅当前实跑会话 working=true）。

## 待人工目测（无法在 headless 后台截图）

- 列表行 `StatusDot`：工作中 = 行进三点动画 + 「工作中」；运行中 = 脉冲点 + 「运行中」。
- 详情页 masthead：工作中徽章优先于「实时」；消息列表尾部出现「Claude 正在处理…」行，回复落地后消失。
- 这些复用既有设计 token（`loading-dots` / `pulse-amber` / surface 类），typecheck + build 已过，破坏风险低。

## 结论

后端判定逻辑在真实数据上 0 误判、反证栏杆生效，wire/构建/类型/单测全绿。**PASS**。
