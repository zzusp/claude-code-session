# Session 详情页 — 过滤器扩展（"仅我"）

## Context

`SessionDetail.tsx` 的 sticky toolbar 现有两个过滤器：搜索框（`query`）+ "system" checkbox（`showMeta`，控制是否显示带 SYSTEM_TAG 的元消息）。用户想加第三个过滤——"只看自己发的"，方便快速回顾自己在该会话里说了什么、跳过 Claude 的长回复和工具结果。

## 设计

复用已有过滤管线，加一个独立 checkbox 与 `showMeta` 并排。两个开关正交：
- `onlyUser` 控制"是否真实用户输入"
- `showMeta` 控制 `isMeta`（系统标签）

**关键陷阱**：Anthropic API 协议中，工具返回（`tool_result`）以 `type:'user'` 角色传回——所以 `message.type === 'user'` 实际包含两类消息：用户键入的和工具返回的。在 hiq 8ce3fb5b 测试 session 中 92 个 `type:user` 消息里 84 个其实是工具返回，只有 5 个是真实用户键入。

正确的"真实用户消息"谓词与 `MessageBubble.tsx:14-23` 的渲染分类完全对齐：
```ts
function isUserTyped(m: Message): boolean {
  if (m.type !== 'user') return false;
  if (m.blocks.length === 0) return true;
  return m.blocks.some((b) => b.type !== 'tool_result');
}
```
即：blocks 全是 `tool_result` 时不算"用户"，与 MessageBubble 把这种消息渲染成 "Tool" 而非 "You" 的视觉一致。

UX 文案选 "only me" / "仅我"——与 `message.role.you = 'You' / '我'` 的称谓体系一致；checkbox 在 toolbar 上空间也更紧凑。

## 关键改动

### `web/src/routes/SessionDetail.tsx`

1. state（紧跟 `showMeta`）：
   ```tsx
   const [onlyUser, setOnlyUser] = useState(false);
   ```

2. filter（`visibleMessages` useMemo 内追加，deps 加 `onlyUser`）：
   ```tsx
   if (onlyUser) list = list.filter((m) => isUserTyped(m.message));
   ```
   `isUserTyped` 定义见上节，放在文件底部模块作用域。

3. toolbar checkbox（紧贴 `system` checkbox 之后，markup 完全同款）

### `web/src/lib/i18n.ts`

新增 `common.onlyUser`：en `'only me'` / zh `'仅我'`。

## Windowing 与 intent-driven 过滤的关系

`renderList` 在无搜索时做 `visibleMessages.slice(-windowSize)`（默认 50），是为了"按近期分页浏览"。但这与 intent-driven 过滤（搜索、仅我）冲突——用户开过滤就是想看**全部命中**，不是分页中的最后一页。否则一个有 200 条用户消息的 session 开 "仅我" 也只会显示最后 50 条，前 150 条被窗口裁掉，行为可疑。

实现：抽出 `skipWindowing = !!deferredQuery || onlyUser`，作为统一旁路：
```ts
const skipWindowing = !!deferredQuery || onlyUser;
const renderList = skipWindowing ? visibleMessages : visibleMessages.slice(-windowSize);
const hasMoreEarlier = !skipWindowing && renderList.length < visibleMessages.length;
```

`showMeta` 不进 `skipWindowing`——它是"显隐系统标签"的 UI 偏好，不是"找匹配"，仍然按时间窗口分页。

## 不做

- 不改 `showMeta` 为下拉/radio——保持两 checkbox 并排的现有 UX 一致性
- 不持久化（`query` / `showMeta` 也未持久化，遵循同一约定）
- 不动 `session.shown` 的 `{{shown}} / {{total}}` 计数——分母已经是 `visibleMessages.length`，加新过滤后自动反映
