# Session Detail Delete — 验收方案

特性：[`session-detail-delete-design.md`](../../spec/session-detail-delete-design.md)
环境：Windows 11、Node 22+、Claude Code session manager dev server (`npm run dev` → http://localhost:5173)

## 自动可验证（已完成）

| 项 | 命令 | 结果 |
|---|---|---|
| typecheck | `npm run typecheck` | ✅ 全绿（server + web） |
| build | `npm run build` | ✅ 全绿（主 bundle 26.70 KB gzip，无回归） |

## 人工 spot-check 清单

启动：`npm run dev` → http://localhost:5173

### A-01 Delete 按钮显示

1. 进入任意项目 → 点开一条 idle 状态（无 live PID、>5 分钟无修改）的 session 详情。
2. 在 masthead 顶部 row 右侧（dateline 右边）应见到红色边框 + 红色文字的 *Delete* / *删除* pill 按钮，含垃圾桶 svg。
3. hover 后边框颜色加深至 `var(--color-danger)`。

判定：✅ / ❌

### A-02 Dialog 打开 + 内容正确

1. 点击 Delete → 弹出 DeleteDialog（与列表页同款）。
2. 标题为 *Delete sessions* / *删除会话*，下方列出当前 session 的 jsonl/subdir/file-history/session-env 字节明细。
3. 底部确认按钮文案：`Delete 1 session` / `删除 1 个会话`。

判定：✅ / ❌

### A-03 删除成功 + 自动跳转

1. 在 dialog 中点确认按钮。
2. 浏览器开发者工具 → 网络面板：`DELETE /api/sessions` 请求体为 `{"items":[{"projectId":"...","sessionId":"..."}]}`，状态 200。
3. result 视图显示 *Sessions removed* / *已删除会话* 与"释放 X · 清理 N 条历史记录"。
4. 点 *Done* → 浏览器地址栏自动跳回 `/projects/<projectId>`，且该 session 不再出现在列表中。
5. 浏览器后退键不会回到详情页（因为用了 `replace: true`）。

判定：✅ / ❌

### A-04 Live / Recently-active 跳过

1. 进入一个正在被 Claude Code 占用（live PID）或 5 分钟内有改动的 session 详情。
2. 点 Delete → dialog 显示 *These 1 will be skipped* / *将跳过这 1 项*，并标注原因（`live PID xxx` 或 `modified within last 5 minutes`）。
3. 底部 *Delete* 按钮 disabled。
4. 点 Cancel → 留在详情页，URL 不变。

判定：✅ / ❌

### A-05 降级：找不到 SessionSummary

1. 在浏览器开发者工具 → Network → 临时 throttle 到 Slow 3G 或在 `projectSessions` 接口上设断点。
2. 直接通过 URL 打开 `/projects/<existing-pid>/sessions/<existing-sid>?...`。
3. 在 `projectSessions` 加载完成前，Delete 按钮处于 disabled，hover 显示 `loading` / `加载中` tooltip。
4. （可选）人为构造 URL 中 sid 不在该 project（例如改最后几个字符），等 query 加载完后 Delete 按钮 disabled 且 tooltip 显示 *Session metadata not available yet* / *暂无法获取该会话状态*。

判定：✅ / ❌

### A-06 列表页行为不变 + 跨 tab 失效

1. 在 tab A 打开 `/projects/<pid>`，在 tab B 打开同 project 下某 idle session 的详情页。
2. 在 tab B 详情页删除该 session（确认 + Done）。
3. 切回 tab A → 触发 refetch（点 logo 或刷新页面）→ 该 session 已不在列表中。
4. 列表页自身的多选 + 批量删除入口和 dialog 行为完全不变。

判定：✅ / ❌

## 失败处理

任意一项 ❌ → 在本目录新建 `round-2/` 记录证据 + 修改后的代码位置 → 修复后重测，spec 中对应 A-xxx 注明 `re-verified after fix`。
