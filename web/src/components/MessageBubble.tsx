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
  if (message.type === 'user') return <UserMessage message={message} query={query} />;
  return <AssistantMessage message={message} query={query} />;
}

function AssistantMessage({ message, query }: { message: Message; query: string }) {
  const t = useT();
  return (
    <div className="flex items-start gap-3" data-uuid={message.uuid}>
      <Avatar role="assistant" />
      <div className="min-w-0 flex-1 max-w-[min(54rem,calc(100%-3rem))]">
        <Header
          align="left"
          label={t('message.role.claude')}
          model={message.model}
          ts={message.ts}
          accent
        />
        <article className="mt-1.5 rounded-2xl rounded-tl-sm border border-l-[3px] border-l-[var(--color-accent)] border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3 shadow-[0_1px_0_0_var(--color-hairline)]">
          <Blocks blocks={message.blocks} query={query} />
        </article>
      </div>
    </div>
  );
}

function UserMessage({ message, query }: { message: Message; query: string }) {
  const t = useT();
  return (
    <div className="flex items-start justify-end gap-3" data-uuid={message.uuid}>
      <div className="min-w-0 max-w-[min(46rem,calc(100%-3rem))]">
        <Header
          align="right"
          label={t('message.role.you')}
          model={message.model}
          ts={message.ts}
        />
        <article className="mt-1.5 rounded-2xl rounded-tr-sm bg-[var(--color-accent-soft)] px-4 py-3 text-[var(--color-accent-ink)] dark:text-[var(--color-fg-primary)]">
          <Blocks blocks={message.blocks} query={query} />
        </article>
      </div>
      <Avatar role="user" />
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
  align,
  label,
  model,
  ts,
  accent,
}: {
  align: 'left' | 'right';
  label: string;
  model: string | null;
  ts: string | null;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'flex items-baseline gap-2 text-[11px] ' +
        (align === 'right' ? 'flex-row-reverse text-right' : '')
      }
    >
      <span
        className={
          'font-display text-[14px] font-medium tracking-tight ' +
          (accent
            ? 'text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]'
            : 'text-[var(--color-fg-primary)]')
        }
      >
        {label}
      </span>
      {model && (
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
          {model}
        </span>
      )}
      <time className="font-mono tabular-nums text-[var(--color-fg-muted)]">
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
                className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-muted)]"
              >
                {t('tool.image')}{block.mediaType ? ` · ${block.mediaType}` : ''}
              </div>
            );
          default:
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-md border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-xs text-[var(--color-fg-secondary)]"
              >
                {JSON.stringify(block.raw, null, 2)}
              </pre>
            );
        }
      })}
    </div>
  );
}

function Avatar({ role }: { role: 'user' | 'assistant' }) {
  if (role === 'assistant') {
    return (
      <span
        aria-hidden
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] text-[var(--color-accent)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M19 7.5A8 8 0 1 0 19 16.5" />
          <path d="M15.5 9.5a4.5 4.5 0 1 0 0 5" opacity="0.45" />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-fg-primary)] font-display text-sm font-medium text-[var(--color-canvas)]"
    >
      Y
    </span>
  );
}
