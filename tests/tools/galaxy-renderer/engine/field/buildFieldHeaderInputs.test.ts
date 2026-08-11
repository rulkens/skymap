/**
 * Assembly-layer contracts only — `packFieldHeaderUniforms.test.ts` already
 * pins the byte layout. What can break silently here instead is ROUTING: a
 * lane read off the wrong source object, or a tier reusing a sibling's
 * target size. Both produce a plausible-looking image, not a crash.
 */
import { describe, expect, it } from 'vitest';

import { buildFieldHeaderInputs } from '../../../../../tools/galaxy-renderer/src/engine/field/buildFieldHeaderInputs';
import { deriveFrameView } from '../../../../../tools/galaxy-renderer/src/engine/frame/deriveFrameView';
import type { RenderSettings } from '../../../../../tools/galaxy-renderer/@types/engine/RenderSettings';
import { DEFAULT_RENDER_SETTINGS } from '../../../../../tools/galaxy-renderer/src/data/defaultRenderSettings';
import { HII_TIERS } from '../../../../../tools/galaxy-renderer/src/data/hiiTiers';

const render: RenderSettings = {
  ...DEFAULT_RENDER_SETTINGS,
  hiiNearFadeStart: 101,
  hiiNearFadeEnd: 102,
  starGrainWarpAmp: 103,
  hiiQuadCap: 104,
};

const frame = deriveFrameView({
  eye: [0, 0, 30],
  target: [0, 0, 0],
  fov: (45 * Math.PI) / 180,
  dist: 30,
  shiftX: 0.1,
  viewportPx: [1600, 900],
  render,
  dustReachR: 5,
});

// Distinct per-tier target sizes, so a tier that reuses a sibling's (or
// `hii`'s) resolution is caught rather than passing by coincidence.
const tierTargetSizePx = Object.fromEntries(
  HII_TIERS.map((tier, i) => [tier.kind, [200 + i, 300 + i]]),
) as Record<(typeof HII_TIERS)[number]['kind'], [number, number]>;

const inputs = buildFieldHeaderInputs({
  eye: [1, 2, 3],
  fov: 1.1,
  shiftX: 0.1,
  frame,
  render,
  model: {
    fieldCounts: { emission: 11, primary: 5, dust: 7 },
    dustHeaderLanes: {
      extinctionRgb: [0.1, 0.2, 0.3],
      noise: { tileUnits: 1, amplitude: 2, cloudOffset: 3, contrastExp: 4 },
      carve: { carve: 5, sharpness: 6, stretch: 7 },
      reachR: 5,
      detail: 8,
    },
    ismMapSeeding: { weight: 9, cap: 10, globalMean: 11 },
    hiiCount: 42,
    hiiTexture: { scale: 12, contrast: 13 },
    youngStars: { contrastGamma: 14, invMeanNorm: 15 },
  },
  targetSizes: {
    field: [400, 500],
    dustMapHeightPx: 600,
    hii: [700, 800],
    tiers: tierTargetSizePx,
  },
});

describe('buildFieldHeaderInputs', () => {
  it('routes hii/primaryCount to the HII draw count, not the field mixture', () => {
    expect(inputs.field.emissionCount).toBe(11);
    expect(inputs.field.primaryCount).toBe(5);
    // The HII pass's own instance count, per pass, not the field's
    // primary/emission split — dustAttenuation.wesl's gate depends on this.
    expect(inputs.hii.emissionCount).toBe(42);
    expect(inputs.hii.primaryCount).toBe(42);
  });

  it('gives every HII_TIERS row its own target size, not a shared one', () => {
    for (const tier of HII_TIERS) {
      expect(inputs.tiers[tier.kind]!.targetSizePx).toEqual(tierTargetSizePx[tier.kind]);
    }
    // None of the tiers accidentally inherited the `hii:extras` target.
    expect(inputs.tiers.shells!.targetSizePx).not.toEqual(inputs.hii.targetSizePx);
  });

  it('keeps every real-value lane off the field header, only on hii and its tiers', () => {
    expect(inputs.field.hiiTexture).toBeUndefined();
    expect(inputs.field.youngStars).toBeUndefined();
    expect(inputs.field.starGrainWarpAmp).toBeUndefined();
    expect(inputs.field.quadCapNdc).toBeUndefined();

    expect(inputs.hii.hiiTexture).toEqual({ scale: 12, contrast: 13 });
    expect(inputs.hii.starGrainWarpAmp).toBe(103);
    expect(inputs.hii.quadCapNdc).toBe(104);
    // Every tier inherits hii's real-value lanes via the same spread.
    expect(inputs.tiers.young!.hiiTexture).toEqual({ scale: 12, contrast: 13 });
    expect(inputs.tiers.young!.quadCapNdc).toBe(104);
  });

  it('zeroes the HII draw of dust it never accumulates, but keeps the shared attenuation lanes live', () => {
    expect(inputs.hii.dust!.count).toBe(0);
    expect(inputs.hii.dust!.noise).toEqual({ tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 });
    // extinctionRgb/slices are the two lanes dustAttenuation.wesl's
    // componentEmission actually reads, so they carry the field's real values.
    expect(inputs.hii.dust!.extinctionRgb).toEqual(inputs.field.dust!.extinctionRgb);
    expect(inputs.hii.dust!.slices).toEqual(inputs.field.dust!.slices);
  });

  it('shares one camera object across field, hii and every tier', () => {
    expect(inputs.hii.camera).toBe(inputs.field.camera);
    expect(inputs.tiers.dig!.camera).toBe(inputs.field.camera);
  });
});
