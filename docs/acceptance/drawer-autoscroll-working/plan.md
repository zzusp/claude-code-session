# 抽屉对话栏 / 会话时间线：处理中新消息自动滚到底

## 需求

Claude 处理中（live + 当前轮未完成）时，有新消息到达，对话应自动滚到底——两处：
1. 会话历史时间线（SessionDetail 主页）
2. 「修改的文件」抽屉的左侧对话栏

前提是用户当前停在底部追看最新动态；若已往上翻历史，则不打断、不拽回底部。

## 现状

- **SessionDetail.tsx**：已有「贴底跟随」（`:277-289`），按 `meta.messageCount` 增长 + 停在底部触发 `window.scrollTo`。缺口：处理中指示器（WorkingIndicator）出现时不增长 messageCount，故指示器冒出时不会跟随。
- **ModifiedFilesDrawer.tsx**：完全没有新消息到达时的跟随——只在首挂载（`:119`）和 visibleCount 变化（`:127`）时定位。处理中新消息到来时对话栏纹丝不动。← 主要缺口

## 改动

`ModifiedFilesDrawer.tsx`
- 新增 `CONV_BOTTOM_STICK_PX = 120` 阈值常量。
- 新增 refs：`stickToBottom`（是否停在底部）、`prevMsgCount`、`prevIsWorking`。
- `onConvScroll`：滚动时更新 `stickToBottom`（离底距离 < 阈值）。挂到对话栏滚动容器 `onScroll`。
- 新增 `useLayoutEffect([messages.length, isWorking])`：消息增长 **或** 刚进入处理中（false→true）时，若停在底部则 `scrollTop = scrollHeight`。让位于 pendingJump / restoreFromBottom 重排，避免互相打架。

`SessionDetail.tsx`
- 新增 `prevIsWorkingRef`，新增 `useEffect([isWorking, urlFocus, skipWindowing])`：处理中指示器出现（isWorking false→true）且停在底部时，跟随到底——补上 messageCount 不变那一类更新的缺口。

## 验证

`scripts/verify-autoscroll.mjs`（Playwright，page.route mock 4 个 GET 接口，会话详情接口按测试步骤增长）：
- C 时间线：停底 + 新消息 → 跟随。
- 抽屉：打开落底 / 停底 + 新消息 → 跟随 / 往上翻历史 + 新消息 → 不拽回。

跑法见脚本头注释；结果见 `report.md`。
