# 验收报告 — 修改文件抽屉：对话落底 + 分屏 diff + 文件名变更色

**状态：全绿（Round 1 一次通过）**

## 三项需求 → 实现 → 证据

| 需求 | 实现（`web/src/components/ModifiedFilesDrawer.tsx`） | 证据 |
|---|---|---|
| 对话默认展示底部最新、不全量 | `visibleCount`（初值 20）只渲染尾部；`useLayoutEffect` 挂载滚到底；顶部「显示更早 N 条」按 40 步长展开，保持离底距离；`jump()` 命中折叠区先全量展开再滚动 | 打开即 `scrollTop==max`、首条不在 DOM、展开可见 |
| 中间改左右分屏对比 | `SplitDiff`/`SplitLine` + `toSplitRows()`：旧→左栏、新→右栏，del[x]↔add[x] 配对，多出一侧 empty 占位；两栏 `whitespace-pre` 行级对齐；保留 word-level 行内高亮 | 旧值 x=605 < 新值 x=970 |
| 右侧文件名按变更类型着色 | `fileChangeType()`（首操作 Write/NotebookEdit + structuredPatch 空数组 = added，否则 modified）+ `changeToneClass()`：added→moss 绿、modified→accent 琥珀；A/M 字母徽章；errored 仍优先红点 | app=琥珀、Button=绿，两色不同 + A/M 徽章 |

## 验证

- `npm run typecheck` ✅ · `npm test` ✅ 61 passed · `npm run build` ✅
- `scripts/verify-split-diff.mjs` ✅ 13/13 ALL GREEN（详见 `round-1.md`）

## 范围

仅前端：`ModifiedFilesDrawer.tsx` + `i18n.ts`（新增 `showEarlier`/`added`/`modified` 中英文案）。wire 协议、server、删除/导入安全网均未触碰。本工具集（Edit/Write/MultiEdit/NotebookEdit）无删除语义，故变更类型只有 added / modified，无 deleted。
