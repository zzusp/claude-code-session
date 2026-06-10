import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// react-markdown（仅被 lazy 的 MarkdownContent 引用）及其 remark/micromark 系
// 传递依赖：必须显式归入 'markdown' chunk，否则会被下面的 'vendor' 兜底吃进
// 首屏 eager chunk，lazy 拆分就失效了。按 node_modules 包名前缀匹配。
const MARKDOWN_PKG_PREFIXES = [
  'react-markdown',
  'remark-',
  'rehype-',
  'mdast-',
  'micromark',
  'unist-',
  'unified',
  'vfile',
  'hast-',
  'bail',
  'trough',
  'is-plain-obj',
  'devlop',
  'decode-named-character-reference',
  'character-entities',
  'character-reference-invalid',
  'is-decimal',
  'is-hexadecimal',
  'is-alphanumerical',
  'is-alphabetical',
  'property-information',
  'space-separated-tokens',
  'comma-separated-tokens',
  'html-url-attributes',
  'trim-lines',
  'longest-streak',
  'zwitch',
  'ccount',
  'markdown-table',
  'escape-string-regexp',
  'style-to-',
  'inline-style-parser',
  'estree-util-is-identifier-name',
  'parse-entities',
  'stringify-entities',
  'dequal',
  'extend',
  '@ungap/structured-clone',
  'debug',
  'ms',
];

function isMarkdownDep(id: string): boolean {
  const tail = id.split('node_modules/').pop() ?? '';
  const pkg = tail.startsWith('@') ? tail.split('/').slice(0, 2).join('/') : tail.split('/')[0]!;
  return MARKDOWN_PKG_PREFIXES.some((p) => pkg === p || pkg.startsWith(p));
}

export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3131',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
          if (id.includes('/react-router')) return 'router';
          if (id.includes('/@tanstack/')) return 'query';
          if (isMarkdownDep(id)) return 'markdown';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
});
