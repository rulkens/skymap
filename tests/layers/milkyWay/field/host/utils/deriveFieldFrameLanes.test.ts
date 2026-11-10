/**
 * The field's per-frame lanes: couplings that break silently and still give
 * a plausible image — an exposure picking up a second factor, the dust slices
 * following the view direction, the grain blend running backwards.
 */
import { describe, expect, it } from 'vitest';

import type { FieldView } from '../../../../../../src/layers/milkyWay/field/@types/FieldView';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import { deriveFieldFrameLanes } from '../../../../../../src/layers/milkyWay/field/host/utils/deriveFieldFrameLanes';
import { FIELD_CALIBRATION } from '../../../../../../src/layers/milkyWay/field/data/fieldCalibration';
import { FIELD_EXPOSURE_GAUGE } from '../../../../../../src/layers/milkyWay/field/host/data/fieldExposureGauge';

const frustum = { tanLeft: -0.5, tanRight: 0.5, tanDown: -0.3, tanUp: 0.3 };
const camera = (eye: Vec3, fwd: Vec3 = [0, 0, -1]): FieldView => ({
  eye,
  right: [1, 0, 0],
  up: [0, 1, 0],
  fwd,
  frustum,
});
const lanes = (
  over: Partial<Parameters<typeof deriveFieldFrameLanes>[0]> = {},
  render: Partial<typeof FIELD_CALIBRATION.render> = {},
) =>
  deriveFieldFrameLanes({
    camera: camera([0, 0, 30]),
    exposure: 1,
    dustReachR: 5,
    render: { ...FIELD_CALIBRATION.render, ...render },
    ...over,
  });

describe('deriveFieldFrameLanes', () => {
  it('scales the exposure by the gauge alone, coupled to no other knob', () => {
    // The gauge once came from the sprite pass's starIntensity/sizeScale, and
    // retuning a SPRITE slider silently moved the FIELD's brightness.
    expect(lanes({ exposure: 2 }).analyticExposure).toBeCloseTo(2 * FIELD_EXPOSURE_GAUGE, 10);
  });

  it('measures the dust slices from the origin, not along the view', () => {
    // Panning turns the camera while the eye stays put; the slices are
    // anchored to the galaxy's centre, so they must not move with it.
    const a = lanes();
    const b = lanes({ camera: camera([0, 0, 30], [0.6, 0, -0.8]) });
    expect(b.dustSlices).toEqual(a.dustSlices);
  });

  it('blends the star-grain feature scale from near to far as the camera pulls out', () => {
    // dustReachR 5: 1 radius out is inside the NEAR anchor, 40 radii well past FAR.
    const grain = { starGrainFeatureScaleNear: 2, starGrainFeatureScaleFar: 15 };
    const close = lanes({ camera: camera([0, 0, 5]) }, grain);
    const far = lanes({ camera: camera([0, 0, 200]) }, grain);
    expect(close.starGrainFeatureScale).toBeCloseTo(2, 5);
    expect(far.starGrainFeatureScale).toBeCloseTo(15, 5);
  });
});
