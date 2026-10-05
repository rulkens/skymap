import { describe, it, expect } from 'vitest';

import { checkoutMismatch } from '../../../../tools/utils/serve/checkoutMismatch';

describe('checkoutMismatch', () => {
  it('no warning for the same checkout', () => {
    expect(checkoutMismatch('/a/skymap', '/a/skymap')).toBeNull();
  });
  it('no warning when only a trailing slash differs', () => {
    expect(checkoutMismatch('/a/skymap/', '/a/skymap')).toBeNull();
  });
  it("no warning for a built bundle's empty root", () => {
    expect(checkoutMismatch('', '/a/skymap')).toBeNull();
  });
  it('names both paths when they differ', () => {
    const line = checkoutMismatch('/a/main', '/a/worktree');
    expect(line).toContain('/a/main');
    expect(line).toContain('/a/worktree');
  });
});
