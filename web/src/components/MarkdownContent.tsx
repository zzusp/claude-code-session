import type { Element } from 'hast';
import { isValidElement, memo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PluggableList } from 'unified';
import { CopyButton } from './ToolBlock.tsx';

// Claude 回复（assistant text block）的 markdown 排版。仅在【非搜索态】渲染：
// 搜索时上层退回 plain HighlightedText（见 MessageBubble 的 markdown 开关），
// 所以本组件不需要处理搜索高亮——「读用富渲染，搜用原文高亮」。
// 仅 assistant 走这里：用户输入是终端原文，渲染成 markdown 会误伤 `*args`、路径等字面量。
// 安全性：不挂 rehype-raw，react-markdown 默认不渲染原始 HTML（显示为字面文本），
// URL 走默认 defaultUrlTransform 白名单。
//
// 本组件经 MessageBubble lazy() 引入，连同 remark/micromark 系列被 vite 拆进
// `markdown` chunk（见 vite.config.ts），不进首屏。

/** 收集 hast 节点下全部文本，供代码块复制按钮取原文。 */
function hastText(node: Element): string {
  let out = '';
  for (const child of node.children) {
    if (child.type === 'text') out += child.value;
    else if (child.type === 'element') out += hastText(child);
  }
  return out;
}

/** 从 <pre> 的子 <code> 上取 ```lang 标注（className: language-x）。 */
function codeLang(children: ReactNode): string | null {
  const el = Array.isArray(children) ? children[0] : children;
  if (!isValidElement(el)) return null;
  const cls = (el.props as { className?: string }).className ?? '';
  const m = /language-([\w+-]+)/.exec(cls);
  return m ? m[1]! : null;
}

// 元素 → 设计 token 的映射。标题在气泡语境内整体缩阶；代码用 mono + sunken；
// 引用沿用 tagline 的 accent 左边框 + 斜体；hr 复用 rule-dotted。
const COMPONENTS: Components = {
  p: ({ node: _n, ...props }) => (
    <p className="whitespace-pre-wrap break-words" {...props} />
  ),
  h1: ({ node: _n, ...props }) => (
    <h1 className="font-display text-[17.5px] font-semibold tracking-[-0.01em] text-[var(--color-fg-primary)]" {...props} />
  ),
  h2: ({ node: _n, ...props }) => (
    <h2 className="font-display text-[16.5px] font-semibold tracking-[-0.01em] text-[var(--color-fg-primary)]" {...props} />
  ),
  h3: ({ node: _n, ...props }) => (
    <h3 className="font-display text-[15.5px] font-semibold text-[var(--color-fg-primary)]" {...props} />
  ),
  h4: ({ node: _n, ...props }) => (
    <h4 className="font-display text-[14.5px] font-semibold text-[var(--color-fg-primary)]" {...props} />
  ),
  h5: ({ node: _n, ...props }) => (
    <h5 className="font-display text-[13.5px] font-semibold text-[var(--color-fg-primary)]" {...props} />
  ),
  h6: ({ node: _n, ...props }) => <h6 className="eyebrow" {...props} />,
  a: ({ node: _n, ...props }) => (
    <a
      target="_blank"
      rel="noreferrer"
      className="break-words text-[var(--color-accent-ink)] underline decoration-[var(--color-accent)]/50 underline-offset-2 transition hover:decoration-[var(--color-accent)] dark:text-[var(--color-accent)]"
      {...props}
    />
  ),
  strong: ({ node: _n, ...props }) => (
    <strong className="font-semibold text-[var(--color-fg-primary)]" {...props} />
  ),
  del: ({ node: _n, ...props }) => (
    <del className="text-[var(--color-fg-muted)] line-through decoration-[var(--color-hairline-strong)]" {...props} />
  ),
  ul: ({ node: _n, ...props }) => (
    <ul className="list-disc space-y-1 pl-5 marker:text-[var(--color-fg-faint)]" {...props} />
  ),
  ol: ({ node: _n, ...props }) => (
    <ol className="list-decimal space-y-1 pl-5 marker:font-mono marker:text-[12px] marker:text-[var(--color-fg-muted)]" {...props} />
  ),
  li: ({ node: _n, className, ...props }) => (
    <li
      className={
        'break-words' +
        (className?.includes('task-list-item') ? ' -ml-5 list-none' : '')
      }
      {...props}
    />
  ),
  // GFM 任务清单的 checkbox：换成与 TodoWrite 同语言的方框打钩。
  input: ({ node: _n, ...props }) =>
    props.type === 'checkbox' ? (
      <span
        aria-hidden
        className={
          'mr-1.5 inline-flex h-[13px] w-[13px] -translate-y-px items-center justify-center rounded-[3px] border align-middle font-mono text-[9px] leading-none ' +
          (props.checked
            ? 'border-[var(--color-moss)] bg-[var(--color-moss-soft)] text-[var(--color-moss)]'
            : 'border-[var(--color-hairline-strong)] text-transparent')
        }
      >
        ✓
      </span>
    ) : null,
  blockquote: ({ node: _n, ...props }) => (
    <blockquote
      className="space-y-1.5 border-l-2 border-[var(--color-accent)] pl-3 italic text-[var(--color-fg-secondary)]"
      {...props}
    />
  ),
  hr: ({ node: _n, ...props }) => <hr className="rule-dotted my-1 border-0" {...props} />,
  code: ({ node: _n, ...props }) => (
    <code
      className="rounded-[5px] border border-[var(--color-hairline)] bg-[var(--color-sunken)] px-[5px] py-[1.5px] font-mono text-[12.5px] text-[var(--color-accent-ink)] dark:text-[var(--color-accent)]"
      {...props}
    />
  ),
  pre: ({ node, children, ...props }) => {
    const lang = codeLang(children);
    const raw = node ? hastText(node) : '';
    return (
      <div className="group/code relative overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-sunken)]">
        <div className="absolute right-1.5 top-1.5 z-[1] flex items-center gap-1.5">
          {lang && (
            <span className="rounded-sm bg-[var(--color-surface)]/85 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
              {lang}
            </span>
          )}
          <span className="opacity-0 transition group-hover/code:opacity-100">
            <CopyButton text={raw} />
          </span>
        </div>
        {/* 行内 code 的 chip 样式在代码块内用后代选择器整体中和。 */}
        <pre
          className="overflow-x-auto px-3.5 py-3 font-mono text-[12px] leading-[1.6] text-[var(--color-fg-primary)] [&_code]:rounded-none [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[12px] [&_code]:text-inherit"
          {...props}
        >
          {children}
        </pre>
      </div>
    );
  },
  table: ({ node: _n, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-max min-w-[50%] border-collapse text-[13.5px]" {...props} />
    </div>
  ),
  th: ({ node: _n, ...props }) => (
    <th
      className="border-b border-[var(--color-hairline-strong)] px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-[var(--color-fg-secondary)]"
      {...props}
    />
  ),
  td: ({ node: _n, ...props }) => (
    <td className="border-b border-[var(--color-hairline)] px-2.5 py-1.5 align-top" {...props} />
  ),
  img: ({ node: _n, ...props }) => (
    <img
      loading="lazy"
      className="my-1 max-w-full rounded-[var(--radius-control)] border border-[var(--color-hairline)]"
      {...props}
    />
  ),
};

const REMARK_PLUGINS: PluggableList = [remarkGfm];

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="space-y-2.5 break-words text-[14.5px] leading-relaxed">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// 时间线一次窗口化渲染 50 条消息，memo 避免轮询引发的全量重解析。
export default memo(MarkdownContent);
