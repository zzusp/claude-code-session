# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 工作原则

1. **先读再改**：读源码 / 读当前实现 / 翻文档，确认现状再动手。没读过不允许动手
2. **目标驱动**：在开始前将模糊的指令转化为可验证的目标
3. **优先复用 + 新建需理由**：先搜同类实现；只有现有文件确实装不下才能新建，新建要说得出理由
4. **用原生能力**：框架 / 语言自带的先用，不自己拼字符串再解析
5. **不堆兜底也不过度设计**：一条清晰路径，不加"兼容旧逻辑 / 多种方式任选 / 未来也许用到"的参数 / 抽象
6. **参数归参数**：请求 / 函数参数就只当参数处理，不混用环境变量
7. **代码精确编辑**：只修改必要部分，不要顺手顺便修复旁边的代码，发现问题可以反馈，但不要直接改
8. **遇阻不绕路**：分析根因给完整方案，不 silently skip / workaround / 打补丁
9. **不要停**：没解决 / 完成就不要停
10. **行为变了就同步文档**：改逻辑 / 接口 / env 顺手更新 README 和部署说明
11. **用过即修**：按文档 / 脚本执行撞到错，修问题 + 同步更新文档 / 脚本，下次直接可用
12. **持续沉淀**：用户画像 / 使用习惯 / 项目隐性规则 / 反复踩的坑 / 外部资源，触发自动记忆（auto memory）归档
13. **先论后证**：结论性陈述(bug 根因 / 分析判断 / 验证结果 / 事实)先给结论、再附可核验证据(`file:line` / 命令输出 / 断言结论正确的最小验证)

## Git 工作流（单人开发分级）

**默认**：trivial 改动（docs / 小 bug fix <50 行 / config tweak / 依赖升级 / 格式化）直接 `git commit && git push`，如果涉及代码改动，则必须要完成验证流程（方案 / Round-N / 验收报告）。

**必须走 feature branch + PR** 的场景：
1. 大 feature（>10 文件 或 >500 行新增）
2. Risky 改动（架构重构、schema 变更、deploy 脚本、auth/billing）
3. 跨 session WIP — 一次完不成，branch 作为保存点
4. 将来 CI 加 required checks 之后

Push 默认不需要事先询问用户 — commit 合理、分支是 feature 分支、测试已过，直接 push。force-push、推 main/master、外部仓库 push 例外，仍需确认。

**分支命名**：
- **worktree 内分支**：`worktree-<name>`（跟官方 `claude --worktree` 约定，未来 session picker `Ctrl+B` / `--from-pr` 等 tooling 自动识别）
- **非 worktree feature 分支**：`feature/<name>`，**不论 feature / bug / refactor**——前缀只是工作流标识，任务类型由 PR 标题 / `note.md` / commit message 表达

两种前缀视觉上立刻能分辨"这分支来自 worktree 还是 standalone"。

## 项目产物归档规范

**MUST**：所有非源码输出放 `docs/` 子目录，禁止散到 `docs/` 根或仓库根。类型不明时先看现有桶放最接近的；都不接近时问用户，**不要自建新顶层目录**。

### 目录结构

```
docs/
├── spec/              # 前置分析、方案、实施计划（不含事后复盘）
├── api/               # 本项目后端暴露的 API 契约（第三方 API 放 reference/）
├── acceptance/        # 验收方案/结果/脚本/证据/特性复盘
│   ├── README.md      # 证据归档红线（大 binary 不入库 + 再生成配方 + 源头治理）
│   ├── _shared/       # 跨 feature 复用的 e2e 工具包(auth/env/ui/api/report);≥2 feature 用过才进
│   └── <feature>/
│       ├── plan.md            # 或 e2e-plan.md
│       ├── report.md          # 全绿才写
│       ├── retrospective.md   # 可选，复盘归此处不进 spec/
│       ├── round-N/           # 每轮独立证据，fix-rerun 必须新目录不覆盖
│       ├── scripts/           # 跨轮可复用的测试脚本 / debug 工具
│       └── fixtures/          # 跨轮复用的静态测试资产(图片/文件/权限 JSON);per-round 数据放 round-N/fixtures.json
├── tmp/               # 当前 session 的 ad-hoc 草稿；PR 合入后转走或删除，不得跨特性堆积
├── reference/         # 外部资料/调研/原始需求/第三方 API 文档（原文件名保留）
├── sql/               # DDL、migration、查询
├── ops/               # 部署流程、运维笔记（凭据禁入库：放仓库外或 .gitignore）
└── manual/            # 最终用户说明（开发者指南放 <service>/CLAUDE.md 或 README.md）
```

**命名**：英文小写 + 连字符、3–6 词、不重复目录类型（`spec/plan-foo.md` 不写成 `spec-plan-foo.md`）；`reference/` 豁免。


## 项目概览

**Claude Code Session Manager** —— 一个本地 Web UI，用于浏览 / 清理 `~/.claude/` 下的 Claude Code 会话历史。默认对磁盘只读，唯一的写操作是用户在 UI 显式点击 *Delete*。绑定 `127.0.0.1`，单用户单机使用。

详细产品说明见 [`README.md`](README.md)；设计文档见 [`docs/spec/`](docs/spec/)。

## 开发命令

需要 **Node 22+**（推荐 24）。

| Script | 用途 |
|---|---|
| `npm run dev` | 并发启动 backend (`node --import tsx --watch server/index.ts`，端口 3131–3140) + Vite dev server (5173)。`dev:web` 先跑 `scripts/wait-for-server.mjs` 等 backend 听到 3131 再起 vite，避开冷启动期间的 `ECONNREFUSED → 500`。Vite 把 `/api/*` 代理到 backend。 |
| `npm run dev:server` / `npm run dev:web` | 单独启动其中一边。 |
| `npm run build` | 用 Vite 把 SPA 构建到 `dist/`。 |
| `npm run start` | 单进程生产模式：Hono 同时托管 `dist/` 静态资源和 API。 |
| `npm run typecheck` | `tsc -b` 同时校验 `tsconfig.server.json` + `tsconfig.web.json`。 |

**没有 lint / 测试 runner。** 改完代码用 `npm run typecheck` 把整个 monorepo 过一遍；UI 行为靠 `docs/acceptance/` 下的 e2e 方案手动验证。

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
- **删除流程的 5 个位置**（`server/lib/delete.ts`）：每条 session 实际散落在 `projects/<encoded-cwd>/<sid>.jsonl` + `projects/<encoded-cwd>/<sid>/` + `file-history/<sid>/` + `session-env/<sid>/` + `history.jsonl` 里的对应行 + `sessions/<pid>.json`（仅当 PID 已退出）。一次 delete 必须级联清理这些位置，缺一不可。
- **删除安全网**（`server/lib/active-sessions.ts`）：sessionId 出现在仍然存活的 `sessions/<pid>.json` 中、或 `.jsonl` 在 5 分钟内被改过 → 跳过不删。Unix 用 `process.kill(pid, 0)`，Windows 用 `tasklist`。
- **`history.jsonl` 改写用原子三步**：`backup → tmp → rename`，绝不原地写。失败时原文件保留为 `.bak-<timestamp>`。
- **CSRF 保护**：所有 mutating endpoint（`DELETE /api/sessions`）要求 `Origin` 头匹配 `http(s)://(localhost|127.0.0.1):*`。

路由分布：`server/routes/{projects,sessions,disk}.ts`。每个路由文件做参数校验 → 调 `server/lib/` 下的纯函数 → 返回 `shared/types.ts` 里定义的响应类型。

### Web 端关键约束

- **TanStack Query 的所有 query key 集中在 `web/src/lib/query-keys.ts`**。新接口要先在这里登记，不要散写字符串数组。
- **`DiskUsage` 路由 + Recharts 是 lazy import**（见 `App.tsx` 的 `lazy()` + `vite.config.ts` 的 `manualChunks`）。初始包 ~124 KB gzipped，charts ~80 KB 仅在 `/disk` 加载。新增重依赖时按这个模式拆。
- **路由层级**：`/` → `/projects/:id` → `/projects/:id/sessions/:sid`，外加 `/projects/:id/memory` 和 `/disk`。`SessionDetail` 是最复杂的页（消息时间线 + 搜索 + tool 块折叠 + 跳转边界）。
- **设计系统在 `web/src/index.css`**：字体（Fraunces 标题 / Plus Jakarta Sans 正文 / Geist Mono 代码）+ OKLCH 颜色 token + 暗色变体 + grain 噪点 + hairline / ribbon-row / pulse-amber 等 utility，刻意走 editorial 风格。改样式优先复用 token 和 utility，不要引入 hex / rgb 字面量。
- **圆角按 surface 大小选 token**：小 CTA / chip / 下拉触发器 / 模态 footer CTA 用 `--radius-control`（8px）；输入框 / nav 项 / sticky toolbar / 内嵌 sunk 面板等高度 ≥36px 的组件用 `--radius-input`（12px）；卡片 / callout 用 `--radius-card`（20px）；模态外壳 / 大面板用 `--radius-panel`。**不要**给小按钮套 `--radius-card`——20px 在 ≤40px 高的元素上会被 CSS 钳成半高变药丸。例外（保留自己形状）：药丸开关、纯图标按钮（≤36×36）、Breadcrumbs 紧密复合组件。完整说明见 `index.css` 注释块。
- **i18n + 主题**：`web/src/lib/i18n.ts`、`web/src/lib/theme.ts`，UI 文本走 i18n（zh / en），不要硬编码。

### 跨平台

- Project id 编码：macOS/Linux `/foo/bar` → `-foo-bar`；Windows `C:\foo\bar` → `C--foo-bar`。
- 反解时优先用 `.jsonl` 里记录的 `cwd` 字段，找不到才退到启发式 decode + `fs.statSync` 验证。

## 改动时容易踩的坑

- **改了 `shared/types.ts`** → 一定要同时跑 server 和 web 的 typecheck（`npm run typecheck` 会同时跑两边）。wire 协议的字段不向前向后兼容，server / web 必须同步更新。
- **新增 backend endpoint** → 在 `server/routes/` 下加，路径以 `/api/` 开头；记得加 ID 校验和 `isUnderClaudeRoot` 校验；前端在 `web/src/lib/api.ts` 加 fetcher，在 `query-keys.ts` 登记 key。
- **改 `~/.claude/` 的 layout 假设** → 改 `PATHS` 一处即可；如果是新增一类相关文件，记得把它纳入 `delete.ts` 的级联清理 + `fs-size.ts` 的 `relatedBytes` 统计，否则会出现"删了但磁盘没变小"。
- **production 模式** (`npm run start`) 要求 `dist/` 已 build，否则 Hono 的 `serveStatic` 中间件不会挂载，但 API 仍可用。dev 模式无需 build。
