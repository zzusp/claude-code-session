// 实证 react-markdown v10 默认（无 rehype-raw）对原始 HTML 的处理：丢弃还是字面显示。
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const cases = [
  'a <b>bold</b> c',
  '<system-reminder>hi</system-reminder>',
  '5 < 6 and a<b',
  'generic Foo<T> in prose',
  '<file_path>x.ts</file_path>',
  'line1\n<div>\nblock html\n</div>\nline2',
];

for (const text of cases) {
  const html = renderToStaticMarkup(
    React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, text),
  );
  console.log(JSON.stringify(text), '→', JSON.stringify(html));
}
