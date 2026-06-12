import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** 竖向可拖拽分割线。拖动时把指针 clientX 连同容器矩形回传，由调用方换算出某侧宽度。
 *  用 setPointerCapture 锁指针，拖出分割线也不丢事件。
 *
 *  分割线本身是整列高的细线（命中区更宽），中间叠一枚抓手（grip）。会话页的左栏是
 *  window 滚动的长时间线，列高可达数千 px，所以抓手用 sticky 钉在视口竖直中线上，
 *  滚到哪都够得着、不必先把页面滚到列中点。 */
export function Splitter({
  getRect,
  onResize,
}: {
  getRect: () => DOMRect | null;
  onResize: (clientX: number, rect: DOMRect) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingRef.current = true;
        setDragging(true);
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return;
        const rect = getRect();
        if (rect) onResize(e.clientX, rect);
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLDivElement>) => {
        draggingRef.current = false;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      className="group relative w-3 shrink-0 cursor-col-resize touch-none self-stretch"
    >
      {/* 整列高的细线：拖动 / 悬浮时染成 accent。 */}
      <span
        className={
          'pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors ' +
          (dragging
            ? 'bg-[var(--color-accent)]'
            : 'bg-[var(--color-hairline)] group-hover:bg-[var(--color-accent)]')
        }
        aria-hidden
      />
      {/* 抓手：sticky 钉在视口竖直中线，长列里始终可见可拖。 */}
      <span
        style={{ top: 'calc(50dvh - 1.25rem)' }}
        className={
          'pointer-events-none sticky mx-auto flex h-10 w-[6px] flex-col items-center justify-center gap-[3px] rounded-full border transition-colors ' +
          (dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
            : 'border-[var(--color-hairline-strong)] bg-[var(--color-surface)] group-hover:border-[var(--color-accent)] group-hover:bg-[var(--color-accent-soft)]')
        }
        aria-hidden
      >
        <Dot dragging={dragging} />
        <Dot dragging={dragging} />
        <Dot dragging={dragging} />
      </span>
    </div>
  );
}

function Dot({ dragging }: { dragging: boolean }) {
  return (
    <span
      className={
        'h-[2px] w-[2px] rounded-full ' +
        (dragging ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-fg-muted)]')
      }
    />
  );
}
