# 验收报告 — Modified files 右侧抽屉 + IDE 目录树 + 内容查看

**状态：全绿 ✅**　|　日期：2026-06-09　|　分支：`worktree-modified-files-drawer`

## 交付

会话详情页的"修改的文件"由内联可折叠表格改为 **masthead 触发 → 右侧滑出抽屉**：

- **左：IDE 目录树**——文件夹可折叠、单子链合并（`deep/nested`）、文件夹优先 + 字母序、
  行内显示操作数与错误点；顶部 collapse/expand all。
- **右：内容查看**——选中文件展示本次会话改动：`Write` 新内容全文、`Edit`/`MultiEdit`
  before/after diff（红/绿）、`NotebookEdit` 新 source；每个操作带工具/时间/errored·pending
  标记与"Jump to"。
- **跳转**复用既有 `?focus=` 滚动 + flash；点击后关抽屉聚焦时间线。

## 关键设计

- **内容数据源 = jsonl 的 tool_use input，复用客户端已加载的 `messages`**（route 建
  `editLookup: Map<toolUseId,{name,input}>`），**无新后端、不破 `isUnderClaudeRoot` 安全红线**
  （`file-history/` 文件名是 hash 反查不出路径，且禁读项目真实文件）。
- 超 `MAX_SESSION_MESSAGES=5000` 截断时缺失项**诚实提示**"内容不可用"，不静默跳过。

## 验证证据

| 验证 | 命令 | 结果 |
|---|---|---|
| 类型（双端） | `npm run typecheck` | ✅ tsc -b 无错 |
| Server 安全网 | `npm test` | ✅ 8 files / 54 tests |
| 生产构建 | `npm run build` | ✅ built（initial bundle 仍 ~34.6KB gz，无新增重依赖） |
| UI 端到端 | `scripts/verify-ui.mjs`（Playwright） | ✅ ALL GREEN 21/21（见 `round-1.md`） |

## 改动文件

- `web/src/components/ModifiedFilesDrawer.tsx`（新，抽屉+树+diff）
- `web/src/components/ModifiedFilesPanel.tsx`（删）
- `web/src/routes/SessionDetail.tsx`（触发按钮 + editLookup + 抽屉集成）
- `web/src/lib/i18n.ts`（en/zh 抽屉 key 增删）
- `.gitignore`（round-1 可再生 PNG 不入库）
- `docs/acceptance/modified-files-drawer/`（plan / round-1 / report / verify 脚本）
