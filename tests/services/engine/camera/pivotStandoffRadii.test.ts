/**
 * pivotStandoffRadii — which focus rows override the global standoff ratio.
 *
 * The one case that matters: a body row carrying `standoffRadii` (Sgr A*'s
 * Q10 floor) must reach the clamp instead of the Earth-tuned global ratio.
 * Everything else — no override on the row, a star, a galaxy, no focus at
 * all — must fall through to `SURFACE_STANDOFF_RADII` so every other body's
 * floor stays byte-identical to today.
 */

import { describe, it, expect } from 'vitest';

import { pivotStandoffRadii } from '../../../../src/services/engine/camera/pivotStandoffRadii';
import { SURFACE_STANDOFF_RADII } from '../../../../src/utils/camera/clampDistance';
import { makeGalaxyRow } from '../../../fixtures/makeGalaxyRow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

describe('pivotStandoffRadii', () => {
  it('reads a body row’s own override', () => {
    const sgrAStar: SelectionRow = {
      type: 'body',
      id: 'sgr-a-star',
      label: 'Sagittarius A*',
      positionMpc: [0, 0, 0],
      radiusM: 1.269e10,
      standoffRadii: 2.0,
    };
    expect(pivotStandoffRadii(sgrAStar)).toBe(2.0);
  });

  it('falls through to the global ratio for a body row with no override', () => {
    const earth: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [0, 0, 0],
      radiusM: 6371000,
    };
    expect(pivotStandoffRadii(earth)).toBe(SURFACE_STANDOFF_RADII);
  });

  it('falls through to the global ratio for a star row — no per-record override field', () => {
    const star: SelectionRow = {
      type: 'star',
      index: 7,
      positionMpc: [1, 2, 3],
      absMag: 4,
      bpRp: 0.6,
      radiusM: 696340000,
    };
    expect(pivotStandoffRadii(star)).toBe(SURFACE_STANDOFF_RADII);
  });

  it('falls through to the global ratio for a galaxy and for no focus at all', () => {
    expect(pivotStandoffRadii(makeGalaxyRow({ diameterKpc: 30 }))).toBe(SURFACE_STANDOFF_RADII);
    expect(pivotStandoffRadii(null)).toBe(SURFACE_STANDOFF_RADII);
  });
});
