# Round 2 — structuredPatch 驱动的统一 diff

## 症状

「修改的文件」抽屉里：

1. **新增文件（Write）的内容没有着色** —— `Write` / `NotebookEdit` 走 `CodeBlock` 渲染成纯文本，全程无绿色。
2. **删除的内容没有着色** —— 覆盖式 `Write` 把旧文件整段替换，被删除的旧内容根本不展示（更谈不上红色）。
3. **行号不准确** —— diff 只用 tool **输入**（`old_string` / `new_string` / `content`）跑前端 LCS，行号是片段内从 1 起的相对值，不是真实文件行号；也不会省略未改动区。

## 根因

渲染数据源用错了。Edit/Write 的真实 diff（带准确文件行号 + 折叠未改动区）由 Claude Code 记录在会话 jsonl 里 user 消息顶层的 `toolUseResult.structuredPatch`（hunk：`oldStart/oldLines/newStart/newLines` + 前缀 ` `/`-`/`+` 的 `lines`），但抽屉完全没用它，只拿了 tool 输入。

## 改动

- `shared/types.ts`：新增 `DiffHunk`，`ModifiedFileOperation` 增加 `structuredPatch: DiffHunk[] | null`（`[]`=全新文件 create；`null`=仍 pending / 被截断）。
- `server/lib/modified-files.ts`：扫描 jsonl 时按 `tool_use_id` 收集同一行的 `toolUseResult.structuredPatch`（`extractStructuredPatch`），挂到每个 operation。
- `web/src/components/ModifiedFilesDrawer.tsx`：把左右分栏 split view（`DiffView`/`DiffPane`/`DiffLine`/`CodeBlock`/`buildSplitRows`）整体换成 **GitHub 风格统一视图**（`UnifiedDiff`/`UnifiedLine` + `rowsFromHunks`/`rowsFromStrings`）：单栏、旧/新两个行号 gutter、红删/绿增/灰上下文、hunk 之间折叠成「N unchanged lines」gap 行。有 `structuredPatch` 用真实行号；create / 仍 pending 时退回从输入文本生成（全绿 / 相对行号）。
- `web/src/lib/i18n.ts`：新增 `session.modified.linesOmitted`，删除不再使用的 `before` / `after`。

## 验证

### 自动化（Round-2 脚本）

`scripts/verify-unified-diff.mjs` —— 隔离 HOME 起后端 + 构建好的 SPA，用 Playwright 驱动抽屉，颜色用 `getComputedStyle` 解析（兼容 `rgb()` 与 `oklch()` 色相）客观判定。

再生成（产物 PNG 不入库，`.gitignore` 已排除 `round-2/*.png`）：

```bash
npm run build
node docs/acceptance/modified-files-drawer/scripts/verify-unified-diff.mjs
```

全绿断言（11/11）：

- ✅ 真实文件行号 120 出现在 gutter（证明不是片段内从 1 重排）
- ✅ 未改动区折叠成「unchanged lines」gap 行
- ✅ 删除行文本显示且底色为红（`oklch(0.94 0.052 30)`）
- ✅ 新增行文本显示且底色为绿（`oklch(0.93 0.045 140)`）
- ✅ Write create 新文件内容整段绿
- ✅ Write 覆盖被删除的旧内容显示且为红

### 回归

- `scripts/verify-ui.mjs`（Round-1，无 structuredPatch 的兜底路径）：20/20 全绿。
- `npm run typecheck`：clean。
- `npm test`：61/61 passed（新增 `modified-files.test.ts` 一例：structuredPatch 透传 / create→`[]` / 缺失→`null`）。
