/**
 * tierToTexturePx — the tier → pixel-edge mapping is the on-disk fetch filename
 * contract (`<body>-<px>.jpg`). These are hand-authored values, not a
 * restatement of the source formula: if a build ever emits a differently-sized
 * texture the runtime fetch URL would silently 404, so the three sizes are
 * pinned as the load-bearing contract between build and runtime.
 */

import { describe, it, expect } from 'vitest';

import { tierToTexturePx } from '../../../src/utils/math/tierToTexturePx';

describe('tierToTexturePx', () => {
  it('maps each tier', () => {
    expect(tierToTexturePx('small')).toBe(2048);
    expect(tierToTexturePx('medium')).toBe(4096);
    expect(tierToTexturePx('large')).toBe(8192);
  });
});
