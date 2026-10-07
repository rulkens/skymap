import { describe, it, expect } from 'vitest';

import { sameStructure } from '../../../src/utils/object/sameStructure';

describe('sameStructure', () => {
  it('matches equal nested plain data', () => {
    const make = () => ({ a: [1, 2], s: [{ k: 'x', n: 1 }] });
    expect(sameStructure(make(), make())).toBe(true);
  });

  it('differs on any changed leaf, length, key set or container kind', () => {
    const base = { a: [1, 2], s: [{ k: 'x' }] };
    expect(sameStructure(base, { ...base, a: [1, 3] })).toBe(false);
    expect(sameStructure(base, { ...base, s: [{ k: 'y' }] })).toBe(false);
    expect(sameStructure(base, { ...base, extra: 1 })).toBe(false);
    expect(sameStructure([], {})).toBe(false);
    expect(sameStructure(null, {})).toBe(false);
  });
});
