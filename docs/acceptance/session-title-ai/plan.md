# Session Title AI — 验收方案

特性：[`session-title-ai-design.md`](../../spec/session-title-ai-design.md)

## 目标

session 列表页 `/projects/:id` 中各行的 title 列要与官方 `claude resume`
picker 显示一致：`customTitle` > 最新 `aiTitle` > 第一条 user message > `(untitled)`。

## 验收点

| ID | 描述 |
|---|---|
| T-01 | 仅有 `ai-title` 记录的会话（无 `custom-title`）→ UI 显示该 `aiTitle`，与 `claude resume` 一致 |
| T-02 | 同时存在 `custom-title` 与 `ai-title`，且 user 已重命名 → `customTitle` 优先于 `aiTitle` |
| T-03 | `npm run typecheck` 全绿（覆盖 server + web 两侧 wire 协议） |

## 已知样本（来自当前 `~/.claude/projects/D--project-claude-code-session/`）

- `575e9779-…` — ai-title `"Add browser tab favicon"`，无 custom-title → T-01 用例
- `e6e5cbad-…` — ai-title `"Add delete button to session detail page"`，无 custom-title → T-01 用例
- `3fe89855-…` — ai-title `"Debug server connection refused error on Windows"` 但有
  custom-title `"windows环境下打开页面，显示"加载项目失败: 500 Internal Server Error""`
  → T-02 用例

## 自动验证脚本

`scripts/verify-titles.mjs` —— Chromium 访问项目页，按 `<a href="/sessions/<sid>">`
解析每行 sid 并断言可见文本包含期望 title。**完全只读**：不调用 DELETE 也不写入。

执行：`npm run start`（或 `npm run dev`）后 `node docs/acceptance/session-title-ai/scripts/verify-titles.mjs`。
