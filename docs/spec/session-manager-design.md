# Claude Code Session 历史管理工具 — 实施方案

## Context

`/Users/sunpeng/workspace/claude-code-session/` 当前为空仓库（仅 `LICENSE` + `CLAUDE.md`）。要在此基础上搭建一个本地工具，**查看 + 清理** Claude Code 历史 session（不做修改类操作）。

**为什么需要**：Claude Code 的会话数据散落在 `~/.claude/` 多个子目录，无内置查看器和清理工具；session 越积越多、`file-history/` 占磁盘大；删一个 session 必须手动跨目录清理才不会留孤儿文件。

**预期产出**：`npm run start` 启动 → 浏览器自动打开 `http://localhost:3131` → 看到所有项目和 session、能搜索、能选中批量级联删除、能看到磁盘占用全景。

**支持平台**：macOS + Windows（Linux 顺带支持，无额外工作）。Node 22+，本工具无 native 依赖。

---

## 一、关键现状（已通过 Explore agent 核实）

### 1.1 一个 session 的数据散在 5 处

| 路径 | 内容 | 删除时处理 |
|---|---|---|
| `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` | 主会话流 | 删文件 |
| `~/.claude/projects/<encoded-cwd>/<sessionId>/` (subagents/, memory/) | 子 agent + 关联记忆 | 递归删目录 |
| `~/.claude/file-history/<sessionId>/` | Claude 编辑过的文件版本快照（**磁盘占用大头**） | 递归删目录 |
| `~/.claude/session-env/<sessionId>/` | 环境快照 | 递归删目录 |
| `~/.claude/history.jsonl` | 全局 prompt 历史（按行包含 sessionId） | 过滤行重写 |
| `~/.claude/sessions/<pid>.json` | 活跃 session 的 PID 映射 | 仅当对应进程已结束时删 |

`projects/` 子目录用 `-` 编码 cwd：
- macOS / Linux：`/Users/sunpeng/workspace/foo` → `-Users-sunpeng-workspace-foo`
- Windows：`C:\Users\sunpeng\workspace\foo` → `C--Users-sunpeng-workspace-foo`（盘符冒号 + 反斜杠都换成 `-`，启动时若发现别的形态再加适配）

**反向解码策略**：单纯按规则反推会有歧义（连续 `-` 是分隔符还是原值？）。`scan.ts` 拿到子目录名后做"启发式校验"——尝试解出几种可能的 cwd 路径，逐个 `fs.stat` 看哪个真实存在；都不在就退化为"按规则机械还原"展示，并在 UI 标注 `(path may not exist anymore)`。

### 1.2 `.jsonl` 行结构（每行一个 JSON）

- `type: "file-history-snapshot"` — 元数据快照（首行常见）
- `type: "user"` — `{ uuid, parentUuid, sessionId, cwd, gitBranch, timestamp, version, message: { role, content } }`
- `type: "assistant"` — `{ ..., message: { model, content: [{type:"text"|"tool_use"|...}], usage: {...} }, requestId, ... }`
- 工具调用 / 结果 = `message.content` 数组里的 `tool_use` / `tool_result` 块

**用作 session 标题**：第一条 `type=user` 且 `message.content` 非系统命令（不是 `<command-name>` 开头）的内容前 60 字。

### 1.3 文件权限

`~/.claude/` 下文件 `0600`，浏览器无法直接读 → 必须本地后端代理。

---

## 二、技术栈

| 层 | 选型 |
|---|---|
| 运行时 / 后端 | **Node 22+**（用户机器 Node 24 已装；不引入额外运行时） |
| TS 运行 / watch | **tsx**（`tsx watch`，零配置 ESM + TS） |
| HTTP 路由 | **Hono** + `@hono/node-server` 适配器 |
| 前端 | **React 19 + Vite + TypeScript** |
| 样式 | **Tailwind v4**（`@tailwindcss/vite`，CSS-first 配置，不需要 tailwind.config.js） |
| 路由 | React Router v6 |
| 数据获取 | TanStack Query（缓存 + 失效时机自动） |
| 图表（磁盘占用） | Recharts |

**理由**：用户选了 React + Vite + Tailwind；Node 24 已装，零额外运行时安装成本；Hono + node-server 组合在 Node 上同样轻量，未来若想换 Bun/Cloudflare Workers/Edge 只需替换适配器；shadcn/ui 暂不引入（按需添加，避免一开始拉一堆 Radix 包）。

---

## 三、目录结构

```
claude-code-session/
├── package.json                 # workspace 根，scripts 串起前后端
├── bun.lockb
├── tsconfig.json                # 共享 TS 配置（path alias）
├── server/
│   ├── index.ts                 # Hono app + Bun.serve 入口
│   ├── routes/
│   │   ├── projects.ts          # GET /api/projects, GET /api/projects/:id
│   │   ├── sessions.ts          # GET /api/sessions/:projectId/:sessionId
│   │   └── delete.ts            # DELETE /api/sessions (批量, body 传 ids)
│   ├── lib/
│   │   ├── claude-paths.ts      # ~/.claude 各子目录路径工具
│   │   ├── encode-cwd.ts        # cwd ↔ -slash-encoded 互转
│   │   ├── scan.ts              # 扫描 projects/ 聚合 session 列表 + size
│   │   ├── parse-jsonl.ts       # 流式行解析 + title 提取 + 消息计数
│   │   ├── search.ts            # session 内消息全文搜索（grep + offset）
│   │   ├── disk-usage.ts        # 各类目录的占用统计
│   │   ├── active-sessions.ts   # 解析 sessions/<pid>.json 判断进程是否还活
│   │   └── delete.ts            # 级联删除 + history.jsonl 行过滤
│   └── types.ts                 # ProjectSummary / SessionSummary / Message 等
├── web/
│   ├── index.html
│   ├── vite.config.ts           # dev 时 proxy /api → http://localhost:3131 后端
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx              # 路由入口
│       ├── routes/
│       │   ├── ProjectsList.tsx       # 首页：项目卡片 + 磁盘总览
│       │   ├── ProjectDetail.tsx      # 项目下 session 列表 + 多选删除
│       │   ├── SessionDetail.tsx      # 消息时间线 + 站内搜索
│       │   └── DiskUsage.tsx          # 可视化页：饼图 + Top N 表
│       ├── components/
│       │   ├── SessionCard.tsx
│       │   ├── MessageBubble.tsx      # 区分 user/assistant/tool_use/tool_result
│       │   ├── ToolBlock.tsx          # 工具调用折叠展开
│       │   ├── DeleteDialog.tsx       # 二次确认 + 显示级联清单 + 释放空间
│       │   └── ui/                    # shadcn/ui 组件（按需添加）
│       ├── lib/
│       │   ├── api.ts                 # fetch 封装
│       │   ├── format.ts              # bytes / 时间格式化
│       │   └── highlight.ts           # 搜索关键词高亮
│       └── hooks/
│           ├── useProjects.ts
│           ├── useSession.ts
│           └── useDeleteSessions.ts
└── README.md                    # 启动步骤 + 截图位 + 安全注意事项
```

---

## 四、API 设计

```
GET  /api/projects
     → [{ id, encodedCwd, decodedCwd, sessionCount, totalBytes, lastActiveAt }]

GET  /api/projects/:id/sessions
     → [{ id, title, firstAt, lastAt, messageCount, bytes, isActive,
          relatedBytes: { jsonl, fileHistory, sessionEnv } }]

GET  /api/sessions/:projectId/:sessionId
     → { meta: {...}, messages: [{ uuid, type, role, ts, blocks: [...] }] }
     # 流式分页（messages 多时支持 ?offset & ?limit）

GET  /api/sessions/:projectId/:sessionId/search?q=xxx
     → [{ messageUuid, snippet, offset }]

GET  /api/disk-usage
     → { byProject: [...], byMonth: [...], topSessions: [...], totalBytes }

DELETE /api/sessions
     body: { items: [{ projectId, sessionId }] }
     → { deleted: [{ sessionId, freedBytes, cleaned: ['jsonl','fileHistory',...] }],
         skipped: [{ sessionId, reason }] }
```

**安全闸门**：
- 后端只接受相对 `~/.claude/` 的路径，所有路径 join 后做 `path.resolve()` + `startsWith(claudeRoot)` 校验，防 `..` 越界（Windows 比对前都 `path.normalize` + 大小写归一）
- DELETE 端点要求 `Origin: http://localhost:3131`，防止其它本地服务跨站
- 监听仅 `127.0.0.1:3131`，不绑 `0.0.0.0`；端口被占用时自动 `+1` 直到 3140，并把实际端口打到 stdout

---

## 五、核心实现要点

### 5.1 标题提取（`parse-jsonl.ts`）

```ts
// 第一条非系统命令的 user 消息前 60 字；都没有则用 sessionId
function extractTitle(lines: string[]): string {
  for (const line of lines) {
    const obj = JSON.parse(line);
    if (obj.type !== 'user') continue;
    const c = typeof obj.message?.content === 'string'
      ? obj.message.content : '';
    if (c.startsWith('<command-name>') || c.startsWith('<local-command')) continue;
    return c.slice(0, 60).replace(/\s+/g, ' ').trim();
  }
  return '(untitled)';
}
```

### 5.2 级联删除（`delete.ts`）

按用户确认的范围，单个 session 删除流程：

1. 检查 `sessions/<pid>.json` 是否还指向此 sessionId 且 PID 存活（**跨平台**封装 `isPidAlive()`：macOS/Linux 用 `process.kill(pid, 0)` + `errno !== 'ESRCH'`；Windows 用 `child_process.execFileSync('tasklist', ['/FI', 'PID eq ' + pid, '/NH'])` 看输出是否含该 PID）→ 存活则 skip
2. `fs.rm(projects/<cwd>/<sessionId>.jsonl)` + `fs.rm(projects/<cwd>/<sessionId>/, { recursive: true })`
3. `fs.rm(file-history/<sessionId>/, { recursive: true })`
4. `fs.rm(session-env/<sessionId>/, { recursive: true })`
5. 流式过滤重写 `history.jsonl`：先写 `.tmp` → `fs.unlink` 老文件 → `fs.rename` 替换（**Windows 不能 rename 覆盖已存在文件**，必须先 unlink）
6. 删除已退出进程对应的 `sessions/<pid>.json`
7. 累加每步 `freedBytes`

### 5.3 消息渲染分支（`MessageBubble.tsx`）

`message.content` 可能是 string（user 简单消息）或 array（assistant / 复杂 user）。Block 类型 → 组件：
- `text` → 普通文本（markdown 渲染）
- `tool_use` → 折叠卡片，显示 `name` + `input` JSON
- `tool_result` → 折叠卡片，content 限制高度 + 展开按钮
- `thinking` → 灰色块，默认折叠

### 5.4 磁盘占用计算（`disk-usage.ts`）

不要每次请求都全盘扫；首次扫完缓存索引：
- macOS / Linux：`~/.cache/claude-session-viewer/index.json`
- Windows：`%LOCALAPPDATA%\claude-session-viewer\index.json`

抽出 `getCacheDir()`：用 `env.XDG_CACHE_HOME ?? env.LOCALAPPDATA ?? path.join(os.homedir(), '.cache')`。文件 mtime > 缓存 mtime 时才重新扫该目录。

### 5.5 跨平台路径工具（`claude-paths.ts`）

```ts
import os from 'node:os';
import path from 'node:path';
const claudeRoot = path.join(os.homedir(), '.claude');
export const PATHS = {
  root: claudeRoot,
  projects: path.join(claudeRoot, 'projects'),
  fileHistory: path.join(claudeRoot, 'file-history'),
  sessionEnv: path.join(claudeRoot, 'session-env'),
  sessions: path.join(claudeRoot, 'sessions'),
  history: path.join(claudeRoot, 'history.jsonl'),
};
```

任何路径都用 `path.join` / `path.sep`，禁止字符串拼接 `/`。所有"是否在 ~/.claude 内"校验都先 `path.resolve()`，Windows 上 `process.platform === 'win32'` 时再做 `.toLowerCase()` 大小写归一。

---

## 六、`package.json` 脚本

```json
{
  "scripts": {
    "dev": "concurrently -k -n server,web \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server": "tsx watch server/index.ts",
    "dev:web": "vite",
    "build": "vite build",
    "start": "tsx server/index.ts"
  }
}
```

跨平台注意：
- 不用 `&` 后台 / 不用 `cd a && cd b` 串接（Windows cmd 不一样）
- `concurrently -k` 在任一进程退出时 kill 全部，Win/Mac 行为一致
- 默认监听 **3131**，被占用自动找下一个空闲端口（最多到 3140），实际端口写到 stdout 让 `open` 能拿到

---

## 七、验证计划

按 `CLAUDE.md` 要求"行为变了就同步文档 / 用过即修"：

1. **本地启动验证**：
   - `npm install && npm run dev` → 浏览器打开 `localhost:3131`
   - 首页应列出当前 4 个项目（`claude-code-session`、`claude-research`、`hiq-project`、`Users-sunpeng`）
   - 进入 `claude-code-session` 应看到 2 个 session

2. **删除冒烟**：
   - 准备一个**测试用的旧 session**（手动复制一个 `.jsonl` 到独立目录避免误删工作数据）
   - 多选 → 删除 → 确认对话框显示将清理的 4 类目录 + 释放字节数
   - 删除后 `find ~/.claude -name "<sessionId>*"` 应无结果
   - `grep <sessionId> ~/.claude/history.jsonl` 应无结果
   - 当前活跃 session（PID 仍在）应被 skip 并给出原因

3. **路径越界防御**：
   - `curl -X DELETE 'http://localhost:3131/api/sessions' -d '{"items":[{"projectId":"../etc","sessionId":"passwd"}]}'`
   - 后端应返 400 + 不动文件系统

4. **跨浏览器**：Chrome / Safari / Firefox 各打开一次确保无 API 兼容问题

5. **跨平台**：
   - macOS：本机直接验证（开发主力）
   - Windows：在 Win11 + Node 22+ 上跑一遍 `npm install && npm run start`，确认：
     - `~/.claude/` 解析到 `C:\Users\<user>\.claude\`
     - `projects/` 子目录的 `C--xxx` 形态能正确解码并展示
     - 删除流程不报 `EPERM` / `EBUSY`（rename 前已 unlink）
     - PID 存活检测 `tasklist` 能识别 Claude Code 进程

6. **README 验收**：照 README 的 "Quick Start" 一遍能跑通（Mac + Win 各一次）；跑不通就改文档不糊弄

---

## 八、后续阶段（不在首版）

- 跨 session 全局搜索（用户未选）→ 用 SQLite FTS5 索引，等数据量上去再加
- 导出 session 为 Markdown
- 自动化清理规则（"超过 30 天 + 0 重要消息 自动归档"）
- 打包成可分发二进制（`pkg` / Node SEA / 改回 Bun `bun build --compile`）

---

## 九、要修改 / 新增的关键文件清单

新增（仓库当前为空）：
- `package.json`、`tsconfig.json`、`tsconfig.server.json`、`package-lock.json`
- `server/index.ts` + `server/routes/*.ts` + `server/lib/*.ts` + `server/types.ts`
- `web/index.html`、`vite.config.ts`（项目根，root 指向 `web/`）
- `web/src/main.tsx`、`web/src/index.css`、`web/src/App.tsx` + `routes/` + `components/` + `lib/` + `hooks/`
- `README.md`（启动步骤 + 数据安全说明 + 截图占位）
- `.gitignore`（`node_modules/`、`dist/`、`.cache/`）

不动 `~/.claude/` 任何内容（除非用户在 UI 里点了删除）。
