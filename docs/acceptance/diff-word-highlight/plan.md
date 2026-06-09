# 修改文件抽屉 diff —— 行内 word-level 高亮

## 需求

「修改前 / 修改后」左右 split diff 此前只做到**整行**着色(删行整片红、增行整片绿)。用户希望更接近 GitHub 对比窗口的体验:**聚焦真正变动的代码**。

前置讨论已确认一个数据源事实:本项目的 diff 内容来自会话 `.jsonl` 里记录的工具入参(`Edit` 的 `old_string`/`new_string`、`Write` 的 `content`、`MultiEdit` 的 `edits[]`),**不读磁盘真实文件**(`server/lib/modified-files.ts:31-93` 仅扫 `.jsonl`)。因此 GitHub 那种「默认折叠、可展开整份文件」无法实现——会话从未存过完整文件,只存了编辑片段。本轮取性价比最高的方向:**在现有片段 split diff 上加 GitHub 式的行内 word-level 高亮**,让一行里只有真正改动的 token 被强调。

(明确不做:把相邻多次 Edit 缝合成一条 hunk 流——当前每个 operation 卡片已等价于一个 hunk,且各带独立时间戳/错误态/跳转,合并反而丢时间线。)

## 方案

只动一个文件:`web/src/components/ModifiedFilesDrawer.tsx`。

- 复用已有的行级 LCS `diffOps()`,在 **token 粒度**上再跑一次得到行内分段。token 切分:连续空白 / 连续单词字符 / 连续标点各成一段(`WORD_RE = /\s+|\w+|[^\w\s]+/g`),贴近 GitHub 分词。
- 仅对「左删 + 右增」**配对的修改行**计算行内分段;纯增 / 纯删 / 相等行保持整行着色(无需分段)。
- 渲染:改动 token 在整行 `-soft` 底色上再叠一层更饱和同色——删侧 `bg-[var(--color-danger)]/25`、增侧 `bg-[var(--color-moss)]/30`(明暗主题各有 token,自动适配)。未变 token 不叠色。
- 兜底:两行毫无公共 token、空行、或 `token 数乘积 > 20000`(超长/压缩行)时返回 `null`,退回整行着色,避免 O(n·m) 卡顿。

## 改动

`web/src/components/ModifiedFilesDrawer.tsx`(单文件,约 +60 行):

- 新增 `interface Seg { text; changed }`,`SplitRow` 增 `leftSegs` / `rightSegs`(仅配对修改行有值,余为 `null`)。
- `buildSplitRows()`:配对行 `hasL && hasR` 时调 `wordSegments()` 填充分段。
- 新增 `wordSegments()` / `pushSeg()`(合并相邻同类段),复用 `diffOps()`。
- `DiffLine` 增 `segs` 入参:有分段则逐段渲染、改动段套高亮 class `hl`;无分段走原整行文本路径。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查(server+web) | `npm run typecheck` | PASS,无错误 |
| Server safety-net 单测 | `npm test` | 8 files / 54 tests 全 PASS |
| 生产构建编译 | `npm run build` | built in 6.94s,无错误 |
| 算法正确性 | 抽出 `diffOps`/`wordSegments` 跑真实样例 | 见下 |

算法 spot-check(`docs/acceptance/diff-word-highlight/scripts/worddiff-check.mjs`),关键不变量 **分段拼回严格等于原行**(无丢字/串字)在所有用例成立:

- 单 token 改 `'a'→'X'`:仅 `'a'`/`'X'` 高亮,其余不动。
- 中间插入 `foo(bar)→foo(bar, baz)`:仅右侧 `, baz` 高亮。
- 改名 `editCount→writeCount`:仅该词高亮。
- 完全不同行:逐词全高亮(共享空格不高亮)——word-diff 自然行为,可读不损坏,与 GitHub 一致。
- 空旧行:退回 `null`(整行着色)。

**待人工确认(bg 环境无浏览器,无法做视觉验收)**:实际页面里高亮底色 `/25`·`/30` 在明/暗主题下的观感对比度。逻辑与构建均已确证,余下纯属 CSS 视觉判断。
