// 复刻 ModifiedFilesDrawer.tsx 中的 diffOps / wordSegments / pushSeg，验证行内分段是否正确。
const WORD_RE = /\s+|\w+|[^\w\s]+/g;

function diffOps(a, b) {
  const n = a.length, m = b.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i], next = dp[i + 1];
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'equal', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', text: a[i] }); i++; }
    else { ops.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] });
  while (j < m) ops.push({ type: 'add', text: b[j++] });
  return ops;
}

function pushSeg(arr, text, changed) {
  const last = arr[arr.length - 1];
  if (last && last.changed === changed) last.text += text;
  else arr.push({ text, changed });
}

function wordSegments(oldLine, newLine) {
  const a = oldLine.match(WORD_RE) ?? [];
  const b = newLine.match(WORD_RE) ?? [];
  if (a.length === 0 || b.length === 0) return null;
  if (a.length * b.length > 20000) return null;
  const ops = diffOps(a, b);
  const left = [], right = [];
  for (const op of ops) {
    if (op.type === 'equal') { pushSeg(left, op.text, false); pushSeg(right, op.text, false); }
    else if (op.type === 'del') pushSeg(left, op.text, true);
    else pushSeg(right, op.text, true);
  }
  if (left.every((s) => s.changed) && right.every((s) => s.changed)) return null;
  return { left, right };
}

const show = (segs) => segs.map((s) => (s.changed ? `[${s.text}]` : s.text)).join('');
const reconstruct = (segs) => segs.map((s) => s.text).join('');

function check(name, oldLine, newLine, expectNull) {
  const r = wordSegments(oldLine, newLine);
  console.log(`\n## ${name}`);
  if (r == null) {
    console.log(`  -> null (整行着色)  ${expectNull ? 'OK' : 'UNEXPECTED'}`);
    return;
  }
  // 关键不变量：分段拼回必须等于原行（无丢字/串字）。
  const okL = reconstruct(r.left) === oldLine;
  const okR = reconstruct(r.right) === newLine;
  console.log(`  L: ${show(r.left)}`);
  console.log(`  R: ${show(r.right)}`);
  console.log(`  reconstruct old==L? ${okL}   new==R? ${okR}  ${okL && okR ? 'OK' : 'FAIL'}`);
}

check('单 token 改', `  const hl = kind === 'del' ? 'a' : 'b';`, `  const hl = kind === 'del' ? 'X' : 'b';`);
check('中间插入', `foo(bar)`, `foo(bar, baz)`);
check('词尾改名', `summary.editCount += 1;`, `summary.writeCount += 1;`);
check('完全不同行(应退回null)', `aaa bbb ccc`, `xxx yyy zzz`, true);
check('空旧行(应退回null)', ``, `new line`, true);
