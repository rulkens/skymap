/**
 * blackHoleLensingPass — the lens pass, one render step per `BLACK_HOLES` row
 * whose slab the frame resolved: `FRAME_ORDER`'s `lens` line expands per
 * body-m row, and this pass answers only the rows posed from a hole's anchor.
 * Its pipeline blends OVER, not the additive convention most `hdr` layers
 * use: the captured disc must truly OCCLUDE the starlight behind it, while
 * per-pixel alpha lets the earlier roster through where deflection is
 * negligible.
 * No `drawPick` — the hole's pick stamp lives in `blackHoleMarkerPass`.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BlackHolesRuntime } from '../@types/BlackHolesRuntime';
import { BLACK_HOLES } from '../data/blackHoles';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { schwarzschildRadiusM } from '../../../utils/physics/schwarzschildRadiusM';
import { packBlackHoleLensingUniforms } from '../../../utils/gpu/packBlackHoleLensingUniforms';
import { lensEdgeFadeEndRs } from '../../../utils/lensing/lensEdgeFadeEndRs';
import { skyCaptureBandAlpha } from '../../../services/engine/frame/skyCaptureBandAlpha';
import { blackHoleAnchorId } from '../present/blackHoleAnchorId';

export function blackHoleLensingPass(runtime: BlackHolesRuntime): ContentPass {
  // `ctx.snapshot.simDays` is Julian days; `flickerTimescaleS` is seconds.
  const SECONDS_PER_DAY = 86_400;

  return {
    name: 'black-hole-lensing',

    enabled(_state, _ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      const hostId = view.slab.frame.hostId;
      return BLACK_HOLES.some((row) => blackHoleAnchorId(row) === hostId);
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const hostId = view.slab.frame.hostId;
      const row = BLACK_HOLES.find((candidate) => blackHoleAnchorId(candidate) === hostId);
      if (row === undefined) return;
      const renderer = runtime.lensRenderer;
      const schwarzschildM = schwarzschildRadiusM(row.massSolar);

      // The SAME pose-provider closure `deriveSlabs` built this row's
      // `view.slab.vp` from — see `planetsPass`'s identical seam.
      const pose = ctx.bodyPose(hostId);
      if (pose === null) return;

      // `> 0` by construction: the `lens` line expands to a step only while
      // the hole's `SlabRow` exists, and that row's `activeBand` is the SAME
      // band object this alpha reads off `CUBEMAP_CAPTURES` — the single gate;
      // the uniform still needs the value (spec §2.5).
      const bandAlpha = skyCaptureBandAlpha(row.capture, state, ctx);

      // The hole's position relative to the camera, in the SAME body-local
      // frame `view.slab.vp` was built in (camera at the origin) — the
      // negation of `pose.eyeRelBodyM`. No separate rebaseViewProj step:
      // unlike the NEAR0 layers, a body-m row's vp is already camera-centred.
      const anchorPosRelCamM: Vec3 = [
        -pose.eyeRelBodyM[0],
        -pose.eyeRelBodyM[1],
        -pose.eyeRelBodyM[2],
      ];

      // Keyed on the SIM clock, so a paused clock holds the flicker still and
      // time-scrubbing carries it. Divides by the SAME `flickerTimescaleS`
      // the packed uniform carries, or a live slider drag desyncs the phase
      // from the period it packs. Wrapped into [0, 2π) HERE, in f64: the raw
      // phase is ~1e9 rad at J2000 epochs, beyond an f32 uniform's reach.
      const tuning = state.settings.blackHoleLensingTuning;
      const simSeconds = ctx.snapshot.simDays * SECONDS_PER_DAY;
      const flickerPhase = ((2 * Math.PI * simSeconds) / tuning.flickerTimescaleS) % (2 * Math.PI);

      // Where the escape fade must reach zero — see lensEdgeFadeEndRs's doc.
      const distRs =
        Math.hypot(anchorPosRelCamM[0], anchorPosRelCamM[1], anchorPosRelCamM[2]) / schwarzschildM;
      const edgeFadeEndRs = lensEdgeFadeEndRs(
        distRs,
        ctx.drawPxPerRad,
        renderer.lut.maxImpactParamRs,
      );

      const uniforms = packBlackHoleLensingUniforms({
        viewProj: view.vp,
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        schwarzschildRadiusM: schwarzschildM,
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

      // Named by the CAPTURE the lens samples, not by the texture that
      // capture happens to own.
      const capturedSky = ctx.snapshot.renderTargets.cubeViewOf(
        CUBEMAP_CAPTURES[row.capture].target,
      );
      renderer.draw(pass, uniforms, capturedSky);
    },
  };
}
