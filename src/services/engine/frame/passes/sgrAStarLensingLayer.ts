/**
 * sgrAStarLensingLayer — the Sgr A* lens pass's `ContentLayer` row.
 *
 * `slab: 'body'`: the frame program expands a `'body'` layer into one render
 * step per body-m slab row, so `enabled`/`draw` are called once per body —
 * narrowed here to Sgr A*'s own row (the anchor's `visibleSlabBodies`
 * candidacy, same seam `planetsLayer` reads for a seeded planet). `blend:
 * 'over'` (Porter-Duff, premultiplied) rather than the additive convention
 * most `hdr` layers use: the black hole's captured disc must truly occlude
 * the additive starlight already accumulated behind it, and per-pixel alpha
 * lets the roster drawn earlier show through wherever deflection is
 * negligible — `Blend.d.ts` enumerates `'over'` for any target, not just the
 * swap-chain rows.
 *
 * No `drawPick`: Sgr A*'s existing pick stamp lives in `starPointsLayer`
 * (see `ContentLayer.d.ts`'s own docblock) and is untouched by this layer.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { BLACK_HOLES } from '../../../../data/blackHoles';
import { SGR_A_STAR } from '../../../../data/bodies/sceneSgrAStar';
import { SGR_A_STAR_MASS_SOLAR } from '../../../../data/bodies/sgrAStarMassSolar';
import { schwarzschildRadiusM } from '../../../../utils/physics/schwarzschildRadiusM';
import { packSgrAStarLensingUniforms } from '../../../../utils/gpu/packSgrAStarLensingUniforms';
import { lensQuadPlaneRadiusRs } from '../../../../utils/lensing/lensQuadPlaneRadiusRs';
import { regionById } from '../../../../utils/scene/regionById';
import { regionRelativeDistanceMpc } from '../../../../utils/scene/regionRelativeDistanceMpc';
import { sceneBodyStates } from '../sceneBodyStates';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';

const GALACTIC_CENTRE_REGION = regionById('galactic-centre');

// `BLACK_HOLES` is authored data guaranteed to carry a Sgr A* row; a missing
// row is a wiring bug worth failing loudly on, not a silent no-op layer.
// Checked once at module scope rather than every frame, the same "hoist the
// constant lookup" convention `starPointsLayer`'s module-scope regions
// follow. The row's VALUES are no longer read here — TEMPORARILY (Task 15),
// `state.settings.sgrAStarLensingTuning` overrides them at pack time (seeded
// from this same row — see `DEFAULT_SGR_A_STAR_LENSING_TUNING`); the removal
// step reverts to reading `BLACK_HOLE.emission.*` directly.
if (BLACK_HOLES.find((row) => row.bodyId === SGR_A_STAR.id) === undefined) {
  throw new Error(`sgrAStarLensingLayer: BLACK_HOLES carries no row for '${SGR_A_STAR.id}'`);
}

const SCHWARZSCHILD_RADIUS_M = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);

/** This frame's fade-band alpha (Q6's zero-dispatch gate) — shared by `enabled` and `draw`. */
function bandAlphaFor(state: EngineState, ctx: ReadyFrameContext): number {
  const distMpc = regionRelativeDistanceMpc(
    ctx.drawCamPos,
    GALACTIC_CENTRE_REGION,
    sceneBodyStates(state, ctx),
  );
  return fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, distMpc);
}

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
    return bandAlphaFor(state, ctx) > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.sgrAStarLensingRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    if (view.slab.frame.bodyId !== SGR_A_STAR.id) return;

    // The SAME pose-provider closure `deriveSlabs` built this row's
    // `view.slab.vp` from — see `planetsLayer`'s identical seam.
    const pose = ctx.bodyPose(view.slab.frame.bodyId);
    if (pose === null) return;

    const bandAlpha = bandAlphaFor(state, ctx);
    if (bandAlpha <= 0) return; // "opacity 0 ⇒ no render" house rule

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

    // TEMPORARY (Task 15): every emission field below reads the DebugPanel
    // tuning cluster, not `BLACK_HOLE.emission` — see the module-scope guard's
    // comment. `flickerPhase` must divide by the SAME `flickerTimescaleS` the
    // packed uniform carries, or a live slider drag would desync the phase
    // from the period it packs.
    const tuning = state.settings.sgrAStarLensingTuning;
    const flickerPhase = (2 * Math.PI * (ctx.nowMs / 1000)) / tuning.flickerTimescaleS;

    // Where the escape fade must reach zero: weak-field deflection is 2/b rad
    // (b in r_s), so it drops below one screen pixel at b = 2·drawPxPerRad.
    // Capped at 0.6× the camera's distance (in r_s) because a billboard's
    // impact-parameter coverage can never exceed that distance — 0.6 bounds
    // the vertex's plane-stretch factor at 1.25 (see vertex.wesl) — and
    // floored at the LUT max so the fade never cuts into the LUT-resolved
    // strong-field region during a close descent. Fading at the raw LUT edge
    // instead blended a sky still deflected ~40 px into the true sky (see
    // audit-cubemap-alignment.md §7).
    const distRs =
      Math.hypot(anchorPosRelCamM[0], anchorPosRelCamM[1], anchorPosRelCamM[2]) /
      SCHWARZSCHILD_RADIUS_M;
    const edgeFadeEndRs = Math.max(
      renderer.lut.maxImpactParamRs,
      Math.min(2 * ctx.drawPxPerRad, 0.6 * distRs),
    );
    // Billboard half-size in f64 HERE, not in the vertex shader: the f32
    // in-shader inversion degenerated close-in (edgeFadeEndRs >= distRs via
    // the lutMax floor) into a ~5e4x-oversized quad whose varying
    // interpolation shook every ray — see lensQuadPlaneRadiusRs's docblock.
    const quadPlaneRadiusRs = lensQuadPlaneRadiusRs(edgeFadeEndRs, distRs);

    const uniforms = packSgrAStarLensingUniforms(
      view.vp,
      view.viewportPx,
      SCHWARZSCHILD_RADIUS_M,
      tuning.innerRs,
      tuning.outerRs,
      tuning.inclinationRad,
      tuning.positionAngleRad,
      tuning.flickerAmp,
      tuning.flickerTimescaleS,
      flickerPhase,
      renderer.lut.minImpactParamRs,
      renderer.lut.maxImpactParamRs,
      renderer.lut.samples.length,
      bandAlpha,
      anchorPosRelCamM,
      tuning.diskScaleHeightRs,
      tuning.edgeFadeStartFraction,
      tuning.dopplerStrength,
      tuning.emissionStrength,
      edgeFadeEndRs,
      tuning.emissionTint,
      quadPlaneRadiusRs,
    );

    const skyCubemapView = ctx.renderTargets.cubeViewOf('sky-cubemap');
    renderer.draw(pass, uniforms, skyCubemapView);
  },
};
