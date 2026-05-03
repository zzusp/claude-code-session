import type { Block, Message } from '../lib/api.ts';
import { formatDateTime } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import HighlightedText from './HighlightedText.tsx';
import { ThinkingBlock, ToolResultBlock, ToolUseBlock } from './ToolBlock.tsx';

export default function MessageBubble({
  message,
  query,
}: {
  message: Message;
  query: string;
}) {
  if (message.isMeta) return <SystemMessage message={message} query={query} />;
  if (
    message.type === 'user' &&
    message.blocks.length > 0 &&
    message.blocks.every((b) => b.type === 'tool_result')
  ) {
    return <Entry message={message} query={query} variant="tool" />;
  }
  if (message.type === 'user') return <Entry message={message} query={query} variant="user" />;
  return <Entry message={message} query={query} variant="assistant" />;
}

function Entry({
  message,
  query,
  variant,
}: {
  message: Message;
  query: string;
  variant: 'user' | 'assistant' | 'tool';
}) {
  const t = useT();
  const label =
    variant === 'user'
      ? t('message.role.you')
      : variant === 'tool'
        ? t('message.role.tool')
        : t('message.role.claude');
  const ruleClass =
    variant === 'user'
      ? 'border-[var(--color-fg-primary)]'
      : variant === 'tool'
        ? 'border-[var(--color-hairline-strong)]'
        : 'border-[var(--color-accent)]';

  return (
    <div className={`relative border-l-2 pl-5 ${ruleClass}`} data-uuid={message.uuid}>
      <Header label={label} model={message.model} ts={message.ts} />
      <Blocks blocks={message.blocks} query={query} />
    </div>
  );
}

function SystemMessage({ message, query }: { message: Message; query: string }) {
  const t = useT();
  return (
    <div className="my-2 flex items-center gap-3 px-4" data-uuid={message.uuid}>
      <span className="h-px flex-1 bg-[var(--color-hairline)]" />
      <div className="max-w-2xl text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {t('message.role.system')} · {formatDateTime(message.ts)}
        </p>
        <div className="mt-1 space-y-1 text-xs italic text-[var(--color-fg-muted)]">
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

function Header({
  label,
  model,
  ts,
}: {
  label: string;
  model: string | null;
  ts: string | null;
}) {
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <span className="eyebrow">{label}</span>
      {model && (
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
          {model}
        </span>
      )}
      <time className="ml-auto font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)]">
        {formatDateTime(ts)}
      </time>
    </div>
  );
}

function Blocks({ blocks, query }: { blocks: Block[]; query: string }) {
  const t = useT();
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text':
            return (
              <p
                key={i}
                className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed"
              >
                <HighlightedText text={block.text} query={query} />
              </p>
            );
          case 'tool_use':
            return <ToolUseBlock key={i} block={block} query={query} />;
          case 'tool_result':
            return <ToolResultBlock key={i} block={block} query={query} />;
          case 'thinking':
            return <ThinkingBlock key={i} block={block} query={query} />;
          case 'image':
            return (
              <div
                key={i}
                className="border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-muted)]"
              >
                {t('tool.image')}{block.mediaType ? ` · ${block.mediaType}` : ''}
              </div>
            );
          default:
            return (
              <pre
                key={i}
                className="overflow-x-auto border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-xs text-[var(--color-fg-secondary)]"
              >
                {JSON.stringify(block.raw, null, 2)}
              </pre>
            );
        }
      })}
    </div>
  );
}
