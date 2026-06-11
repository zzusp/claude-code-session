# 贡献指南

本项目以 `@zzusp/ccsm` 之名发布到 npm，版本迭代与发布遵循一套标准化流程。完整规范见
[`docs/spec/release-process.md`](docs/spec/release-process.md)，本文是日常速查。

## 提交信息：Conventional Commits

每条 commit 必须符合 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，
由 `commitlint` 的 `commit-msg` 钩子强制校验，不合格直接被拒。

```
<type>(<scope>)?: <subject>
```

| type | 含义 | 版本影响 |
|---|---|---|
| `feat` | 新功能 | MINOR |
| `fix` | bug 修复 | PATCH |
| `perf` | 性能优化 | PATCH |
| `refactor` | 重构（不改外部行为） | 不发版 |
| `docs` | 文档 | 不发版 |
| `build` / `ci` | 构建 / CI | 不发版 |
| `chore` / `test` / `style` | 杂项 / 测试 / 格式 | 不发版 |

- **破坏性变更 → MAJOR**：type 后加 `!`（如 `feat!:`），或在脚注写 `BREAKING CHANGE: <说明>`。
- **scope 建议**：`server` / `web` / `shared` / `cli` / `release` / `deps`。
- subject 用祈使句、简洁；中文 / 英文均可。
- 应急绕过钩子：`git commit --no-verify`（仅限确有必要，不要养成习惯）。

什么改动算哪个版本级别（尤其对 CLI 选项、默认行为、import/export 语义），见规范文档。

## 分支与 PR

- 一律从**最新 `origin/main`** 切分支：`git fetch && git checkout -b feature/<name> origin/main`。
  （不要基于本地旧分支——它们可能落后于已发布身份。）
- 通过 PR 合入 main；merge / squash 的标题同样遵守 Conventional Commits。

## 发版（在 `main` 上进行）

发版 = 本地用 `npm version` 打 tag，`git push --follow-tags` 即触发 GitHub Actions
自动 publish（`.github/workflows/release.yml`）。

```bash
git checkout main && git pull --ff-only   # 确保在最新 main
npm version <x.y.z>                        # bump package.json + commit + 打 tag v<x.y.z>
git push --follow-tags                     # 推 commit + tag；tag 即触发 CI 发布
```

`<x.y.z>` 按 SemVer 定，或用 `npm version patch|minor|major` 自增。CI 会：校验 tag ==
package.json 版本 → `npm test` + `typecheck` 闸门 → `npm publish` → 建 GitHub Release
（release notes 由 conventional-changelog 从 commits 现算）。

**发布前置**：仓库 Environment `NPM_PUBLISH` 下配 secret `NPM_PUBLISH_TOKEN`（bypass-2FA 的
npm token），一次性。开发者本地只需 git 推送权限，**不需要** npm login / OTP。
