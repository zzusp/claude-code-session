# Modified files → 右侧抽屉 + IDE 目录树 + 内容查看

## 需求

会话详情页原本用一个内联可折叠表格（`ModifiedFilesPanel`）展示"本次会话改过哪些文件"。
改为：

1. 从 masthead 触发按钮（带文件计数）**右侧滑出抽屉**。
2. 抽屉左侧是 **IDE 式目录树**：文件夹可折叠、单子链合并（`a/b`）、文件夹优先 + 字母序、行内显示操作数与错误点，信息密度高。
3. 抽屉右侧 **打开查看内容**：选中文件展示本次会话对它的改动——
   - `Write` → 新内容全文；
   - `Edit` → before/after diff；
   - `MultiEdit` → 每个 edit 的 diff；
   - `NotebookEdit` → 新 source。
4. 保留"跳转到消息"（点击后关抽屉并高亮对应消息）。

## 方案

- **数据源（安全红线）**：内容唯一安全来源是 jsonl 里 tool_use 的 `input`（`file-history/<sid>/`
  文件名是 hash 反查不出路径；读项目真实文件违反 `isUnderClaudeRoot`）。这些 input 客户端已经有了——
  session detail 查询返回的 `messages[].blocks[]` 里的 tool_use 自带完整 input（`load-session.ts:154-161`）。
  → **无需新后端**。route 用 `messages` 建 `editLookup: Map<toolUseId,{name,input}>` 传给抽屉。
- **截断降级**：`MAX_SESSION_MESSAGES = 5000`，超出时晚期编辑的 tool_use 不在 messages 中，
  抽屉对缺失项诚实显示"改动内容不可用（会话被截断）"，不静默跳过。
- 复用既有 `GET /modified-files` 聚合接口（提供树结构 + 计数 + 跳转所需 messageUuid）。

## 改动

- `web/src/components/ModifiedFilesDrawer.tsx`（新）：抽屉 + 目录树（`buildTree` + 单子链合并 +
  文件夹优先排序）+ master-detail 内容区（`DiffView` / `CodeBlock`）。删除旧
  `web/src/components/ModifiedFilesPanel.tsx`。
- `web/src/routes/SessionDetail.tsx`：移除内联面板；route 级拉 modified-files query + 由
  `data.messages` 建 `editLookup`；masthead 加触发按钮（带计数 + `FilesIcon`）；条件渲染抽屉，
  Jump 时关抽屉并写 `?focus=`。
- `web/src/lib/i18n.ts`：en/zh 新增抽屉 key（close/collapseAll/expandAll/selectFile/before/after/
  newContent/editN/contentUnavailable/noContent/openAria），删除随面板移除的死 key
  （subtitle/expand/collapse/col.ops/col.range/col.jump/opSummary*/jumpAria）。

## 验证

- `npm run typecheck`（双端）+ `npm test`（server 安全网 54 项）。
- `npm run build`（Vite 生产构建）。
- Round-1：`scripts/verify-ui.mjs`（Playwright，隔离 HOME，种入含 Edit/Write/MultiEdit +
  嵌套目录 + cwd 外 errored 文件的会话）驱动真实 UI：触发→抽屉打开→树渲染（含单子链合并）→
  点文件看 diff/全文→Jump 关抽屉→Esc/关闭。截图存 `round-1/`。
