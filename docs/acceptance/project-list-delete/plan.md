# Project List Delete — 验收方案

特性：在 Projects 索引页每行末尾添加 *Delete* 按钮，点击弹出确认 dialog；后端新增 `DELETE /api/projects/:id` 端点，整项目级删除（all-or-nothing：任一 session 处于 live / 5 分钟内活跃 → 整个项目不动），删除成功时连带 `~/.claude/projects/<id>/` 目录一起 `rm -rf`。

环境：Windows 11、Node 22+、`npm run dev` → http://localhost:5173

## 自动可验证

| 项 | 命令 | 结果 |
|---|---|---|
| typecheck | `npm run typecheck` | ✅ 全绿（server + web） |

## 人工 spot-check 清单

启动：`npm run dev` → 浏览器打开 `http://localhost:5173`

### A-01 索引行展示删除按钮

1. 进入 Projects 页面（默认首页）。
2. Index 列表每行最右侧应同时显示：垃圾桶按钮 + chevron 箭头。
3. hover 行时整行高亮（`var(--color-sunken)`），整行点击仍能跳转到 `/projects/<id>`。
4. hover 垃圾桶按钮时，按钮变红色边框 + 红色 `var(--color-danger-soft)` 背景，且**行不再被整行 navigate**（鼠标悬停在按钮上点击不跳转）。

判定：✅ / ❌

### A-02 点击删除弹出 dialog

1. 在某个 idle 项目（无 live session、>5 分钟无活动）行上点击垃圾桶。
2. 弹出 `DeleteProjectDialog`，标题 *Delete project* / *删除项目*。
3. header 显示该项目的 `decodedCwd`（mono 字体）。
4. summary 显示 `N session(s) · ~XX KB to free · directory will be removed`。
5. 红色警告条：`This removes every session in <cwd> ...`。
6. 不应出现"将跳过"的黄条。
7. ESC 或点遮罩可关闭。

判定：✅ / ❌

### A-03 删除成功 + 列表刷新

1. 在 A-02 dialog 中点 *Delete project*。
2. 开发者工具 Network：`DELETE /api/projects/<encoded-id>`，状态 200，响应包含 `projectDirRemoved: true`、`deleted` 数组、`historyLinesRemoved` ≥ 0。
3. result 区显示绿色条 *Removed N session(s) and the project directory ...*。
4. 点 *Done* 关闭 dialog。
5. Projects 索引列表中该项目已消失。
6. 在文件系统中确认 `~/.claude/projects/<id>/` 已被删除；`~/.claude/projects/history.jsonl` 中相关 sessionId 行已剔除（如原本存在）。

判定：✅ / ❌

### A-04 Live / Recent 阻断（all-or-nothing）

1. 启动一个 Claude Code 进程让其驻留某 project（保持 live PID），或在 5 分钟内编辑过该 project 下任一 session 的 jsonl。
2. 在 Projects 列表点击该项目的垃圾桶。
3. dialog 加载 sessions 后显示黄色阻断条：`N session(s) are live or were modified in the last 5 minutes — nothing will be deleted. Try again later.`
4. 列表里枚举具体 sessionId + `live PID xxx` / `recent`。
5. 底部 *Delete project* 按钮 **disabled**。
6. 点 Cancel → dialog 关闭，列表与文件系统均无变化。

判定：✅ / ❌

### A-05 服务端 origin 校验

1. 用 curl（无 Origin 头）请求 `curl -X DELETE http://127.0.0.1:<port>/api/projects/<id>`。
2. 返回 403 + `{"error":"origin not allowed"}`。
3. 文件系统未发生任何变化。

判定：✅ / ❌

### A-06 跨页面缓存失效

1. tab A 打开 `/disk`（Disk usage）。
2. tab B 在 Projects 页删除一个 idle 项目。
3. 切回 tab A 刷新或重新进入 → `byProject` 数据中该 project 已消失，总计字节相应减少。

判定：✅ / ❌

## 失败处理

任意一项 ❌ → 在本目录新建 `round-2/` 记录证据 + 修复后的代码位置 → 修复后重测，本文件对应 A-xxx 注明 `re-verified after fix`。
