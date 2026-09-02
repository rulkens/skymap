/**
 * poseFromBodyArm tests — provider B's pure conversion (spec §5.2).
 *
 * `poseFromBodyArm` is the anchor fold alone: `eyeRelBodyM = anchorLocalM +
 * eyeRelAnchorM`, `basisM = basisLocal`. This file pins the fold with a
 * non-zero, hand-computed anchor — a zero anchor (the only case the first
 * landing ever constructs, spec §5.3, ruled S2) would pass even if the fold
 * were silently dropped.
 */

import { describe, it, expect } from 'vitest';
import { poseFromBodyArm } from '../../../src/utils/camera/poseFromBodyArm';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';

describe('poseFromBodyArm', () => {
  it('folds the anchor exactly — a non-zero anchor, hand-computed', () => {
    const basisLocal: BodyFixedPose['basisLocal'] = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [4_000_000, -3_000_000, 2_000_000],
      eyeRelAnchorM: [1200, -800, 500],
      basisLocal,
    };

    const result = poseFromBodyArm(pose);

    expect(result.eyeRelBodyM).toEqual([4_001_200, -3_000_800, 2_000_500]);
    // `basisM` passes `basisLocal` through unchanged — no rotation is part of
    // this conversion, only the anchor fold.
    expect(result.basisM).toEqual(basisLocal);
  });

  it('is a no-op fold at the body centre (anchor zero)', () => {
    const basisLocal: BodyFixedPose['basisLocal'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pose: BodyFixedPose = {
      bodyId: 'planet',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [10, 20, 30],
      basisLocal,
    };

    expect(poseFromBodyArm(pose).eyeRelBodyM).toEqual([10, 20, 30]);
  });
});
