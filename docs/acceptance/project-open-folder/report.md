# Project Open Folder — 验收报告

验收日期：2026-05-15
环境：Windows 11 Home China 10.0.26200、Node v22、Playwright v1.59.1
服务：`npm run start` → http://127.0.0.1:3133

## 总览

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 全绿 |
| `e2e.mjs`（A-01..A-06 + U-01..U-03） | ✅ 9/9 PASS |

Round-1 流水见 [`round-1.md`](round-1.md)。

## 覆盖

后端 `POST /api/projects/:id/reveal`：
- 合法 Origin + resolved 项目 → `200 { ok, path }`，path 严格等于 `decodedCwd`，且 Explorer 真的弹出。
- 缺 Origin / 异源 Origin → 403。
- 未知 id → 404 `project not found`。
- cwdResolved=false 项目 → 404 `directory missing on disk`。

前端项目详情页：
- en + zh i18n 都通。
- resolved 项目 → 按钮启用，tooltip 是 decoded cwd。
- missing-dir 项目 → 按钮 disabled，tooltip 是 "directory no longer exists"。

## 未在本轮覆盖

- macOS `open` / Linux `xdg-open` 分支只走代码 review；本机仅 Windows。
- Explorer 窗口在桌面上真实出现：自动化无法断言，已人工目视确认。

## 结论

源码变更（`open-folder.ts` + `scan.ts:resolveProjectCwd` + `projects.ts:POST /reveal` + i18n + ProjectDetail 按钮）行为符合方案，无回归。
