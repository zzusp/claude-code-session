# Memory Page Redesign

**Status**: approved, in implementation
**Date**: 2026-05-04
**Scope**: `web/src/routes/ProjectMemory.tsx` 单页布局重构

## 现状

```
Header → 分组卡片 (USER / FEEDBACK / PROJECT / REFERENCE / OTHER)
       → 末尾原始 <pre> 索引 (MEMORY.md 全文)
```

问题：`MEMORY.md` 本来就是用户自己精挑细选的目录，是这一页的"导航"，却被挤到最底；分组卡片（详情）反而是页面打开后的第一视觉锚点，层级倒挂。

## 目标

- 索引在打开页面就可见，且向下滚动时仍然可见。
- 分组卡片继续作为详情视图，能从索引点进去。
- 不引入新色板 / 新组件，复用现有 design tokens（hairline / dotted rule / eyebrow / accent ribbon）。
- 兼容 `MEMORY.md` 中的自由格式（标题、空行、注释行）。

## 选型

候选方案：
1. 索引提到最上面（单列堆叠）
2. 左右两栏，索引常驻左侧

选 #2。理由：
- 索引是导航 + 详情是内容，关系是 nav/content 而非 summary/detail，sticky 侧栏天然契合。
- 单列堆叠只解决"先看到"，但向下滚后导航消失；点开任意一张卡再回索引得滚回顶部。
- 现有 editorial 排版（hairline、dotted rule、mono、eyebrow）适合两栏静态页。

## 布局

`md:` 及以上：

```
┌── Breadcrumbs ───────────────────────────────────────────┐
│ PageHeader: MEMORY · "Memory" · N entries                │
├──────────────────────┬───────────────────────────────────┤
│ INDEX           N    │ USER  ·  k                        │
│ ─ ─ ─ ─ ─ ─          │ ─ ─ ─                             │
│ User role            │ ┌─────────────────────────────┐   │
│   primary developer  │ │ User role                   │   │
│ Test prefs           │ │ user_role.md · 234 B · 2d   │   │
│   preferred tone…    │ └─────────────────────────────┘   │
│                      │                                   │
│ (sticky top-6,       │ FEEDBACK  ·  k                    │
│  width ~300px)       │ ...                               │
└──────────────────────┴───────────────────────────────────┘
```

`< md`：堆叠，索引在上、分组在下，索引不 sticky。

`MEMORY.md` 为空：隐藏左栏，分组占满；不渲染空索引壳。

## 索引解析

- 按行分割 `MEMORY.md`。
- 对每一行尝试 `^[\s*-]*\[(?<title>[^\]]+)\]\((?<href>[^)]+)\)\s*[—–\-:]?\s*(?<hook>.*)$` 匹配。
  - 命中 → entry 项 `{ title, href, hook }`，渲染成可点击行。
  - 未命中且非空行 → 渲染成 plain text（自由文本如 `# Memory`、注释、分节符照搬）。
  - 空行 → 渲染成 spacer（小空隙，不渲染 `<br>`）。
- entry 项 `href` 与 `entries[].filename` 配对：
  - 配对成功 → 可点击，scroll-to + flash。
  - 未匹配（文件已删 / 拼写错） → 仍渲染但置灰、`cursor-not-allowed`、`title="未找到对应条目"` 提示。

## 交互

- 每张 `MemoryCard` 外层 `id={entry.filename}`，scrollIntoView 用。
- 点击索引条目：
  - `behavior: 'smooth'`、`block: 'start'` 滚到目标卡。
  - 给目标卡 `data-flash="true"` 1.6s 后清除，配合 CSS 用 `--color-accent` 短暂高亮边框（复用 ribbon-row 风格，但是是 outline pulse）。
- 不自动展开卡片正文 —— 高亮足够，避免一次展开所有内容造成抖动。

## 不做

- 不做客户端搜索 / 过滤索引（条目通常 < 30，没必要）。
- 不做 raw `<pre>` toggle。左栏已经覆盖所有行，原文不再单独展示。
- 不引入 markdown 渲染库，索引解析手写正则即可。
- 不动后端 API。

## 影响

- 文件改动：`web/src/routes/ProjectMemory.tsx`、`web/src/index.css`（新增 flash keyframe + 给 light 主题加 `color-scheme: light`，后者顺手修 checkbox 黑底问题）、`web/src/lib/i18n.ts`（新增索引相关 key）。
- 不动：`shared/types.ts`、`server/`、其他路由。

## 验收

- light theme 下 ProjectDetail 第一列 checkbox 不再黑底。
- `/projects/:id/memory` 打开后第一眼能看到索引（左侧或顶部，取决于断点）。
- 点击索引任一可点条目：右侧对应卡滚到视口、高亮一次。
- `MEMORY.md` 含未匹配行（标题 / 注释）时不丢失，按弱化文本渲染。
- 无对应文件的索引条目置灰但仍可见。
- `npm run typecheck` 通过。
- 窄屏（< 768px）堆叠不破版。
