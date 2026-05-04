import { useState } from 'react';
import type { Block } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
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
    <div className="overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-sunken)] text-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-[var(--color-canvas)]"
      >
        <span className="flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-fg-secondary)]">
          <Glyph kind="tool" /> {block.name}
        </span>
        <Caret open={open} />
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[11.5px] text-[var(--color-fg-primary)]">
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const long = block.content.length > PREVIEW_CHARS;
  const visible = open || !long ? block.content : block.content.slice(0, PREVIEW_CHARS) + '…';

  const tone = block.isError
    ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
    : 'border-[var(--color-hairline)] bg-[var(--color-sunken)] text-[var(--color-fg-primary)]';

  return (
    <div className={`overflow-hidden rounded-xl border text-sm ${tone}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em]">
          <Glyph kind={block.isError ? 'error' : 'result'} />
          {block.isError ? t('tool.error') : t('tool.result')}
        </span>
        {long && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="font-mono text-[10.5px] uppercase tracking-[0.16em] underline-offset-2 hover:underline"
          >
            {open ? t('common.collapse') : t('common.expand')}
          </button>
        )}
      </div>
      <pre className={`overflow-x-auto whitespace-pre-wrap break-words border-t px-3 py-2 font-mono text-[11.5px] ${block.isError ? 'border-[var(--color-danger)]/30' : 'border-[var(--color-hairline)] bg-[var(--color-surface)]'}`}>
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const hasText = block.text.trim() !== '';
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-sunken)] text-sm text-[var(--color-fg-secondary)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em]">
          <Glyph kind="thinking" /> {t('tool.thinking')}
        </span>
        <Caret open={open} />
      </button>
      {open && (
        hasText ? (
          <div className="whitespace-pre-wrap break-words border-t border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-fg-secondary)]">
            <HighlightedText text={block.text} query={query} />
          </div>
        ) : (
          <p className="border-t border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-3 py-2 text-[12px] italic text-[var(--color-fg-muted)]">
            {t('tool.thinkingEncrypted')}
          </p>
        )
      )}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--color-fg-muted)] transition-transform"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Glyph({ kind }: { kind: 'tool' | 'result' | 'error' | 'thinking' }) {
  const common = {
    width: 11,
    height: 11,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'tool') {
    return (
      <svg {...common}>
        <path d="M14.7 5.3a3 3 0 1 0 4 4l-2.5 2.5 5 5-2.7 2.7-5-5-2.5 2.5a3 3 0 1 0-4-4z" />
      </svg>
    );
  }
  if (kind === 'result') {
    return (
      <svg {...common}>
        <path d="M5 12h13" />
        <path d="M13 7l5 5-5 5" />
      </svg>
    );
  }
  if (kind === 'error') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4.5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.6 1.1 2.7v.5h5v-.5c0-1.1.3-2.1 1.1-2.7A6 6 0 0 0 12 3z" />
    </svg>
  );
}
