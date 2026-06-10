# 验收报告 — 会话消息内容展示优化

**状态：全绿（PASS）** · 2026-06-11 · 分支 `feature/message-content-display`

## 目标达成

统一并升级会话时间线与「修改的文件」弹窗的消息展示，二者共用 `MessageBubble`/`ToolBlock`：

1. ✅ Claude 回复 markdown 排版（标题/代码块/列表/表格/引用/链接），贴合 OKLCH 设计 token。
2. ✅ tool_use 折叠头一行摘要 + 分工具富展开体（Edit/Write→−/+ diff、TodoWrite→checklist、Bash→命令块+复制）。
3. ✅ tool_result 头部标注来源工具（「工具返回 · Bash」）。
4. ✅ 时间线与弹窗对话栏展示完全一致（同组件）。
5. ✅ 既有能力无回归：搜索高亮、折叠/展开、live 跟随、`?focus=` 深链。
6. ✅ 首屏体积不回归：markdown 独立 chunk 按需加载。

## 设计要点

**「读用富渲染，搜用原文高亮」**：非搜索态走 markdown / 富 diff；搜索态退回原文 +
`HighlightedText`。一个决策同时保证搜索高亮可靠、搜索态零 markdown 解析开销、所见即所搜一致。

## 改动文件

| 文件 | 改动 |
|---|---|
| `web/src/components/MarkdownContent.tsx` | 新建：react-markdown@10 + remark-gfm，元素映射 design token，lazy 加载 |
| `web/src/lib/diff.ts` | 新建：从弹窗下沉的 diff 纯函数（+ `LCS_CELL_CAP` 规模上限） |
| `web/src/components/ToolBlock.tsx` | 重写：摘要头 + 分工具展开体 + 搜索态 JSON 回退 + 复制按钮 |
| `web/src/components/MessageBubble.tsx` | text block 接 markdown（lazy，`!isTool && !query`）+ toolNames 透传 |
| `web/src/components/ModifiedFilesDrawer.tsx` | 改用 lib/diff、对话栏传 toolNames |
| `web/src/routes/SessionDetail.tsx` | 时间线传 toolNames |
| `vite.config.ts` | markdown 依赖闭包独立 chunk |
| `web/src/lib/i18n.ts` | +4 key（copy/copied/moreLines/replaceAll，zh+en） |

## 验证

- **typecheck** PASS · **vitest** 61/61 PASS · **build** PASS（markdown chunk 157 kB 独立、无 circular、首屏 178.8 kB 不变）。
- **Round 1**（[round-1.md](round-1.md)）：Playwright 8/8 + 原始 HTML 保真性实证 + 截图。
- **Round 2**（[round-2.md](round-2.md)）：多 lens 对抗性 review（25 agent，7 条确认 0 误报）全部处置 → Playwright 5/5 + round-1 回归 8/8。

## 复现

```powershell
npm run dev   # backend + vite
node docs/acceptance/message-content-display/scripts/verify-message-display.mjs   # round-1
node docs/acceptance/message-content-display/scripts/verify-search-revert.mjs     # round-2
```
