/**
 * satellitesPass — the satellite dots, additive into HDR on the NEAR0 line after the body
 * composite, beside the trails and under their occlusion (sampled depth plus the analytic body
 * spheres), so a satellite behind Earth is hidden. Not a body-m row: Earth's row exists only while
 * its disc is on screen, and a GEO satellite must still draw with Earth out of frame (spec §4).
 * Earth's offset from the eye and the TEME rotation are composed here in f64 each frame. The pick
 * stamps the overlay target (`pickTarget`): a dot drawn over Earth's disc must take the click from
 * the disc, as a caption does. It binds the far placeholder for depth, since the pick window has
 * no scene depth of its own; the occluder spheres still drop dots behind Earth.
 */
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { SampledDepthBinding } from '../../../@types/rendering/SampledDepthBinding';
import type { SatellitePointFrame } from '../@types/SatellitePointFrame';
import type { SatelliteClass } from '../../../@types/satellites/SatelliteClass';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { sampledDepthBinding } from '../../../services/engine/frame/sampledDepthBinding';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderSpheres } from '../../../services/engine/frame/sceneOccluderSpheres';
import { near0OverlayClipScale } from '../../../services/engine/frame/near0OverlayClipScale';
import { near0OverlayVpF32 } from '../../../services/engine/frame/near0OverlayVpF32';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { sweepAgeOpacity } from '../subsystems/sweepAgeOpacity';
import { satelliteLayerOpacity } from '../subsystems/satelliteLayerOpacity';
import { composeTemeToWorld } from '../subsystems/composeTemeToWorld';
import { SATELLITE_SWEEP_TIMING } from '../../../data/satellites/satelliteSweepTiming';

export function satellitesPass(runtime: SatellitesRuntime): ContentPass<'satellites'> {
  const opacityOf = (simDays: number): number => {
    const sweep = runtime.renderer.uploaded();
    const age = sweep === null ? Infinity : Math.abs(julianDaysToUnixMs(simDays) - sweep.simMs);
    return (
      sweepAgeOpacity(
        Math.max(age, runtime.simRate.rate() * SATELLITE_SWEEP_TIMING.expectedSweepLagMs),
      ) * satelliteLayerOpacity(runtime.propagator.catalog(), simDays)
    );
  };

  const frameOf = (
    view: SlabView,
    ctx: FrameView,
    state: PassState,
    fade: Readonly<Record<SatelliteClass, number>>,
    depth: SampledDepthBinding,
  ): SatellitePointFrame => {
    const earth = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!;
    const { simDays } = ctx.snapshot;
    const eye = view.camPos;
    return {
      vp: near0OverlayVpF32(
        rebaseViewProj(view.slab.vp, eye),
        near0OverlayClipScale(view.slab.near),
      ),
      viewportPx: view.viewportPx,
      pxPerRad: ctx.drawPxPerRad,
      simMs: julianDaysToUnixMs(simDays),
      earthKm: [
        (earth.positionMpc[0] - eye[0]) / SCALE_UNITS.KM_TO_MPC,
        (earth.positionMpc[1] - eye[1]) / SCALE_UNITS.KM_TO_MPC,
        (earth.positionMpc[2] - eye[2]) / SCALE_UNITS.KM_TO_MPC,
      ],
      temeToWorld: composeTemeToWorld(earth.orientation, simDays),
      opacity: opacityOf(simDays),
      classOpacity: [fade.active, fade.debris, fade.other],
      occluders: sceneOccluderSpheres(state, ctx),
      depth,
    };
  };

  return {
    name: 'satellites',
    fade: 'satellites',

    enabled(_state, ctx) {
      return opacityOf(ctx.snapshot.simDays) > 0;
    },

    draw(pass, view, ctx, state, fade) {
      const depth = sampledDepthBinding(
        view.sampledDepth,
        ctx.bodyPose,
        ctx.snapshot.renderTargets,
      );
      runtime.renderer.draw(pass, frameOf(view, ctx, state, fade, depth));
    },

    pickTarget: 'overlay',

    drawPick(pass, view, ctx, state, fade) {
      const depth = { frame: null, view: ctx.snapshot.renderTargets.farDepthView() };
      runtime.renderer.drawPick(pass, frameOf(view, ctx, state, fade, depth));
    },
  };
}
