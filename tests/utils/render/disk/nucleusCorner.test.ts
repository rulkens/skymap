/**
 * nucleusCorner — exercises the pure placement-math mapping a
 * famous-galaxy thumbnail's nucleus into the disk's local corner frame:
 * where does the nucleus sit so the shader can slide it onto the catalog
 * point?
 *
 * The webp-corner mapping tests pin the no-flip convention by hand: a
 * top-left nucleus must map to corner [-1, -1] (NOT [-1, +1]), matching
 * the atlas's top-down upload.
 */

import { describe, it, expect } from 'vitest';

import { nucleusCorner } from '../../../../src/utils/render/disk/nucleusCorner';

describe('nucleusCorner', () => {
  it('is [0,0] for a centred nucleus', () => {
    // center [0.5, 0.5] → [0, 0] — the uncalibrated default that leaves
    // the quad unshifted.
    expect(nucleusCorner([0.5, 0.5])).toEqual([0, 0]);
  });

  it('maps an off-centre nucleus to corner space', () => {
    // center.x = 0.25 → 0.25 * 2 - 1 = -0.5; center.y = 0.5 → 0.
    expect(nucleusCorner([0.25, 0.5])).toEqual([-0.5, 0]);
  });

  it('maps webp top-left to corner [-1,-1]', () => {
    // Pins the no-flip convention: webp-top (v = 0) maps to corner.y = -1,
    // matching the atlas's top-down upload. A v-flip would give [-1, +1].
    expect(nucleusCorner([0, 0])).toEqual([-1, -1]);
  });

  it('maps webp bottom-right to corner [1,1]', () => {
    expect(nucleusCorner([1, 1])).toEqual([1, 1]);
  });
});
