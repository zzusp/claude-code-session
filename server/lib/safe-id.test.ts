import { describe, expect, it } from 'vitest';
import { isSafeId } from './safe-id.ts';

// 守门：URL 参数里的 sessionId / projectId 走到任何 fs.* 之前必须先过这一关，
// 漏一类就会让攻击者用 ../ 跳出 ~/.claude，所以四个拒绝点逐条钉死。
describe('isSafeId', () => {
  it('接受常规 uuid / 编码后的 cwd', () => {
    expect(isSafeId('019410ce-49fb-7d5c-b0a4-2d7d2b6a4b7d')).toBe(true);
    expect(isSafeId('-Users-sunpeng-workspace-claude-code-session')).toBe(true);
    expect(isSafeId('C--Users-sunpeng')).toBe(true);
  });

  it('拒绝空字符串', () => {
    expect(isSafeId('')).toBe(false);
  });

  it('拒绝包含正斜杠的 id（path-traversal 入口）', () => {
    expect(isSafeId('a/b')).toBe(false);
    expect(isSafeId('../etc/passwd')).toBe(false);
  });

  it('拒绝包含反斜杠的 id（Windows path-traversal）', () => {
    expect(isSafeId('a\\b')).toBe(false);
    expect(isSafeId('..\\windows')).toBe(false);
  });

  it('拒绝包含 .. 的 id（即便不带分隔符）', () => {
    expect(isSafeId('foo..bar')).toBe(false);
    expect(isSafeId('..')).toBe(false);
  });

  it('拒绝以 . 开头的 id（屏蔽 dotfile）', () => {
    expect(isSafeId('.hidden')).toBe(false);
    expect(isSafeId('.bak-1700000000')).toBe(false);
  });

  it('单点开头的拒绝不影响中间含 . 的合法 id', () => {
    expect(isSafeId('memory.md')).toBe(true);
    expect(isSafeId('file.imported-abcd1234.md')).toBe(true);
  });
});
