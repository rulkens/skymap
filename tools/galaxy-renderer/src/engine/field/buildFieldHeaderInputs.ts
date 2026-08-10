/**
 * buildFieldHeaderInputs — the three `FieldHeaderInput` object literals one
 * frame needs (the primary field draw, the `hii:extras` draw, and every
 * `HII_TIERS` row), assembled from explicit inputs rather than an engine
 * closure. `packFieldHeaderUniforms` + `queue.writeBuffer` — the GPU half —
 * stay in `drawFrame`; this is only the pure arithmetic ahead of them, split
 * out for the same reason `deriveFrameView.ts` is: it's what a test can reach
 * without a device.
 *
 * The three share one `camera` (assembled here from `eye`/`fov`/`shiftX` plus
 * `frame`'s view/aspect/exposure) and mostly diverge on which lanes carry
 * REAL values versus the packer's own inert defaults — see each field's own
 * comment below and `FieldHeaderInput`'s own doc for the asymmetry.
 */
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { DustHeaderLanes } from '../../../@types/engine/DustHeaderLanes';
import type { FieldCamera } from '../../../@types/engine/FieldCamera';
import type { FieldHeaderInput } from '../../../@types/engine/FieldHeaderInput';
import type { FieldSliceCounts } from '../../../@types/engine/FieldSliceCounts';
import type { HiiTextureLanes } from '../../../@types/engine/HiiTextureLanes';
import type { HiiTierKind } from '../../../@types/engine/HiiTierKind';
import type { IsmMapSeedingLanes } from '../../../@types/engine/IsmMapSeedingLanes';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import type { YoungStarsLanes } from '../../../@types/engine/YoungStarsLanes';
import type { FrameView } from '../frame/deriveFrameView';

import { HII_TIERS } from '../../data/hiiTiers';

/** The model-derived lanes no `render`/`frame` value can supply — one snapshot per frame off `model`'s own getters. */
export type FieldHeaderModelLanes = {
  readonly fieldCounts: FieldSliceCounts;
  readonly dustHeaderLanes: DustHeaderLanes;
  readonly ismMapSeeding: IsmMapSeedingLanes;
  readonly hiiCount: number;
  readonly hiiTexture: HiiTextureLanes;
  readonly youngStars: YoungStarsLanes;
};

/** Each pass's own target resolution — `targets.reducedSize(...)`, resolved by the caller (this module never touches `targets`). */
export type FieldHeaderTargetSizes = {
  readonly field: Vec2;
  readonly dustMapHeightPx: number;
  readonly hii: Vec2;
  readonly tiers: Readonly<Record<HiiTierKind, Vec2>>;
};

export type FieldHeaderInputsDeps = {
  readonly eye: Vec3;
  readonly fov: number;
  readonly shiftX: number;
  readonly frame: FrameView;
  readonly render: RenderSettings;
  readonly model: FieldHeaderModelLanes;
  readonly targetSizes: FieldHeaderTargetSizes;
};

export type FieldHeaderInputs = {
  readonly field: FieldHeaderInput;
  readonly hii: FieldHeaderInput;
  readonly tiers: Readonly<Record<HiiTierKind, FieldHeaderInput>>;
};

export function buildFieldHeaderInputs(deps: FieldHeaderInputsDeps): FieldHeaderInputs {
  const { eye, fov, shiftX, frame, render, model, targetSizes } = deps;
  const { debugViews, galaxyWeight, ismMapChannels, dustSlices, starGrainFeatureScale } = frame;

  // Shared ray basis — `aspect` is the PROJECTION's (the canvas's), not any
  // reduced target's: the fullscreen triangle covers a divisor-scaled target,
  // but the frustum it must reconstruct is the one `proj` was built with.
  const camera: FieldCamera = {
    eye,
    view: frame.view,
    fov,
    aspect: frame.aspect,
    lensShiftX: shiftX,
    exposure: frame.analyticExposure,
  };

  const field: FieldHeaderInput = {
    camera,
    emissionCount: model.fieldCounts.emission,
    primaryCount: model.fieldCounts.primary,
    targetSizePx: targetSizes.field,
    dust: {
      count: model.fieldCounts.dust,
      // All three cached by rebuildDustMixture, not recomputed per frame.
      extinctionRgb: model.dustHeaderLanes.extinctionRgb,
      noise: model.dustHeaderLanes.noise,
      carve: model.dustHeaderLanes.carve,
      detail: model.dustHeaderLanes.detail,
      // VIEW-dependent, unlike every other lane in this bag.
      slices: dustSlices,
      mapHeightPx: targetSizes.dustMapHeightPx,
    },
    // Each present shader reads its own view's lane out of this; bubble's
    // does so through its own bind group, bound to THIS header's `fieldUbo`
    // and never to the HII one below.
    debugViews,
    galaxyWeight,
    ismMapChannels,
    // ismMapPresent.wesl binds ONLY this header (createIsmMapOutput.ts's
    // presentBindGroup) — the HII header below omits this and packs the
    // seeding lanes inert.
    ismMapSeeding: model.ismMapSeeding,
  };

  // `primaryCount` is packed to THIS pass's own instance count, not the
  // primary galaxy's — dustAttenuation.wesl's componentEmission gates its
  // attenuation branch on `instanceIndex < primaryCount`, true for every HII
  // sprite, so the whole tier darkens under the same dust law the disc reads.
  //
  // `dust.extinctionRgb`/`.slices` carry the field header's own live values —
  // the only two lanes componentEmission reads. Everything else in `dust`
  // stays INERT: `noise`/`detail`/`count`/`mapHeightPx` feed dustMap.wesl's
  // accumulation pass, which this draw never runs — carrying the field's real
  // `dust.noise` here would silently retune hiiNoiseTerm's sampling
  // frequency as a side effect of a fix that is only about attenuation.
  const hii: FieldHeaderInput = {
    camera,
    emissionCount: model.hiiCount,
    primaryCount: model.hiiCount,
    targetSizePx: targetSizes.hii,
    dust: {
      count: 0,
      extinctionRgb: model.dustHeaderLanes.extinctionRgb,
      noise: { tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 },
      carve: { carve: 0, sharpness: 0.5, stretch: 1 },
      detail: 0,
      slices: dustSlices,
      mapHeightPx: 0,
    },
    // `hiiTexture`/`youngStars`/`starGrainFeatureScale`/`starGrainWarpAmp`/
    // `quadCapNdc` all carry REAL values only on this header — the field
    // draw's own components never carry a nonzero `textureWeight`/
    // `starsWeight`, so leaving them off `field` above costs it nothing (see
    // each field's own doc on `FieldHeaderInput`). `nearFadeStart`/`End` ride
    // `render`, not `model` — a live perf knob, not per-galaxy tuning.
    hiiTexture: model.hiiTexture,
    youngStars: {
      contrastGamma: model.youngStars.contrastGamma,
      invMeanNorm: model.youngStars.invMeanNorm,
      nearFadeStart: render.hiiNearFadeStart,
      nearFadeEnd: render.hiiNearFadeEnd,
    },
    starGrainFeatureScale,
    starGrainWarpAmp: render.starGrainWarpAmp,
    quadCapNdc: render.hiiQuadCap,
    debugViews,
    galaxyWeight,
    ismMapChannels,
  };

  // Every `HII_TIERS` row's own header — identical to `hii` above (same
  // whole-tier `primaryCount`, so the dust-attenuation gate is correct for
  // whichever sub-range a given pass draws) EXCEPT `targetSizePx`: each tier
  // has its OWN reduced target, and that lane is what `counts2.w` feeds the
  // shader's footprint gates and dustMapTex UV reconstruction with — reusing
  // `hii.targetSizePx` here would silently hand every tier's splat the
  // extras target's resolution instead of its own.
  const tiers = Object.fromEntries(
    HII_TIERS.map((tier) => [tier.kind, { ...hii, targetSizePx: targetSizes.tiers[tier.kind] }]),
  ) as Record<HiiTierKind, FieldHeaderInput>;

  return { field, hii, tiers };
}
