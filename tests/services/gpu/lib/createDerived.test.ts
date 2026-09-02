import { describe, expect, it } from 'vitest';

import { createDerived } from '../../../../src/services/gpu/lib/createDerived';

describe('createDerived', () => {
  it('does not compute before the first read', () => {
    let computes = 0;
    createDerived({
      key: () => [1],
      compute: () => {
        computes++;
        return computes;
      },
    });
    expect(computes).toBe(0);
  });

  it("recomputes when a key element's identity moves", () => {
    let a = { v: 1 };
    let computes = 0;
    const derived = createDerived({
      key: () => [a],
      compute: () => {
        computes++;
        return computes;
      },
    });
    expect(derived.get()).toBe(1);
    a = { v: 1 };
    expect(derived.get()).toBe(2);
  });

  it('returns the same object across reads on an unmoved key', () => {
    const a = { v: 1 };
    const derived = createDerived({
      key: () => [a],
      compute: () => ({ result: 'value' }),
    });
    const first = derived.get();
    const second = derived.get();
    expect(second).toBe(first);
  });

  it('treats a key length change as a move', () => {
    let key: readonly unknown[] = [1, 2];
    let computes = 0;
    const derived = createDerived({
      key: () => key,
      compute: () => {
        computes++;
        return computes;
      },
    });
    expect(derived.get()).toBe(1);
    key = [1, 2, 3];
    expect(derived.get()).toBe(2);
  });

  it('retries at the same key after a throwing compute', () => {
    let shouldThrow = true;
    let computes = 0;
    const derived = createDerived({
      key: () => [1],
      compute: () => {
        computes++;
        if (shouldThrow) throw new Error('boom');
        return 'value';
      },
    });

    expect(() => derived.get()).toThrow('boom');
    shouldThrow = false;
    expect(derived.get()).toBe('value');
    expect(computes).toBe(2);
  });

  it('compares by Object.is, so NaN and -0 keys do not thrash', () => {
    let keyElement: number = NaN;
    let computes = 0;
    const derived = createDerived({
      key: () => [keyElement],
      compute: () => {
        computes++;
        return computes;
      },
    });
    expect(derived.get()).toBe(1);
    // Object.is(NaN, NaN) is true — a repeated NaN key is NOT a move.
    keyElement = NaN;
    expect(derived.get()).toBe(1);

    keyElement = -0;
    const afterNegativeZero = derived.get();
    // Object.is(-0, 0) is false — this IS a move.
    keyElement = 0;
    expect(derived.get()).toBeGreaterThan(afterNegativeZero);
  });
});
