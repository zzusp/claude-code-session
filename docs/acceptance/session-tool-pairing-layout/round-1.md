# round-1 验证记录

环境：`npm run dev`（vite 5174 → 后端 3131，读真实 `~/.claude`）；会话 `8afefc96-2541-4e57-8065-f77f2c47f979`（27 个 PowerShell 调用）。

## 静态门禁

- `npm run typecheck` → 通过（tsc -b 两端无错）。
- `npm test` → 9 文件 61 用例全过。

## UI（`scripts/verify-ui.mjs`，1500×1000）

```
PASS · 存在「运行」折叠行（PowerShell/Bash 共用动词），count=27
PASS · 折叠行动词位不再是 "PowerShell"，count=0
PASS · 展开体出现配对返回标头（工具返回/工具错误），count=1
PASS · 时间线无独立「工具」角色标头消息，count=0
PASS · 存在文件卡，count=16
boxes(top): header{0..53} aside{65..909} footer{921..1000} viewportH=1000 pageScrollH=1000
PASS · 预览面板底(909) 不压页脚顶(921)
PASS · 预览面板顶(65) 在页头底(53) 之下
PASS · 整页窗口不滚动 scrollH=1000 viewportH=1000
boxes(scrolled): 同上（中间层内部滚动，三层不动）
PASS · 滚到底后预览面板底(909) 仍不压页脚顶(921)
PASS · 滚到底后预览面板顶(65) 仍在页头之下（不脱离上移）
PASS · 滚到底后页脚仍贴视口底 footer.bottom=1000
```

证据图：`round-1/01-ran-expanded.png`（PowerShell 折叠=运行+description，展开=命令块 + 空行 +「工具错误」返回）、`02-preview-open.png`、`03-preview-scrolled.png`。

## 搜索 / 过滤（`scripts/verify-search-filter.mjs`）

```
PASS · 错误过滤筛出 6 条消息（含工具错误的调用块）
PASS · 搜索“TS2307”（仅存在于工具返回正文）命中 1 条 → haystack 折叠生效
```

证据图：`round-1/04-error-filter.png`、`05-search-result-body.png`。

## deep-link focus 重定向（手动 probe）

`?focus=<被剔除的 result 消息 uuid>` → `{ownerRendered:true, resultRendered:false, ownerInView:true}`：result 消息已不渲染，跳转重定向到调用块所在消息并滚入视野。

## 旁路回归

- 「修改的文件」独立页（复用 `MessageBubble` 但不传 `toolResults`）：0 pageerror，行为不变（独立 result 仍渲染、无配对）。
- 窄屏 820px：三层成立、中间内部滚动、窗口不滚（`section 0..900 / footer 779..900 / scrollable=true`）。
- 已知非本次问题：≤~500px 移动端，侧栏移动端 topbar 被 flex-row 挤成左列（项目列表页同样如此，代码路径未改）——**预存在**，超出本次范围。
