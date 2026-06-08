# 版本发布与迭代规范

`@zzusp/ccsm` 已发布到 npm 官方仓库，是正式对外项目。本文是版本迭代、CHANGELOG、
npm 发布的**单一事实源**；[`CONTRIBUTING.md`](../../CONTRIBUTING.md) 是面向贡献者的速查。

## 一、三大基础标准

| 标准 | 用途 |
|---|---|
| [SemVer 2.0.0](https://semver.org/lang/zh-CN/) | 版本号语义 |
| [Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/) | commit 信息规范，自动定版 + 生成 CHANGELOG 的输入 |
| [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/) | `CHANGELOG.md` 格式 |

## 二、版本号怎么算（贴合本项目的「对外契约」）

`@zzusp/ccsm` 是 **CLI 工具 + 本地 Web UI**，不是 library。它的对外契约是：

1. **`ccsm` 的 CLI 选项**：`-p/--port`、`--host`、`-o/--open`、`-h/--help`、`-v/--version`
2. **默认运行行为**：默认绑 `127.0.0.1`、端口 3131–3140、对磁盘只读
3. **UI 数据操作语义**：delete / export / import 的行为与安全网
4. **Node 最低版本**：当前 `>=22`

| 级别 | 触发 | 例子 |
|---|---|---|
| **MAJOR** (x.0.0) | 破坏已有契约 | 移除 / 改名某 CLI 选项；改默认 host/port 行为；改变 delete/export/import 语义致不兼容；提升 Node 最低版本 |
| **MINOR** (1.x.0) | 向后兼容地加能力 | 新增 CLI 选项；新增 UI 页面 / 功能（如 import/export、跨会话搜索） |
| **PATCH** (1.0.x) | 不改契约的修复 | 修端口冲突 bug；性能优化；依赖补丁；缩小安装体积 |

> ⚠️ **易误判点**：改 `shared/types.ts` 的 wire 协议**不算 breaking**。server 与 web 是
> 同一个包一起发布、一起更新的，用户不直接依赖该内部协议。breaking 只看上面四类
> **用户可感知**的契约。

## 三、Commit 规范

格式 `<type>(<scope>)?: <subject>`，由 `commitlint`（`commit-msg` 钩子）强制校验。

- **type → 版本影响**：`feat`→MINOR，`fix`/`perf`→PATCH，
  `refactor`/`docs`/`build`/`ci`/`chore`/`test`/`style`→不单独触发发版。
- **breaking → MAJOR**：type 后加 `!`（`feat!:`）或脚注 `BREAKING CHANGE: <说明>`。
- **scope 建议**：`server` / `web` / `shared` / `cli` / `release` / `deps`。
- 配置：`commitlint.config.js`（继承 `@commitlint/config-conventional`，放宽中文长行）；
  钩子 `.husky/commit-msg`。**只校验 commit message**，不挂 pre-commit 重活
  （项目无 lint，`typecheck` 较慢不适合每次提交）。

## 四、CHANGELOG

- `CHANGELOG.md`，Keep a Changelog 格式。
- 从 `1.0.1` 起由 `release-it` 在发版时**自动**从 commits 生成 / 更新；`1.0.0` 为手工回填基线。
- 日常无需手改；只在历史 commit 不规范、需要补全描述时手工编辑 `[Unreleased]` 段。

## 五、工具链：release-it（本地一键）

采用 [`release-it`](https://github.com/release-it/release-it) +
[`@release-it/conventional-changelog`](https://github.com/release-it/conventional-changelog)，
配置见 `.release-it.json`。

**为什么是它（而非其他）：**

- ✅ 单人、无需搭 CI；一条命令端到端；交互确认 + `--dry-run`，出错好回退。
- ❌ `semantic-release` + GitHub Actions：需搭 CI + 配 `NPM_TOKEN`，每次合 main 即发，对当前无 CI / 单人现状过重；将来需要时可平滑升级到这条路。
- ❌ `changesets`：核心价值在多包 monorepo / 多人协作；本项目**单包单人**，"每次先写 .changeset" 仪式价值打折。
- ❌ `standard-version`：已废弃。

`npm run release` 依次执行：

1. **发布前闸门**（`hooks.before:init`）：`npm run typecheck` + `npm run build`，失败即停。
2. 读 commits（`conventionalcommits` preset）→ 自动算新版本号。
3. 更新 `CHANGELOG.md` + bump `package.json`。
4. git commit `chore: release v${version}` + 打 tag `v${version}`。
5. `git push --follow-tags`。
6. `npm publish`（`publishConfig.access=public` 已就位，`prepublishOnly` 自动 build `dist/`）。
7. 建 GitHub Release（附本版 CHANGELOG 片段）。

`requireBranch: "main"` 确保只能在 main 发版；`requireCleanWorkingDir` 确保工作区干净。
`npm run release:dry` 为预演，不产生任何副作用。

## 六、端到端 SOP（每次迭代）

1. `git fetch && git checkout -b feature/<name> origin/main`。
2. 按 Conventional Commits 提交（`commit-msg` 钩子把关）。
3. PR → 合并 main（merge / squash 标题也遵守规范）。
4. 在 main：`npm run release:dry` 预演确认版本号与 CHANGELOG → `npm run release` 正式发。
5. 发版后 npm 与 GitHub Release 自动就绪。

**发布前置**：`npm login`（`@zzusp` 发布权限）、`gh auth login` 或环境变量 `GITHUB_TOKEN`。

## 七、纪律

- **所有新分支基于最新 `origin/main`**。本地旧分支可能落后于已发布身份（package.json 仍是
  旧包名 / `private:true`），在其上发版会失败或发错——确认无用应及时清理。
- 发布只在 `main` 上、用 `npm run release` 进行，不手动 `npm version` / `npm publish`，
  以保证版本号、tag、CHANGELOG、发布产物始终一致。
