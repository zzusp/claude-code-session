# 验收报告 — 版本更新提示 + 一键更新

**状态：通过（ALL GREEN）** · 2026-06-09

## 结论

侧栏底部新增版本行：开页查一次 GitHub `releases/latest`（1h 缓存），有新版本时琥珀脉冲 pill
「新版本 vX.Y.Z」，点击展开弹窗——查看 current→latest + 发布说明、一键更新（后端真跑
`npm install -g @zzusp/ccsm@latest`，回显结果 + 提示重启）、前往发布页 / 代码仓库。无更新或检查
失败（如仓库尚无 GitHub Release → 404）时静默只显示当前版本。

## 验证

- 类型：`npm run typecheck`（server+web）零错。
- 单测：`npx vitest run` → 60/60，含 `version.test.ts` 6 例钉死 `compareSemver` 升/降/相等/
  pre-release/`v` 前缀/缺位补 0。
- e2e：`scripts/e2e.mjs` 11/11（4 真实 API 含 CSRF 403 守卫 + 7 UI mock 覆盖四态 + zh/en）。
  详见 `round-1.md`。
- 安全：真实 `POST /update` 仅以坏/缺 Origin 验 403（短路于更新前）；成功/失败更新流程全程
  Playwright mock，验证期间**未真跑** `npm install -g`。

## 关键决策

- 数据源选 **GitHub Releases API**（含 release notes `body` + 发布页 `html_url`），npm registry
  无更新说明故不选。
- 「更新」按用户选择**后端真执行**（非复制命令 / 非跳转），固定参数 `spawn`、Win `shell:true`
  跑 `npm.cmd`，exit≠0 回 200+output 让 UI 展示 npm 报错并给手动命令兜底。
- release notes 沿用项目既有 `<pre> whitespace-pre-wrap` 正文范式，不引 markdown 库。

## 已修

- Modal 被 aside 的 transform 困在侧栏窄列 → `createPortal` 到 `document.body`（见 round-1.md）。
