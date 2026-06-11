# 验收报告 — 空修改文件抽屉保留三栏框架

状态：**全绿**（matrix.csv 9/9 PASS，round-1 ALL GREEN）

## 需求

打开「修改的文件」弹窗时，若本会话没有修改任何文件，对话部分要保留、页面三栏框架
要保留，只是右侧两部分（内容栏 / 文件树栏）没有内容。

## 改动

- `web/src/components/ModifiedFilesDrawer.tsx`
  - 合并 `count === 0` / `count > 0` 两个互斥分支为单一 `!loading && !error` 守卫，
    三栏框架（对话栏 + 两条分割线 + 右两栏）零文件时照常渲染。
  - 中间内容栏空态文案按 `count` 区分：零文件用 `session.modified.empty`，
    否则沿用 `session.modified.selectFile`。
  - 右侧文件树栏 `tree` 为空时自然不渲染行，即「无内容」，无需改动。

复用既有 i18n key，无新增文案。`npm run typecheck` 通过。

## 验证

- `npm run typecheck`：通过。
- `node docs/acceptance/empty-modified-drawer/scripts/verify-empty-drawer.mjs`：ALL GREEN（9/9）。
- 截图 `round-1/empty-three-columns.png` 视觉确认三栏框架完整、左栏对话渲染、右两栏空。
