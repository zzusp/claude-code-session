# Project Open Folder — Round 1

日期：2026-05-15
环境：Windows 11 Home China 10.0.26200、Node v22 (项目要求 22+)、Playwright v1.59.1
服务：`npm run build` + `npm run start` → http://127.0.0.1:3133（3131/3132 被其它 worktree 占用，自动顺延）

## 跑了什么

```
npm run typecheck        # 全绿
npm run build            # SPA dist 重建
npm run start &          # 后台启
PORT=3133 node docs/acceptance/project-open-folder/scripts/e2e.mjs
```

## 结果

| ID | 结果 | 备注 |
|---|---|---|
| T-01 | ✅ | `tsc -b` 全绿 |
| A-01 | ✅ | `POST /reveal` 200，`path === decodedCwd === D:\project\claude-code-session`。**实际弹了 1 次 Explorer**，目录正确。 |
| A-02 | ✅ | 无 Origin → 403 |
| A-03 | ✅ | `Origin: http://evil.example.com` → 403 |
| A-04 | ✅ | 不存在的 id → 404 `project not found` |
| A-05 | ✅ | `D--project-claude-novel--claude-worktrees-ai-tasks-analysis`（实际是 decode 还原到不存在路径）→ 404 `directory missing on disk` |
| A-06 | ✅ | 当前 `~/.claude/projects/` 下有现成的 missing-dir fixture，无需构造 |
| U-01 | ✅ | resolved 项目 → 按钮启用，hover title = `D:\project\claude-code-session` |
| U-02 | ✅ | missing-dir 项目 → 按钮 disabled，title 匹配 "no longer exists" |
| U-03 | ✅ | zh locale 下按钮文本是 `打开目录` |

## 中途修复

第一次跑出现两个 UI 断言 FAIL（U-01 / U-02）。两个都是**测试脚本的 race**，不是源码 bug：

- `/api/projects` 在我这台机器上要 ~2.3s（28 个 project 的全量扫描），首次默认 5s 的 retry 窗口不够
- 触发现象：`projectsQuery` 还没 resolve 时 button 已经渲染，title 退到 `id`、`cwdResolved` 为 undefined 不为 false，所以 disabled state 也没生效
- 修法：`playwright/test` 的 `expect(...).toHaveAttribute(...)` + 把 timeout 拉到 15s，让 Playwright 自动 retry 等 React Query 写回。脚本里把同步 `getAttribute` / `isDisabled` 全部换成 auto-retrying expect

源码侧的 fallback `cwd = project?.decodedCwd ?? id` 行为本身是对的（在 projects 列表还没回来时 tooltip 显示 id 比闪一下"undefined"更可读），不需要改。

## 证据

- `round-1/verdict.json` — 9 个断言的结构化结果
- `round-1/screenshots/u01-resolved-en.png` — resolved 项目 en locale 截图（button 启用）
- `round-1/screenshots/u02-missing-en.png` — missing-dir 项目截图（button 禁用 + 红色 "Directory missing on disk" 徽章）
- `round-1/screenshots/u03-resolved-zh.png` — zh locale 截图（按钮文案为「打开目录」）

## 已知未覆盖

- **macOS / Linux 真正调用**：本机只能验证 `explorer.exe` 路径。`darwin → open`、其它 → `xdg-open` 走的是同形态的 `spawn(cmd, [path], { detached: true, stdio: 'ignore' })`，需在对应平台跑一遍才算闭环。
- **Explorer 窗口实际在桌面出现**：自动化只能断言 server 返回 200；窗口本身由我（人）肉眼确认。本轮已确认。
