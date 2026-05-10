# Memory Page Redesign — v2

**Status**: implemented (2026-05-10)
**Date**: 2026-05-10
**Supersedes**: [`memory-page-redesign.md`](./memory-page-redesign.md) (v1, 2026-05-04 双栏 sticky 索引方案；本次 v2 实施前线上代码已演进过两轮，最终落地为下文方案)
**Scope**: `/projects/:id/memory` 路由整体改版，`web/src/routes/ProjectMemory.tsx` 重写，`web/src/index.css` 增加类型色调 utility / 抽屉动画。
**Non-scope**: 新增 / 编辑 / 删除 / 重命名记忆条目（仍只读）；server API 不动；`shared/types.ts` 不动；不引入 markdown 渲染依赖。

## 现状与问题（改版前的 list/reader 双栏版）

当前页是 list/reader 双栏：左 320–360px ribbon-row 列表 + 右 reader pane，工具条 sticky（搜索 + 6 个类型 pill + 排序）。

具体问题：
1. **范式像通用文件浏览器**——记忆是"知识卡片"，list+reader 把它压成 Outlook 邮件式形态，扫不出"Claude 在这个项目里都记住了什么"。
2. **`MEMORY.md` 双重身份混乱**——既是左列表的伪条目，又是右栏的一种视图模式，"Appears in MEMORY.md as" 提示块直接秀 raw markdown 链接给用户看。
3. **类型缺颜色锚点**——user / feedback / project / reference 同色描边 tag。
4. **元信息密度 / 字号过碎**。
5. **空状态只有一句话兜底**。

## 目标

- 打开页面第一眼能看到所有记忆——Claude 在这个项目里记住了多少 / 哪几类 / 各自大致讲什么——不需要二次点击。
- `MEMORY.md` 索引就是这页的"目录"，不是另一个视图模式；自由文本 / heading / 死链都按用户自己写的样子保留。
- 类型有颜色语义但不喧宾夺主，保持 editorial 调性，复用既有 OKLCH token，不引入新色板。
- URL 可深链（分享 / 刷新保持选中条目）。
- 不引入新依赖，不依赖客户端 markdown 渲染。

## 非目标

- 不新增 CRUD（用户明确不要）。
- 不引入富文本编辑器、markdown 渲染库（用户在 v2 试做后明确不要 markdown 真渲染 / Why·How 高亮，希望抽屉里就是原文 monospace）。
- 不动 server API、不动 wire 协议。
- 不引入色板 / 设计系统级新增 token。

## 信息架构

```
/projects/:id/memory                   首屏：单张记忆索引卡片
/projects/:id/memory?entry=<filename>  抽屉打开某条目
/projects/:id/memory?view=raw          抽屉显示 MEMORY.md 原文
```

URL 不再用 `?entry=__index__` 这种伪 key——index 走独立 `?view=raw`，语义清晰。深链刷新能直接定位到抽屉态。

## 主方案：单张"记忆索引"卡片 + 右侧抽屉阅读

整页结构：

```
┌─ Breadcrumbs ──────────────────────────────────────────────────────┐
│                                                                    │
│  PageHeader                                                        │
│    eyebrow:  /D--project-claude-code-session                       │
│    title:    Memory                                                │
│    meta:     12 entries · 4 types · last update 3d ago             │
│                                                                    │
│  ╔══════════════════════════════════════════════════════════════╗  │
│  ║  MEMORY 索引                                  view raw  ↗   ║  │
│  ║  MEMORY.md                                                   ║  │
│  ║                                                              ║  │
│  ║  🔍 Search title, hook or body…                12 entries    ║  │
│  ║  · · · · · · · · · · · · · · · · · · · · · · · · · · ·       ║  │
│  ║                                                              ║  │
│  ║  MEMORY INDEX                                                ║  │  ← MD heading
│  ║  ●  UI 验证默认走 Playwright            [feedback]  ↗       ║  │  ← entry row
│  ║     浏览器/UI 端到端验证默认写 .mjs 脚本…                    ║  │
│  ║     feedback_ui_test_runner.md · 1.4 KB · 3d ago             ║  │
│  ║                                                              ║  │
│  ║  USEREMAIL                                                   ║  │
│  ║  The user's email address is …                               ║  │  ← free text
│  ║                                                              ║  │
│  ║  ───── Not in index · 2 ───────                              ║  │  ← 孤儿区
│  ║  ●  Stale memory                          [other]    ↗       ║  │
│  ╚══════════════════════════════════════════════════════════════╝  │
└────────────────────────────────────────────────────────────────────┘
```

抽屉打开后：

```
┌─ 索引卡 暗化 (overlay 0.4) ─────────┬─ Drawer (max-w-[640px]) ────┐
│                                      │  ┌──────────────────── × ┐ │
│   PageHeader (灰)                    │  │ [feedback]              │ │
│   ╔════════════════════════╗         │  │ UI 验证默认走 Playwri… │ │
│   ║ MEMORY 索引            ║         │  │ feedback_ui_test_…md   │ │
│   ║                        ║         │  │ 1.4 KB · 3d ago        │ │
│   ║ ●●● UI 验证 (active)   ║         │  ├────────────────────────┤ │
│   ║                        ║         │  │ description             │ │
│   ╚════════════════════════╝         │  │  ┌──────────────────┐  │ │
│                                      │  │  │ pre / mono / wrap │  │ │
│                                      │  │  │ 项目内任何需要 UI   │  │ │
│                                      │  │  │ 行为验证的任务…     │  │ │
│                                      │  │  │ **Why:** 2026-05-08│  │ │  ← 原文文本
│                                      │  │  │ ...                │  │ │
│                                      │  │  └──────────────────┘  │ │
│                                      │  ├────────────────────────┤ │
│                                      │  │ INDEX HOOK              │ │
│                                      │  │ — 浏览器/UI 端到端…     │ │
│                                      │  └────────────────────────┘ │
└──────────────────────────────────────┴─────────────────────────────┘
```

### 关键组成

#### 1. 单张 "记忆索引" 卡片 (`#memo-index-card`)

- 头部：eyebrow `MEMORY 索引` / `Memory index`，title `MEMORY.md`，右上 `view raw ↗` 切换抽屉显示原文。
- 中部：搜索输入框 + 当前计数（`12 entries` / 搜索激活时 `n / total`）。
- 分隔线：`rule-dotted`。
- 列表：把 MEMORY.md 解析后的每一行渲染为一种 `Row`，按原顺序：

  | Row 类型     | 来源                                           | 渲染                                           |
  |---           |---                                             |---                                             |
  | `entry`      | MEMORY.md 的 `[title](filename.md) — hook` 行  | 可点击行，左色点 + 标题 + chip + hook + 元信息 |
  | `missing`    | 同上但 entries 中无该文件                      | 灰化 line-through，仍可见，不可点击            |
  | `heading`    | MEMORY.md 中 `#…######` 开头行                 | mono small-caps eyebrow（如 `MEMORY INDEX`）   |
  | `text`       | MEMORY.md 中既非 link 也非 heading 的非空行    | muted plain text，等宽字体保留排版             |
  | `spacer`     | MEMORY.md 中的空行                             | 2px 高的空隙                                   |

- **孤儿区**：entries 中存在但 MEMORY.md 中未出现的条目，自动归到尾部 `Not in index · N` 弱化分隔线下面，仍是可点击的 entry 行。没有孤儿则不渲染该区。

- **搜索激活时**：仅渲染匹配的 entry 行（heading / text / spacer / 孤儿区都收起，避免空段），无匹配显示 "No entries match"。计数自动切到 `n / total`。

- **没有 `MEMORY.md`**：head 区的 `view raw ↗` 隐藏，列表区直接展示孤儿区（即所有 entries）。

#### 2. 类型颜色锚点（不引入新 token）

| Type       | 色调来源                  | 用法                                   |
|---         |---                        |---                                     |
| user       | `--color-iris`            | 行左 2px 色点 + chip 软底              |
| feedback   | `--color-accent`          | 同上                                   |
| project    | `--color-moss`            | 同上                                   |
| reference  | `--color-fg-muted`        | 弱化色，外链类语义低饱和               |
| other      | `--color-fg-faint`        | 未分类 fallback                        |

类型 chip 通过 `color-mix(in oklch, var(--memo-tone) 18%, var(--color-surface))` 出软底，保证 light/dark 都可读。

#### 3. 行的可达性

- 每个 entry 行是 `<button type="button">`，`tab` 可达，`Enter` 打开抽屉。
- `Hover` / `focus-visible` → 整行 `--color-sunken` 浅底色，色点变饱和并缩放 1.2，右上角 `↗` 滑入。

#### 4. Drawer

- 右侧滑入抽屉，宽度 `min(640px, 92vw)`，背景 `--color-surface`，圆角 `--radius-panel`（仅左侧）。
- Backdrop 半透明 `--color-canvas / 0.4` + `blur(2px)`；点击 backdrop 关闭。
- 抽屉内容滚动独立；`<body>` scroll-lock。
- 抽屉头：类型 chip + 大标题（display 24px light）+ `filename.md · size · mtime`，关闭按钮 `×` / `Esc`。
- 抽屉正文：
  - 如果 entry 有 `description`（来自 frontmatter）：先渲染一段 `<p>` 作为副标题文。
  - body：`<pre class="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.65]">` 包住，`--color-sunken` 背景 + 1px hairline + `--radius-control` 圆角。**不渲染 markdown，不解析 Why / How 标识，原文等宽展示。**
  - 抽屉脚（仅在该条目出现在 MEMORY.md 时）：`INDEX HOOK` eyebrow + 原 hook 文本 + 跳回索引锚点的链接。
- URL：
  - 打开抽屉 → `setSearchParams({ entry })` 或 `{ view: 'raw' }`。
  - 浏览器后退按钮关闭抽屉。
  - 进入页面时 `?entry=...` 自动打开对应抽屉；找不到对应 entry → 抽屉显示 "not found" 状态。

#### 5. 空 / 半空状态

| 状态                          | 表现                                                                  |
|---                            |---                                                                    |
| 无 entries 也无 MEMORY.md     | 居中 hero：图标 + 标题 + 引导文，无操作按钮                           |
| 有 MEMORY.md 但 entries 为空  | 索引卡正常显示（含 `missing` 行），上方多一条 callout 提示 "孤儿索引" |
| 有 entries 但无 MEMORY.md     | 索引卡里只有孤儿区，head 区不显示 `view raw`                          |
| 索引中有死链                  | 该行 `missing` 渲染：灰化 line-through                                |

#### 6. PageHeader meta

- `条目数 N` + `类型 N`（type 集合 size）+ `最近更新 Xd ago`（所有 entries mtime 的最大值）。

## 视觉规范

### 字号层级（统一为 4 档）

- Display: 24px (drawer title) / 18px (索引卡 title) — `font-display font-light tracking-tight`
- Body: 14.5px / 14px（行 title / drawer description）
- Meta: 12.5px / 11px（hook 文本、description）
- Mono micro: 10.5–11px uppercase tracking — eyebrow / chip / footer

### 圆角

- 索引卡 / 抽屉里的 pre 容器 → `--radius-card` (20px) / `--radius-control` (12px)
- 抽屉外壳 → `--radius-panel` 28px（仅左两角）
- 行 hover 高亮区 → 0.65rem (~10px)，比 `--radius-control` 略小，看起来贴合行高

### 阴影 / 边框

- 索引卡：`surface-card` (`shadow-rise` + 1px hairline)
- 抽屉：`shadow-pop`
- 行无边框，只靠浅底 hover

### 动效

- 抽屉入场：`transform: translateX(100%) → 0`，280ms cubic-bezier(0.32, 0.72, 0, 1)
- Backdrop fade 200ms
- 行 hover transition 160ms
- Reduced motion：所有 transition 改为 0ms

## 数据合同

- 不动 `shared/types.ts`：`MemoryResponse { index: string | null; entries: MemoryEntry[] }` 已经够用。
- 客户端不解析 markdown，原文逐字呈现。

## 客户端实现要点

### 文件清单（最终）

- 重写：`web/src/routes/ProjectMemory.tsx`（单文件包含所有子组件：`IndexCard` / `RowItem` / `Drawer` / `EntryDrawerBody` / `RawDrawerBody` / `EmptyState` / `TypeChip` / SVG icons / `parseIndex` / `buildRows` / `matchEntry`）
- 改：`web/src/index.css`（新增 `.memo-type-*` 类型色 utility、`.memo-row*` 行样式、`.memo-chip` 软底 chip、`.memo-drawer-backdrop` / `.memo-drawer-panel` + 入场 keyframe）
- 改：`web/src/App.tsx`（`ProjectMemory` 改为 `lazy()` + Suspense fallback）
- 改：`web/src/lib/i18n.ts`（cover / drawer / empty / raw 等新 key，旧 list/reader key 保留待清）
- **不增加** `web/src/lib/markdown.ts`，**不增加** marked / dompurify 依赖。

### 状态管理

- URL 参数：`entry` / `view`（`raw`），由 `useSearchParams()` 驱动。
- 本地状态：`query`，session-scoped。
- 保留 `useQuery(queryKeys.projectMemory(id))`，无需新增 key。

### 解析

- `LINK_RE` 匹配 `^[\s*-]*\[title\](href)\s*[—–\-:]?\s*hook?$`。
- `buildRows()`：把 indexLines + entries 折叠成 `Row[]` + `orphans: MemoryEntry[]`。

### 键盘 / 可达性

- `Esc`：关闭抽屉。
- 行 `tabindex` 默认（`<button>`），`Enter`/`Space` 打开抽屉。
- 抽屉 `aria-modal="true"`，open 时 focus 抽屉容器。
- 索引卡链接 / 按钮均为真 `<button>`，键盘可访。

## 影响

- **新增 / 改写**：见上文文件清单。
- **不改动**：`shared/types.ts`、`server/`、其他路由、API。
- **依赖**：无新增（marked / dompurify 在试做后撤回）。

## 验收（已完成）

`docs/tmp/verify-memory-redesign.mjs` 跑过 12 项断言，含：

1. 索引卡渲染（`#memo-index-card`）。
2. 没有遗留的 `.memo-card` 网格元素。
3. 列表行 (`.memo-row`) 数量 ≥ 1。
4. 搜索框在索引卡内（`#memo-index-card input[type="search"]`）。
5. 点击行 → 抽屉打开 + URL `?entry=`。
6. 抽屉里有 `<pre>` 渲染原文。
7. `Esc` 关闭抽屉 + URL 清掉 entry 参数。
8. 搜索过滤行；无匹配显示 "No entries match"。
9. `view raw ↗` 打开抽屉显示 MEMORY.md 原文。
10. 暗主题渲染正常。

bundle：ProjectMemory route 独立 chunk 15.40 KB / 4.71 KB gz；初始包未增长（路由 lazy-load）。

## 风险与权衡

- **抽屉里是原文 raw text**：用户的 markdown 源（`**Why:**` / 列表 / 代码块）就是原样显示。优点是零依赖、安全、所见即所得；代价是富文本视觉层级在 UI 里弱化，feedback / project 类型的"理由 + 适用场景"靠等宽字体的缩进与排版保持可读，不再有 callout 高亮。**用户在 v2 试做后明确选择了这条路径。**
- **抽屉关闭无出场动画**：直接卸载，开场动画是 280ms slide-in。如果以后要补出场，需要受控的"closing"中间态。
- **类型筛选 chip 与排序菜单已删除**：MEMORY.md 顺序就是排序，搜索是唯一过滤入口。条目 ≤ 30 的场景下足够；以后超过这个量级再考虑加回筛选。
- **`# Memory index` 这种顶级 heading 会按 `MEMORY INDEX` 渲染在卡内**：与卡片本身的 `MEMORY.md` 标题略有重复，但保留对用户来说更可预期（你写啥就显啥），不做 H1 自动隐藏。

## 不做（明确范围）

- 不做条目编辑 / 新增 / 删除（用户明确不要 CRUD）。
- 不做 markdown 渲染、Why / How 高亮、链接自动外开新窗。
- 不引入色板 / 字体 / 设计 token 的新增。
- 不做记忆 diff / 历史 / 时间线视图。
- 不做跨项目记忆聚合（user 类型记忆其实跨项目共享，但本页只看当前项目；这是另一个 spec）。
