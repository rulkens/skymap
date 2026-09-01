/**
 * reanchoredPose tests — ulp-quantized re-anchoring (spec §5.3).
 *
 * `anchor + eyeRel` must be bit-identical before and after, not merely close:
 * a broken implementation that silently drops precision would still look
 * "right" under `toBeCloseTo`. Two magnitude regimes (Earth-radius-scale and
 * a modest one) rather than one, so a grid mismatched to the anchor's own
 * scale — the bug the ulp quantization exists to prevent — has more than one
 * chance to surface as an actual bit difference rather than a coincidental
 * pass.
 */

import { describe, it, expect } from 'vitest';
import { reanchoredPose } from '../../../src/utils/camera/reanchoredPose';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';

function magnitude([x, y, z]: readonly [number, number, number]): number {
  return Math.hypot(x, y, z);
}

/** Componentwise `a + b`, so the bit-identity checks below compare per axis. */
function addComponents(
  [ax, ay, az]: readonly [number, number, number],
  [bx, by, bz]: readonly [number, number, number],
): readonly [number, number, number] {
  return [ax + bx, ay + by, az + bz];
}

const BASIS_IDENTITY: BodyFixedPose['basisLocal'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('reanchoredPose', () => {
  it('leaves the named point unmoved (bit-identical) — large anchor, past the trigger', () => {
    // ~Earth-radius-scale anchor (spec §5.3's own worked example), range at
    // ~0.03% of the anchor's magnitude — comfortably past the 0.1% trigger.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [4_000_000, -3_000_000, 2_000_000],
      eyeRelAnchorM: [1200, -800, 500],
      basisLocal: BASIS_IDENTITY,
    };

    const out = reanchoredPose(pose);

    expect(addComponents(out.anchorLocalM, out.eyeRelAnchorM)).toEqual(
      addComponents(pose.anchorLocalM, pose.eyeRelAnchorM),
    );
  });

  it('leaves the named point unmoved (bit-identical) — modest anchor, past the trigger', () => {
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [50, -30, 20],
      eyeRelAnchorM: [0.02, -0.01, 0.005],
      basisLocal: BASIS_IDENTITY,
    };

    const out = reanchoredPose(pose);

    expect(addComponents(out.anchorLocalM, out.eyeRelAnchorM)).toEqual(
      addComponents(pose.anchorLocalM, pose.eyeRelAnchorM),
    );
  });

  it('shrinks |eyeRelAnchorM| for a pose past the trigger', () => {
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [4_000_000, -3_000_000, 2_000_000],
      eyeRelAnchorM: [1200, -800, 500],
      basisLocal: BASIS_IDENTITY,
    };

    const out = reanchoredPose(pose);

    expect(magnitude(out.eyeRelAnchorM)).toBeLessThan(magnitude(pose.eyeRelAnchorM));
  });

  it('returns the input unchanged (by reference) below the trigger', () => {
    // Range at 1% of the anchor's magnitude — above the 0.1% trigger fraction.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [4_000_000, -3_000_000, 2_000_000],
      eyeRelAnchorM: [40_000, -30_000, 20_000],
      basisLocal: BASIS_IDENTITY,
    };

    expect(reanchoredPose(pose)).toBe(pose);
  });

  it('quantizes to ulp(|anchorLocalM|), not ulp(range) or a fixed grid', () => {
    // Hand-derived via the actual ulp(anchorMag) grid — verified by
    // substitution to differ from quantizing off ulp(range) or a fixed 1e-6
    // grid, so this pins the BASIS the spec calls out (§5.3), not merely
    // that some quantization ran. Non-round components (not clean integers)
    // so the grid's own bits actually get exercised — 1200 divides its own
    // ulp(anchorMag) grid evenly and would pin nothing.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [4237918.63821547, -3119004.22187693, 2884650.91120408],
      eyeRelAnchorM: [1234.567891234, -789.123456789, 456.789012345],
      basisLocal: BASIS_IDENTITY,
    };

    const out = reanchoredPose(pose);

    expect(out.anchorLocalM).toEqual([4239153.206106704, -3119793.345333719, 2885107.7002164247]);
    expect(out.eyeRelAnchorM).toEqual([
      3.992681740783155e-10, 1.8064838513964787e-10, 4.459366209630389e-10,
    ]);
  });

  it('quantizes correctly at a power-of-two anchor magnitude', () => {
    // 2^23 exactly — the binade boundary `ulpAt`'s mantissa-increment must
    // not miss (the failure mode `Math.log2` would be prone to instead).
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [8388608, 0, 0],
      eyeRelAnchorM: [1234.567891234, -789.123456789, 456.789012345],
      basisLocal: BASIS_IDENTITY,
    };

    const out = reanchoredPose(pose);

    expect(out.anchorLocalM).toEqual([8389842.567891235, -789.1234567891806, 456.78901234455407]);
    expect(out.eyeRelAnchorM).toEqual([
      -5.32054400537163e-10, 1.8064838513964787e-10, 4.459366209630389e-10,
    ]);
  });

  it('never triggers for a body-centre anchor ([0,0,0])', () => {
    // BodyFixedPose's doc comment: `[0,0,0]` = body centre. A zero-magnitude
    // anchor makes the trigger fraction's threshold zero too, so ANY range
    // (short of also being exactly zero) stays above it — the shipped
    // descent floor never re-anchors, by construction rather than a
    // special-cased branch.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [1, 2, 3],
      basisLocal: BASIS_IDENTITY,
    };

    expect(reanchoredPose(pose)).toBe(pose);
  });
});
