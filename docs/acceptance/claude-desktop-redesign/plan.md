# 验收方案：仿 Claude 桌面端改版

## 需求

把 Session Manager 的 UI 从「editorial / 黄绿 accent」重塑成 Claude 桌面端视觉语言。范围与用户对齐为 **视觉 + 布局重构（不加新功能）**，四个必还原特征：① 暖米白纸感背景 ② 陶土 coral 主色 ③ Fraunces 衬线标题 ④ 聊天式卡片与圆角。

## 方案 / 改动

完整配色映射、字体、布局重塑与改动文件清单见 [`../../spec/claude-desktop-redesign.md`](../../spec/claude-desktop-redesign.md)。一句话：`index.css` 两组 OKLCH token 重配色 + Fraunces 衬线 + Sidebar/MessageBubble 视觉重塑，纯表现层。

## 验证策略

UI 改版无后端契约变化，验证 = 编译/测试不回归 + 真机截图确认两套主题渲染符合预期：

- **静态**：`npm run typecheck`、`npm run build`、`npm test`（server 安全网 61 tests，确认表现层改动未碰逻辑）。
- **视觉**：Playwright 跑生产构建（`npm run start`，读真实 `~/.claude`），截 home / project / session × light / dark 共 6 张。脚本见 [`scripts/shot.mjs`](scripts/shot.mjs)，证据见 [`round-1.md`](round-1.md) + [`round-1/`](round-1/)。

状态总表见 [`matrix.csv`](matrix.csv)。
