# 验收报告 — Modified-files drawer 增强（split diff / open-file / 可拖拽栏宽）

**结论：全绿通过。** 4 项需求均已实现并经真实 UI + 后端实跑验证（Round 1，18/18）。

## 交付项 → 证据

| 需求 | 实现 | 证据 |
|---|---|---|
| 抽屉更宽 | `w-[min(96vw,1280px)]`（原 900px） | 实测 dialog 宽 1280px |
| 改动前后左右对比、git-diff 效果 | `DiffView` 重写为行级 LCS split diff（左=前/右=后，行号 gutter、`+/−`、红/绿底色，逐行对齐） | e01 截图：`− BEFORE`/`+ AFTER` 双栏，第 2 行左红右绿对齐 |
| 每个文件可点击打开 | 树行 hover「打开」图标 + 明细头部「OPEN FILE」按钮 → `POST /open-file`（默认程序打开，校验成员资格） | header 按钮可见、树行打开按钮存在；端点守卫 403/400/400/404 |
| 文件树完整文件名 + 横向滚动 | 文件名 `whitespace-nowrap`（不截断）+ `ul w-max` → 树栏横向滚动 | 长名未截断；`scrollW 726 > clientW 300` |
| 树/内容可拖拽分割线 | `[role=separator]` + pointer capture，实时改 `railWidth` | 拖右 300→441、拖左 441→281；e02 截图 |

## 质量门

- `npm run typecheck` ✅（server + web，strict + noUncheckedIndexedAccess）
- `npm run build` ✅
- `npm test` ✅ 54/54（safety-net 未回归）
- Round-1 e2e ✅ 18/18

## 安全说明

`open-file` 是第二类「显式触发」操作，已按仓库既有约束加固：Origin/CSRF 校验、`isSafeId`、
**成员资格校验**（从会话 jsonl 重新聚合，只允许打开本会话确实改过的文件，杜绝任意路径打开）、
`statSync` 文件存在性校验。复用 `openFolder` 同一套 detached spawn（`explorer/open/xdg-open`）。
