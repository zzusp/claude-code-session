import { lazy, Suspense } from 'react';
import type { Block, Message } from '../lib/api.ts';
import { formatDateTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import HighlightedText from './HighlightedText.tsx';
import { ThinkingBlock, ToolResultBlock, ToolUseBlock } from './ToolBlock.tsx';

// markdown 渲染按需加载（remark/micromark 在独立 chunk），加载完成前
// Suspense fallback 退回纯文本——内容始终可见，不闪空白。
const MarkdownContent = lazy(() => import('./MarkdownContent.tsx'));

/** toolUseId → 工具名。tool_use 与其 tool_result 分属两条消息，调用方
 *  （时间线 / 弹窗对话栏）从已加载的全量消息构建后传入，用于 result 头部标注来源。 */
export type ToolNameLookup = ReadonlyMap<string, string>;

/** toolUseId → 配对的 tool_result。传入时（会话时间线），调用块在展开体尾部内联其返回，
 *  独立的「工具」返回消息由调用方提前剔除。不传时（如修改文件视图）维持原样。 */
export type ToolResultLookup = ReadonlyMap<string, { content: string; isError: boolean }>;

export default function MessageBubble({
  message,
  query,
  toolNames,
  toolResults,
}: {
  message: Message;
  query: string;
  toolNames?: ToolNameLookup;
  toolResults?: ToolResultLookup;
}) {
  if (message.isMeta) return <SystemMessage message={message} query={query} />;
  if (
    message.type === 'user' &&
    message.blocks.length > 0 &&
    message.blocks.every((b) => b.type === 'tool_result')
  ) {
    return (
      <AssistantMessage message={message} query={query} toolNames={toolNames} variant="tool" />
    );
  }
  if (message.type === 'user') {
    const command = commandInfoOf(message);
    if (command) return <CommandMessage message={message} command={command} query={query} />;
    return <UserMessage message={message} query={query} toolNames={toolNames} />;
  }
  return (
    <AssistantMessage
      message={message}
      query={query}
      toolNames={toolNames}
      toolResults={toolResults}
    />
  );
}

// Assistant turn — claude.ai renders this as full-width prose, no bubble / card /
// avatar. Tool-result turns get a faintly inset container so they read as machine
// output rather than Claude's own voice.
function AssistantMessage({
  message,
  query,
  toolNames,
  toolResults,
  variant = 'assistant',
}: {
  message: Message;
  query: string;
  toolNames?: ToolNameLookup;
  toolResults?: ToolResultLookup;
  variant?: 'assistant' | 'tool';
}) {
  const t = useT();
  const isTool = variant === 'tool';
  const label = isTool ? t('message.role.tool') : t('message.role.claude');
  return (
    <div className="group" data-uuid={message.uuid}>
      <MetaRow label={label} model={isTool ? null : message.model} ts={message.ts} />
      <div
        className={
          isTool
            ? 'mt-1 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-sunken)]/60 px-3.5 py-2.5'
            : 'mt-0.5'
        }
      >
        <Blocks
          blocks={message.blocks}
          query={query}
          toolNames={toolNames}
          toolResults={toolResults}
          markdown={!isTool && !query}
        />
      </div>
    </div>
  );
}

// Human turn — claude.ai shows a right-aligned soft bubble, no avatar.
function UserMessage({
  message,
  query,
  toolNames,
}: {
  message: Message;
  query: string;
  toolNames?: ToolNameLookup;
}) {
  const t = useT();
  return (
    <div className="group flex flex-col items-end" data-uuid={message.uuid}>
      <MetaRow label={t('message.role.you')} model={message.model} ts={message.ts} align="right" />
      <div className="mt-0.5 max-w-[80%] rounded-[1.25rem] rounded-tr-md bg-[var(--color-sunken)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--color-fg-primary)]">
        <Blocks blocks={message.blocks} query={query} toolNames={toolNames} />
      </div>
    </div>
  );
}

// 斜杠命令的用户消息（/clear、/model …）在 jsonl 里是一坨 `<command-name>…</command-name>`
// XML 正文。解析出命令名 / 参数 / 本地输出，渲染成干净的命令胶囊，而不是裸 XML。
interface CommandInfo {
  name: string;
  args: string;
  stdout: string;
}

const COMMAND_TAG_RE = /^\s*<command-(?:name|message|args)>/;

function commandInfoOf(message: Message): CommandInfo | null {
  if (message.type !== 'user') return null;
  const text = message.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as Extract<Block, { type: 'text' }>).text)
    .join('\n');
  if (!COMMAND_TAG_RE.test(text)) return null;
  const pick = (tag: string) =>
    text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? '';
  const info = {
    name: pick('command-name'),
    args: pick('command-args'),
    stdout: pick('local-command-stdout'),
  };
  return info.name || info.args ? info : null;
}

// 命令胶囊 + 可选参数气泡，靠右对齐（与人类消息同侧，命令也是用户发起的）。
function CommandMessage({
  message,
  command,
  query,
}: {
  message: Message;
  command: CommandInfo;
  query: string;
}) {
  const t = useT();
  return (
    <div className="group flex flex-col items-end" data-uuid={message.uuid}>
      <MetaRow label={t('message.role.you')} ts={message.ts} align="right" />
      <div className="mt-0.5 flex max-w-[80%] flex-col items-end gap-1.5">
        {command.name && (
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-hairline-strong)] bg-[var(--color-sunken)] px-2.5 py-1 font-mono text-[12.5px] font-medium text-[var(--color-fg-primary)]">
            <span className="text-[var(--color-fg-muted)]">
              <CommandGlyph />
            </span>
            {command.name}
          </span>
        )}
        {command.args && (
          <div className="rounded-[1.25rem] rounded-tr-md bg-[var(--color-sunken)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--color-fg-primary)]">
            <HighlightedText text={command.args} query={query} />
          </div>
        )}
        {command.stdout && (
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[11.5px] text-[var(--color-fg-secondary)]">
            <HighlightedText text={command.stdout} query={query} />
          </pre>
        )}
      </div>
    </div>
  );
}

// 终端提示符样式的小图标（`›_`），标记这是一条斜杠命令而非普通消息。
function CommandGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 8l4 4-4 4" />
      <path d="M13 16h4" />
    </svg>
  );
}

function SystemMessage({ message, query }: { message: Message; query: string }) {
  const t = useT();
  return (
    <div className="my-2 flex items-center gap-3" data-uuid={message.uuid}>
      <span className="h-px flex-1 bg-[var(--color-hairline)]" />
      <div className="max-w-2xl text-center">
        <p className="text-[11px] font-medium text-[var(--color-fg-faint)]">
          {t('message.role.system')} · {formatDateTime(message.ts)}
        </p>
        <div className="mt-1 space-y-1 text-xs text-[var(--color-fg-muted)]">
          {message.blocks.map((block, i) => {
            if (block.type === 'text') {
              const text = block.text.length > 200 ? block.text.slice(0, 200) + '…' : block.text;
              return (
                <p key={i} className="whitespace-pre-wrap break-words">
                  <HighlightedText text={text} query={query} />
                </p>
              );
            }
            if (block.type === 'tool_use') return <p key={i}>{t('tool.use')} · {block.name}</p>;
            if (block.type === 'tool_result') return <p key={i}>{t('tool.result')}</p>;
            return null;
          })}
        </div>
      </div>
      <span className="h-px flex-1 bg-[var(--color-hairline)]" />
    </div>
  );
}

// Subtle role + model + time line above a turn. Muted and small so the dominant
// impression stays claude.ai-clean; useful here because this is a history browser.
function MetaRow({
  label,
  model,
  ts,
  align = 'left',
}: {
  label: string;
  model?: string | null;
  ts: string | null;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={
        'flex items-baseline gap-2 text-[11px] text-[var(--color-fg-faint)] ' +
        (align === 'right' ? 'flex-row-reverse' : '')
      }
    >
      <span className="font-medium text-[var(--color-fg-muted)]">{label}</span>
      {model && <span className="truncate">{model}</span>}
      <time className="tabular-nums">{formatDateTime(ts)}</time>
    </div>
  );
}

function Blocks({
  blocks,
  query,
  toolNames,
  toolResults,
  markdown = false,
}: {
  blocks: Block[];
  query: string;
  toolNames?: ToolNameLookup;
  toolResults?: ToolResultLookup;
  /** true=assistant 回复且非搜索态，text block 走 markdown 排版；否则纯文本+高亮。 */
  markdown?: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text': {
            const plain = (
              <p
                key={i}
                className="whitespace-pre-wrap break-words text-[15px] leading-7"
              >
                <HighlightedText text={block.text} query={query} />
              </p>
            );
            if (!markdown) return plain;
            return (
              <Suspense key={i} fallback={plain}>
                <MarkdownContent text={block.text} />
              </Suspense>
            );
          }
          case 'tool_use':
            return (
              <ToolUseBlock
                key={i}
                block={block}
                query={query}
                result={block.id ? toolResults?.get(block.id) : undefined}
              />
            );
          case 'tool_result':
            return (
              <ToolResultBlock
                key={i}
                block={block}
                query={query}
                toolName={toolNames?.get(block.toolUseId)}
              />
            );
          case 'thinking':
            return <ThinkingBlock key={i} block={block} query={query} />;
          case 'image':
            return (
              <div
                key={i}
                className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-muted)]"
              >
                {t('tool.image')}{block.mediaType ? ` · ${block.mediaType}` : ''}
              </div>
            );
          default:
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-xl border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-xs text-[var(--color-fg-secondary)]"
              >
                {JSON.stringify(block.raw, null, 2)}
              </pre>
            );
        }
      })}
    </div>
  );
}

// Trailing "Claude is working…" row — sits at the tail of a timeline while the
// live poll keeps `isWorking` true, then unmounts when the reply lands.
export function WorkingIndicator() {
  const t = useT();
  return (
    <li className="py-2" aria-live="polite">
      <div className="flex items-center gap-2.5 text-[var(--color-fg-muted)]">
        <span aria-hidden className="loading-dots text-[var(--color-accent)]">
          <span />
          <span />
          <span />
        </span>
        <span className="text-[14px]">{t('session.working.indicator')}</span>
      </div>
    </li>
  );
}
