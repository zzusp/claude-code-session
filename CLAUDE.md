# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

**Claude Code Session Manager** —— 一个本地 Web UI，用于浏览 / 清理 `~/.claude/` 下的 Claude Code 会话历史。默认对磁盘只读，写操作仅在用户 UI 显式触发时发生：*Delete* 一个会话、*Export* 一份可移植 bundle（写到 `~/.claude/` 之外）、或 *Import* 一份（跨设备共享记忆 + 对话历史，路径会重映射到本机）。绑定 `127.0.0.1`，单用户单机使用。

详细产品说明见 [`README.md`](README.md)；设计文档见 [`docs/spec/`](docs/spec)。

## 开发命令

需要 **Node 22+**（推荐 24）。

| Script | 用途 |
|---|---|
| `npm run dev` | 并发启动 backend (`node --import tsx --watch server/index.ts`，端口 3131–3140) + Vite dev server (5173)。`dev:web` 先跑 `scripts/wait-for-server.mjs` 等 backend 听到 3131 再起 vite，避开冷启动期间的 `ECONNREFUSED → 500`。Vite 把 `/api/*` 代理到 backend。 |
| `npm run dev:server` / `npm run dev:web` | 单独启动其中一边。 |
| `npm run build` | 用 Vite 把 SPA 构建到 `dist/`。 |
| `npm run start` | 单进程生产模式：Hono 同时托管 `dist/` 静态资源和 API。 |
| `npm run typecheck` | `tsc -b` 同时校验 `tsconfig.server.json` + `tsconfig.web.json`。 |
| `npm test` | vitest 跑 `server/**/*.test.ts`：覆盖 safety-net 核心（路径校验 `isSafeId` / `isUnderClaudeRoot`、删除 5 处级联 + 活会话/最近 5 分钟跳过、export ↔ import 占位符双向替换的对称性）。`npm run test:watch` 是开发期的 watch 模式。 |

**没有 lint。** 改完代码用 `npm run typecheck` 把整个 monorepo 过一遍，再跑 `npm test` 跑 server 端 safety-net 单元测试；web 端 UI 行为仍靠 `docs/acceptance/` 下的 e2e 方案手动验证。

端口：3131 占用时自动顺延到 3140，并把实际端口打到 stdout。

## 架构

三层结构，所有改动应保持这个分层不被打破：

```
shared/    Wire 协议（类型 + 常量），server 和 web 都导入。改这里要双向 typecheck。
server/    Hono backend。所有文件系统读写都集中在这里。
web/       React 19 + Vite + Tailwind v4 SPA。绝不直接读 ~/.claude/，只走 /api。
```

### Server 端关键约束

- **`~/.claude/` 路径只在一处定义**：`server/lib/claude-paths.ts` 的 `PATHS` 对象。其它地方需要拼路径必须从 `PATHS` 派生，不要再独立用 `os.homedir()` 拼。
- **任何路径在读 / 写之前必须过 `isUnderClaudeRoot()` 校验**（Windows 下做大小写折叠），防止 path-traversal 逃出 `~/.claude/`。
- **ID 校验**：`server/lib/safe-id.ts` 拒绝包含 `/`、`\`、`..` 或以 `.` 开头的 sessionId / projectId。所有从 URL 参数进来的 id 必须先过这一关。
- **删除流程的 5 个位置**（`server/lib/delete.ts`）：每条 session 实际散落在 `projects/<encoded-cwd>/<sid>.jsonl` + `projects/<encoded-cwd>/<sid>/` + `file-history/<sid>/` + `session-env/<sid>/` + `history.jsonl` 里的对应行 + `sessions/<pid>.json`（仅当 PID 已退出）。一次 delete 必须级联清理这些位置，缺一不可。**孤儿场景走 `deleteOrphan`**（`server/lib/cleanup-suggestions.ts`）：jsonl + subdir 都没了、只剩 `file-history/<sid>/` 或 `session-env/<sid>/` 时，`deleteSessions` 会因 "no files" 早退，所以单删孤儿目录走 `deleteOrphan`。两条路径的「路径校验 + 实际 rm」共用 `server/lib/safe-remove.ts` 的 `safeRemove`，差异只在前置判定（`deleteSessions` 跳过 live PID / 5 分钟内活跃；`deleteOrphan` 二次确认仍是孤儿）——改删除安全网时改 `safeRemove` 一处即可。
- **删除安全网**（`server/lib/active-sessions.ts`）：sessionId 出现在仍然存活的 `sessions/<pid>.json` 中、或 `.jsonl` 在 5 分钟内被改过 → 跳过不删。Unix 用 `process.kill(pid, 0)`，Windows 用 `tasklist`。
- **`history.jsonl` 改写用原子三步**：`backup → tmp → rename`，绝不原地写。失败时原文件保留为 `.bak-<timestamp>`。
- **CSRF 保护**：所有 mutating endpoint（`DELETE /api/sessions`、`POST /api/projects/:id/export`、`POST /api/import` 及 `/preview`）要求 `Origin` 头匹配 `http(s)://(localhost|127.0.0.1):*`。
- **跨设备共享 = export/import（第二类写操作）**（`server/lib/{bundle,export-bundle,import-bundle}.ts`）：bundle 是「路径无关」的文件夹——export 把项目根的绝对路径替换成 `${CLAUDE_PROJECT_ROOT}` 哨兵，import 再换回本机选定路径。**要替换的是两个不同字段**：session `.jsonl` 行里的 `cwd`，和 `history.jsonl` 行里的 `project`（不是 `cwd`）。消息正文 / `gitBranch` / `version` 一律不改写（是归档记录）。export 拒绝写进 `~/.claude/`；import 复用 delete 的安全网（`isUnderClaudeRoot` + 跳过 live/5 分钟内活跃的 session + tmp→rename + history 原子 append-去重）。`history.jsonl` 去重 key 含 `project`，所以同 bundle 重复 import 是幂等的，但 import 到不同目标路径会当作不同条目新增。

路由分布：`server/routes/{projects,sessions,disk,search,import}.ts`。每个路由文件做参数校验 → 调 `server/lib/` 下的纯函数 → 返回 `shared/types.ts` 里定义的响应类型。

### Web 端关键约束

- **TanStack Query 的所有 query key 集中在 `web/src/lib/query-keys.ts`**。新接口要先在这里登记，不要散写字符串数组。
- **`DiskUsage` 路由 + Recharts 是 lazy import**（见 `App.tsx` 的 `lazy()` + `vite.config.ts` 的 `manualChunks`）。初始包 ~124 KB gzipped，charts ~80 KB 仅在 `/disk` 加载。新增重依赖时按这个模式拆。
- **路由层级**：`/` → `/projects/:id` → `/projects/:id/sessions/:sid`，外加 `/projects/:id/memory` 和 `/disk`。`SessionDetail` 是最复杂的页（消息时间线 + 搜索 + tool 块折叠 + 跳转边界）。
- **设计系统在 `web/src/index.css`**：字体（Fraunces 衬线标题 / Plus Jakarta Sans 正文 / Geist Mono 代码）+ OKLCH 颜色 token + 暗色变体 + hairline / ribbon-row / pulse-amber 等 utility。视觉**一比一对齐 claude.ai web**：暖*象牙*画布（#FAF9F5，claude.ai 真实聊天底色，比早期更收敛的 #F8F8F6 更暖更奶油）、近白卡面、侧栏用更深一档暖 sunken（~#F0EEE6）、clay/coral accent（#D97757 ↔ #C6613F，~hue 43）；灰阶落在暖色 90–95 hue 带且低 chroma，避免冷中性；**已移除 grain 噪点叠层**；暗色是 Claude 暖炭灰（#262624 系）。布局照 claude.ai：内容平铺画布、页头/面包屑**不套卡片盒**（`surface-card` 仅留给图表等真实卡片面）；聊天视图=助手整宽纯文本（无卡片 / 无头像）、人类右侧柔色气泡。改样式优先复用 token 和 utility，不要引入 hex / rgb 字面量。配色映射与改版说明见 `docs/spec/claude-desktop-redesign.md`。
- **圆角按 surface 大小选 token**：小 CTA / chip / 下拉触发器 / 模态 footer CTA 用 `--radius-control`（8px）；输入框 / nav 项 / sticky toolbar / 内嵌 sunk 面板等高度 ≥36px 的组件用 `--radius-input`（12px）；卡片 / callout 用 `--radius-card`（20px）；模态外壳 / 大面板用 `--radius-panel`。**不要**给小按钮套 `--radius-card`——20px 在 ≤40px 高的元素上会被 CSS 钳成半高变药丸。例外（保留自己形状）：药丸开关、纯图标按钮（≤36×36）、Breadcrumbs 紧密复合组件。完整说明见 `index.css` 注释块。
- **i18n + 主题**：`web/src/lib/i18n.ts`、`web/src/lib/theme.ts`，UI 文本走 i18n（zh / en），不要硬编码。

### 跨平台

- Project id 编码：macOS/Linux `/foo/bar` → `-foo-bar`；Windows `C:\foo\bar` → `C--foo-bar`。
- 反解时优先用 `.jsonl` 里记录的 `cwd` 字段，找不到才退到启发式 decode + `fs.statSync` 验证。

## 改动时容易踩的坑

- **改了 `shared/types.ts`** → 一定要同时跑 server 和 web 的 typecheck（`npm run typecheck` 会同时跑两边）。wire 协议的字段不向前向后兼容，server / web 必须同步更新。
- **新增 backend endpoint** → 在 `server/routes/` 下加，路径以 `/api/` 开头；记得加 ID 校验和 `isUnderClaudeRoot` 校验；前端在 `web/src/lib/api.ts` 加 fetcher，在 `query-keys.ts` 登记 key。
- **改 `~/.claude/` 的 layout 假设** → 改 `PATHS` 一处即可；如果是新增一类相关文件，记得把它纳入 `delete.ts` 的级联清理 + `fs-size.ts` 的 `relatedBytes` 统计，否则会出现"删了但磁盘没变小"；同时判断它是否该进 export/import 的 bundle（当前 core tier 只含 `.jsonl` + memory + 匹配的 history 行）。
- **production 模式** (`npm run start`) 要求 `dist/` 已 build，否则 Hono 的 `serveStatic` 中间件不会挂载，但 API 仍可用。dev 模式无需 build。
