/**
 * slabRowActive — the ONE gate on a banded row's consuming pass, so its
 * edges must match `skyCaptureBandAlpha(key) > 0` for the same band. The
 * bandless case is the store rows' path: they must never be gated.
 */

import { describe, it, expect } from 'vitest';

import { slabRowActive } from '../../../src/utils/frame/slabRowActive';
import { SCALE_FADE_BANDS } from '../../../src/services/engine/presentation/scaleFadeBands';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { SlabRow } from '../../../src/@types/engine/frame/SlabRow';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const ANCHOR_ID = 'galactic-centre';
const BAND = SCALE_FADE_BANDS.sgrAStarLensing;

const ROW: SlabRow = {
  anchorId: ANCHOR_ID,
  drawRadiusM: () => 1,
  footprintRadiusM: 1,
  activeBand: BAND,
  source: 'lens',
};

/** The anchor `distanceMpc` from a camera at the origin. */
function statesAt(distanceMpc: number): ReadonlyMap<string, BodyState> {
  const positionMpc: Vec3 = [distanceMpc, 0, 0];
  return new Map([[ANCHOR_ID, { positionMpc, orientation: [...IDENTITY], meanAnomalyRad: 0 }]]);
}

const CAM: Vec3 = [0, 0, 0];

describe('slabRowActive', () => {
  it('is always true for a bandless row, even with no anchor state', () => {
    const bandless: SlabRow = { ...ROW, activeBand: undefined };

    expect(slabRowActive(bandless, CAM, new Map())).toBe(true);
  });

  it('is active inside fullAt and inactive past goneAt', () => {
    expect(slabRowActive(ROW, CAM, statesAt(BAND.fullAt / 2))).toBe(true);
    expect(slabRowActive(ROW, CAM, statesAt(BAND.goneAt * 1.5))).toBe(false);
  });

  it('is inactive when the anchor has no state — Infinity, never a 0 that reads as "on top of it"', () => {
    expect(slabRowActive(ROW, CAM, new Map())).toBe(false);
  });
});
