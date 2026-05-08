# Project List Delete — 验收报告 · Round 1

特性：[plan.md](./plan.md)
分支：`feature/project-list-delete`
PR：https://github.com/zzusp/claude-code-session/pull/20
环境：Windows 11、Node 22、`npm run start`（serving build at http://127.0.0.1:3131）
浏览器：Playwright bundled chromium (chromium-headless-shell v1217)
日期：2026-05-08

## 自动可验证

| 项 | 命令 | 结果 |
|---|---|---|
| typecheck | `npm run typecheck` | ✅ 全绿 |
| build | `npm run build` | ✅ 全绿，主 bundle 28.48 KB gzip（projects 列表新增 ~3 KB），无回归 |

## E2E 自动化结果

两段 Playwright 脚本：
- `scripts/verify-non-destructive.mjs` — A-01 / A-02 / A-04 / A-05
- `scripts/verify-destructive.mjs` — A-03 / A-06（用合成 project 走完整删除路径，不触碰真实数据）

| 项 | 结果 | 关键证据 |
|---|---|---|
| **A-01** 索引行展示删除按钮 | ✅ | `rows=26, trash buttons=26`；`round-1/a01-index-trash.png` 显示每行末尾 trash + chevron |
| **A-02** idle 项目 dialog 内容正确 | ✅ | `title=true warning=true blocker=false confirmEnabled=true`；截图 `round-1/a02-idle-dialog.png` 显示 *删除项目 / D:\project\lcd-calculation / 2 个会话 · 约释放 1.6 MB · 项目目录将被删除* + 红色警告条 + Delete 按钮可点 |
| **A-03** 实删 happy path | ✅ | 用合成 project `D--acceptance--project-list-delete--<token>` 提供一个 jsonl（mtime 24h 前），通过浏览器 `fetch('/api/projects/...', {method:'DELETE'})` 命中 200，响应 `projectDirRemoved:true / deleted.length=1 / historyLinesRemoved:1`；fs 验证项目目录已 rm；`/api/projects` 项目数 27→26；`history.jsonl` 中合成的 acceptance 行被剔除 |
| **A-04** live/recent 整体阻断 | ✅ | 在 `D--project-claude-code-session`（当前 Claude Code 进程的活动 cwd）行点击 trash → 黄条 *1 个会话正在运行或最近 5 分钟内被修改 — 本次不会删除任何内容，请稍后再试* + 列出 `ab52f2cb-... — live PID 19060` + Delete 按钮 disabled；`round-1/a04-live-blocker.png` |
| **A-05** 服务端 origin 校验 | ✅ | `curl -X DELETE /api/projects/__definitely_not_a_real_project__`（无 Origin 头）→ `403 {"error":"origin not allowed"}` |
| **A-06** 删除后列表 / 缓存反映 | ✅ | `/api/projects` 在删除后立即不再包含目标项目（API 侧无缓存层）；前端 dialog 在 `onSuccess` 主动 `invalidateQueries(['projects'], ['project-sessions',id], ['disk-usage'])`，由 React Query 拉新数据 |

## 复现命令

```bash
# 启动服务
npm run build && npm run start

# 非破坏性
node docs/acceptance/project-list-delete/scripts/verify-non-destructive.mjs

# 破坏性（合成 project，安全）
node docs/acceptance/project-list-delete/scripts/verify-destructive.mjs
```

## 备注

- 首次运行前需 `npx playwright install chromium` 下载 bundled chromium-headless-shell（~111 MiB）。如直连慢可设 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`。
- A-04 的 live PID 来源于运行本次会话的 Claude Code 自身（`~/.claude/sessions/19060.json`），是天然的 live blocker，无需额外构造。
- A-03 / A-06 的合成 project 命名以 `D--acceptance--project-list-delete--` 前缀 + 时间戳 token 防撞名；如果脚本中途崩溃漏删，`docs/acceptance/project-list-delete/scripts/verify-destructive.mjs` 内的 `cleanupOnFailure` 会兜底删除项目目录并清理 `history.jsonl` 行。
