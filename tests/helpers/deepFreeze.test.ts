/**
 * The three contracts `makeCameraSimHarness` leans on: the walk reaches nested
 * array elements (a pose's `target` is where a stray write would land), it
 * leaves non-plain containers alone (freezing a `Float32Array` throws), and it
 * stops at an already-frozen node — which is what makes the per-frame call
 * cheap, and what a "just freeze everything" rewrite would silently break.
 */
import { describe, it, expect } from 'vitest';

import { deepFreeze } from './deepFreeze';

describe('deepFreeze', () => {
  it('reaches an element of a nested array', () => {
    const tree = { pose: { target: [1, 2, 3] } };
    deepFreeze(tree);
    expect(() => {
      tree.pose.target[0] = 9;
    }).toThrow(TypeError);
  });

  it('leaves a typed array or Map in the tree writable rather than throwing', () => {
    const tree = { basis: new Float32Array(3), byId: new Map([['a', 1]]) };
    expect(() => deepFreeze(tree)).not.toThrow();
    tree.basis[0] = 9;
    tree.byId.set('b', 2);
    expect(tree.basis[0]).toBe(9);
  });

  it('does not walk into an already-frozen subtree', () => {
    const child = { n: 1 };
    const tree = { shared: Object.freeze({ child }) };
    deepFreeze(tree);
    child.n = 2;
    expect(child.n).toBe(2);
  });
});
