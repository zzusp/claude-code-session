# 侧栏选中/悬浮态中性化（对齐 claude.ai web）

## 症状

侧栏的 nav 活跃项（如「项目」）与 Recents 选中项用了 **coral / 陶土色填充**（`--color-accent-soft` 底 + `--color-accent-ink` 字 + coral 图标），悬浮态则切到 `--color-surface`（比侧栏更白）。与 claude.ai web 实际侧栏不符——后者的选中/悬浮是 **暖中性灰**，coral 只保留给品牌标记、正文链接与主 CTA。

## 根因

PR #67 引入 Recents 时把侧栏高亮定为 coral-soft（当时判断「贴近 Claude 侧栏」）。但 claude.ai 侧栏的 selected/hover 一律是中性叠加层，不带色相；coral 出现处仅限 logo、链接、主按钮、live 状态点。颜色语义用错，导致侧栏整体偏「橙」。

## 同根因排查

侧栏内所有「选中/悬浮」着色点，全部从 coral 改为中性：
- `nav` 活跃项底色 + 文字 + 图标
- `nav` 悬浮底色（原 `surface` 白 → 中性叠加）
- Recents 行的选中/悬浮
- 搜索触发器（原 `surface-card` 抬升白卡 → 扁平 hairline 边 + 中性悬浮）

未改（语义正确，保留 coral）：品牌 coral 方块、live/working 状态点（`StatusDot` / `pulse-amber`）、正文链接与 CTA、内容区 `ribbon-row` 悬浮指示。

## 修复

`web/src/index.css`：新增两枚侧栏中性选中 token，用 `color-mix` 叠加 `--color-fg-primary`，明暗两套主题一处定义自动适配（light 是 cream 上的淡黑、dark 是炭灰上的淡白）：

```css
--sidebar-active: color-mix(in oklch, var(--color-fg-primary) 9%, transparent);
--sidebar-hover:  color-mix(in oklch, var(--color-fg-primary) 5%, transparent);
```

`web/src/components/Sidebar.tsx`：
- nav 活跃 → `bg-[var(--sidebar-active)]` + `text-fg-primary`，图标 `text-fg-primary`；非活跃悬浮 → `hover:bg-[var(--sidebar-hover)]`，图标 hover → `fg-secondary`（去掉 coral）。
- Recents 行同上。
- 搜索触发器去掉 `surface-card is-interactive`（抬升白卡 + 阴影），改 hairline 边 + 透明底 + `hover:bg-[var(--sidebar-hover)]`，更贴 claude.ai 的扁平侧栏控件。

## 验证

- `npm run typecheck` ✓（tsc -b，0 error）
- `npm run build` ✓（CSS 65.42 kB，含新 token）
- `npm test` ✓（9 files / 61 tests 全绿，纯表现层不碰安全网）
- 真机截图（Playwright，生产构建 + `npm start` 读真实 `~/.claude`，2.5× DPI 侧栏裁剪）：
  - `round-1/z1-side-light.png` — light 选中「项目」为中性暖灰、搜索框扁平
  - `round-1/z2-side-dark.png` — dark 选中为炭灰上淡白叠加，coral 仅剩品牌方块 + live 点
  - `round-1/z3-side-hover.png` — 悬浮 Recents 行呈中性圆角填充
  - `round-1/z4-side-session-active.png` — 会话页下选中的 Recents 行中性高亮
