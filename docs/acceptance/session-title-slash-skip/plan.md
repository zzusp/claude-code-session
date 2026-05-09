# Session Title Slash-Skip — 验收方案

特性：[`session-title-slash-skip-design.md`](../../spec/session-title-slash-skip-design.md)

## 目标

session 列表/详情页的 title 派生跟 `claude resume` 一致：
**`customTitle` > 最新 `aiTitle` > 跳过空 args slash 命令后的首条 user message > `(untitled)`**。

## 验收点

| ID | 描述 |
|---|---|
| L-01 | `D--project-hiq-project` 中 3 个之前显示 `<command-name>/clear|/model|/login</command-name>` 的 session 现在显示真实首条 prompt |
| L-02 | `D--project-doc-first-dev/69eb2882`（`<command-message>` 在前的边角 shape）显示真实 `/init` 正文，不再显示 XML wrapper |
| L-03 | `D--project-doc-first-dev/75cd9f6d`（全程仅 `/plugin` 空 args，无真实 prompt）正确落到 `(untitled)` |
| L-04 | 上一轮的 `ai-title` 修复未回归：`D--project-claude-code-session/575e9779` 仍显示 `"Add browser tab favicon"` |
| L-05 | `customTitle` 优先级未回归：`ee017991` / `3fe89855` 两条 customTitle 仍正常显示 |
| D-01 | session 详情页 header 也读 `ai-title`（上一轮只覆盖了列表，本轮拉平） |

## 自动验证脚本

`scripts/verify-titles.mjs` —— Chromium 访问 3 个 project 列表页 + 1 个详情页，
按 sid 前缀解析每行 / header 文本断言期望 title 子串。**完全只读**。

执行：`npm run start`（或 `npm run dev`）后 `node docs/acceptance/session-title-slash-skip/scripts/verify-titles.mjs`。

## 全量回归扫描

实施时跑了一次离线模拟（直接 fs 读 `~/.claude/projects/` 全部 37 个 session，按
新逻辑算 title）：
- 9 个 session title 改变（全部从尖括号文本变成真实 prompt）
- 1 个 session 落到 `(untitled)`（即 75cd9f6d，对应 L-03，session 全程无 user prompt）
- **0 个 session 修复后还以 `<` 开头**

模拟结果作为 round-1 证据保留在本报告里。
