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

版本号、`CHANGELOG.md`、git tag、npm 发布、GitHub Release 全部由 `release-it` 自动完成。

```bash
git checkout main && git pull        # 确保在最新 main
npm run release:dry                  # 预演：确认推算的版本号 + CHANGELOG 片段
npm run release                      # 正式发布
```

`npm run release` 会依次：跑 `typecheck` + `build` 闸门 → 按 commits 算版本 →
更新 `CHANGELOG.md` 与 `package.json` → 提交并打 tag `vX.Y.Z` → push →
`npm publish` → 建 GitHub Release。

**首次发布前置**：`npm login`（具备 `@zzusp` 发布权限）、`gh auth login` 或设置环境变量
`GITHUB_TOKEN`（供建 GitHub Release）。
