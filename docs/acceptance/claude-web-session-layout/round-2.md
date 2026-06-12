# round-2 — 会话页搜索/过滤器交互精简

承接 round-1（标题面包屑 + 去删除 + 底部信息栏），按用户反馈进一步精简会话页工具区。

## 需求

1. 搜索组件一拆为二：搜索框默认收起，标题行右侧只保留一个搜索按钮，点击才展开搜索框。
2. 过滤开关「系统 / 仅我 / 错误」移到页面底部（或去掉）。
3. 消息计数（shown/total）去掉或换地方，比如塞到「加载更早(+n)」旁。

## 改动（`web/src/routes/SessionDetail.tsx`）

- 移除常驻的 `FilterRow`，拆成：
  - `SessionTitleBar` 右侧加一个搜索切换按钮（`SearchIcon`，`aria-expanded`，展开时 coral 高亮）。新增 `searchOpen` state；URL 带 `?q=` 深链时自动展开。
  - 新组件 `SearchReveal`（点击后条件渲染在标题栏下）：仅搜索输入框 + 实时结果计数（有 query 时）+ 关闭按钮；`autoFocus`、Esc 关闭、关闭时清空 query。
- 「系统 / 仅我 / 错误」三个 `ToggleSwitch` 移入 `SessionFooter`（与「修改的文件」卡同排，底部第二行）。
- shown/total 计数：从工具区移到「加载更早(+n)」按钮旁；搜索态下另在 `SearchReveal` 内显示。

## 验证

- `npm run typecheck` ✓ ｜ `npm run build` ✓ ｜ `npm test` ✓（9 files / 61 tests 全绿）
- 真机截图（Playwright，生产构建 + `npm start` 读真实 `~/.claude`），证据见 `round-2/`：
  - `search-collapsed.png` — 默认：标题行右侧仅一个搜索图标按钮
  - `search-open.png` — 点击后：按钮 coral 高亮 + 下方展开搜索框（输入 "server" → 计数 31/31 + 关闭）
  - `footer-toggles-light.png` / `footer-toggles-dark.png` — 底部 bar 第二行：系统/仅我/错误 + 修改的文件卡
  - `load-earlier-count.png` — 「加载更早 (+50)  50 / 737」计数贴按钮旁
