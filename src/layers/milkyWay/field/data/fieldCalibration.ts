/**
 * FIELD_CALIBRATION — the analytic field's calibrated defaults, the one row
 * the tool's boot settings and the app's settings both read, so a look tuned
 * in the tool transfers. `render`'s debug lanes are neutral (no debug view,
 * full galaxy, every ISM channel, no seeding overlay): inert in the app, the
 * starting point the tool overrides from its own knobs.
 */
import type { FieldHostTuning } from '../host/@types/FieldHostTuning';
import type { FieldTargetId } from '../@types/FieldTargetId';

export const FIELD_CALIBRATION = {
  // 1.0 is the calibration point itself — see `FIELD_EXPOSURE_GAUGE`.
  exposure: 1,
  divisors: {
    // Coarse because the field is FILL-bound and a sum of wide Gaussians
    // survives it: measured 2.5-3 ms at the sprite divisor against under 1 ms
    // at 5, with no visible difference. The ceiling is bloom FIREFLIES zoomed
    // far out: the closed-form integral point-samples the ray, so a bulge core
    // narrower than a texel aliases past the bloom threshold.
    field: 6,
    // Finer than the field would need: the dust map carries the particle-cloud
    // tier, cloud-scale detail (io.wesl's DUST MAP doc). Only one step, though:
    // diving toward the centre puts the big splats over the whole screen, and
    // 2 is measurably too expensive there.
    dustMap: 5,
    // Full resolution for the extras and the shells: an embedded shell is
    // small and bright by construction, so any downsampled target collapses it
    // under a texel and bloom promotes the spike into a firefly
    // (`docs/research/milky-way/hii-regions.md`).
    extras: 1,
    shells: 1,
    // 2: the grain band-limit (hiiSplat/starGrain.wesl's starGrainTerm) makes
    // the half-res young target alias-free, and the tier is the HII pass's
    // worst overdraw contributor.
    young: 2,
    // DIG is the biggest, softest, lowest-frequency tier: a coarse target costs
    // no visible detail while cutting fragment work by about the square of this.
    dig: 4,
  } satisfies Record<FieldTargetId, number>,
  render: {
    // 4.5 mirrors splatSilhouette.wesl's SPLAT_CUT, so the fade starts exactly
    // where the eye enters a component's truncation sphere; 1.5 is gone before
    // the fallback quad dominates the frame.
    hiiNearFadeStart: 4.5,
    hiiNearFadeEnd: 1.5,
    // Breaks the grain's tile repeat while staying under one tile
    // (starGrain.wesl's own doc); 0 makes the repeat visible again.
    starGrainWarpAmp: 0.04,
    // 0 = off (io.wesl's perf.x quad cap), until a value is settled against
    // the reference gallery.
    hiiQuadCap: 0,
    // One static value could not serve both regimes; `deriveFieldFrameLanes`
    // blends them by camera distance.
    starGrainFeatureScaleNear: 4,
    starGrainFeatureScaleFar: 15,
    // A small DERIVATIVE scale (noise suppression before the gradient) and a
    // larger INTEGRATION scale (averaging after the tensor), conventionally
    // 2-3x the derivative one.
    orientationSigmaDerivTexels: 1.5,
    orientationSigmaIntegTexels: 4,
    debugViews: { dust: 0, ismMap: 0, orientation: 0, bubble: 0 },
    galaxyWeight: 1,
    ismMapChannels: {
      gasWeight: 1,
      starsWeight: 1,
      activityWeight: 1,
      dustWeight: 1,
    },
    ismMapSeeding: { weight: 0, cap: 0, globalMean: 0 },
  } satisfies FieldHostTuning['render'],
};
