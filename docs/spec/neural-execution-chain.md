# 思维/执行链 · 神经放电可视化

## 目标

会话详情页提供一个「神经元链路」全屏浮层:把一条会话里 Claude 的
**思考 → 调工具 → 看结果 → 再思考 → 回复** 的执行链,可视化成类似大脑神经元
之间传递信号(动作电位)的效果。块级粒度、按钮唤起、live 跟随工作中会话。

可验证目标:
1. 会话详情 masthead 有一个「链路」按钮,点开是全屏沉浸浮层,Esc / 点叉关闭。
2. 浮层把 `messages.flatMap(blocks)` 渲染成一串发光神经元节点 + 突触连线,
   信号脉冲沿链路传递(神经放电观感)。
3. 节点按块类型着色:thinking=靛蓝 / tool_use=金 / result-ok=绿 / result-err=红 /
   user=中性墨 / text 回复=靛蓝(更亮更大)。
4. 点任一节点 → 关闭浮层 + 跳到该块所属消息(复用现有 `data-uuid` + flash)。
5. 工作中会话(isWorking):头节点强放电、新节点随 2 秒轮询生长进来。
6. `prefers-reduced-motion` 时停连续动画,退化为静态可点击图。

非目标:不改后端 / 不改 wire 协议(数据已全在 `Message.blocks`);不引第三方图库
(canvas 手绘);不做缩放/平移(用 serpentine 折行 + 纵向滚动承载长会话)。

## 数据来源(全部现成,零后端改动)

- `SessionDetail.messages: Message[]`,每条 `blocks: Block[]`(`shared/types.ts:47-63`)。
- 块类型即天然节点:`text` / `tool_use` / `tool_result`(带 `isError`)/ `thinking` /
  `image` / `unknown`。
- 会话数据已由 `queryKeys.session` 加载并 2 秒轮询(`SessionDetail.tsx:121-134`),
  浮层直接复用同一份 `data`,live 跟随天然成立。

## 链路抽取(`web/src/lib/neural-chain.ts`,纯函数 + 单测)

`buildChain(messages: Message[]): ChainNode[]`

- 过滤 `isMeta`(系统噪声不进链)。
- 按消息顺序、消息内块顺序展开;每块 → 一个 `ChainNode`:
  - `kind`: `'user' | 'thinking' | 'text' | 'tool_use' | 'tool_result'`
    - user 消息里的 `text` 块 → `user`;`tool_result` 块 → `tool_result`。
    - assistant 消息里的 `thinking` / `text` / `tool_use` → 同名 kind。
    - `image` / `unknown` 跳过(不污染链)。
  - `messageUuid`(跳转用)、`isError`(result)、`label`(短标签:工具名 / 截断文本 /
    `t('tool.thinking')` 等)、`idx`(全局序)。
- 边 = 顺序相邻(`idx` → `idx+1`),这是真实时间序(并行 tool_use 与其 result 在
  下一条 user 消息里按序出现,保持线性不交叉,诚实还原)。

测试(`neural-chain.test.ts`,放 web 端? 项目单测在 `server/**`,web 端无 vitest 配
覆盖 → 该纯函数逻辑简单,改放轻量断言或并入手动验收)。**决策**:vitest 只配了
`server/**/*.test.ts`(见 CLAUDE.md),web 端纯函数不在其覆盖。`buildChain` 逻辑用
`docs/acceptance/` 手动验收 + typecheck 兜底,不强塞 server 测试目录。

## 布局(serpentine 折行)

`layoutChain(nodes, width): Placed[]`(在组件内 useMemo,依赖容器宽度)

- 每行容纳 `cols = floor((width - 2*MARGIN) / SX)` 个节点,左→右 / 右→左 蛇形折行。
- 每节点加确定性 jitter(由 `idx` 哈希,非 `Math.random`,避免每帧抖动)→ 有机感。
- 画布高 = `rows * SY`,外层 `overflow-y-auto` 滚动承载长会话。
- 节点很多时(> CAP=800)只取最近 CAP 个,UI 顶部提示「显示最近 N / 共 M 步」
  (不静默截断,遵守 no-silent-caps)。

## 渲染 + 动画(`web/src/components/NeuralChainOverlay.tsx`)

- `createPortal` 到 `document.body`(绕开页面 transform 困住 fixed 层)。
- 单 `<canvas>`,`requestAnimationFrame` 循环:
  1. 突触连线:相邻节点间二次贝塞尔曲线,低 `globalAlpha` 暗描。
  2. 信号脉冲:沿每条边一个发光点,相位按 `idx` 错开 → 一道波沿链下行(放电波)。
  3. 节点:径向渐变光球,按 kind 取色(`useThemeColors` 解析 token),`sin` 呼吸微亮;
     text 回复节点更大更亮(Claude「发声」),thinking 同靛蓝但偏暗(内部思考)。
  4. live 工作中:头节点强放电 + 扩散环(动作电位)。
- 颜色用 token 解析后的色串 + `ctx.globalAlpha` 控透明(不依赖 canvas 的 oklch alpha)。
- 点击:命中测试最近节点 → `onJump(messageUuid)`。
- `prefers-reduced-motion`:跳过 rAF,画一帧静态图。
- 卸载清理 rAF;`ResizeObserver` 重算布局 + 重设 canvas 像素尺寸(devicePixelRatio)。

## 接入 `SessionDetail.tsx`

- state `showChain`;masthead + CompactMasthead 加「链路」按钮(镜像「修改文件」按钮样式
  + 一个神经网络图标)。
- `<AnimatePresence>` 内挂 `NeuralChainOverlay`,传 `messages`(用 `conversationMessages`
  已 meta 过滤)、`isWorking`、`onClose`、`onJump`。
- `onJump(uuid)`:`setShowChain(false)` + 确保 windowSize 含目标(算 needed) + rAF
  `scrollIntoView({block:'center'})` + 加 `flash-focus` 1.3s(镜像 271-279,不改原 effect)。

## i18n(`web/src/lib/i18n.ts`,en + zh)

`session.chain.title`(链路)、`session.chain.openAria`、`session.chain.close`、
`session.chain.empty`、`session.chain.subtitle`(神经放电)、`session.chain.capped`
(显示最近 {{n}} / 共 {{m}} 步)、各 kind 图例标签。

## 验收

`npm run typecheck`(server+web 双过)+ `npm test`(server safety-net 不回归)+
`docs/acceptance/neural-execution-chain/` 手动验收:
- 静态会话:开浮层、节点着色正确、点节点跳转 + flash、Esc 关。
- 工作中会话:头节点放电、新节点生长、关浮层不影响时间线 live。
- 长会话:折行 + 滚动 + 截断提示。
- 暗/亮主题切换:canvas 配色跟随。
- `prefers-reduced-motion`:静态图仍可点击跳转。
