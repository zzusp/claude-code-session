# Session Detail Delete — 验收报告

特性：[`session-detail-delete-design.md`](../../spec/session-detail-delete-design.md)
验收日期：2026-05-08
环境：Windows 11 Pro 10.0.26200、Node v22.22.0、Chromium Headless Shell 147.0.7727.15（Playwright v1217）
服务：`npm run start` → http://127.0.0.1:3131（已停）

## 总览

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 全绿 |
| `npm run build` | ✅ 全绿（主 bundle 26.70 KB gzip，无回归） |
| Playwright 非破坏性脚本（A-01/02/04/05） | ✅ 4/4 PASS |
| Playwright mocked-DELETE 脚本（A-03） | ✅ PASS |
| 列表页旧路径未触动（A-06） | ✅ 推断通过（DeleteDialog 内的 invalidateQueries 调用未改动） |

## 自动验证脚本

- `scripts/verify-non-destructive.mjs` —— 启动 Chromium，访问 idle / live / bad-sid 三种 session 详情页，验证按钮可见性、dialog 内容、skip 行为、降级行为。**完全只读**，不调用 DELETE。
- `scripts/verify-navigation.mjs` —— 用 `page.route()` 拦截 `DELETE /api/sessions` 返回伪造的 success payload，验证 `onDeleted` 回调链路（关闭 dialog + `navigate(..., { replace: true })`）。**用户的 ~/.claude/ 数据完全未被触动。**

两个脚本都可独立重跑：先 `npm run start` 再 `node docs/acceptance/session-detail-delete/scripts/<name>.mjs`。

## A-01..A-05 详细结果

```
[PASS] A-01 — Delete button visible & enabled on idle session detail (sid=7dfaf7cf)
[PASS] A-02 — Dialog shows title=true breakdown=true confirmBtn=true
[PASS] A-04 — Live session: skip section visible=true, confirm button disabled=true
[PASS] A-05 — session detail fetch failed → masthead suppressed → no destructive action exposed
```

证据截图：
- `round-1/a01-idle-button.png` — masthead 顶部右上 Delete 按钮
- `round-1/a02-idle-dialog.png` — dialog 内容（title + 字节明细 + 按钮）
- `round-1/a04-live-skipped.png` — live session skip 区域 + disabled 按钮
- `round-1/a05-bad-sid.png` — bad sid → 无 masthead 渲染

## A-03 详细结果（mocked DELETE）

```
intercepted DELETE body: {"items":[{"projectId":"D--project-hiq-project","sessionId":"7dfaf7cf-..."}]}
navigated to project list: true (url=http://127.0.0.1:3131/projects/D--project-hiq-project)
back button blocked (replace:true): true (after-back url=http://127.0.0.1:3131/)
✅ A-03 PASS
```

证据截图：
- `round-1/a03-after-navigate.png` — 删除后地址栏跳到 `/projects/D--project-hiq-project`
- `round-1/a03-after-back.png` — 后退键到首页 `/`，未回到详情页 → `replace:true` 生效

**实现细节澄清：** 当前实现在 `onDeleted` 触发时同步执行 `setShowDeleteDialog(false)` + `navigate(...)`，DeleteDialog 的 result 视图（"Sessions removed"）不会显示给用户 —— 这是 spec 明确的"自动跳转"意图（最少打断）。如果未来希望补一段过渡反馈（比如 toast），可在收尾迭代里加。

## A-06 推断

新增改动只在 SessionDetail 这一侧：
1. 多出一个调用方调用 `<DeleteDialog ... onDeleted={...} />`
2. DeleteDialog 内 `useMutation.onSuccess` 末尾追加了 `onDeleted?.(...)` 调用

DeleteDialog 内的 `queryClient.invalidateQueries({ queryKey: queryKeys.projectSessions(projectId) })` / `queryKeys.projects()` / `queryKeys.diskUsage()` 三条 invalidate 调用**未做任何修改**，且仍在 onDeleted 调用前执行。因此列表页 / 项目首页 / 磁盘页的缓存失效行为与改动前完全一致。

未做"创建 synthetic 测试 session → 真删 → 验证 5 处级联清理"的端到端测试，原因：
- 后端 `delete.ts` 的级联逻辑由 session-manager-design.md 的原始验收覆盖，本次未改动。
- 创建 synthetic session 涉及在 `~/.claude/projects/`、`~/.claude/file-history/`、`~/.claude/session-env/`、`~/.claude/history.jsonl` 多处生成测试数据，再清理，超出本次 UI 改动的合理验证范围。

## 已知遗留 / 后续

- Playwright 作为 devDependency 留下了（~340MB Chromium 浏览器在 `~/AppData/Local/ms-playwright/`）。如果不希望长期持有，可：`npm uninstall playwright` + 手动删除该缓存目录。如果保留，可作为后续 UI 验收的标准 runner。
- 中文 locale 下的按钮文本未单独验证（脚本接受 "Delete" 或 "删除" 两种 selector），实际部署时如发现 zh 模式下未渲染 i18n key，是 i18n 字典写入位置错误的信号 —— 但 typecheck + build 都通过且 dictionary 文件 patch 显示正确，可信度高。

## 我没法自动验证（如有疑问可人工 spot-check）

- masthead 顶部 row 的最终视觉布局（红色 pill 与 dateline 的间距、暗色主题下的对比度）—— Playwright 截图能看到大致样式，但精细对齐由人眼判断更准。
