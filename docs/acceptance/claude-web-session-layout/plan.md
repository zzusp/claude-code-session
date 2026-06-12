# 会话页布局对齐 claude.ai/code（标题面包屑 + 去删除 + 底部信息栏）

## 需求（用户三点 + docs/tmp 参考图）

参考 claude.ai/code 的会话页（`docs/tmp/session_details.png`）：

1. **会话标题展示改成参考页一致** —— 顶部面包屑 `🖥 项目名 / 会话标题`（画布上内联、不套卡片），而非原来的「面包屑 + 大号衬线标题卡片 + MetaLine」三段式。
2. **去掉会话页的删除按钮** —— 删除改走项目管理页（原有）或左侧 Recents（本次新增悬浮删除）。
3. **元信息移到底部** —— 修改的文件、分支、文件夹、模型、大小、版本、开始时间等放进底部信息栏。

## 改动

**`web/src/routes/SessionDetail.tsx`**（重排，纯表现层，不动数据/轮询/滚动跟随逻辑）：
- 顶部：移除 `<Breadcrumbs>` + 大号 `ChatHeader` 标题卡 + `MetaLine`，改成 `SessionTitleBar`——live beacon + `MonitorIcon` + 项目链接 + `/` + 可编辑会话标题（保留 hover 重命名铅笔）。标题字号从 18/19px 降到 15px 面包屑级，去掉尾部 accent dot。标题栏 + 搜索行合成一个 sticky-top 玻璃条（无卡片盒）。
- 底部：新增 `SessionFooter`（sticky-bottom 玻璃条）——左侧 `dl` 自适应换行放 文件夹(cwd)/分支(gitBranch)/模型/大小/消息数/版本/开始时间，右上角固定「修改的文件」文件卡（FileThumb + 计数）。模型从消息列表派生（取最后一条 assistant 的 model）。
- 删除：移除 `DeleteDialog` 用法 + `showDeleteDialog`/`deleteTooltip`/`navigate`，删 `ChatHeader`/`MetaLine`/`Fact`/`TrashIcon`，新增 `MonitorIcon`/`FolderGlyph`/`BranchGlyph`/`ModelGlyph`。
- **effort / 真·上下文 token 我们没有**（SessionMeta 无此字段），未编造；用 `bytes`（会话大小）作「上下文大小」近似。

**`web/src/components/Sidebar.tsx`**：Recents 行加悬浮删除——行重构成 `div.group.relative` 包 `Link`(pr-8) + 绝对定位的垃圾桶按钮（group-hover 显形）。点击开 `DeleteDialog`，**`createPortal` 到 `document.body`**（侧栏 `<aside>` 的 transform 会困住 fixed overlay，见记忆 sidebar-overlay-needs-portal）。DeleteDialog 已内置 recents 查询失效化 + 活跃会话跳过保护。

## 验证

- `npm run typecheck` ✓（0 error）｜ `npm run build` ✓ ｜ `npm test` ✓（9 files / 61 tests 全绿）
- 真机截图（Playwright，生产构建 + `npm start` 读真实 `~/.claude`）+ DOM probe，证据见 `round-1/`：
  - `titlebar.png` — 顶部面包屑 `🖥 claude-code-session / claude web ui styling refactor ✎`
  - `footer-light.png` / `footer-dark.png` — 底部信息栏：文件夹/分支(HEAD)/模型(claude-opus-4-8)/大小/消息数/版本/开始时间 + 修改的文件卡(计数)
  - `sidebar-hover.png` — Recents 行悬浮露出垃圾桶
  - `delete-dialog.png` — 删除弹窗 portal 居中（`inAside:false`、满视口）；当前 live 会话被安全网正确跳过（"运行中 PID …"）
  - DOM probe：`hasDelete:false`（会话页无删除按钮）、footer 含全部字段、title=会话标题
