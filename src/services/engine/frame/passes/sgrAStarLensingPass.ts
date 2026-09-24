/**
 * sgrAStarLensingPass — the Sgr A* lens pass's `ContentPass` row.
 *
 * `FRAME_ORDER`'s `lens` line expands into one render step per body-m row in
 * the frame's lensing list, so `enabled`/`draw` run once per body and are
 * narrowed here to Sgr A*'s.
 * Its pipeline blends OVER, not the additive convention most `hdr` layers
 * use: the captured disc must truly OCCLUDE the starlight behind it, while
 * per-pixel alpha lets the earlier roster through where deflection is
 * negligible.
 * No `drawPick` — Sgr A*'s pick stamp lives in `starPointsPass`.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { BLACK_HOLES } from '../../../../data/blackHoles';
import { SGR_A_STAR } from '../../../../data/bodies/sceneSgrAStar';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../data/places/galacticCentre';
import { SGR_A_STAR_MASS_SOLAR } from '../../../../data/bodies/sgrAStarMassSolar';
import { CUBEMAP_CAPTURES } from '../../../../data/rendering/cubemapCaptures';
import { schwarzschildRadiusM } from '../../../../utils/physics/schwarzschildRadiusM';
import { packSgrAStarLensingUniforms } from '../../../../utils/gpu/packSgrAStarLensingUniforms';
import { lensEdgeFadeEndRs } from '../../../../utils/lensing/lensEdgeFadeEndRs';
import { skyCaptureBandAlpha } from '../skyCaptureBandAlpha';

// `BLACK_HOLES` is authored data guaranteed to carry a Sgr A* row; a missing
// row is a wiring bug worth failing loudly on, not a silent no-op layer. The
// row's VALUES are not read here: `state.settings.sgrAStarLensingTuning` is
// what packs (seeded from this same row — see `sgrAStarLensingTuning/initialState.ts`).
if (BLACK_HOLES.find((row) => row.bodyId === SGR_A_STAR.id) === undefined) {
  throw new Error(`sgrAStarLensingPass: BLACK_HOLES carries no row for '${SGR_A_STAR.id}'`);
}

const SCHWARZSCHILD_RADIUS_M = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);

/** `ctx.snapshot.simDays` is Julian days; `flickerTimescaleS` is seconds. */
const SECONDS_PER_DAY = 86_400;

export const sgrAStarLensingPass: ContentPass = {
  name: 'sgr-a-star-lensing',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m' || view.slab.frame.hostId !== GALACTIC_CENTRE_ANCHOR.id) {
      return false;
    }
    return state.gpu.sgrAStarLensingRenderer !== null;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.sgrAStarLensingRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    if (view.slab.frame.hostId !== GALACTIC_CENTRE_ANCHOR.id) return;

    // The SAME pose-provider closure `deriveSlabs` built this row's
    // `view.slab.vp` from — see `planetsPass`'s identical seam.
    const pose = ctx.bodyPose(view.slab.frame.hostId);
    if (pose === null) return;

    // `> 0` by construction: the `lens` line expands to a step only while
    // Sgr A*'s `SlabRow` exists, and that row's `activeBand` is the SAME band
    // object this alpha reads off `CUBEMAP_CAPTURES` — the single gate, so the
    // pass no longer re-asks it in `enabled` (spec §2.5).
    const bandAlpha = skyCaptureBandAlpha('sgrAStar', state, ctx);

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
    const simSeconds = ctx.snapshot.simDays * SECONDS_PER_DAY;
    const flickerPhase = ((2 * Math.PI * simSeconds) / tuning.flickerTimescaleS) % (2 * Math.PI);

    // Where the escape fade must reach zero — see lensEdgeFadeEndRs's doc.
    const distRs =
      Math.hypot(anchorPosRelCamM[0], anchorPosRelCamM[1], anchorPosRelCamM[2]) /
      SCHWARZSCHILD_RADIUS_M;
    const edgeFadeEndRs = lensEdgeFadeEndRs(
      distRs,
      ctx.drawPxPerRad,
      renderer.lut.maxImpactParamRs,
    );

    const uniforms = packSgrAStarLensingUniforms({
      viewProj: view.vp,
      viewportPx: view.viewportPx,
      pxPerRad: ctx.drawPxPerRad,
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
      viewBasis: pose.basisM,
      frustum: ctx.frustum,
    });

    // Named by the CAPTURE the lens samples, not by the texture that capture
    // happens to own.
    const capturedSky = ctx.snapshot.renderTargets.cubeViewOf(CUBEMAP_CAPTURES.sgrAStar.target);
    renderer.draw(pass, uniforms, capturedSky);
  },
};
