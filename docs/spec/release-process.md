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

> 版本号不再自动从 commits 计算——由发版者用 `npm version <x.y.z>` 显式指定（见五、六）。
> 但 commit 规范仍是硬约束：它是 CI 生成 release notes 的唯一输入。

## 四、CHANGELOG / Release Notes

- 历史版本（`1.0.0`–`1.0.2`）的中文分组 changelog 保留在 `CHANGELOG.md`，作为归档。
- **自 tag 触发发布起，每版 release notes 由 CI 用 `conventional-changelog`（`conventionalcommits`
  preset）从 commits 现算，发布在对应的 GitHub Release**，不再回写仓库内 `CHANGELOG.md`
  （它定格在 `1.0.2`）。
- notes 质量仍取决于 commit message 是否守 Conventional Commits——这是唯一输入。

## 五、工具链：tag 触发 + GitHub Actions

发版 = **本地 `npm version` 打 tag → `git push --follow-tags` → CI 自动 publish**。
配置见 `.github/workflows/release.yml`（`on: push: tags: ['v*']`）。

**为什么这样（而非本地 release-it）：** npm 账号开了 **2FA**，本地非交互 `npm publish` 会被
`403`（需 OTP 或 bypass-2FA token）。把 publish 放到 CI、用 environment `NPM_PUBLISH` 下的
bypass-2FA token，一推 tag 全自动，本地不再碰 OTP。release-it 这类「本地驱动整个发布」的工具
与「人打 tag 触发」模型冲突（它要打的 tag 已存在），故已移除（连同 `.release-it.json` 与两个
`@release-it/*` 依赖）。

**职责划分：**

- **本地 `npm version <x.y.z>`**：bump `package.json` + `package-lock.json` → commit → 打 tag
  `v<x.y.z>`，三者天然一致。
- **CI（tag push 触发）**：
  1. 校验 tag 名 == `package.json` version（不一致直接 fail，防发错版本）。
  2. `npm ci` → `npm test` → `npm run typecheck`（闸门）。
  3. 生成本版 release notes（`conventional-changelog` 取最新一段；本版若只有 `ci`/`chore` 等
     不入 changelog 的 commit，回退 GitHub 自动生成的 notes，避免空 / 错位）。
  4. `npm publish`（`prepublishOnly` 自动 build `dist/`；token 来自 secret `NPM_PUBLISH_TOKEN`）。
  5. `gh release create <tag>` 附 release notes。
- CI **不写回 main**：不 commit、不改 `CHANGELOG.md`。

**认证（一次性配置）：**

1. npmjs.com → **Access Tokens** → **Generate New Token** → **Granular Access Token**，
   **务必勾选「Bypass two-factor authentication」**（在 Description 之后、Packages 之前的独立一节），
   Permissions 选 **Read and Write**、scope 含 `@zzusp/ccsm`。classic **Automation** token 亦可
   （类型即 bypass 2FA，但 npm 计划移除 classic token）。
2. 存为 **Environment Secret**：仓库 Settings → Environments → `NPM_PUBLISH` → secret
   `NPM_PUBLISH_TOKEN`。workflow 的 `release` job 声明了 `environment: NPM_PUBLISH` 才能取到。
   `GITHUB_TOKEN` 由 Actions 自带，无需配。

## 六、端到端 SOP（每次迭代）

1. `git fetch && git checkout -b feature/<name> origin/main`。
2. 按 Conventional Commits 提交（`commit-msg` 钩子把关）。
3. PR → 合并 main（merge / squash 标题也遵守规范）。
4. **发版**（在最新 main 上）：

   ```bash
   git checkout main && git pull --ff-only
   npm version <x.y.z>          # bump package.json + commit + 打 tag v<x.y.z>
   git push --follow-tags       # 推 commit + tag；tag 即触发 CI 发布
   ```

   `<x.y.z>` 按「二、版本号怎么算」定；也可用 `npm version patch|minor|major` 让它自增。
5. 去 **Actions** 看 Release run 跑完；npm 与 GitHub Release 自动就绪。

**发布前置**：Environment `NPM_PUBLISH` 下的 secret `NPM_PUBLISH_TOKEN`（bypass-2FA token），
一次性配置。开发者本地只需 git 推送权限，**不需要** npm login / OTP。

## 七、纪律

- **所有新分支基于最新 `origin/main`**；发版前确保本地 main 已 `git pull --ff-only` 到最新，
  否则 `npm version` 会基于旧代码打 tag。
- 发版只走 **`npm version` + `git push --follow-tags`**，由 CI 完成 publish + GitHub Release；
  不在本地手动 `npm publish`，以保证版本号、tag、发布产物始终一致。
- **tag 必须由 `npm version` 创建**（保证 tag == `package.json` version）；不要手写 `git tag`
  再改 package.json，CI 的一致性校验会拒绝不匹配的发布。
- 发错 / 想撤：删远程 tag + 对应 GitHub Release 即可；npm 已发布版本不可覆盖，只能发新 patch 修。
