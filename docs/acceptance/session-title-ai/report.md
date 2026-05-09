# Session Title AI — 验收报告

特性：[`session-title-ai-design.md`](../../spec/session-title-ai-design.md)
验收日期：2026-05-09
环境：Windows 11 Pro 10.0.26200、Node v22.22.0、Playwright v1.59.1
服务：`npm run dev` → http://127.0.0.1:3131（dev 模式同时跑 vite 5173；脚本访问 BASE=3131）

## 总览

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 全绿 |
| Playwright `verify-titles.mjs`（T-01 × 2 + T-02 × 1） | ✅ 3/3 PASS |

## 自动验证脚本

`scripts/verify-titles.mjs` —— 启动 Chromium，访问
`/projects/D--project-claude-code-session`，逐行匹配 sid 前缀并断言行文本
包含期望 title。**完全只读**。

## 详细结果

```
[PASS] row-575e9779 — expected (ai-title) "Add browser tab favicon…" — found in row text: true
[PASS] row-e6e5cbad — expected (ai-title) "Add delete button to session detail page…" — found in row text: true
[PASS] row-3fe89855 — expected (custom-title) "windows环境下打开页面，显示"加载项目失败: 500 Internal Server Error"…" — found in row text: true
```

证据：
- `round-1/project-sessions.png` — 项目页 4 行 session 列表（含当前 live session
  `align-session-titles`），顶部三行均与用户提供的 `claude resume` 输出一致

## 与 `claude resume` 的对照

| Session | `claude resume` 显示 | UI 修复后显示 | 来源 |
|---|---|---|---|
| 575e9779-… | Add browser tab favicon | Add browser tab favicon | ai-title |
| e6e5cbad-… | Add delete button to session detail page | Add delete button to session detail page | ai-title |
| 3fe89855-… | windows环境下打开页面，显示"加载项目失败: 500 Internal Server Error" | 同左 | custom-title（优先级最高，未受改动影响） |

## 结论

修复落地后，session 列表 title 列与 `claude resume` 显示完全一致。底层改动局限于
`server/lib/parse-jsonl.ts` 的 title 解析优先级，wire 协议形状未变；前端 `s.customTitle ?? s.title`
原有逻辑保持不变。
