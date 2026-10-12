import { describe, it, expect } from 'vitest';

import { isKeyOf } from '../../../src/utils/object/isKeyOf';

describe('isKeyOf', () => {
  it('accepts own keys and rejects inherited ones', () => {
    const registry = { cosmicWeb: 1 };
    expect(isKeyOf(registry, 'cosmicWeb')).toBe(true);
    expect(isKeyOf(registry, 'toString')).toBe(false);
  });
});
