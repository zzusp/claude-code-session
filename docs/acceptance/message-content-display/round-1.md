# Round 1 — 实现后首轮验证（2026-06-10）

环境：Windows 11 / Node 22.22 / `npm run dev`（backend 3134，vite 5173）。
测试会话：真实数据 `D--project-claude-code-session/1a3271ad-…`（markdown + Edit/Write + result 齐备，只读）。

## V1 typecheck + vitest

- `npm run typecheck`（tsc -b，server+web 双 tsconfig）→ **PASS**（无输出，exit 0）。
- `npm test` → 首跑 60/61，`delete.test.ts` 级联用例超时（实跑 22s>5s 上限，Windows `tasklist`
  探活冷启动慢）；**单独重跑 6/6 PASS**（3.97s），确认环境性偶发、与本次改动无关
  （本次未触碰任何 server 代码，`git diff main --stat` 可证）。

## V2 build chunk

`npm run build` → **PASS**：
- `markdown-*.js` 157.02 kB（gzip 47.58）独立 chunk，仅由 lazy 的 `MarkdownContent-*.js`（5.51 kB）引用；
- 首屏 `index-*.js` 178.89 kB / gzip 43.38，与 main 基线一致（基线 178.93/43.38）；
- 首轮 build 出现 `Circular chunk: markdown -> vendor -> markdown` 警告 → 用依赖闭包脚本找出
  8 个漏归包（parse-entities/stringify-entities/style-to-js/dequal/extend/@ungap/structured-clone/debug/ms），
  补进 `MARKDOWN_PKG_PREFIXES` 后警告消除。

## V3–V10 Playwright（scripts/verify-message-display.mjs）

首跑 7/8：V5 FAIL 是脚本选择器缺陷（工具名 span textContent 带前导空格，`/^Edit$/` 不匹配），
修正正则后重跑 **8/8 PASS**：

```
PASS V3 — assistant 气泡内 markdown 元素 ×61
PASS V4 — tool 摘要非空 ×14（采样 14）
PASS V5 — 展开后 diff 着色行/块 ×45
PASS V6 — result 头部带来源工具名 ×13
PASS V8 — markdown 内文 <mark> ×19（query=SessionDetail）
PASS V7 — 弹窗对话栏 markdown ×38、tool 摘要 ×6、diff 着色 ×3
PASS V9 — 暗色主题 markdown 元素 ×15
PASS V10 — 无 console error / pageerror
```

截图证据（round-1/）：`timeline-light.png`、`timeline-dark.png`、`drawer.png`、
`search-highlight.png`、`markdown-zoom.png`（围栏代码块特写：PYTHON 语言标签 + 悬浮复制按钮 +
行内代码 chip + 加粗/链接，scripts/zoom-markdown.mjs 生成）。

## 补充：原始 HTML 保真性实证（scripts/raw-html-test.mjs）

react-markdown@10 默认（无 rehype-raw）对 6 种含 `<tag>` / `a<b` / `Foo<T>` 的输入
**全部转义为字面文本渲染，零丢失、零执行**：

```
"a <b>bold</b> c" → "<p>a &lt;b&gt;bold&lt;/b&gt; c</p>"
"<system-reminder>hi</system-reminder>" → "<p>&lt;system-reminder&gt;hi&lt;/system-reminder&gt;</p>"
"5 < 6 and a<b" → "<p>5 &lt; 6 and a&lt;b</p>"
"generic Foo<T> in prose" → "<p>generic Foo&lt;T&gt; in prose</p>"
"<file_path>x.ts</file_path>" → "<p>&lt;file_path&gt;x.ts&lt;/file_path&gt;</p>"
"line1\n<div>\nblock html\n</div>\nline2" → "<p>line1</p>\n&lt;div&gt;\nblock html\n&lt;/div&gt;\nline2"
```

→ spec 中标记的「内容丢失」风险关闭。

## 状态

Round 1 全绿。待办：多 lens 对抗性 review（workflow wf_247cdd35-b5e）结论出来后决定是否需要 round-2。
