import { useState } from 'react';
import type { Block } from '../lib/api.ts';
import HighlightedText from './HighlightedText.tsx';

const PREVIEW_CHARS = 280;

export function ToolUseBlock({
  block,
  query,
}: {
  block: Extract<Block, { type: 'tool_use' }>;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const inputJson = JSON.stringify(block.input, null, 2);
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/40 text-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
      >
        <span className="font-mono text-xs font-medium text-blue-800">
          ⚙ {block.name}
        </span>
        <span className="text-xs text-blue-600">{open ? 'collapse' : 'expand'}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-blue-200 px-3 py-2 font-mono text-xs text-neutral-800">
          <HighlightedText text={inputJson} query={query} />
        </pre>
      )}
    </div>
  );
}

export function ToolResultBlock({
  block,
  query,
}: {
  block: Extract<Block, { type: 'tool_result' }>;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const long = block.content.length > PREVIEW_CHARS;
  const visible = open || !long ? block.content : block.content.slice(0, PREVIEW_CHARS) + '…';

  const tone = block.isError
    ? 'border-red-300 bg-red-50/60 text-red-900'
    : 'border-emerald-200 bg-emerald-50/40 text-neutral-800';

  return (
    <div className={`rounded-md border text-sm ${tone}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <span className="font-mono text-xs font-medium">
          {block.isError ? '⚠ tool error' : '↩ tool result'}
        </span>
        {long && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs underline"
          >
            {open ? 'collapse' : 'expand'}
          </button>
        )}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-current/20 px-3 py-2 font-mono text-xs">
        <HighlightedText text={visible} query={query} />
      </pre>
    </div>
  );
}

export function ThinkingBlock({
  block,
  query,
}: {
  block: Extract<Block, { type: 'thinking' }>;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-100 text-sm text-neutral-700">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
      >
        <span className="font-mono text-xs font-medium">💭 thinking</span>
        <span className="text-xs text-neutral-500">{open ? 'collapse' : 'expand'}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-neutral-200 px-3 py-2 font-mono text-xs text-neutral-700">
          <HighlightedText text={block.text} query={query} />
        </pre>
      )}
    </div>
  );
}
