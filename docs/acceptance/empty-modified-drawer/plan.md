# 空修改文件抽屉保留三栏框架

## 症状

打开「修改的文件」弹窗（`ModifiedFilesDrawer`）时，若本会话没有修改任何文件
（`count === 0`），整个弹窗塌成一句居中提示「本次会话没有修改任何文件。」，
左侧对话栏与三栏框架全部消失。

## 根因

`web/src/components/ModifiedFilesDrawer.tsx` 用两个互斥分支渲染主体：

- `count === 0` → 只渲染一句 `session.modified.empty` 段落；
- `count > 0` → 渲染三栏布局（对话 | 内容 | 文件树）。

于是零文件时三栏框架（含承载对话的左栏）被整体跳过。

## 同根因

仅此一处分支。对话栏、文件树栏、内容栏共用同一个 `count > 0` 守卫，三者一起被吞掉。

## 修复

`ModifiedFilesDrawer.tsx`：

1. 合并两个分支——主体改为 `!loading && !error` 即渲染三栏框架，删掉独立的
   `count === 0` 段落。左侧对话栏、两条分割线、右两栏表头一律保留。
2. 中间内容栏的空态文案按 `count` 区分：`count === 0` 用
   `session.modified.empty`（「本次会话没有修改任何文件」），否则沿用
   `session.modified.selectFile`（「从左侧选择一个文件」）。
3. 右侧文件树栏在 `tree` 为空时 `<ul>` 自然不渲染任何行 —— 即「无内容」，
   无需改动，符合「右侧两部分没有内容」的要求。

复用既有 i18n key（`session.modified.empty`），无新增文案。

## 验证

`scripts/verify-empty-drawer.mjs`：隔离 HOME 起后端 + 内置 SPA，种一个**只有对话、
无任何文件编辑**的会话，打开抽屉断言：三栏表头 + 两条分割线在、左栏渲染对话、
中栏显示空态文案、列顺序正确、Esc 可关闭。证据见 `round-1.md`。
