# 报告：会话页工具配对 + PowerShell 对齐 Bash + 三层定高布局

全绿（见 `matrix.csv` / `round-1.md`）。本次落地三处用户反馈，纯前端表现层 + 会话页布局结构调整，server / wire 协议不变。

## 改了什么

### 1. 工具调用 ↔ 返回配对（请求 1）
`tool_use`(assistant 消息) 与 `tool_result`(下一条 user 消息) 现按 `toolUseId` 配对：返回结果内联到调用块展开体尾部（命令/参数 + 空行 + 返回），并行调用各自配对；原先独立的「工具」标头消息从时间线剔除。

- `web/src/routes/SessionDetail.tsx` — `indexed` 剔除「纯 tool_result 且每个 result 都有对应 tool_use」的消息，并把 result 正文折进拥有该 tool_use 的消息 haystack（保会话内搜索命中）；`resultLookup` 升级为 `toolResults: Map<id,{content,isError}>`；`hasError(m, results)` 改为也认「tool_use 的配对返回 isError」；新增 `focusRedirect`（result 消息 uuid → 调用块所在消息 uuid）修全局搜索命中 tool_result 后的 deep-link 失焦。
- `web/src/components/MessageBubble.tsx` — 新增可选 `toolResults` prop，透传到 `ToolUseBlock`（`result={toolResults?.get(block.id)}`）。不传时（修改文件视图复用）行为不变。
- `web/src/components/ToolBlock.tsx` — `ToolUseBlock` 新增 `result?` prop；展开体尾部渲染 `PairedResult`（截断/高亮/错误色，preview-host 文件卡除外，其返回走右侧预览面板）。

### 2. PowerShell 对齐 Bash（请求 2）
`toolVerb` / `toolSummary` / `buildToolBody` 三处给 `PowerShell` 与 `Bash` 同处理：折叠「运行(Ran) + description」、展开终端命令块；展开体再接配对返回。

- `web/src/components/ToolBlock.tsx` — 三个 `switch` 各加 `case 'PowerShell'`。

### 3. 三层定高布局（请求 3）
右侧内容改为定高三层（页头/页脚 `shrink-0` 固定，中间层 `flex-1 min-h-0` 内部滚动），中间层再左右拆分（时间线 | 预览）。预览面板 `self-stretch` 填满中间层，被页头/页脚夹住——不压页脚、滚到底不脱离。原来靠「整页 window 滚动 + sticky 叠加 + 写死 3.5rem 页脚高度」伪造三层（实测预览底 y=976 压住页脚顶 y=921，重叠 55px；滚到底脱离 top=-18）。

- `web/src/App.tsx` — `ChromeLayout` 识别会话路由为 fullBleed：外层 `h-dvh overflow-hidden`、main 全高 flex 列、wrapper 去纵向 py 改 `flex-1 min-h-0 flex flex-col`；其它路由不变。
- `web/src/routes/SessionDetail.tsx` — `<section>` 改 `flex h-full min-h-0 flex-col overflow-hidden`；topbar/footer 去 sticky 加 `shrink-0`；中间左列时间线作内部滚动容器（`scrollRef` + `overflow-y-auto`），右列 `aside` 去 sticky/height-calc/topbarH 测量、改 `self-stretch`；滚动逻辑（stickToBottom / live-tail 跟随 / working 跟随 / ScrollToEdges）从 `window`/`documentElement` 改到 `scrollRef`。
- `web/src/components/Splitter.tsx` — 抓手从 `sticky top:calc(50dvh-1.25rem)` 改为分割条内 `absolute` 居中。

## 验证证据
typecheck + 61 单测全过；Playwright 量盒子：`header{0..53} / aside{65..909} / footer{921..1000}`（aside 不压 footer、窗口不滚、滚动后三层不动）；错误过滤 6 条、搜索 result 正文命中、focus 重定向生效；修改文件页 0 报错。明暗主题人工核对均正常。

## 已知边界（非本次范围）
≤~500px 移动端侧栏 topbar 被 flex-row 挤成左列——项目列表页同样如此（代码路径未改），系**预存在**问题。
