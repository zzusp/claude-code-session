# 会话消息内容展示优化（timeline + 修改文件弹窗统一）

## 背景与问题

会话时间线（`SessionDetail`）与「修改的文件」弹窗对话栏（`ModifiedFilesDrawer` 左栏）共用
`MessageBubble` 渲染消息，结构上已统一，但内容展示有三处明显短板：

1. **Claude 回复是裸文本**（`MessageBubble.tsx` 的 text block 只有 `whitespace-pre-wrap`）：
   markdown 的 `**加粗**`、``` 代码块、`-` 列表、表格、标题全部原样显示，长回复可读性差。
2. **tool_use 块信息密度为零**：折叠态只有工具名，看不出这次调用动了哪个文件 / 跑了什么
   命令；展开是原始 JSON。
3. **视觉语言不统一**：Edit/Write 的改动在消息流里是 JSON 字符串，而弹窗里是带 −/+ 着色 +
   字内高亮的 split diff——同一份数据两种呈现。

## 方案

设计概念：**批注过的手稿**——Claude 的回复升级为排版后的正文，工具调用收敛成紧凑的
ledger 行，diff 视觉语言与弹窗对照一致。全部组件级改动落在共用组件上，两个界面天然统一。

### 1. Markdown 渲染（assistant text block）

- 新组件 `web/src/components/MarkdownContent.tsx`：`react-markdown@10` + `remark-gfm@4`。
- 仅 assistant 的 text block 走 markdown；用户输入保持纯文本（终端输入不是 markdown，
  渲染会误伤 `*args`、路径等字面量）。
- 所有元素映射到现有 design token：标题用 font-display 缩阶、行内代码 / 代码块用
  font-mono + sunken 底、链接 accent、表格 hairline、引用 accent 左边框、hr 用 rule-dotted。
- 原始 HTML 不渲染（react-markdown 默认安全行为，显示为字面文本），不引入 rehype-raw。
- **搜索态行为：「读用富渲染，搜用原文高亮」**（对抗性 review 后定稿，见 acceptance/round-2）。
  `query` 非空时 assistant 文本退回 plain `HighlightedText`（`markdown={!isTool && !query}`），
  tool_use 展开体退回 JSON 原文 + `HighlightedText`。这样搜索匹配的原文与所见高亮一致，
  且搜索态不触发 markdown 解析（性能）；非搜索态才走富渲染。markdown 渲染本身因此无需处理
  query 高亮。
- **按需加载**：`MessageBubble` 内 `lazy()` 引入，Suspense fallback 退回现有纯文本渲染；
  `vite.config.ts` 的 manualChunks 把 remark/micromark 系列拆进 `markdown` chunk，
  避免落入 eager 的 `vendor` chunk 拖慢首屏。

### 2. tool_use 块摘要化 + 分工具展开体

- 折叠头部新增一行摘要（mono、truncate）：
  Bash→description/命令首行；Edit/Write/Read 等→文件路径；Grep/Glob→pattern；
  Task→description；WebFetch→url；WebSearch→query；TodoWrite→完成进度；其余→null。
- 展开体按工具特化：
  - Edit/MultiEdit → old/new 以 −/+ 着色行渲染（复用 diff 算法，字内高亮），与弹窗一致；
  - Write/NotebookEdit → 内容按「新增」整体 + 着色；
  - TodoWrite → checklist（✓ moss / ● accent / ○ faint）；
  - Bash → 命令代码块 + description；
  - 其它 → 原始 JSON（现状保留）。
- 代码块 / 命令提供 hover 复制按钮。

### 3. tool_result 标注来源工具

- `Block` 的 tool_result 已带 `toolUseId`；`SessionDetail` 已为弹窗构建
  `editLookup`（toolUseId → {name,input}，覆盖全部 tool_use）。
- `MessageBubble` 新增可选 `toolNames` prop（Map<id,name>），result 头部显示
  「工具返回 · Bash」。两个调用方都现成有数据。

### 4. diff 算法下沉共用

- `ModifiedFilesDrawer.tsx` 内的纯函数（`diffOps` / `wordSegments` / `rowsFromStrings` /
  `UnifiedRow` 等）抽到 `web/src/lib/diff.ts`，弹窗与 ToolBlock 共用。纯搬移不改行为。

## 改动清单

| 文件 | 改动 |
|---|---|
| `package.json` | +react-markdown +remark-gfm（devDeps，web 构建期依赖） |
| `vite.config.ts` | manualChunks 增加 markdown chunk |
| `web/src/components/MarkdownContent.tsx` | 新建：markdown 渲染 + 高亮 rehype 插件 |
| `web/src/lib/diff.ts` | 新建：从弹窗抽出的 diff 纯函数 |
| `web/src/components/ToolBlock.tsx` | 重设计：摘要头 + 分工具展开体 + 复制 |
| `web/src/components/MessageBubble.tsx` | text block 接 markdown（lazy）；toolNames 透传 |
| `web/src/components/ModifiedFilesDrawer.tsx` | 改 import diff lib；对话栏传 toolNames |
| `web/src/routes/SessionDetail.tsx` | 时间线传 toolNames |
| `web/src/lib/i18n.ts` | +复制等 key（zh/en） |

## 风险与对策

- **内容丢失**：react-markdown 默认对 raw HTML 的处理需实测确认显示为字面文本
  （Playwright round 覆盖含 `<tag>` 的消息）。
- **首屏体积**：markdown 库必须进独立 chunk，build 后核对 chunk 划分与初始体积。
- **搜索高亮回归**：query 高亮在 markdown 文本、代码块、tool 摘要内均需生效（round 覆盖）。
- **长会话性能**：markdown 解析按消息粒度 + lazy chunk；时间线本身有窗口化（50 条起）。

## 验证

`docs/acceptance/message-content-display/`：Playwright 脚本对真实会话截图断言
（markdown 元素存在、摘要可见、弹窗对话栏渲染一致、搜索高亮、暗色主题），
typecheck + vitest + build chunk 核对；全绿后 report.md。
