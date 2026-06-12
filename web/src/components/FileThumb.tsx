// Claude.ai-style tilted "page" thumbnail. A small document peeking up from the
// bottom, tilted a few degrees; on hover it straightens and scales — the playful
// micro-interaction claude.ai gives its artifact/file cards. Drive the hover from
// a clickable ancestor that carries the `group/file` class (group-hover/file:*).
//
// The glyph path is Phosphor's `file-text` (256×256 viewBox), the exact icon
// claude.ai uses inside its artifact block.
export default function FileThumb({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const page =
    size === 'sm' ? 'h-[26px] w-[20px] pt-[4px]' : 'h-[34px] w-[26px] pt-[5px]';
  const wrap = size === 'sm' ? 'w-[24px]' : 'w-[30px]';
  const glyph = size === 'sm' ? 12 : 14;
  return (
    <span
      className={`pointer-events-none relative flex ${wrap} shrink-0 items-end justify-center`}
      aria-hidden
    >
      <span
        className={
          `relative flex ${page} translate-y-[2px] -rotate-6 items-start justify-center ` +
          'overflow-hidden rounded-t-md border border-[var(--color-hairline-strong)] ' +
          'bg-gradient-to-b from-[var(--color-sunken)] to-transparent ' +
          // Tailwind v4 drives rotate/scale/translate as individual CSS properties
          // (not the `transform` shorthand), so transition-all is needed to tween
          // the hover lift — transition-transform would leave it snapping instantly.
          'transition-all duration-300 ease-out will-change-transform ' +
          'group-hover/file:translate-y-0 group-hover/file:-rotate-3 group-hover/file:scale-105'
        }
      >
        <FileTextGlyph size={glyph} />
      </span>
    </span>
  );
}

function FileTextGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      className="text-[var(--color-fg-muted)]"
      aria-hidden
    >
      <path d="M212.24,83.76l-56-56A6,6,0,0,0,152,26H56A14,14,0,0,0,42,40V216a14,14,0,0,0,14,14H200a14,14,0,0,0,14-14V88A6,6,0,0,0,212.24,83.76ZM158,46.48,193.52,82H158ZM200,218H56a2,2,0,0,1-2-2V40a2,2,0,0,1,2-2h90V88a6,6,0,0,0,6,6h50V216A2,2,0,0,1,200,218Zm-34-82a6,6,0,0,1-6,6H96a6,6,0,0,1,0-12h64A6,6,0,0,1,166,136Zm0,32a6,6,0,0,1-6,6H96a6,6,0,0,1,0-12h64A6,6,0,0,1,166,168Z" />
    </svg>
  );
}
