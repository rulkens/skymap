/**
 * passSlabOf — the pick program's grouping key, derived from the real
 * `FRAME_ORDER`. Picking rasterises a pass through the slab it draws through;
 * reading that off the wrong line silently tests the wrong depth buffer, which
 * shows up as a click landing on the thing behind the thing you clicked.
 */

import { describe, it, expect } from 'vitest';

import { passSlabOf } from '../../../../src/services/engine/frame/passSlabOf';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';

describe('passSlabOf', () => {
  it("resolves a foreground line's body roster to the body widening, its NEAR0 roster to NEAR0", () => {
    const slabs = passSlabOf(FRAME_ORDER);

    // The body rosters — the foreground line's and the lens line's — have no
    // single slab index: each expands to one step per body-m row, and pick
    // widens the same way.
    expect(slabs.get('earth')).toBe('body');
    expect(slabs.get('sgr-a-star-lensing')).toBe('body');
    // Their fixed-index neighbours, from the two roster kinds that carry one.
    expect(slabs.get('star-spheres')).toBe(NEAR0);
    expect(slabs.get('star-catalog')).toBe(NEAR0);
  });

  it('returns undefined for a pass no line names', () => {
    // A pickable pass off the frame order picks NOWHERE rather than defaulting
    // into some slab — the pick program reads the miss and drops the row.
    expect(passSlabOf(FRAME_ORDER).get('no-such-pass')).toBeUndefined();
  });
});
