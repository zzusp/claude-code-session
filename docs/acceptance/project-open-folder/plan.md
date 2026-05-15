# Project Open Folder — 验收方案

特性：项目详情页（含 session 列表的）新增「打开目录」按钮，点击后在系统文件管理器中
显示该项目的工作目录（Explorer / Finder / xdg-open）。

## 目标

- 后端 `POST /api/projects/:id/reveal` 解出 cwd → 用平台命令唤起文件管理器；带
  Origin-CSRF 校验、`isSafeId` 校验、cwdResolved 失败降级为 404。
- 前端在项目详情页 PageHeader actions 区域加按钮；当 `project.cwdResolved === false`
  时按钮禁用并显示 tooltip。

## 验收点

| ID | 描述 |
|---|---|
| A-01 | `POST /reveal` 对 `cwdResolved=true` 的项目（如 `D--project-claude-code-session`）+ 合法 Origin → `200 { ok: true, path }` 且 path 等于 `decodedCwd`。**会实际弹一次 Explorer**。 |
| A-02 | `POST /reveal` 无 Origin → `403 origin not allowed` |
| A-03 | `POST /reveal` 错 Origin（`http://evil.example.com`） → `403 origin not allowed` |
| A-04 | `POST /reveal` 不存在的 projectId（任何不在 `~/.claude/projects/` 下的 safe id） → `404 project not found` |
| A-05 | `POST /reveal` 一个 `cwdResolved=false` 的项目（id 在 disk 上但 decode 后路径不存在） → `404 directory missing on disk` |
| A-06 | `GET /api/projects` 仍然正常返回，列表中至少有 1 个 `cwdResolved=false` 的项目（为 A-05 提供 fixture） |
| U-01 | `/projects/:id`（resolved=true）渲染 `Open folder` 按钮，未 disabled，hover title 是 cwd 字符串 |
| U-02 | `/projects/:id`（resolved=false）渲染同一按钮但 disabled，title 是 `Directory no longer exists on disk` |
| U-03 | 中文 locale 下按钮文本为 `打开目录`，英文 locale 下为 `Open folder`（i18n 链路通） |
| T-01 | `npm run typecheck` 全绿 |

## 自动验证脚本

`scripts/e2e.mjs` —— 单脚本，三段：
1. 直接 `fetch` 调 `/api/projects/:id/reveal` 覆盖 A-01..A-05。
2. Playwright headless Chromium 截 `/projects/:id` 页面，断言按钮存在 + 状态正确（U-01..U-03）。
3. typecheck 在脚本外预先跑一次（已记录 T-01）。

执行：`npm run dev:server` 起后端 → `node docs/acceptance/project-open-folder/scripts/e2e.mjs`。

## 不在覆盖范围

- "Explorer 窗口真的在桌面上出现"——属于 OS GUI 副作用，自动化不可断言；由人工
  在 A-01 跑完后扫一眼桌面确认。
- macOS / Linux 分支——本机仅 Windows，跨平台部分靠代码 review（`spawn(open|xdg-open, [path])` 同形）。
