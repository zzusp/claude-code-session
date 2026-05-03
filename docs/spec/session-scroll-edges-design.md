# Session 详情页 — 跳转顶/底浮动按钮 + slash 命令首消息丢失修复

## Context

会话详情页用户反馈两件事：

1. **用户消息从开头缺失**——以 `b0439a31-c6ac-4240-bace-cd79d5d65398`（`session-rename-support`）会话验证：第一条用户消息是 `/plan` slash 命令调用，被错误地标为 `isMeta=true` 默认隐藏，**用户真正输入的内容（藏在 `<command-args>` 里）也跟着不见**。
2. **缺少快速跳到顶/底的按钮**——长会话翻页费力，期望加 floating 按钮。

任务 2 加浮动按钮，纯滚动操作，**不**自动展开 windowing（保持语义纯，与 `Load earlier` 解耦）。

## 任务 1：slash 命令调用不再标记为 meta

### 根因

`server/lib/system-tags.ts:1-2` 的 `SYSTEM_TAG_RE` 把以下六类 XML wrapper 一锅炖标为 meta：

```
<command-name>  <command-message>  <command-args>          ← slash 命令调用（用户主动输入）
<local-command> <system-reminder>  <caveat>                ← 真·系统注入
```

这两类语义不同：

- **slash 命令调用**：用户在 prompt 里输入 `/plan 可以为session重命名么？` 触发的，原始 JSONL 里以单个 text block 字符串形式记录三段 XML：`<command-name>/plan</command-name>...<command-args>可以为session重命名么？</command-args>`。**这是用户消息**，应该显示。
- **系统注入**：runtime 自动塞进 transcript 的 stdout 回放、系统提醒、caveats。这些才是真噪声。

`buildMessage()`（`load-session.ts:107-109`）一旦 regex 命中就 `isMeta=true`；前端 `SessionDetail.tsx:84` 默认 `!showMeta` 把它们过滤掉。结果：slash 命令开头的会话，**用户的第一条真问题消失**。

证据：
- `b0439a31-c6ac-4240-bace-cd79d5d65398.jsonl` 第 3 条 `type=user`，`message.content` 整段就是 slash 命令的三段 XML wrapper，包含用户真问题 `可以为session重命名么？`。
- `server/lib/load-session.ts:90` 的 `deriveAutoTitle()` 也跳过 `isMeta` 消息——同一个错误分类导致 slash 起头的会话标题也错（之前以下一条非-meta 消息为标题）。

### 修复（方案 B：最小正则改动）

`server/lib/system-tags.ts`：从 `SYSTEM_TAG_RE` 中移除 `command-(name|message|args)`，只保留真·系统注入。

```ts
export const SYSTEM_TAG_RE = /^\s*<(local-command|system-reminder|caveat)/i;
```

**显示后果**：slash 命令的用户消息以原样 XML 文本（`<command-name>/plan</command-name>...<command-args>...</command-args>`）显示在 user bubble 里。视觉糙但保信息——已和用户对齐选这条路。`MessageBubble` 不动，将来要美化（提取 `<command-args>` 内容 + 命令名做 prefix tag）作为独立 follow-up。

### 已知副作用

- `parseJsonlMeta`（`server/lib/parse-jsonl.ts:58`）和 `deriveAutoTitle`（`server/lib/load-session.ts:88-99`）派生标题时都用 `SYSTEM_TAG_RE` / `isMeta` 跳过。修正后，slash 起头的会话**自动派生标题会落在 XML wrapper 文本上**（如 `<command-name>/plan</command-name> ...`）——比原先错过用户真问题更糟。
- 用户已 rename 的会话有 `customTitle`，不受影响（`SessionDetail.tsx:112` 优先用 `customTitle`）。
- 这是已知 trade-off。等 `MessageBubble` / 标题派生加 slash-command 解析逻辑（follow-up）一并修。本次不动 title 派生。

## 任务 2：浮动「跳到顶部 / 跳到底部」按钮

### 决策（已和用户对齐）

- **位置**：右下角 fixed 浮动小圆按钮，两个按钮纵向叠放（顶在上、底在下）。
- **行为**：纯滚动操作，**不**自动展开 windowing。Top 滚到 `top: 0`，Bottom 滚到 `document.documentElement.scrollHeight`，`behavior: 'smooth'`。
- **可见性**：按滚动位置智能显隐，阈值 `EDGE_THRESHOLD = 320`px——
  - `Top` 按钮：`window.scrollY >= 320` 才显示。
  - `Bottom` 按钮：`scrollHeight - (scrollY + innerHeight) >= 320` 才显示。
  - 内容不足一屏时两个按钮都隐藏（自然落入上面两条规则）。
- **范围**：仅 `SessionDetail` 页面，不动 `ProjectDetail` 或全局布局。

### 关键改动

#### `web/src/lib/i18n.ts`

`common.*` 块新增两个 key（`en` 和 `zh` 同步）：

```ts
'common.scrollToTop': 'Jump to top',         // zh: '回到顶部'
'common.scrollToBottom': 'Jump to bottom',   // zh: '回到底部'
```

#### `web/src/routes/SessionDetail.tsx`

1. 文件底部新增内联子组件 `ScrollToEdges` + `ChevronIcon`（沿用文件内既有的 `SearchIcon` 风格，inline SVG + currentColor stroke）。
2. `<section>` 末尾插入 `{data && <ScrollToEdges />}`——仅数据加载完后挂载，避免空页飘按钮。

`ScrollToEdges` 实现要点：

- `useState` 两个 boolean：`showTop` / `showBottom`。
- `useEffect` 注册 `window` 上的 `scroll` + `resize`（都 `passive: true`），handler 用 `requestAnimationFrame` 节流（`if (frame) return`），避免每次 scroll 事件都 `setState`。挂载时立即调一次 `update()` 同步初值。
- 卸载时移除两个 listener + `cancelAnimationFrame` 取消未触发的 rAF。
- `if (!showTop && !showBottom) return null`——不可见时整体不渲染（hooks 仍存活）。
- 容器 `fixed bottom-6 right-6 z-30 flex flex-col gap-2`；按钮样式沿用 `SessionDetail.tsx` 既有 token：
  ```
  rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)]
  p-2.5 text-[var(--color-fg-secondary)] shadow-[var(--shadow-rise)]
  transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]
  ```
- 按钮 `aria-label` + `title` 都用 i18n key。

### z-index 确认

现有层级：sticky filter bar `z-30`、mobile sidebar `z-40`、DeleteDialog `z-[60]`。浮动按钮选 `z-30`——和 sticky bar 同层但物理位置（`bottom-6 right-6` vs `top-0`）不冲突；遇到 dialog 时被正确遮挡，符合预期。

## 验证

```bash
npm run dev
```

任务 1：

1. 打开 `b0439a31-c6ac-4240-bace-cd79d5d65398` 会话——第一条用户消息应该出现，bubble 内文本为 `<command-name>/plan</command-name>...<command-args>可以为session重命名么？</command-args>`。
2. 勾选 `Show System` checkbox 后，能额外看到 `<local-command-stdout>Enabled plan mode</local-command-stdout>` 的 meta 消息。
3. 任意 session-reminder 起头的 user 记录仍被默认隐藏（已开 Show System 才出现）。

任务 2：

1. **冷打开长会话**（>50 条）：进入页面应自动滚到底 → Top 按钮**可见**、Bottom 按钮**隐藏**。
2. 点 Top → 平滑滚到 0；滚动结束 Top 隐藏、Bottom 显示。
3. 点 Bottom → 平滑滚回底；状态翻转。
4. **短会话**（<一屏）：两个按钮都不应该出现。
5. **手动滚到中间**：两个按钮同时显示。
6. **窗口 resize**：从大窗口缩到一屏内时，按钮按新阈值正确隐藏。
7. **i18n**：切到中文，按钮 `aria-label` / `title` 显示「回到顶部 / 回到底部」。
8. **暗色模式**：`var(--color-*)` token 自动跟随，无需额外 dark 变体。
