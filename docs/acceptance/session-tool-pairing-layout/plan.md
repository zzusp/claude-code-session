# 会话页：工具调用/返回配对 + PowerShell 对齐 Bash + 三层定高布局

## 需求（用户三条反馈）

1. **工具返回配对到调用**：会话流里工具调用的返回结果，应紧跟在对应调用之后（展开体内：参数/命令 + 空行 + 返回结果），不再作为独立的「工具」标头消息散落在下方。并行调用时各自配对，不再批在一起。
2. **PowerShell 对齐 Bash**：当前 PowerShell 折叠行显示「PowerShell + 部分命令」、展开是 JSON。应改为与 Bash 同款——折叠「运行(Ran) + description」、展开终端命令块；展开体再接「空行 + 工具返回」。
3. **右侧预览三层布局**：点文件卡拆出的预览面板「层级搞错」。正确结构：侧栏 | 右侧内容；右侧内容先分**上(页头)/中/下(页脚)三层**，再由**中间层左右拆分**（时间线 | 预览）。预览面板严丝合缝填满中间层，不压页脚、底部不脱离。

用户已确认：请求3走**定高三层 + 中间内部滚动**；请求1走**合并并移除独立「工具」消息**。

## 根因（ground-truth）

- 请求2：`ToolBlock.toolVerb/toolSummary/buildToolBody` 只特化了 `Bash`，`PowerShell` 落到 default → 折叠显示工具名 + 命令、展开 JSON。
- 请求1：`tool_use`(assistant 消息) 与 `tool_result`(下一条 user 消息) 分属两条消息；`MessageBubble` 把纯 tool_result 的 user 消息渲染成 `variant="tool"` 独立卡。并行调用时多个 result 批在一条消息里、与各自 call 错位。
- 请求3：实测预览 `aside` 用 `position:sticky` + `height:calc(100dvh - topbarH - 3.5rem)`（写死页脚 3.5rem）伪造三层。打开时 aside 底 y=976 压住 footer 顶 y=921（重叠 55px）；滚到底时 aside 脱离（top=-18）。根因是整页 window 滚动 + sticky 叠加，并非真正定高三层。

## 改动方案

### 请求 1+2 — `ToolBlock.tsx` / `MessageBubble.tsx` / `SessionDetail.tsx`

- `SessionDetail`：
  - `resultLookup` 升级为 `toolResults: Map<id, {content, isError}>`（FilePreviewPanel 取 `.content`）。
  - `indexed` 构建时：**剔除**纯 tool_result 且其 toolUseId 均有对应 tool_use 的消息（这些将配对内联）；并把 result 正文**折进**拥有该 tool_use 的消息 haystack（保搜索命中）。孤儿 result（无对应 tool_use）仍独立渲染兜底。
  - `hasError`（错误过滤）改为：消息含 tool_use 且其 result `isError`，或仍含独立 error result。
  - 把 `toolResults` 下发给 `MessageBubble`。
- `MessageBubble`：新增可选 `toolResults` prop，透传到 `ToolUseBlock`（`result={toolResults?.get(block.id)}`）。未传时行为不变（ModifiedFilesView 复用不受影响）。
- `ToolBlock.ToolUseBlock`：
  - `toolVerb/toolSummary/buildToolBody` 增 `case 'PowerShell'` 与 Bash 同处理。
  - 新增 `result?` prop；在展开体尾部渲染 `<PairedResult>`（命令/参数下方空行 + 返回结果块，沿用截断/高亮/错误色）。preview-host 文件卡不内联（结果在预览面板）。

### 请求 3 — `App.tsx`(ChromeLayout) / `SessionDetail.tsx` / `Splitter.tsx`

- `ChromeLayout`：会话详情路由识别为 fullBleed → 外层 `flex h-dvh overflow-hidden`（窗口不滚），main `flex-1 min-h-0 flex flex-col`，wrapper 保留 `mx-auto max-w-6xl` + 横向 px、去掉纵向 py、改 `flex-1 min-h-0 flex flex-col`。其它路由维持原 `min-h-dvh` + 带 py 的滚动壳。
- `SessionDetail`：
  - `<section>` 改 `flex h-full min-h-0 flex-col`。
  - 三层：topbar(`shrink-0`，去 sticky) / split-row(`flex-1 min-h-0`) / footer(`shrink-0`，去 sticky)。
  - 中间左列时间线作为**内部滚动容器**（`overflow-y-auto`，挂 `scrollRef`）；右列 `aside` 改 `h-full`（去 sticky / 去 height calc / 去 topbarH 测量）。
  - 滚动相关逻辑（stickToBottom / live-tail 跟随 / working 跟随 / ScrollToEdges）从 `window`/`documentElement` 改到 `scrollRef` 容器。
- `Splitter`：抓手从 `sticky top:calc(50dvh-1.25rem)` 改为在定高分割条内居中（`absolute top-1/2 -translate-y-1/2`）。

## 验证

- `npm run typecheck` + `npm test` 全过。
- Playwright（会话 `8afefc96`，1500×1000 与窄屏各一遍）：
  - PowerShell 折叠=「运行 + description」、展开=命令块 + 空行 + 返回；不再有独立「工具」消息。
  - 并行调用各自配对。
  - 预览面板填满中间层、不压页脚；滚到底页脚仍在底部、预览不脱离。
  - 错误过滤仍能筛出工具错误；会话内搜索仍命中 result 正文。
