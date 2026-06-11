# Changelog

## [1.0.2](https://github.com/zzusp/claude-code-session/compare/v1.0.1...v1.0.2) (2026-06-11)

### Features

* **message:** 会话消息 markdown 渲染 + tool 块摘要化，时间线与弹窗统一 ([6d5eb6b](https://github.com/zzusp/claude-code-session/commit/6d5eb6b54655d545ea98cb51d7e2a9adeee19edc))
* **session:** 会话列表错误数列 + 详情页错误筛选 ([31a3d85](https://github.com/zzusp/claude-code-session/commit/31a3d85fdcab25b4cbad97faa342733853e9a131))
* **session:** 会话详情新增思维/执行链神经放电可视化浮层 ([378d2df](https://github.com/zzusp/claude-code-session/commit/378d2df180567d9be1f117d2b6fac576d7dee5ae))
* **session:** 会话详情滚动时面包屑+卡片+搜索栏整体粘顶 ([7b66d60](https://github.com/zzusp/claude-code-session/commit/7b66d6042c2aee716e9081726840f55e566d9ae7))
* **version:** 新版本红点提示 + 弹窗信息展示优化 ([7f66e9d](https://github.com/zzusp/claude-code-session/commit/7f66e9d93487720e8ecfd3e284eef052424d191f))

### Bug Fixes

* **modified-files:** 空修改文件时保留三栏框架与对话栏 ([72404bc](https://github.com/zzusp/claude-code-session/commit/72404bc9bd4a033000d34546ec617e50336f1a95))

### Performance Improvements

* **modified-files:** 去掉 diff 行号 per-row sticky 消除滚动卡顿 ([afc9f40](https://github.com/zzusp/claude-code-session/commit/afc9f40e5686c1c9e177fbb4ec39f69bf7f0b62d))

### Reverts

* **session:** 移除思维/执行链神经放电可视化浮层 ([e91359e](https://github.com/zzusp/claude-code-session/commit/e91359e5d13abd280d329573dec97f14ece61d95)), closes [#59](https://github.com/zzusp/claude-code-session/issues/59)

## [1.0.1](https://github.com/zzusp/claude-code-session/compare/v1.0.0...v1.0.1) (2026-06-09)

### Features

* **disk:** 新增清理建议区块与孤儿目录单条删除 ([54942a7](https://github.com/zzusp/claude-code-session/commit/54942a7c40125ed73425a410651e2ebac924c278))
* **modified-files:** structuredPatch 驱动的 GitHub 风格统一 diff ([c93298c](https://github.com/zzusp/claude-code-session/commit/c93298c84f2761db42215f895c90ce660c161b05))
* **session:** 处理中新消息到达时对话自动滚到底 ([69321bb](https://github.com/zzusp/claude-code-session/commit/69321bbb9ee430c7079d9d1282098bbf2b7ad5e7))
* **session:** 会话详情页对运行中会话实时追加新消息 ([1cd5900](https://github.com/zzusp/claude-code-session/commit/1cd590088eae60691f0c25d99d0bf6c302f80b64))
* **session:** 区分「工作中」与「运行中」会话状态 ([e6292e7](https://github.com/zzusp/claude-code-session/commit/e6292e7cf837420080bc934092b7724114d191e4))
* **session:** 新增修改文件面板与定位跳转 ([312b2e6](https://github.com/zzusp/claude-code-session/commit/312b2e6a3e9075d026ec885ed0a3e53d4b8ec5bd))
* **session:** 修改文件抽屉 diff 增加行内 word-level 高亮 ([33d64ab](https://github.com/zzusp/claude-code-session/commit/33d64abb57c2d0e7e973eaa6baac310026117b92))
* **session:** 修改文件抽屉对话落底 + 分屏 diff + 文件名变更色 ([94efe05](https://github.com/zzusp/claude-code-session/commit/94efe05bd28846a9f72960f6911d088c33d4bd0b))
* **session:** 修改文件抽屉改为全屏铺满 ([c34375f](https://github.com/zzusp/claude-code-session/commit/c34375f51a36bf68c76f9c86ef35cacf050e2f0a))
* **session:** 修改文件抽屉重排为三栏（对话｜内容｜文件树） ([1817793](https://github.com/zzusp/claude-code-session/commit/1817793398e0d28f468c46ed99a9e312d1383f4c))
* **session:** 修改文件抽屉左右 git-diff + 打开文件 + 可拖拽栏宽 ([0954254](https://github.com/zzusp/claude-code-session/commit/09542542747954d56cf652f12c0f2d8f5d8820b8))
* **session:** 修改文件弹窗将多次变更按行号拼接为单文件左右对照 ([5541844](https://github.com/zzusp/claude-code-session/commit/554184427e2dfc5ba4e3da4c0b8ad6a359e0d268))
* **session:** 修改文件改用右侧抽屉 + IDE 目录树 + 内容查看 ([92b7b98](https://github.com/zzusp/claude-code-session/commit/92b7b98c13b181243da0099c5fffa2cf5e1c09b9))
* **version:** 添加新版本提示与一键更新 ([7a3e30a](https://github.com/zzusp/claude-code-session/commit/7a3e30a23d77013925f4102c4552d942f340a2ed))
* **web:** 在会话列表加多选 + 串行批量删除 ([34b0bfd](https://github.com/zzusp/claude-code-session/commit/34b0bfd78b3c8d368bf4fd9c02a01d68c2f73a42))

### Bug Fixes

* **claude-paths:** 按平台显式选 path.win32/path.posix，单测可跑真实 Windows 路径 ([#31](https://github.com/zzusp/claude-code-session/issues/31)) ([2dcd9d4](https://github.com/zzusp/claude-code-session/commit/2dcd9d4b5e65c6d3032e23b81f6c47081277ce4a))
* **modified-files:** 缩小"修改的文件"弹窗顶部 header 高度 ([3de1949](https://github.com/zzusp/claude-code-session/commit/3de1949f58aee9585c298c118008899dcc60eed5))
* **modified-files:** header 再压一档 52px→46px ([f8266a7](https://github.com/zzusp/claude-code-session/commit/f8266a75c23110ce0db6db301e6c7db01e26a9f9))
* **session:** 修复抽屉新消息跟随引用已删除的 pendingJump 报错 ([9c8eb14](https://github.com/zzusp/claude-code-session/commit/9c8eb1412f6493ff8ccda009eb63678c78b580fb)), closes [#49](https://github.com/zzusp/claude-code-session/issues/49) [#50](https://github.com/zzusp/claude-code-session/issues/50)
* **session:** 修复处理中指示器错位 + 修改文件弹窗对话同步显示处理中 ([6114040](https://github.com/zzusp/claude-code-session/commit/6114040be9e3009a3d88fb12b8b65f80b3b36770))
* **session:** 修改文件 diff 给单独的删除/新增行补上饱和高亮 ([903edc4](https://github.com/zzusp/claude-code-session/commit/903edc4e53f6f04641465c021a1d191bc2940032))

### Performance Improvements

* **disk:** 磁盘占用页加载从 ~109s 降到 ~2.5s ([0cc4285](https://github.com/zzusp/claude-code-session/commit/0cc42858f0370dd846f8016276ca0e7df4942460))

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
