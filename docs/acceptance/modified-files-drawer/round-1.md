# Round 1 — Modified-files drawer UI smoke

**Date:** 2026-06-09
**Script:** `scripts/verify-ui.mjs` (Playwright · headless Chrome · isolated throwaway HOME)
**Pre:** `npm run build`（dist/ 必须存在）

种子会话（`33333333-…`，cwd `D:\fake\mfd`）jsonl 含 5 个文件改动的 tool_use + 配套 tool_result：
`src/app.ts`(Edit) · `src/components/Button.tsx`(Write) · `deep/nested/only.ts`(Write) ·
`README.md`(MultiEdit×2) · cwd 外 `D:\other\outside.txt`(Write, **errored**)。

## 结果：ALL GREEN（21/21）

| # | 断言 | 结果 |
|---|---|---|
| 1 | masthead 触发按钮渲染 | ✅ |
| 2 | 触发按钮显示文件计数（5） | ✅ `MODIFIED FILES 5` |
| 3 | 抽屉从右侧打开 | ✅ |
| 4 | 树显示 `src` 文件夹 | ✅ |
| 5 | 单子链合并 `deep/nested` | ✅ |
| 6 | 文件叶子 `Button.tsx` | ✅ |
| 7 | 文件叶子 `README.md` | ✅ |
| 8 | cwd 外文件 `outside.txt` | ✅ |
| 9 | Write 全文渲染（`WRITE_BUTTON_BODY`） | ✅ |
| 10 | Edit diff before（`OLD_APP_VALUE`） | ✅ |
| 11 | Edit diff after（`NEW_APP_VALUE`） | ✅ |
| 12 | MultiEdit `edit 1` 标签 | ✅ |
| 13 | MultiEdit 改动值（`NEW_HEADING`） | ✅ |
| 14 | errored 徽章在 detail（`1 errored`） | ✅ |
| 15 | cwd 外文件显示 `absolute path` | ✅ |
| 16 | collapse all 收起嵌套叶子 | ✅ |
| 17 | expand all 恢复嵌套叶子 | ✅ |
| 18 | Jump to 关闭抽屉 | ✅ |
| 19 | Jump 后 URL 带 `?focus=` | ✅ `?focus=a1` |
| 20 | Esc 关闭抽屉 | ✅ |

> 截图 `round-1/m01..m06-*.png`（可再生，已 gitignore；跑脚本重生成）。

## 复跑

```pwsh
npm run build
node docs/acceptance/modified-files-drawer/scripts/verify-ui.mjs
```
