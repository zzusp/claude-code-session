# Session 重命名 — 实施方案

## Context

用户问"可以为 session 重命名么？"。调查后发现两件事：

1. **Claude Code 已经原生支持 rename**，并把结果以 append-only 形式写进 session 的 `.jsonl`：
   ```
   {"type":"custom-title","customTitle":"<name>","sessionId":"<sid>"}
   {"type":"agent-name","agentName":"<name>","sessionId":"<sid>"}
   ```
   两条配对、值始终相等，最后一次写入即生效。证据：本机 11 个 jsonl 中 5 个含此记录，每个 append 2~49 次；用户指出的 `~/.claude/projects/-Users-sunpeng-workspace-hiq-project/8ce3fb5b-c229-4663-807f-f9991f061cb9.jsonl` 在 line 332/333、338/339 都有 `"去掉常规flow，仅保留fast flow"`。

2. **当前 session manager 完全忽略了这个字段**——`server/lib/parse-jsonl.ts:48-54` 只取首条非系统标签的 user 消息文本，所以即便用户在 CLI 里 rename 过，UI 列表 / 详情页仍然显示首条提示词。这是 bug。

修复后，**读** 走 Claude Code 的原生字段；**写** 也照同一格式追加，零私有 metadata、零数据格式发明、双向兼容。

## 拒绝过的备选方案

| 方案 | 拒绝原因 |
|---|---|
| 改首条 user 消息文本 | 破坏用户原始 prompt——上下文、搜索、`claude --resume` 后的回放全错 |
| Sidecar `.meta.json` 文件 | 在 Claude Code 已有 native 字段时另造一套 metadata 体系，违反 CLAUDE.md 原则 4「用原生能力」 |
| 自定义 `{"type":"sessionDisplayName",...}` 行 | 写入未拥有的文件格式（原则 6「参数归参数」）；Claude Code 自身遇到未知 type 行为不可预知 |

## 数据语义

- `SessionSummary.title` / `SessionMeta.title`：从首条 user 消息推导的 fallback 值，永远存在
- `SessionSummary.customTitle` / `SessionMeta.customTitle`：用户显式命名值，未命名时为 `null`
- 前端显示 = `customTitle ?? title`

## 关键改动

### Shared types — `shared/types.ts`
- `SessionSummary` 加 `customTitle: string | null`
- `SessionMeta` 加 `customTitle: string | null` 与 `title: string`

### Server — 读
- `server/lib/parse-jsonl.ts`：循环里识别 `obj.type === 'custom-title'` 时，`customTitle = obj.customTitle`（last-wins）；返回新增 `customTitle` 字段
- `server/lib/scan.ts`：把 `meta.customTitle` 透传到 `SessionSummary`
- `server/lib/load-session.ts`：`captureMeta` 同样捕获 `custom-title`；并新增 `deriveAutoTitle(messages)` 一次性算好放入 `meta.title`，避免前端重复实现

### Server — 写
- 新文件 `server/lib/rename-session.ts`
  - 安全检查（参考 `server/lib/delete.ts:32-58` 同级模式）：
    1. `isSafeId(projectId) && isSafeId(sessionId)`
    2. 路径必须 `isUnderClaudeRoot`
    3. jsonl 文件必须存在
    4. **拒绝 live PID**：`buildActiveSessionMap()` 包含此 sessionId 时返回 reason `"live PID <pid> owns this session — close the running claude first"`
    5. trim 后 1~200 字符
    6. 拒绝控制字符（`/[\x00-\x1F\x7F]/`）防止 JSONL 行注入
  - 写入：`fs.appendFileSync(jsonlPath, titleLine + '\n' + agentLine + '\n')` 单次系统调用、两行原子追加（< PIPE_BUF）
- `server/routes/sessions.ts`
  - 新增 `PATCH /:projectId/:sessionId`，body `{ customTitle: string }`
  - 沿用 `isAcceptableOrigin` CSRF 检查（与 DELETE 同款）
  - live PID → 409；其他失败 → 400

### Web — 读
- `web/src/routes/ProjectDetail.tsx`：列表渲染 `s.customTitle ?? s.title`
- `web/src/routes/SessionDetail.tsx`：用 `data.meta.customTitle ?? data.meta.title`；删掉前端重复的 `findSessionTitle` 函数

### Web — 写
- `web/src/components/PageHeader.tsx`：新增可选 `editableValue` + `onTitleEdit` props，hover 显示铅笔，Enter 提交 / Esc 取消 / blur 取消，带 inline error
- `web/src/routes/SessionDetail.tsx`：TanStack `useMutation` 调 PATCH，成功后 invalidate `session(pid,sid)` + `projectSessions(pid)`

## 安全 / 边界

- **Live session 写冲突**：`fs.appendFileSync` 在 macOS / Linux 对 < PIPE_BUF（macOS 512 / Linux 4096）的写入是原子的。我们一次 200~500 字节，理论安全。但仍直接拒绝 live session rename，由用户在 CLI 关掉 claude 再改。
- **只增不删**：v1 不实现"清除自定义标题"。Claude Code 自身也是 append-only 模型，无"撤销 rename"概念。
- **JSONL 行注入防护**：所有控制字符（含 `\n` `\r` `\t`）一并拒绝。

## 不做

- 不引入 sidecar `.meta.json` / SQLite / 索引文件
- 不在 ProjectDetail 列表里加铅笔（用户已明确只要详情页一个入口）
- 不写 `agent-name` 之外的字段；不读 `agent-name`（与 `customTitle` 双源歧义；已实证两者恒等）
