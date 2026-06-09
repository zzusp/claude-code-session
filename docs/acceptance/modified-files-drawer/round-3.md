# Round 3 — 抽屉重排为三栏（对话 | 文件内容 | 文件树）

## 需求

调整「修改的文件」侧边弹窗的布局：

1. 从原来的两栏（左文件树 | 右文件内容）改为**三栏**：**左侧对话 — 中间文件内容 — 右侧文件树**。
2. 打开 / 关闭弹窗时，给「对话历史移入弹窗」加一个过渡效果（复杂可省）。

## 改动

- `web/src/components/ModifiedFilesDrawer.tsx`
  - body 由两栏改为三栏：① 新增**对话栏**（左），渲染会话消息（复用 `MessageBubble`）；② **文件内容栏**（中，`flex-1` 吃剩余空间）；③ **文件树栏**（右，原在左侧，整段平移过去，边框由 `border-r` 改 `border-l`）。
  - 新增两条可拖拽分割线：抽出通用 `Splitter` 组件（`setPointerCapture` 锁指针）+ `clampWidth` 帮助函数。对话栏宽 `convWidth`（默认 420）、文件树栏宽 `railWidth`（默认 280）各自可拖，中间内容栏保底 `CONTENT_MIN_PX=320`。替换掉原先只服务单分割线的 `onSplitter*` 三个内联处理函数。
  - **Jump to 行为变更**：原来「跳转 + 关闭抽屉 + 滚动底层页面」，现在改为**在抽屉自己的对话栏内**滚到目标消息并 `flash-focus` 高亮，**不再关闭抽屉**（三栏下「边看改动边看对话」才是价值所在）；同时仍把 `?focus=<uuid>` 推给底层页面，关闭后落点一致。
  - **动效**：对话栏入场 `x:-32→0 + opacity`，文件树栏 `x:+32→0`，读作两侧栏向中间「合拢 / 对话流入弹窗」；overlay + aside 补 `exit`，配合路由层 `AnimatePresence` 实现关闭动画。
  - 新增 props：`messages: Message[]`、`query: string`。
- `web/src/routes/SessionDetail.tsx`
  - `import { AnimatePresence }`；用 `<AnimatePresence>` 包裹抽屉（带 `key`）以启用关闭动画。
  - 新增 `conversationMessages = data.messages.filter(!isMeta)`，连同 `deferredQuery` 传入抽屉。
  - `onFocusMessage` 注释更新为「同步 ?focus 给底层页面」。
- `web/src/lib/i18n.ts`：新增 `session.modified.col.conversation`（en `Conversation` / zh `对话`）。

## 验证

### 自动化（Round-3 脚本）

`scripts/verify-3col-layout.mjs` —— 隔离 HOME 起后端 + 构建好的 SPA，Playwright 驱动抽屉。覆盖：三栏均渲染、**对话栏在文件树左侧**（boundingBox.x 比较）、中间内容随树选中切换、Jump 后抽屉**保持打开** + URL 带 `?focus=`、两条分割线拖拽后列宽变化、Esc 关闭。

再生成（产物 PNG 不入库）：

```bash
npm run build
node docs/acceptance/modified-files-drawer/scripts/verify-3col-layout.mjs
```

### 结果（全绿，2026-06-09）

```
✅ drawer opens
✅ conversation column header present
✅ conversation renders the opening user message
✅ tree shows src folder
✅ single-child chain merged (deep/nested)
✅ file leaf Button.tsx present
✅ conversation sits left of the file tree — conv.x=434 tree.x=1715
✅ Write body renders in middle content pane
✅ Edit diff shows before value
✅ Edit diff shows after value
✅ Jump to keeps the drawer OPEN (new behavior)
✅ URL carries ?focus= after jump — …?focus=a1
✅ conversation splitter drags (column resizes) — before=420 after=280
✅ tree splitter drags (column resizes) — before=1219 after=1098
✅ Esc closes the drawer

ALL GREEN
```

`npm run typecheck` 全绿（server + web）。

## 备注

- Round-1 的 `verify-ui.mjs` 仍断言旧的「Jump to 关闭抽屉」行为，已被本轮行为变更取代；当前行为以本轮 `verify-3col-layout.mjs` 为准（按 round-N append-only 约定，不回改 round-1 历史脚本与截图）。
- 对话栏渲染全部非 meta 消息（不做窗口化），以保证 Jump 目标始终可定位；本地单用户工具，体量可接受。
