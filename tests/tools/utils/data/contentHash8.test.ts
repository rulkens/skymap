import { describe, expect, it } from 'vitest';

import { contentHash8 } from '../../../../tools/utils/data/contentHash8';

describe('contentHash8', () => {
  it('is a pure function of the bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const a = contentHash8(bytes);
    const b = contentHash8(new Uint8Array([1, 2, 3, 4, 5]));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);

    const flipped = new Uint8Array([1, 2, 3, 4, 6]);
    expect(contentHash8(flipped)).not.toBe(a);
  });
});
