# 版本更新提示与一键更新

## 需求

侧栏底部展示当前版本；有新版本时高亮提示，点击展开弹窗，可：

1. 查看 current → latest 与发布说明（release notes）
2. 一键更新（后端真执行 `npm install -g @zzusp/ccsm@latest`，回显进度/结果，提示重启）
3. 前往发布页 / 代码仓库（外链）

## 数据源

- **当前版本**：读 `package.json` 的 `version`（与 `bin/cli.mjs --version` 同一事实源）。
- **最新版本 + 发布说明**：GitHub Releases API
  `https://api.github.com/repos/zzusp/claude-code-session/releases/latest`
  取 `tag_name`(去掉前导 `v`)、`name`、`body`(markdown 说明)、`html_url`、`published_at`。
  npm registry 不含 release notes，故选 GitHub。
- 比较用最小 semver（`major.minor.patch` 数值比较 + release > prerelease），不引依赖。
- 结果在 server 内存缓存 1h，避免每次开页都打 GitHub；`?refresh=1` 强制刷新。
  失败（离线 / 限流）不缓存，`checkError` 带原因，UI 静默降级只显示当前版本。

## 接口

| Method | Path | 说明 |
|---|---|---|
| `GET`  | `/api/version` | 返回 `VersionInfo`（current/latest/hasUpdate/releaseNotes/releaseUrl/repositoryUrl/checkError…） |
| `POST` | `/api/version/update` | 跑 `npm install -g @zzusp/ccsm@latest`，返回 `VersionUpdateResult`（ok/fromVersion/toVersion/output/restartRequired）。Mutating → 校验 `Origin`；无更新时 400 |

`POST` 用 `spawn`（固定参数、无用户输入；Windows 用 `shell:true` 跑 `npm.cmd`），exit≠0 也回 200 带 `ok:false`+output，让 UI 展示 npm 输出而非吞掉。

## 前端

- `VersionNotice`（挂 `Sidebar` 底卡）：`useQuery(queryKeys.version())`。无更新显示 `v{current}`（可点开弹窗）；有更新显示琥珀 `pulse` 高亮 pill「新版本 vX.Y.Z」。
- `VersionModal`：current→latest + release notes(`<pre> whitespace-pre-wrap`，复用项目既有正文渲染范式，无 markdown 库)；`立即更新`(mutation：进度→成功「请重启」/失败显示 output)；`发布页↗`/`仓库↗` 外链。
- i18n `version.*`（zh/en），不硬编码文案。

## 不做

- 不自动更新、不后台轮询；只在开页时查一次（带缓存）。
- 不替用户重启进程（npm 替换全局文件后需用户手动重启 ccsm）。
- 不渲染完整 markdown（与项目现有 memory/正文一致用 pre-wrap）。
