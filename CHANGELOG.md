# Changelog

本项目所有值得记录的变更都会写在这里。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)。

从 `1.0.1` 起，本文件由 [`release-it`](https://github.com/release-it/release-it) 依据
[Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 在发版时自动生成。

## [Unreleased]

_（下一版发布时，本节内容会被 `release-it` 根据自上次 tag 以来的 Conventional Commits 自动填充。）_

## [1.0.0] - 2026-06-08

首个公开发布版本。`@zzusp/ccsm` —— 一个本地 Web UI，用于浏览和清理 `~/.claude/` 下的 Claude Code 会话历史，默认对磁盘只读，写操作仅在 UI 显式触发时发生。

### Added

- **CLI**：`ccsm` 命令一键启动（`npx @zzusp/ccsm` 或全局安装）。支持 `-p/--port`、`--host`、`-o/--open`、`-h/--help`、`-v/--version`；默认绑定 `127.0.0.1`，端口在 3131–3140 间自动顺延。
- **浏览**：按项目浏览全部会话，展示标题、消息数、字节占用、存活状态徽标（`live · pid N` / `recently active` / `idle`）。
- **删除**：单选 / 多选级联删除，跨 5 处存储位置清理，内置安全网（存活 PID 或 5 分钟内活跃的 session 跳过不删）。
- **磁盘用量**：`/disk` 路由可视化 `~/.claude/` 各类文件的占用。
- **跨会话搜索**：跨项目检索会话内容。
- **项目记忆**：查看每个项目的 memory。
- **跨设备共享**：导出会话 + 记忆为路径无关的可移植 bundle，并在另一台机器上导入（带 dry-run 预览，路径自动重映射）。
- **会话重命名**：内联重命名（向 `.jsonl` 追加 `custom-title`，存活 PID 占用时拒绝）。
- **国际化与主题**：中 / 英文界面，明暗主题。

[Unreleased]: https://github.com/zzusp/claude-code-session/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/zzusp/claude-code-session/releases/tag/v1.0.0
