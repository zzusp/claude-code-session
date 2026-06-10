# 验收：会话消息内容展示优化（timeline + 弹窗统一）

方案见 [`docs/spec/message-content-display.md`](../../spec/message-content-display.md)。

## 需求

1. Claude 回复（assistant text block）按 markdown 排版（标题/代码块/列表/表格/引用/链接），
   样式贴合现有 editorial 设计 token。
2. tool_use 块折叠态给一行摘要（Bash→命令、Edit/Write→文件路径、TodoWrite→进度等）；
   展开体分工具特化（Edit/Write→−/+ diff、TodoWrite→checklist、Bash→命令块+复制）。
3. tool_result 头部标注来源工具名（「工具返回 · Bash」）。
4. 会话时间线与「修改的文件」弹窗对话栏展示完全一致（共用 MessageBubble/ToolBlock）。
5. 既有能力不回归：搜索高亮（含 markdown 内文与 tool 摘要）、折叠/展开、live 跟随。
6. 首屏体积不回归：markdown 库独立 chunk 按需加载。

## 改动

见 spec 改动清单；关键文件：`web/src/components/{MarkdownContent,ToolBlock,MessageBubble}.tsx`、
`web/src/lib/diff.ts`（从弹窗下沉）、`vite.config.ts`（markdown chunk）。

## 验证矩阵

| # | 项 | 方法 |
|---|---|---|
| V1 | typecheck + vitest | `npm run typecheck` / `npm test` |
| V2 | build chunk：markdown 独立、无 circular、首屏不涨 | `npm run build` 输出 |
| V3 | 时间线 assistant 消息 markdown 元素实渲染（strong/code/标题/列表） | Playwright |
| V4 | tool_use 折叠头摘要非空 | Playwright |
| V5 | Edit/Write 展开体出现 −/+ diff 着色行 | Playwright |
| V6 | tool_result 头部带来源工具名 | Playwright |
| V7 | 弹窗对话栏与时间线同样渲染 markdown + 摘要 | Playwright |
| V8 | 搜索 query 在 markdown 内文以 `<mark>` 高亮 | Playwright |
| V9 | 暗色主题下渲染正常（截图） | Playwright |
| V10 | 页面无 console error | Playwright |

脚本：`scripts/verify-message-display.mjs`（只读真实会话数据，无任何写操作）。
