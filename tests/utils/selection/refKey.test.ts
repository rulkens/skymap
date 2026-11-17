import { describe, expect, it } from 'vitest';
import { refKey } from '../../../src/utils/selection/refKey';

describe('refKey', () => {
  it('refKey separates kinds that share an id', () => {
    const body = { type: 'body', id: 'voyager-1' };
    const craft = { type: 'craft', id: 'voyager-1' };
    expect(refKey(body)).not.toBe(refKey(craft));
  });

  it('refKey is independent of field order', () => {
    const a = { type: 'galaxyCatalog', source: 'sdss', index: 7 };
    const b = { index: 7, type: 'galaxyCatalog', source: 'sdss' };
    expect(refKey(a)).toBe(refKey(b));
    const other = { ...a, index: 8 };
    expect(refKey(a)).not.toBe(refKey(other));
  });
});
