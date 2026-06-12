# 文件展示对齐 claude.ai artifact 文件卡

## 需求

用户给了一个登录态 claude.ai 对话页（带 cookie 免登录），要求「注意文件的展示」并一比一对齐。用 Playwright 带 cookie 打开真实页面、直接读 DOM + computed style（非靠截图估色），定位到 claude.ai 的**文件展示 = artifact block（文件卡）**：消息内联的可点击文档卡。

## claude.ai 文件卡真实规格（从 DOM 提取）

- 外壳 `group/artifact-block`：`rounded-lg`(8px) + `border 1px rgba(31,31,30,0.15)`(border-300) + `px-4`，透明底；hover→`bg-bg-000/50` + 边框转深 `rgba(31,31,30,0.3)`(border-200)；高 ~72px
- 左侧**倾斜纸张缩略图** `52×71px`：`rounded-t-lg` + `border-0.5 border-200`，`-rotate-0.1rad`(~-5.7°)，底部 `bg-gradient from-bg-000 to-transparent`（纸张渐隐），内嵌 Phosphor `file-text` SVG（`text-500` 灰）；hover→`scale-1.035` + 回正 `-rotate-0.065rad`，弹性 `cubic-bezier(0,0.9,0.5,1.35)`
- 中间：标题 `text-sm line-clamp-1` + 副标题 `text-xs text-400`「Document · MD」（分隔符 `opacity-50`）
- 右侧：Download 图标按钮；整卡一个隐形 `<button aria-label="View …">` 覆盖点击
- 字体 Anthropic Sans，画布 `#F8F8F6`

## 落点（用户选「两者都做」）

我们 app 里文件出现在：会话内文件操作工具块、Modified files 三栏视图（密集树，不适合卡片）、会话头 Modified files 入口。用户选定落到 **① 工具块折叠态 + ② 会话头入口**。

## 改动

**新增 `web/src/components/FileThumb.tsx`**（2 处复用，符合复用原则）：claude.ai 风倾斜纸张缩略图，紧凑两档 `sm`(20×26)/`md`(26×34)，内嵌从 claude.ai 抓到的真实 Phosphor `file-text` path；hover 由祖先 `group/file` 驱动，回正 + `scale-105` 抬升。

**`web/src/components/ToolBlock.tsx`**：`ToolUseBlock` 对文件操作工具（`Read/Write/Edit/MultiEdit/NotebookEdit`，`fileOpOf` 识别）折叠态渲染成文件卡——`rounded-control` 边框卡（透明底，hover 边强 + 沉底）+ `FileThumb` + 文件名标题 + `工具名 · 扩展名` 副标题 + 展开 caret；展开体仍是原 diff/JSON。非文件工具维持原沉底折叠行。卡高 ~36px（紧凑，避免会话里几十个块撑高时间线）。

**`web/src/routes/SessionDetail.tsx`**：会话头「Modified files」按钮从大写描边按钮改成紧凑文件卡——`FileThumb size="sm"` + 标题 + 计数 badge，hover 缩略图抬升；移除不再用的 `FilesIcon`。

**坑**：Tailwind v4 用独立 `rotate`/`scale`/`translate` CSS 属性（非 `transform` 简写，computed `transform: none` 佐证），`transition-transform` 不会给悬浮抬升补间——改用 `transition-all` 才平滑。

## 验证

- `npm run typecheck` ✓（0 error）
- `npm run build` ✓
- `npm test` ✓（9 files / 61 tests 全绿，纯表现层）
- 真机截图（Playwright，生产构建 + `npm start` 读真实 `~/.claude`，2× DPI），证据见 `round-1/`：
  - `fc2-stream.png` — light 流内文件卡：`SessionDetail.tsx` / `Edit · TSX` + 倾斜缩略图 + caret
  - `fc-dark-stream.png` — dark 流内文件卡：`fc-light-cards.png` / `Read · PNG`
  - `fc-light-header.png` — 会话头「修改的文件」文件卡 + 计数 15
  - `fc2-hover.png` — 悬浮：底色加深 + 边框转强 + 缩略图回正放大
  - DOM 核验：12 个文件卡渲染、卡高 36px、缩略图 20×26 / `rounded-t 6px` / 渐变底
