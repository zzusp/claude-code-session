# 验收方案 — 版本更新提示 + 一键更新

## 需求

侧栏底部展示当前版本；有新版本时琥珀高亮 pill，点击展开弹窗，可：查看 current→latest +
发布说明、一键更新（后端真跑 `npm install -g @zzusp/ccsm@latest`，回显进度/结果 + 提示重启）、
前往发布页 / 代码仓库。详见 `docs/spec/version-update-notice.md`。

## 改动

| 层 | 文件 | 改动 |
|---|---|---|
| shared | `types.ts` | 新增 `VersionInfo` / `VersionUpdateResult` |
| server | `lib/version.ts` | 读 pkg 版本 + GitHub releases/latest + `compareSemver` + 1h 缓存 |
| server | `lib/update.ts` | `spawn npm install -g …@latest`（Win `shell:true`），exit≠0 回 `ok:false`+output |
| server | `routes/version.ts` | `GET /api/version`、`POST /api/version/update`(CSRF + 无更新 400) |
| server | `index.ts` | 注册 `/api/version` |
| server | `lib/version.test.ts` | `compareSemver` 6 例单测 |
| web | `query-keys.ts` / `i18n.ts` | 登记 `version` key；`version.*` 文案(zh/en) |
| web | `components/VersionNotice.tsx` | 侧栏 pill + 弹窗(notes/更新/外链)，modal 走 `createPortal` 逃出 aside transform |
| web | `components/Sidebar.tsx` | 底卡挂 `VersionNotice` |

## 验证

- `npm run typecheck`（server+web）+ `npx vitest run`（含新单测）
- `npm run build` → 生产服务 `npx tsx server/index.ts --port 3137`
- Playwright `scripts/e2e.mjs`：4 项真实 API（shape + CSRF 403）+ 7 项 UI（mock 路由，覆盖
  有更新/更新成功/更新失败/已最新 + zh/en）。**安全红线**：真实 `POST /update` 只用坏/缺 Origin
  打（→403 短路），更新成功/失败流程全程 Playwright mock，**绝不真跑 `npm install -g`**。
