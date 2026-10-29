/**
 * satelliteOrbitsPass — the selected and focused satellites' orbits as the same fading trail the
 * planets get, drawn by the Layer's OWN `OrbitTrailRenderer`: core's rewrites its instance buffer on
 * every `draw`, so a second draw in a frame would overwrite the planets' records before submit.
 * Alpha is the class fade times the stale-data and camera-distance fade, not the dots' sweep-lag
 * fade: at fast time a ring is computed every frame and stays exact. NEAR0, under the same
 * occlusion as the trails; no pick.
 * HARD INVARIANT: `view.slab.vp`, never `view.vp` (see `writeOrbitTrailRecord`).
 */
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';
import { INSTANCE_FLOATS } from '../../../services/gpu/renderers/bodies/orbitTrailRenderer';
import { sampledDepthBinding } from '../../../services/engine/frame/sampledDepthBinding';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderSpheres } from '../../../services/engine/frame/sceneOccluderSpheres';
import { writeOrbitTrailRecord } from '../../../utils/orbit/writeOrbitTrailRecord';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SATELLITE_CLASSES } from '../../../data/satellites/satelliteClasses';
import { SATELLITE_POINT_STYLE } from '../../../data/satellites/satellitePointStyle';
import { satelliteLayerOpacity } from '../subsystems/satelliteLayerOpacity';
import { satelliteOrbitEllipse } from '../subsystems/satelliteOrbitEllipse';
import { composeTemeToWorld } from '../subsystems/composeTemeToWorld';

export function satelliteOrbitsPass(runtime: SatellitesRuntime): ContentPass<'satellites'> {
  let staging = new Float32Array(0);

  return {
    name: 'satellite-orbits',
    fade: 'satellites',

    enabled(state, ctx, _view, fade) {
      if (runtime.selected.tracked().length === 0) return false;
      if (!SATELLITE_CLASSES.some((cls) => fade[cls] > 0)) return false;
      const earth = sceneBodyStates(state, ctx).get(SCENE_EARTH.id);
      if (earth === undefined) return false;
      return (
        satelliteLayerOpacity(
          runtime.propagator.catalog(),
          ctx.snapshot.simDays,
          ctx.drawCamPos,
          earth.positionMpc,
        ) > 0
      );
    },

    draw(pass, view, ctx, state, fade) {
      const earth = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!;
      const { simDays } = ctx.snapshot;
      const eye = ctx.drawCamPos;
      const opacity = satelliteLayerOpacity(
        runtime.propagator.catalog(),
        simDays,
        eye,
        earth.positionMpc,
      );
      const tracked = runtime.selected.tracked();
      if (staging.length < tracked.length * INSTANCE_FLOATS) {
        staging = new Float32Array(tracked.length * INSTANCE_FLOATS);
      }
      const temeToWorld = composeTemeToWorld(earth.orientation, simDays);

      let count = 0;
      for (const satellite of tracked) {
        const classFade = fade[SATELLITE_CLASSES[satellite.classCode]!];
        if (classFade === 0) continue;
        const orbit = satelliteOrbitEllipse(satellite, simDays, temeToWorld, earth.positionMpc);
        if (orbit === null) continue;
        const wrote = writeOrbitTrailRecord(
          {
            slabVp: view.slab.vp,
            viewportPx: view.viewportPx,
            eyeMpc: eye,
            pxPerRad: ctx.drawPxPerRad,
            ...orbit,
            color: SATELLITE_POINT_STYLE.color,
            fade: classFade * opacity,
          },
          staging,
          count * INSTANCE_FLOATS,
        );
        if (wrote) count++;
      }
      if (count === 0) return;
      runtime.orbitRenderer.draw(pass, {
        instances: staging,
        count,
        occluders: sceneOccluderSpheres(state, ctx),
        depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
        showImpostor: state.settings.debug.overlays['orbit-trail-impostor'],
      });
    },
  };
}
