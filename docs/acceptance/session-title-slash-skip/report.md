# Session Title Slash-Skip — 验收报告

特性：[`session-title-slash-skip-design.md`](../../spec/session-title-slash-skip-design.md)
验收日期：2026-05-09
环境：Windows 11 Pro 10.0.26200、Node v22.22.0、Playwright v1.59.1
服务：`npm run dev` → http://127.0.0.1:3131

## 总览

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 全绿 |
| Playwright `verify-titles.mjs`（L-01..L-05 + D-01，共 9 行断言） | ✅ 9/9 PASS |
| 全量离线回归扫描（37 sessions across 5 projects） | ✅ 0 个 post-fix 仍以 `<` 开头 |

## 自动验证脚本

`scripts/verify-titles.mjs` —— Chromium 访问 3 个 project 列表页 + 1 个详情页，
按 sid 前缀解析每行 / header 文本断言期望 title 子串。**完全只读**。

## 详细结果

```
[PASS] D--project-hiq-project/7dfaf7cf  slash-skip → expected "帮我分析分析这个pr" found=true
[PASS] D--project-hiq-project/b093dcb5  slash-skip → expected "查看这三个代码仓库" found=true
[PASS] D--project-hiq-project/24b1d800  slash-skip → expected "我发现两个fast flow" found=true
[PASS] D--project-hiq-project/ee017991  custom-title (regression) → expected "worktree-flow-scaffold" found=true
[PASS] D--project-doc-first-dev/69eb2882  slash-skip (msg-first shape) → expected "Please analyze this codebase" found=true
[PASS] D--project-doc-first-dev/75cd9f6d  genuinely empty → (untitled) → expected "(untitled)" found=true
[PASS] D--project-claude-code-session/575e9779  ai-title (regression) → expected "Add browser tab favicon" found=true
[PASS] D--project-claude-code-session/3fe89855  custom-title (regression) → expected "windows环境下打开页面" found=true
[PASS] detail-ai-title  session detail header includes "Add browser tab favicon" → true
```

证据：
- `round-1/list-D--project-hiq-project.png` — hiq-project 列表 11 行真实 title
- `round-1/list-D--project-doc-first-dev.png` — doc-first-dev 列表（含 `(untitled)` 行 + msg-first shape 行）
- `round-1/list-D--project-claude-code-session.png` — claude-code-session 列表（aiTitle / customTitle 回归）
- `round-1/detail-ai-title.png` — 575e9779 详情页 header 显示 `"Add browser tab favicon"`（上一轮遗漏的详情页 ai-title 拉平）

## 全量离线回归

跑了一次直接 `fs.readFileSync` + 模拟新逻辑的脚本，扫了 `~/.claude/projects/` 下
**5 个 project / 37 个 session**：

```
Total sessions: 37
Sessions whose title CHANGES after fix: 9
Sessions still showing (untitled): 1
Sessions whose POST-FIX title still starts with "<": 0
```

唯一落到 `(untitled)` 的是 `D--project-doc-first-dev/75cd9f6d` —— session 文件
1.9KB / 5 行，仅含 caveat + `<command-name>/plugin</command-name>` 空 args + stdout，
**没有任何真实 user prompt**。这是正确结果，跟 `claude resume` 行为对齐
（resume 也无法从这个 session 派生标签）。

## 与 `claude resume` 的对照（用户原报告样本）

| resume 行 | sid | UI 修复后 | 来源 |
|---|---|---|---|
| 帮我分析分析这个pr的第一次… | 7dfaf7cf | 同上 | first-user-msg（跳过 `/clear`+`/model`） |
| 查看这三个代码仓库… | b093dcb5 | 同上 | first-user-msg（跳过 `/clear`） |
| worktree-flow-scaffold | ee017991 | 同上 | customTitle |
| 我在思考… | 926db1e5 | 同上 | first-user-msg（跳过 `/model`） |
| 是否可以根据"uat2-deploy-runbook.md"… | d0de2fcc | 同上 | first-user-msg（无 slash 干扰） |

## 结论

3 处源码改动（`system-tags.ts` 加 `pickTitleText`、`parse-jsonl.ts` 调用、
`load-session.ts` 同步 ai-title + 调用）覆盖了所有已观察到的 4 种 slash-command
shape（`<command-name>` / `<command-message>` 起头 × 空/非空 args）。前端
`s.customTitle ?? s.title` 链路无需改动。
