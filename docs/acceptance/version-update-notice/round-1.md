# Round 1 — 版本更新提示 + 一键更新

**Date:** 2026-06-09
**Pre:** `npm run build`（dist/ 必须存在，生产服务才挂 serveStatic）
**Server:** `npx tsx server/index.ts --port 3137`
**Script:** `scripts/e2e.mjs`（Playwright · headless Chrome · 全程 mock `/api/version*`）
**单测:** `npx vitest run` → 9 files / 60 tests 全绿（含新增 `version.test.ts` 6 例）

## 真实环境观察（重要）

线上仓库 `zzusp/claude-code-session` 有 `v1.0.0` git tag 但**尚未发布 GitHub Release**，故
`GET https://api.github.com/repos/zzusp/claude-code-session/releases/latest` 返回 **404**。
后端按设计优雅降级：`{current:"1.0.0", latest:null, hasUpdate:false, checkError:"GitHub API 404"}`，
UI 静默只显示 `v1.0.0`，不报错、不误提示更新。维护者发布首个 GitHub Release 后即自动生效。
（真实端点实测输出见下方 A-01。）

## 结果：ALL GREEN（11/11）

| # | 断言 | 结果 |
|---|---|---|
| A-01 | `GET /api/version` → 200 + `current` 字符串 + `repositoryUrl` 正确 + `hasUpdate` 布尔 | ✅ |
| A-02 | 基线 `hasUpdate=false`（current==latest / 或 checkError 降级） | ✅ |
| A-03 | `POST /api/version/update` 无 Origin → 403（更新前短路） | ✅ |
| A-04 | `POST /api/version/update` 外部 Origin → 403 | ✅ |
| U-01 | 侧栏底卡渲染琥珀「新版本 v1.2.0」pill（脉冲点） | ✅ |
| U-02 | 点击展开弹窗：标题「发现新版本」+ `v1.0.0 → v1.2.0` + 发布说明正文 | ✅ |
| U-03 | 「发布页↗」「代码仓库↗」外链 href 正确 | ✅ |
| U-04 | 点「立即更新」（mock 成功）→「更新完成」+「请重启 ccsm」；POST 触发 1 次 | ✅ |
| U-05 | mock 失败 →「更新失败」+ 手动命令 `npm install -g @zzusp/ccsm@latest` + npm 输出 | ✅ |
| U-06 | 无更新态：侧栏 `v1.0.0`、弹窗「已是最新版本」+ 仓库链接、无「立即更新」 | ✅ |
| U-07 | en locale 渲染「Update v1.2.0」pill | ✅ |

> 截图 `round-1/screenshots/u01..u07-*.png`（可再生，跑脚本重生成）。
> verdict.json 记录每项断言与时间戳。

## 过程中修掉的真 bug（已在本轮复测）

**Modal 被困在侧栏窄列**：`VersionNotice` 挂在 `<aside>` 内，而 aside 带 `lg:translate-x-0`
**transform**——transform 祖先会成为后代 `position:fixed` 的包含块，导致 `fixed inset-0` 的遮罩
相对 aside(288px) 而非视口定位（ExportDialog/SearchModal 挂在无 transform 的 main/根下故无此问题）。
**修复**：modal 用 `createPortal(…, document.body)` 渲染，逃出 aside 上下文。复测 u02/u05 截图确认
弹窗已全屏居中。

## 复跑

```pwsh
npm run build
npx tsx server/index.ts --port 3137   # 另开一个终端
$env:PORT="3137"; node docs/acceptance/version-update-notice/scripts/e2e.mjs
```
