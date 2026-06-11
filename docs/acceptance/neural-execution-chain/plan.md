# 验收 · 思维/执行链神经放电可视化

## 需求 + 方案

会话详情新增「链路」按钮 → 全屏神经放电浮层,把会话的块级执行链
(thinking / tool_use / tool_result / text / user)可视化成神经元 + 突触 + 信号脉冲。
点节点跳回时间线对应消息;工作中会话 live 跟随。方案详见
[`docs/spec/neural-execution-chain.md`](../../spec/neural-execution-chain.md)。

## 改动(file:line)

- `web/src/lib/neural-chain.ts`（新）— `buildChain(messages)` 把消息展平成块级链节点。
- `web/src/components/NeuralChainOverlay.tsx`（新）— canvas 神经放电浮层(createPortal、
  rAF 绘制、serpentine 布局、点击命中跳转、live 头节点放电、reduced-motion 静态降级)。
- `web/src/lib/theme.ts:+useThemeColors` — 把 OKLCH token 解析成 canvas 可用色串(复用)。
- `web/src/routes/SessionDetail.tsx` — masthead + CompactMasthead 加按钮、挂浮层、
  `handleChainJump` 复用 data-uuid + flash-focus 跳转、`NeuralIcon`。
- `web/src/lib/i18n.ts` — `session.chain.*`(en + zh)。

## Round 1 · 自动验证(已绿)

| 项 | 命令 | 结果 |
|---|---|---|
| 类型 | `npm run typecheck` | PASS(server+web,`tsc -b` 无报错) |
| 单测 | `npm test` | PASS(9 files / 61 tests) |
| 构建 | `npm run build` | PASS(1398 modules) |
| 数据层(真实会话) | tsx 喂 `buildChain` | PASS,见下 |

真实会话(829 条消息)`buildChain` 输出:
- 827 节点,`byKind = {user:12, thinking:139, text:136, tool_use:270, tool_result:270}`
- tool_use:tool_result = 270:270(平衡);errors = 12(与 isError 一致)
- idx 连续 0..n-1 ✓;全部有 messageUuid ✓;tool_use 全有 name ✓
- 序列形态 `user→thinking→text→tool_use→tool_result→…` = 执行链 ✓
- 827 > CAP(800)→ 顺带覆盖「显示最近 N / 共 M 步」截断提示路径

## Round 2 · 浏览器手动验收(待人眼)

canvas 视觉 / 交互无法由后台脚本断言,需在真机浏览器逐项验:

- [ ] 静态会话:点「链路」开浮层 → 节点按 kind 着色(思考靛蓝 / 工具金 / 结果绿 / 报错红 / 提问墨)、信号脉冲沿链下行。
- [ ] 悬停节点出 tooltip(kind + 预览 + 点击跳转提示),光标变 pointer。
- [ ] 点节点 → 浮层关 + 时间线滚到该消息 + flash-focus 高亮;重复点同一节点仍生效。
- [ ] 长会话(>800 块):serpentine 折行 + 纵向滚动 + 顶部「最近 800 / 共 N 步」提示。
- [ ] 工作中会话:头节点强放电(扩散环)+ 新节点随 2 秒轮询生长;关浮层不影响时间线 live tail。
- [ ] 暗/亮主题切换:canvas 配色跟随(MutationObserver 重读 token)。
- [ ] `prefers-reduced-motion: reduce`:停连续动画、静态图仍可点击跳转。
- [ ] Esc 关浮层;打开时背景不滚动。

> 启动:`npm run dev`,浏览器开 `http://localhost:5173`,进任一有较多消息的会话。
