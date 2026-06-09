# 修改文件抽屉：对话默认底部 + 分屏 diff + 文件名变更色

## 需求

1. **对话栏默认落底 + 不全量渲染**：弹窗打开时对话栏滚到底部（最新一条），且默认只渲染尾部最新 N 条（N=20），更早的折叠在顶部「显示更早」按钮后逐批展开。
2. **中间文件变更改为左右分屏对比**（GitHub PR changes 页面的 split 视图）：左栏旧（删除），右栏新（新增），两栏行级对齐；保留行内 word-level 高亮。
3. **右侧文件名按变更类型着色**：新增（A，moss 绿）/ 修改（M，accent 琥珀）区分；errored 仍优先红点。

## 改动

- `web/src/components/ModifiedFilesDrawer.tsx`
  - 对话栏：`visibleCount` 状态（初值 20，步长 40），`useLayoutEffect` 挂载滚到底；`showEarlier()` 展开并保持离底距离；`jump()` 命中折叠区时先全量展开再滚动。顶部「显示更早 N 条」按钮。
  - diff：`UnifiedDiff/UnifiedLine` → `SplitDiff/SplitLine` + `toSplitRows()`（统一行 → 分屏行，del[x]↔add[x] 配对，多出一侧 empty 占位）。两栏各自横向滚动，纵向因每行 `whitespace-pre` 恒一行高而对齐。
  - 着色：`fileChangeType()`（首个操作是 Write/NotebookEdit 且 structuredPatch 为空数组 → added，否则 modified）+ `changeToneClass()`；树行文件名/图标/`A·M` 字母 + 明细头文件名同步着色。
- `web/src/lib/i18n.ts`：`session.modified.showEarlier` / `.added` / `.modified`（zh + en）。

## 验证

- `npm run typecheck` ✅ / `npm test` ✅ / `npm run build` ✅
- `scripts/verify-split-diff.mjs`（Playwright，隔离 HOME 种子会话）：对话默认底部 + 折叠/展开、分屏左右定位、A/M 着色区分。证据见 `round-1/`。
