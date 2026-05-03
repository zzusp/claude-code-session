import type { Message } from '../lib/api.ts';
import { formatDateTime } from '../lib/format.ts';
import HighlightedText from './HighlightedText.tsx';
import { ThinkingBlock, ToolResultBlock, ToolUseBlock } from './ToolBlock.tsx';

const ROLE_LABEL: Record<Message['type'], string> = {
  user: 'User',
  assistant: 'Assistant',
};

const ROLE_TONE: Record<Message['type'], string> = {
  user: 'border-l-neutral-300 bg-white',
  assistant: 'border-l-indigo-300 bg-indigo-50/30',
};

export default function MessageBubble({
  message,
  query,
}: {
  message: Message;
  query: string;
}) {
  return (
    <article
      className={`rounded-md border border-neutral-200 border-l-4 px-4 py-3 ${
        ROLE_TONE[message.type]
      } ${message.isMeta ? 'opacity-60' : ''}`}
      data-uuid={message.uuid}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3 text-xs text-neutral-500">
        <span className="font-medium text-neutral-700">
          {ROLE_LABEL[message.type]}
          {message.model && (
            <span className="ml-2 font-mono text-neutral-400">{message.model}</span>
          )}
          {message.isMeta && <span className="ml-2 text-neutral-400">(system)</span>}
        </span>
        <time className="font-mono">{formatDateTime(message.ts)}</time>
      </header>
      <div className="space-y-2">
        {message.blocks.map((block, i) => {
          switch (block.type) {
            case 'text':
              return (
                <p
                  key={i}
                  className="whitespace-pre-wrap break-words text-sm text-neutral-800"
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
                  className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500"
                >
                  🖼 image{block.mediaType ? ` (${block.mediaType})` : ''}
                </div>
              );
            default:
              return (
                <pre
                  key={i}
                  className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-600"
                >
                  {JSON.stringify(block.raw, null, 2)}
                </pre>
              );
          }
        })}
      </div>
    </article>
  );
}
