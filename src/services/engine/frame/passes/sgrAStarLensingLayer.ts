/**
 * sgrAStarLensingLayer — the Sgr A* lens pass's `ContentLayer` row.
 *
 * `slab: 'body'` expands into one render step per body-m row, so
 * `enabled`/`draw` run once per body and are narrowed here to Sgr A*'s.
 * `blend: 'over'`, not the additive convention most `hdr` layers use: the
 * captured disc must truly OCCLUDE the starlight behind it, while per-pixel
 * alpha lets the earlier roster through where deflection is negligible.
 * No `drawPick` — Sgr A*'s pick stamp lives in `starPointsLayer`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { BLACK_HOLES } from '../../../../data/blackHoles';
import { SGR_A_STAR } from '../../../../data/bodies/sceneSgrAStar';
import { SGR_A_STAR_MASS_SOLAR } from '../../../../data/bodies/sgrAStarMassSolar';
import { schwarzschildRadiusM } from '../../../../utils/physics/schwarzschildRadiusM';
import { packSgrAStarLensingUniforms } from '../../../../utils/gpu/packSgrAStarLensingUniforms';
import { lensQuadPlaneRadiusRs } from '../../../../utils/lensing/lensQuadPlaneRadiusRs';
import { sgrAStarLensBandAlpha } from '../sgrAStarLensBandAlpha';

// `BLACK_HOLES` is authored data guaranteed to carry a Sgr A* row; a missing
// row is a wiring bug worth failing loudly on, not a silent no-op layer. The
// row's VALUES are not read here: `state.settings.sgrAStarLensingTuning` is
// what packs (seeded from this same row — `DEFAULT_SGR_A_STAR_LENSING_TUNING`).
if (BLACK_HOLES.find((row) => row.bodyId === SGR_A_STAR.id) === undefined) {
  throw new Error(`sgrAStarLensingLayer: BLACK_HOLES carries no row for '${SGR_A_STAR.id}'`);
}

const SCHWARZSCHILD_RADIUS_M = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);

/** `ctx.simDays` is Julian days; `flickerTimescaleS` is seconds. */
const SECONDS_PER_DAY = 86_400;

export const sgrAStarLensingLayer: ContentLayer = {
  name: 'sgr-a-star-lensing',
  slab: 'body',
  target: 'hdr',
  blend: 'over',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m' || view.slab.frame.bodyId !== SGR_A_STAR.id) {
      return false;
    }
    if (state.gpu.sgrAStarLensingRenderer === null) return false;
    return sgrAStarLensBandAlpha(state, ctx) > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.sgrAStarLensingRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    if (view.slab.frame.bodyId !== SGR_A_STAR.id) return;

    // The SAME pose-provider closure `deriveSlabs` built this row's
    // `view.slab.vp` from — see `planetsLayer`'s identical seam.
    const pose = ctx.bodyPose(view.slab.frame.bodyId);
    if (pose === null) return;

    // `> 0` by construction: `enabled` gates on it, and `frameProgram` only
    // emits this step at all while the band is open.
    const bandAlpha = sgrAStarLensBandAlpha(state, ctx);

    // Sgr A*'s position relative to the camera, in the SAME body-local frame
    // `view.slab.vp` was built in (camera at the origin) — the negation of
    // `pose.eyeRelBodyM` (camera relative to the body). No separate
    // rebaseViewProj step: unlike the NEAR0 layers, a body-m row's vp is
    // already camera-centred (see `bodySlabRow`, slabs.ts).
    const anchorPosRelCamM: Vec3 = [
      -pose.eyeRelBodyM[0],
      -pose.eyeRelBodyM[1],
      -pose.eyeRelBodyM[2],
    ];

    // Keyed on the SIM clock, so a paused clock holds the flicker still and
    // time-scrubbing carries it (spec §Data). Divides by the SAME
    // `flickerTimescaleS` the packed uniform carries, or a live slider drag
    // desyncs the phase from the period it packs. Wrapped into [0, 2π) HERE,
    // in f64: the raw phase is ~1e9 rad at J2000 epochs, which an f32 uniform
    // could not resolve to a fraction of a cycle.
    const tuning = state.settings.sgrAStarLensingTuning;
    const simSeconds = ctx.simDays * SECONDS_PER_DAY;
    const flickerPhase = ((2 * Math.PI * simSeconds) / tuning.flickerTimescaleS) % (2 * Math.PI);

    // Where the escape fade must reach zero: weak-field deflection is 2/b rad
    // (b in r_s), so it drops below one screen pixel at b = 2·drawPxPerRad.
    // Capped at 0.6× the camera's distance (in r_s) because a billboard's
    // impact-parameter coverage can never exceed that distance — 0.6 bounds
    // the vertex's plane-stretch factor at 1.25 (see vertex.wesl) — and
    // floored at the LUT max so the fade never cuts into the LUT-resolved
    // strong-field region during a close descent — fading at the raw LUT edge
    // blends a sky still deflected ~40 px into the true sky.
    const distRs =
      Math.hypot(anchorPosRelCamM[0], anchorPosRelCamM[1], anchorPosRelCamM[2]) /
      SCHWARZSCHILD_RADIUS_M;
    const edgeFadeEndRs = Math.max(
      renderer.lut.maxImpactParamRs,
      Math.min(2 * ctx.drawPxPerRad, 0.6 * distRs),
    );
    // Billboard half-size in f64 HERE, not in the vertex shader — see
    // `lensQuadPlaneRadiusRs`'s docblock.
    const quadPlaneRadiusRs = lensQuadPlaneRadiusRs(edgeFadeEndRs, distRs);

    const uniforms = packSgrAStarLensingUniforms({
      viewProj: view.vp,
      viewportPx: view.viewportPx,
      schwarzschildRadiusM: SCHWARZSCHILD_RADIUS_M,
      innerRs: tuning.innerRs,
      outerRs: tuning.outerRs,
      inclinationRad: tuning.inclinationRad,
      positionAngleRad: tuning.positionAngleRad,
      flickerAmp: tuning.flickerAmp,
      flickerPhase,
      lutMinImpactParamRs: renderer.lut.minImpactParamRs,
      lutMaxImpactParamRs: renderer.lut.maxImpactParamRs,
      lutSampleCount: renderer.lut.samples.length,
      bandAlpha,
      anchorPosRelCamM,
      diskScaleHeightRs: tuning.diskScaleHeightRs,
      edgeFadeStartFraction: tuning.edgeFadeStartFraction,
      dopplerStrength: tuning.dopplerStrength,
      emissionStrength: tuning.emissionStrength,
      edgeFadeEndRs,
      emissionTint: tuning.emissionTint,
      quadPlaneRadiusRs,
    });

    const skyCubemapView = ctx.renderTargets.cubeViewOf('sky-cubemap');
    renderer.draw(pass, uniforms, skyCubemapView);
  },
};
