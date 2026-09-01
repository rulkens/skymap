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
import { regionById } from '../../../../utils/scene/regionById';
import { regionRelativeDistanceMpc } from '../../../../utils/scene/regionRelativeDistanceMpc';
import { sceneBodyStates } from '../sceneBodyStates';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';

const GALACTIC_CENTRE_REGION = regionById('galactic-centre');

// One row today (Sgr A* only) — found once at module scope rather than
// re-scanned every frame, the same "hoist the constant lookup" convention
// `starPointsLayer`'s module-scope regions follow. `BLACK_HOLES` is authored
// data guaranteed to carry this row; a missing row is a wiring bug worth
// failing loudly on, not a silent no-op layer.
const BLACK_HOLE = BLACK_HOLES.find((row) => row.bodyId === SGR_A_STAR.id);
if (BLACK_HOLE === undefined) {
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

    const flickerPhase = (2 * Math.PI * (ctx.nowMs / 1000)) / BLACK_HOLE.emission.flickerTimescaleS;

    const uniforms = packSgrAStarLensingUniforms(
      view.vp,
      view.viewportPx,
      SCHWARZSCHILD_RADIUS_M,
      BLACK_HOLE.emission.innerRs,
      BLACK_HOLE.emission.outerRs,
      BLACK_HOLE.emission.inclinationRad,
      BLACK_HOLE.emission.positionAngleRad,
      BLACK_HOLE.emission.flickerAmp,
      BLACK_HOLE.emission.flickerTimescaleS,
      flickerPhase,
      renderer.lut.minImpactParamRs,
      renderer.lut.maxImpactParamRs,
      renderer.lut.samples.length,
      bandAlpha,
      anchorPosRelCamM,
    );

    const skyCubemapView = ctx.renderTargets.cubeViewOf('sky-cubemap');
    renderer.draw(pass, uniforms, skyCubemapView);
  },
};
