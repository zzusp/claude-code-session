# Claude 桌面端风格改版（视觉 + 布局重构）

把 Session Manager 的 UI 从原「editorial 社论 / 黄绿 accent」基调，重塑成 **Claude 桌面端**的视觉语言：暖米白纸感背景、陶土 coral 主色、Fraunces 衬线标题、聊天式卡片。**纯表现层**——不改路由、数据获取、删除/导出安全网、i18n 文案与任何业务逻辑。

## 范围（开工前与用户对齐）

- **改动范围**：视觉 + 布局重构（不加新功能）。
- **必还原的 Claude 视觉特征**：① 暖米白纸感背景 ② 陶土 coral 主色 ③ 衬线标题字体 ④ 聊天式卡片与圆角。

## 为什么改动面小

设计系统全程 **token 驱动**（`web/src/index.css` 的 `@theme` / `.dark` 两组 OKLCH 变量），所以「换肤」主要改这两组 token 一处，即可传导到全部页面（项目列表 / 会话详情 / 磁盘 / 记忆 / 弹窗）。布局重构只落在 Sidebar 与消息气泡两块。

## 配色映射（OKLCH）

灰阶 hue 从原来的 85 迁到暖色 55–92 带，accent 从黄绿（hue 65–70）换成陶土 coral（hue 44 / 暗色 46）。

| Token | 旧（light） | 新（light） | 说明 |
|---|---|---|---|
| canvas | `0.972 0.008 85` | `0.971 0.0095 92` | 暖米白纸感 |
| surface | `1 0 0` | `0.992 0.004 92` | 近白偏暖 |
| sunken | `0.945 0.010 85` | `0.948 0.012 90` | 深一点的奶油（侧栏/代码/用户气泡） |
| fg-primary | `0.21 0.012 85` | `0.255 0.012 58` | 暖近黑 |
| accent | `0.72 0.165 65`（黄绿） | `0.635 0.118 44`（陶土 coral） | 链接/活跃/CTA |
| accent-ink | `0.32 0.090 60` | `0.455 0.105 42` | coral 文本（soft 底上） |
| accent-soft | `0.94 0.058 75` | `0.925 0.038 62` | 柔和桃 / 活跃 nav 底 |

暗色：canvas `0.158 0.006 85` → `0.205 0.005 68`（Claude 暖炭灰 #262624 系），accent → `0.705 0.115 46`（提亮的 coral）。完整值见 `web/src/index.css` 的 `@theme` 与 `.dark` 块。

`pulse-amber`（live/working 脉冲）里硬编码的黄色 `0.78 0.155 70` 同步改成 coral `0.68 0.13 46`（utility 与 `@keyframes` 两处）。grain 噪点 opacity 调淡（light 0.045→0.03 / dark 0.07→0.05），贴近 Claude 干净纸面。

## 字体

`--font-display` 从「指向 Plus Jakarta」改为 **Fraunces Variable**（暖高对比衬线，呼应 Claude 的 Copernicus/Tiempos 标题气质），并新增 `@fontsource-variable/fraunces` 依赖 + `wght` / `wght-italic` 导入。`base` 层 `h1,h2,h3` 也从 `--font-sans` 改指 `--font-display`。正文与 UI 标签仍走 Plus Jakarta sans。

> 注：项目 CLAUDE.md 早已写明「Fraunces 标题」属设计意图，但旧 `index.css` 实际未接上（display 指向 sans）。本次改动让文档与实现一致。

## 布局重塑

- **Sidebar**（`web/src/components/Sidebar.tsx`）：品牌标记换成实心 coral 方块 + 浅色 Claude 风「日芒」sunburst（`Glyph` 重画，非抄袭 Anthropic logo）；wordmark 放大走衬线；nav 活跃态从「白卡 + 阴影」改为 coral-soft 柔色高亮（贴近 Claude 侧栏）。
- **消息气泡**（`web/src/components/MessageBubble.tsx`）：用户消息从糖果桃色改为暖奶油卡（`--color-sunken` + hairline），贴近 Claude 的中性人类气泡；助手卡保持近白 + coral 左缘，与工具块区分。会话详情那套性能敏感的 sticky / 滚动 JS 逻辑**未动**（只改视觉）。

## 改动文件

- `web/src/index.css` — token / 字体 / grain / pulse 配色
- `web/src/components/Sidebar.tsx` — 品牌标记 + nav 活跃态
- `web/src/components/MessageBubble.tsx` — 用户气泡质感
- `package.json` — 新增 `@fontsource-variable/fraunces`
- `CLAUDE.md` — 设计系统说明同步

## 验证

- `npm run typecheck` ✓（tsc -b，0 error）
- `npm run build` ✓（34s；Fraunces woff2 正常打包，CSS 编译通过）
- `npm test` ✓（9 files / 61 tests 全绿，安全网未受影响）
- 真机截图（Playwright，生产构建 + `npm run start`，读真实 `~/.claude`）：home / project / session × light / dark 共 6 张，确认暖米白 + coral + 衬线 + 聊天气泡在两套主题下都按预期渲染。
