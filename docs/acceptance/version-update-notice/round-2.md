# Round 2 — 红点提示 + 弹窗信息展示优化

**Date:** 2026-06-09
**Pre:** `npm run build`（dist/ 必须存在，生产服务才挂 serveStatic）
**Server:** `npm run start`（自动选端口，本轮实测 `http://127.0.0.1:3134`）
**Script:** `scripts/verify-version.mjs` + `scripts/verify-topbar.mjs`（Playwright · headless Chrome · 全程 mock `/api/version`）
**静态校验:** `npm run typecheck` 全绿；`npm test` → 9 files / 61 tests 全绿

## 需求

1. 检测到远程有新版本时，提示要更醒目 —— 红点 + 移动端汉堡菜单也能看到。
2. 点击版本后的弹窗信息展示优化 —— release notes 之前是原始 markdown 直接塞进灰框，没渲染。

## 改动

| 文件 | 改动 |
|---|---|
| `web/src/index.css` | 新增 `.pulse-danger` class + `@keyframes pulse-danger`（红色脉动，用 `--color-danger` token，自适应明暗） |
| `web/src/components/VersionNotice.tsx` | ① 抽出共享 hook `useVersionInfo()`；② 侧栏徽章脉动点 `--color-accent`→`--color-danger`（红色）；③ 弹窗头部版本信息重排为「当前版本 → 最新版本」pill + 发布日期独立行；④ release notes 由 `<pre>` 原文改为自写零依赖 markdown 渲染（标题/有序无序列表/行内码/代码块/链接/粗斜体，纯 React 节点不走 `dangerouslySetInnerHTML`） |
| `web/src/components/Sidebar.tsx` | 移动端汉堡菜单按钮加红色脉动角标（`hasUpdate && !open` 时显示），复用 `useVersionInfo()` |

> markdown 渲染选择**自写零依赖**而非引入 react-markdown：仅服务 release notes 这一处，符合「用原生能力 / 新建需理由」；输入来自 GitHub Release（半可信），渲染成 React 元素而非裸 HTML 规避注入。

## 结果：ALL GREEN

| # | 断言 | 结果 |
|---|---|---|
| U-01 | 侧栏徽章「新版本 v1.2.0」pill 带**红色**脉动点 | ✅ |
| U-02 | 点击展开弹窗：「当前版本 v1.0.1 → 最新版本 v1.2.0」pill + 发布日期 | ✅ |
| U-03 | release notes 渲染：`## Highlights` 标题成块 | ✅ |
| U-04 | release notes 渲染：`[the pull request](…)` 成可点链接 | ✅ |
| U-05 | release notes 渲染：`**red dot**` 成 `<strong>` 粗体 | ✅ |
| U-06 | release notes 渲染：``` 围栏代码块成 `<pre>` | ✅ |
| U-07 | 移动端（414px）汉堡按钮内含红点（`span.pulse-danger`，visible=true） | ✅ |

> 证据：`round-2/01-sidebar-badge.png`（侧栏红点徽章）、`round-2/02-modal-markdown.png`（弹窗渲染后 markdown + 版本 pill）、`round-2/03-mobile-hamburger-dot.png`（移动端整页）、`round-2/04-hamburger-dot.png`（汉堡红点特写）。截图可再生，跑脚本重生成。

## 既有问题观察（未改，超出本次范围）

移动端（<1024px）整体布局：`App.tsx:24` 外层是 `flex min-h-dvh`（恒为 row），`Sidebar` 的顶栏 `div.topbar-glass`（`lg:hidden`）在该 flex 行里被当成**左侧竖直窄列**（实测 width≈239 / height 拉满），而非横贯顶部的 bar——顶栏应 `w-full` 且容器在移动端 `flex-col` 堆叠。这是**既有布局问题**，与本次红点改动无关（本次只在汉堡按钮加 `relative` + 红点 span，不触碰 flex 结构）。红点本身已确认挂在汉堡按钮上且 visible。建议另开任务处理移动端顶栏布局。

## 复跑

```pwsh
npm run build
npm run start                 # 另开终端，记下打印的端口（如 3134）
$env:BASE="http://127.0.0.1:3134"
node docs/acceptance/version-update-notice/scripts/verify-version.mjs
node docs/acceptance/version-update-notice/scripts/verify-topbar.mjs
```
