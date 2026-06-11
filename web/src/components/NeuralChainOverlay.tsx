import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.ts';
import type { ChainNode, ChainNodeKind } from '../lib/neural-chain.ts';
import { useThemeColors } from '../lib/theme.ts';

// 一条边/节点都有的几何 + 类型信息;颜色在绘制时按 kind 现算(随主题变)。
interface Placed extends ChainNode {
  x: number;
  y: number;
  r: number;
}

interface Edge {
  ax: number;
  ay: number;
  cx: number;
  cy: number;
  bx: number;
  by: number;
  fromKind: ChainNodeKind;
  fromErr: boolean;
}

// 布局参数(serpentine 蛇形折行)。
const MARGIN = 72;
const SX = 104; // 列间距
const SY = 96; // 行高
const JITTER = 16; // 有机抖动幅度
const CAP = 800; // 节点上限(超出只画最近 CAP 个,UI 明示)
const PULSES = 3; // 同时游走的信号数
const TAU = Math.PI * 2;

const NEURAL_VARS = [
  '--color-iris',
  '--color-accent',
  '--color-moss',
  '--color-danger',
  '--color-fg-primary',
  '--color-fg-muted',
] as const;

interface Colors {
  iris: string;
  accent: string;
  moss: string;
  danger: string;
  fg: string;
  fgMuted: string;
}

function nodeColor(kind: ChainNodeKind, isError: boolean, c: Colors): string {
  switch (kind) {
    case 'tool_result':
      return isError ? c.danger : c.moss;
    case 'tool_use':
      return c.accent;
    case 'thinking':
    case 'text':
      return c.iris;
    case 'user':
      return c.fg;
  }
}

function nodeRadius(kind: ChainNodeKind): number {
  switch (kind) {
    case 'text':
      return 11;
    case 'user':
    case 'tool_use':
      return 8;
    case 'tool_result':
      return 7;
    case 'thinking':
      return 6;
  }
}

// 确定性哈希 → 0..1,给抖动/曲率一个稳定值(不每帧 random,否则节点会跳)。
function hash(n: number): number {
  const h = (Math.imul(n + 1, 2654435761) >>> 0) % 1000;
  return h / 1000;
}

export default function NeuralChainOverlay({
  nodes,
  toolNames,
  isWorking,
  onClose,
  onJump,
}: {
  nodes: ChainNode[];
  toolNames: ReadonlyMap<string, string>;
  isWorking: boolean;
  onClose: () => void;
  onJump: (messageUuid: string) => void;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ node: Placed } | null>(null);
  const hoverIdxRef = useRef<number | null>(null);

  const raw = useThemeColors(NEURAL_VARS);
  const colors: Colors = useMemo(
    () => ({
      iris: raw['--color-iris'],
      accent: raw['--color-accent'],
      moss: raw['--color-moss'],
      danger: raw['--color-danger'],
      fg: raw['--color-fg-primary'],
      fgMuted: raw['--color-fg-muted'],
    }),
    [raw],
  );

  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 只画最近 CAP 个节点;长会话不至于撑爆画布高度。
  const visible = useMemo(() => (nodes.length > CAP ? nodes.slice(-CAP) : nodes), [nodes]);
  const capped = nodes.length > CAP;

  // 布局:蛇形折行 + 确定性抖动;同时算出每条边的二次贝塞尔控制点(信号沿同一曲线走)。
  const { placed, edges, height } = useMemo(() => {
    const placed: Placed[] = [];
    const edges: Edge[] = [];
    if (width <= 0 || visible.length === 0) return { placed, edges, height: 0 };
    const cols = Math.max(1, Math.floor((width - MARGIN * 2) / SX));
    for (let i = 0; i < visible.length; i++) {
      const node = visible[i];
      if (!node) continue;
      const row = Math.floor(i / cols);
      const within = i % cols;
      const col = row % 2 === 0 ? within : cols - 1 - within; // 蛇形:奇数行反向
      const jx = (hash(node.idx) - 0.5) * 2 * JITTER;
      const jy = (hash(node.idx * 7 + 13) - 0.5) * 2 * JITTER;
      placed.push({
        ...node,
        x: MARGIN + col * SX + SX / 2 + jx,
        y: MARGIN + row * SY + jy,
        r: nodeRadius(node.kind),
      });
    }
    for (let i = 0; i < placed.length - 1; i++) {
      const a = placed[i];
      const b = placed[i + 1];
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // 垂直于连线的微偏移 → 突触曲线;曲率由序号哈希决定(稳定 + 有机)。
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const amp = (hash(a.idx * 3 + 1) - 0.5) * 2 * Math.min(28, len * 0.35);
      edges.push({
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        cx: mx + (-dy / len) * amp,
        cy: my + (dx / len) * amp,
        fromKind: a.kind,
        fromErr: a.isError,
      });
    }
    const rows = Math.ceil(visible.length / cols);
    return { placed, edges, height: MARGIN * 2 + rows * SY };
  }, [visible, width]);

  // 量容器宽度(布局依赖);ResizeObserver 跟随窗口/侧栏变化。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 设画布像素尺寸(含 devicePixelRatio),并缓存已缩放的 ctx 供绘制循环用。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(Math.max(1, height) * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${Math.max(1, height)}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
    }
  }, [width, height]);

  // 绘制循环:神经放电。reduced-motion 下只画一帧静态图。
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || width <= 0) return;

    const render = (ts: number) => {
      const time = ts / 1000;
      ctx.clearRect(0, 0, width, height);

      // 突触连线(暗描)
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.fgMuted;
      for (const e of edges) {
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.moveTo(e.ax, e.ay);
        ctx.quadraticCurveTo(e.cx, e.cy, e.bx, e.by);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 信号脉冲:几道光点沿链下行(动作电位)
      if (!reduced && edges.length > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const speed = 7; // 边/秒
        for (let k = 0; k < PULSES; k++) {
          const g = (time * speed + (k / PULSES) * edges.length) % edges.length;
          const ei = Math.floor(g);
          const e = edges[ei];
          if (!e) continue;
          const tt = g - ei;
          const mt = 1 - tt;
          const px = mt * mt * e.ax + 2 * mt * tt * e.cx + tt * tt * e.bx;
          const py = mt * mt * e.ay + 2 * mt * tt * e.cy + tt * tt * e.by;
          drawGlow(ctx, px, py, 3.2, nodeColor(e.fromKind, e.fromErr, colors));
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // 节点(径向分层 alpha 模拟辉光 + 呼吸)
      for (const n of placed) {
        const breathe = reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(time * 1.4 + n.idx * 0.5));
        drawNode(ctx, n.x, n.y, n.r, nodeColor(n.kind, n.isError, colors), breathe);
      }

      // live 头节点强放电(扩散环)
      if (isWorking && !reduced && placed.length > 0) {
        const head = placed[placed.length - 1];
        if (head) {
          const ring = (time * 0.85) % 1;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - ring) * 0.55;
          ctx.strokeStyle = nodeColor(head.kind, head.isError, colors);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(head.x, head.y, head.r + ring * 28, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    };

    if (reduced) {
      render(0);
      return;
    }
    let raf = requestAnimationFrame(function loop(ts: number) {
      render(ts);
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [placed, edges, colors, width, height, isWorking, reduced]);

  // Esc 关闭 + 锁背景滚动。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // 工作中会话:新节点生长进来时滚到链尾(头节点),跟住最新动态。
  const prevLenRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = visible.length > prevLenRef.current;
    prevLenRef.current = visible.length;
    if (grew && isWorking) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [visible.length, isWorking]);

  function hitTest(e: ReactMouseEvent<HTMLCanvasElement>): Placed | null {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: Placed | null = null;
    let bestD = Infinity;
    for (const n of placed) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= n.r + 10 && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function kindLabel(n: Placed): string {
    if (n.kind === 'tool_result') {
      const name = n.refId ? toolNames.get(n.refId) : undefined;
      const base = n.isError ? t('session.chain.kind.error') : t('session.chain.kind.result');
      return name ? `${name} · ${base}` : base;
    }
    if (n.kind === 'tool_use') return n.name ?? t('session.chain.kind.tool');
    if (n.kind === 'thinking') return t('session.chain.kind.thinking');
    if (n.kind === 'user') return t('session.chain.kind.user');
    return t('session.chain.kind.text');
  }

  const legend: { token: string; label: string }[] = [
    { token: '--color-iris', label: t('session.chain.kind.thinking') },
    { token: '--color-accent', label: t('session.chain.kind.tool') },
    { token: '--color-moss', label: t('session.chain.kind.result') },
    { token: '--color-danger', label: t('session.chain.kind.error') },
    { token: '--color-fg-primary', label: t('session.chain.kind.user') },
  ];

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[60] flex flex-col bg-[rgba(9,11,16,0.95)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('session.chain.title')}
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            {t('session.chain.subtitle')}
          </p>
          <h2 className="font-display text-[17px] font-medium tracking-tight text-white/90">
            {t('session.chain.title')}
            {capped && (
              <span className="ml-2 font-mono text-[11px] font-normal normal-case tracking-normal text-white/45">
                {t('session.chain.capped', { n: CAP, m: nodes.length })}
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <ul className="hidden flex-wrap items-center gap-x-3 gap-y-1 md:flex">
            {legend.map((it) => (
              <li key={it.token} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: `var(${it.token})`, boxShadow: `0 0 6px var(${it.token})` }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">
                  {it.label}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('session.chain.close')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-white/15 text-white/70 transition hover:border-white/40 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto overflow-x-hidden">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6">
            <p className="font-display text-[15px] italic text-white/55">
              {t('session.chain.empty')}
            </p>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="block"
              onClick={(e) => {
                const n = hitTest(e);
                if (n) onJump(n.messageUuid);
              }}
              onMouseMove={(e) => {
                const n = hitTest(e);
                e.currentTarget.style.cursor = n ? 'pointer' : 'default';
                const id = n ? n.idx : null;
                if (id !== hoverIdxRef.current) {
                  hoverIdxRef.current = id;
                  setHover(n ? { node: n } : null);
                }
              }}
              onMouseLeave={() => {
                hoverIdxRef.current = null;
                setHover(null);
              }}
            />
            {hover && (
              <div
                className="pointer-events-none absolute z-10 max-w-[18rem] -translate-x-1/2 -translate-y-full rounded-[var(--radius-input)] border border-white/15 bg-[rgba(20,22,30,0.96)] px-3 py-2 shadow-lg"
                style={{ left: hover.node.x, top: hover.node.y - hover.node.r - 8 }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
                  {kindLabel(hover.node)}
                </p>
                {hover.node.preview && (
                  <p className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-white/85">
                    {hover.node.preview}
                  </p>
                )}
                <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                  {t('session.chain.jumpHint')}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  intensity: number,
): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.1 * intensity;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.22 * intensity;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.55, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  // 高光核
  ctx.globalAlpha = 0.8 * intensity;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}
