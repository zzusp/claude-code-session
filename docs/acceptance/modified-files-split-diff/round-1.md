# Round 1 — ALL GREEN

跑 `node docs/acceptance/modified-files-split-diff/scripts/verify-split-diff.mjs`（隔离 HOME 种子 65 条消息会话 + 1 个 Edit「修改」+ 1 个 Write「新增」）。

```
✅ drawer opens
✅ latest message visible by default
✅ earliest message collapsed (not in DOM)
✅ "show earlier" button present
✅ conversation scrolled to (near) bottom on open — top=1225 max=1225
✅ one "show earlier" click renders MORE messages
✅ after fully expanding, the earliest message is rendered
✅ "show earlier" button is gone once everything is shown
✅ split diff shows both old and new
✅ old value sits LEFT of new value (side-by-side) — old.x=605 new.x=970
✅ modified vs added file names use DISTINCT colors — app=oklch(0.32 0.09 60) button=oklch(0.55 0.068 145)
✅ modified file shows "M" badge
✅ added file shows "A" badge

ALL GREEN
```

## 结论对应

1. **对话默认底部 + 折叠**：打开即 `scrollTop == max`（1225/1225）落到最新；首条 `EARLY_MARKER_FIRST` 初始不在 DOM，`LATEST_MARKER` 可见；「显示更早」逐批展开、全展后按钮消失。
2. **分屏 diff**：选中 `app.ts`，旧值 `OLD_APP_VALUE`（x=605）位于新值 `NEW_APP_VALUE`（x=970）左侧 → 左右对比成立。
3. **文件名变更色**：`app.ts`（修改）= accent-ink `oklch(0.32 0.09 60)` 琥珀；`Button.tsx`（新增）= moss `oklch(0.55 0.068 145)` 绿，两色不同；A/M 字母徽章各自出现。

截图：`round-1/s01-conversation-bottom.png`、`s02-split-diff.png`、`s03-filename-colors.png`。

## 旁路验证

`npm run typecheck` ✅ 0 error · `npm test` ✅ 61 passed · `npm run build` ✅。
