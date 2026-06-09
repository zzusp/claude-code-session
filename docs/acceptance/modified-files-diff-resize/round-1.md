# Round 1 — PASS

跑 `node docs/acceptance/modified-files-diff-resize/scripts/verify-ui.mjs`（隔离 HOME 起后端 +
内置 SPA + Playwright/Chrome headless），**18/18 全绿**：

```
✅ drawer opens
✅ drawer is wide (~1280px cap, was 900) — 1280px
✅ diff: before column header
✅ diff: after column header
✅ diff: old value present
✅ diff: new value present
✅ diff: before is left of after (side-by-side) — before.x=456 after.x=911
✅ detail header has "open file" button
✅ tree rows carry an open button (per file) — 2 buttons
✅ long filename rendered untruncated
✅ tree scrolls horizontally for long names — scrollW=726 clientW=300
✅ splitter present
✅ drag right widens the tree rail — 300 → 441
✅ drag left narrows the tree rail — 441 → 281
✅ open-file: 403 without Origin — status 403
✅ open-file: 400 without filePath — status 400
✅ open-file: 400 for non-member path — status 400
✅ open-file: 404 for member missing on disk — status 404

ALL GREEN
```

证据截图：
- `round-1/e01-split-diff.png` —— 左 `− BEFORE`（红）/ 右 `+ AFTER`（绿）双栏，行号 gutter，
  line1/line3 不变、第 2 行左红 `OLD_APP_VALUE` 右绿 `NEW_APP_VALUE` 对齐；头部 `OPEN FILE` 按钮。
- `round-1/e02-rail-widened.png` —— 拖动后树栏变宽、分割线高亮、内容区相应收窄、布局完好。

另：`npm run typecheck`、`npm run build`、`npm test`（54/54）均通过。
