# Modified-files drawer — split diff / open-file / resizable rail

## 需求

在「修改的文件」右侧抽屉（`web/src/components/ModifiedFilesDrawer.tsx`）上做 4 项增强：

1. **抽屉更宽**：上限 900px → 1280px（`w-[min(96vw,1280px)]`）。
2. **改动前后改成左右 git-diff**：原本 old/new 上下堆叠，改为行级 LCS split diff——
   左栏=修改前、右栏=修改后，逐行对齐，带行号 gutter、`+/−` 标记、红/绿底色。
3. **每个文件可点击打开真实文件**：树行 hover 出「打开」图标 + 明细头部「打开文件」按钮，
   走新后端 `POST /api/sessions/:pid/:sid/open-file`（系统默认程序打开；校验该路径属于本会话）。
4. **文件树显示完整文件名 + 横向滚动 + 可拖拽分割线**：文件名不再截断（`whitespace-nowrap`），
   超宽时树栏横向滚动；树栏与内容区之间的分割线可拖拽实时调宽窄。

## 改动

- `server/lib/open-folder.ts`：提取共享 `launch()`，新增 `openFile()`（`isFile` 校验），类型改名 `OpenResult`。
- `server/routes/sessions.ts`：`POST /:pid/:sid/open-file`——Origin/CSRF + isSafeId + body 校验 +
  「成员资格」校验（从 jsonl 重新聚合，只允许打开本会话改过的文件）+ `openFile`。
- `shared/types.ts`：新增 `OpenFileResult`。
- `web/src/lib/i18n.ts`：`session.modified.openFile` / `openFailed`（zh+en）。
- `web/src/routes/SessionDetail.tsx`：`openFileMutation` + 传 `onOpenFile`。
- `web/src/components/ModifiedFilesDrawer.tsx`：宽度、`DiffView` 重写为 split、树行打开按钮、
  明细头部打开按钮、`whitespace-nowrap` + `ul w-max`、可拖拽 splitter（pointer capture）。

## 验证（scripts/verify-ui.mjs）

隔离 HOME 起后端 + 内置 SPA，Playwright 驱动真实 UI：
- 抽屉宽度 ≈ 1280（viewport 1400，96vw=1344 → 命中 1280 上限）。
- Edit 文件 → split diff：`before`/`after` 双栏头、old+new 同屏、行号。
- 明细头部「open file」按钮可见；树行存在打开按钮（DOM）。
- 超长文件名 → 树滚动容器 `scrollWidth > clientWidth`。
- 拖拽 splitter → 树栏宽度随之增/减。
- 后端 open-file 守卫（无副作用，不真正 spawn）：403 无 Origin / 400 无 body / 400 非成员 / 404 成员但磁盘不存在。
