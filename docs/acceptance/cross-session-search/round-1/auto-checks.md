# Round-1 — 自动可验证项

执行环境：macOS Darwin 22.6.0、Node v24.15.0、本地真实 `~/.claude/`。
执行时间：2026-05-04。

## ✅ 通过

### 1. Typecheck

```
$ npm run typecheck
> tsc -b
（无输出，退出码 0）
```

server 与 web 双侧 typecheck 全绿。

### 2. Build

```
$ npm run build
✓ 1135 modules transformed.
✓ built in 8.76s
../dist/assets/index-*.js                                                99.64 kB │ gzip: 25.86 kB
../dist/assets/index-*.css                                               49.69 kB │ gzip: 13.35 kB
（DiskUsage 仍 lazy；Recharts 仅在 /disk 加载）
```

无 build error / warning。

### 3. Route 健康

```
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3131/api/health    → 200
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3131/api/projects  → 200
$ curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:3131/  → 200 text/html
```

prod server (npm run start) 同时托管 dist + API 正常。

### 4. 短 query 拒绝

```
$ curl -s -i 'http://127.0.0.1:3131/api/search?q=a' | head -1
HTTP/1.1 400 Bad Request
{"error":"q must be at least 2 characters"}
```

### 6 + 7. 流式 + 命中结构

```
$ curl -s -i 'http://127.0.0.1:3131/api/search?q=claude-paths&maxSessions=3' | head -10
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-store
X-Accel-Buffering: no

{"type":"session","projectId":"…","sessionId":"…","projectDecodedCwd":"/Users/sunpeng/workspace/claude-code-session","title":"…","customTitle":"cross-session-search-implementation","lastAt":"2026-05-04T08:51:12.604Z","hasMore":true,"snippets":[…5 items…]}
{"type":"session",…,"hasMore":false,"snippets":[…2 items…]}
{"type":"session",…,"hasMore":false,"snippets":[…3 items…]}
{"type":"done","scanned":16,"matched":3,"durationMs":874,"truncated":true}
```

✅ Header 正确（NDJSON、chunked、no-store、X-Accel-Buffering: no）
✅ 每行 SearchSessionHit JSON 完整（projectId/sessionId/projectDecodedCwd/title/customTitle/lastAt/hasMore/snippets）
✅ 末行 SearchDone 含 scanned/matched/durationMs/truncated
✅ snippet `before/match/after` 三段切片正确，命中保留原大小写

### 8. per-session cap

第一个 session `hasMore: true` 且 snippets.length === 5（默认 perSession=5）。

### 9. maxSessions cap

`maxSessions=3` 触发 `done.truncated=true`，仅 3 个 session 返回。

## ⏳ 待人工 spot-check（13–33）

UI 交互项无法在自动化环境内驱动，需用户 `npm run dev` 后手动验证：

- 13. ⌘K / Ctrl+K 任意路由唤起 modal、input 自动 focus
- 14. 模态打开时再按 ⌘K toggle 关闭
- 15. ESC 关闭
- 16. 遮罩点击关闭
- 17. 输入高频词 → 结果按 session 分组逐组到达；header 显示 project tail · title · 相对时间
- 18. 命中词 `<mark>` 高亮（OKLCH 调色，light + dark）
- 19. `hasMore: true` 的 session 末尾出现 "+more in this session"
- 20. footer 显示 `N session · scanned X · Yms`
- 21. truncated 时底部显示 "Showing first N sessions — refine your query."
- 22. ↑↓ Home End Enter 键盘导航
- 23. 鼠标 hover 同步 activeIndex
- 24. 点击 / Enter → URL 变为 `?focus=<uuid>&q=<query>`
- 25. SessionDetail 加载后滚动至 message 居中并 1.2s `flash-focus` 闪光
- 26. focus 落在 windowSize 之外（>50 条）时 windowSize 自动扩到目标
- 27. URL 带 `q` 时 SessionDetail 顶部搜索框预填 + 页内 `<mark>` 全亮
- 28. focus 命中 meta 消息 → showMeta 自动开启
- 29. 单字符 query → 中性 `refineQuery` 提示
- 30. 不可能匹配 → `noResults` 提示
- 31. zh / en 切换文案
- 32. dark / light 主题下 modal + flash-focus 不出现 hex 字面量
- 33. 关闭 modal 后立即 abort 当前 fetch（DevTools Network 中应能看到 `(canceled)`）

## 已知 deviation

- 旧 README 写"初始 bundle ~124 KB gzip"——当前实测 25.86 KB（index 主 chunk）+ react/vendor/router/query 拆分后总和约 183 KB gzip。这是 soft-skin 系列变更累积造成（与本特性无关）；本特性零新增依赖，不放大首屏。README 数字可待后续刷新。
- title 字段对 `<command-name>` 系命令存在系统消息渗透（项目原有行为，`SYSTEM_TAG_RE` 仅匹配 `<local-command|system-reminder|caveat>`）。SearchModal UI 优先使用 `customTitle ?? title`，绝大多数情况下不会展示原始尖括号文本。

## 下一步

人工通过 13–33 后写 `report.md`；任何失败先记录到 `round-1/issues.md`，修复后整轮重跑。
