# Round 2 — 对抗性 review 修复后复验（2026-06-11）

## 输入：多 lens 对抗性 review

用 workflow 跑了 4 lens（correctness / design / perf / regression）× 每条发现 3 个对抗性
复核员多数投票，共 25 agent。结论 **7 条确认（0 误报）**：

| # | 严重度 | 问题 | 处置 |
|---|---|---|---|
| 1 | minor | CopyButton 用 Tailwind `shadow-sm`（全库唯一非 token 阴影） | 改 `shadow-[var(--shadow-rise)]` |
| 2 | major | Edit/MultiEdit 展开 LCS 无 memo + diffOps 行级无规模上限 | `buildToolBody` useMemo + diffOps 加 `LCS_CELL_CAP` |
| 3 | major | 搜索时 markdown 全量重解析（skipWindowing×5000 条） | 设计决策（下） |
| 4 | major | 回归：Edit/Write 展开体丢搜索高亮 | 设计决策（下） |
| 5 | minor | markdown 高亮 vs haystack 双向不一致 | 设计决策（下） |
| 6 | minor | tool 原文显示后「照所见搜」被 JSON 转义 haystack 过滤 | 设计决策（下） |
| 7 | minor | `?focus=` 深链 markdown chunk 加载后滚动漂移 | 设计决策（下，连带解决） |

## 核心修复：一个设计决策解决 #3–#7

**「读用富渲染，搜用原文高亮」**：`query` 非空（搜索态）时——
- assistant 文本退回 plain `HighlightedText`（`MessageBubble` 的 `markdown={!isTool && !query}`）；
- tool_use 展开体退回 JSON 原文 + `HighlightedText`（`ToolBlock` 的 `searching` 分支，复用 main 的 `JsonDump`）。

收益：搜索态不解析 markdown（#3 消解）、tool 体恢复高亮命中可见（#4 回归修复）、所见即原文
所搜一致（#5/#6 消解）；`?focus=` 深链恒带 `?q=`（SearchModal 唯一来源），搜索态不加载
markdown chunk → 无异步高度漂移（#7 连带解决）。副产物：`MarkdownContent` 移除自写高亮 rehype
插件后从 5.51→4.86 kB。

## 复验结果

### typecheck / vitest / build
- `npm run typecheck` PASS；`npm test` **61/61 PASS**（冷启动正常，4.88s）。
- `npm run build` PASS：markdown chunk 157 kB 独立、**无 Circular 警告**、首屏 index 178.8 kB 不变。

### Playwright round-2（scripts/verify-search-revert.mjs，5/5 PASS）

```
PASS R1 — 非搜索态 markdown 元素 ×8
PASS R4 — 非搜索态 Edit 展开＝富 diff 着色 ×9
PASS R2 — 搜索态 markdown 元素=0、纯文本 <mark> ×26
PASS R3 — 搜索态 Edit 展开＝JSON 原文 + <mark> ×3
PASS R5 — 无 console error
```

要点：R2 用 markdown 独有元素（strong/标题/引用/表格）判定——首跑误用宽选择器把 tool 的
`pre`/`code`/`ul` 当 markdown 导致 R2 假阴性，改窄后通过；R1 首跑因 markdown 是 lazy chunk
未加载完成而为 0，加 `waitForSelector` 后通过（确认是 timing 非缺失）。证据：round-2/search-tool-json.png
（搜索 "MessageBubble"：文本退回 `**MessageBubble**` 原文高亮、Edit 展开为 JSON 且命中高亮）。

### Playwright round-1 全套回归（8/8 PASS）
重跑确认富渲染路径未被破坏：markdown 渲染、tool 摘要、富 diff（×162）、result 来源标注、
弹窗对话栏一致、暗色主题、无 console error 全部仍通过。

## 状态

两轮全绿，7 条 review 发现全部处置。
