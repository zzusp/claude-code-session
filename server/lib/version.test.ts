import { describe, expect, it } from 'vitest';
import { compareSemver } from './version.ts';

// compareSemver 是 hasUpdate 判定的唯一依据：latest 比 current 新才提示更新。
// 这里钉死「更新/不更新/相等」三类边界，外加 `v` 前缀与 pre-release 排序。

describe('compareSemver', () => {
  it('newer patch / minor / major → positive', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('older → negative', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareSemver('1.0.9', '1.1.0')).toBeLessThan(0);
  });

  it('equal → 0, regardless of leading v', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3', 'v1.2.3')).toBe(0);
  });

  it('plain release outranks a pre-release of the same core', () => {
    expect(compareSemver('1.2.0', '1.2.0-rc.1')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0-rc.1', '1.2.0')).toBeLessThan(0);
  });

  it('does not flag an update for the same version (the v1.0.0 baseline)', () => {
    // current == latest must yield hasUpdate=false in the route.
    expect(compareSemver('1.0.0', '1.0.0') > 0).toBe(false);
  });

  it('treats missing patch as 0 (1.2 == 1.2.0)', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
    expect(compareSemver('1.3', '1.2.0')).toBeGreaterThan(0);
  });
});
