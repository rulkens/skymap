/**
 * satellitesPass — the satellite dots, additive into HDR on the NEAR0 line after the body
 * composite, beside the trails and under their occlusion (sampled depth plus the analytic body
 * spheres), so a satellite behind Earth is hidden. Not a body-m row: Earth's row exists only while
 * its disc is on screen, and a GEO satellite must still draw with Earth out of frame (spec §4).
 * Earth's offset from the eye and the TEME rotation are composed here in f64 each frame.
 */
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';
import type { Vec3 } from '../../../@types/math/Vec3';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { sampledDepthBinding } from '../../../services/engine/frame/sampledDepthBinding';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderSpheres } from '../../../services/engine/frame/sceneOccluderSpheres';
import { near0OverlayVpF32 } from '../../../services/engine/frame/near0OverlayVpF32';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SATELLITE_SWEEP_TIMING } from '../../../data/satellites/satelliteSweepTiming';
import { satelliteOpacity } from '../subsystems/satelliteOpacity';
import { composeTemeToWorld } from '../subsystems/composeTemeToWorld';
import { SATELLITE_CLASSES } from '../../../data/satellites/satelliteClasses';

export function satellitesPass(runtime: SatellitesRuntime): ContentPass<'satellites'> {
  const opacityOf = (simDays: number, eye: Readonly<Vec3>, earthMpc: Readonly<Vec3>): number => {
    const catalog = runtime.propagator.catalog();
    if (catalog === null) return 0;
    return satelliteOpacity(
      julianDaysToUnixMs(simDays),
      catalog.fetchedAtMs,
      distanceMpc(eye, earthMpc) / SCALE_UNITS.KM_TO_MPC,
    );
  };

  return {
    name: 'satellites',
    fade: 'satellites',

    enabled(state, ctx, view, fade) {
      const earth = sceneBodyStates(state, ctx).get(SCENE_EARTH.id);
      const sweep = runtime.renderer.uploaded();
      if (!SATELLITE_CLASSES.some((cls) => fade[cls] > 0)) return false;
      if (earth === undefined || sweep === null) return false;
      const simAge = Math.abs(julianDaysToUnixMs(ctx.snapshot.simDays) - sweep.simMs);
      if (simAge > SATELLITE_SWEEP_TIMING.maxDrawSimAgeMs) return false;
      return opacityOf(ctx.snapshot.simDays, view.camPos, earth.positionMpc) > 0;
    },

    draw(pass, view, ctx, state, fade) {
      const earth = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!;
      const { simDays } = ctx.snapshot;
      const eye = view.camPos;
      runtime.renderer.draw(pass, {
        vp: near0OverlayVpF32(rebaseViewProj(view.slab.vp, eye)),
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        simMs: julianDaysToUnixMs(simDays),
        earthKm: [
          (earth.positionMpc[0] - eye[0]) / SCALE_UNITS.KM_TO_MPC,
          (earth.positionMpc[1] - eye[1]) / SCALE_UNITS.KM_TO_MPC,
          (earth.positionMpc[2] - eye[2]) / SCALE_UNITS.KM_TO_MPC,
        ],
        temeToWorld: composeTemeToWorld(earth.orientation, simDays),
        opacity: opacityOf(simDays, eye, earth.positionMpc),
        classOpacity: [fade.active, fade.debris, fade.other],
        occluders: sceneOccluderSpheres(state, ctx),
        depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
      });
    },
  };
}
