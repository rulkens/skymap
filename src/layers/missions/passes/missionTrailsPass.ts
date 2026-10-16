/**
 * missionTrailsPass — Voyager-style sampled-craft trails, additive into HDR
 * beside `orbitTrailsPass` (same NEAR0 step) but on its own `missionTrails` setting and fade.
 * The renderer builds and uploads vertices once per `trajectoryRegistry.version()`;
 * per frame the pass only picks `k`, the vertices at or before the sim clock, and
 * ends the trail on the snapshot position so it welds to the mesh. The vp is
 * rebased about the eye in f64 (as `near0SelectionRingPass` does) and the shader
 * subtracts the eye's hi/lo pair from each hi/lo vertex, keeping 160 AU in 1 km.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { MissionsRuntime } from '../@types/MissionsRuntime';
import { SAMPLED_BODIES } from '../../../data/missions/spacecraftBodies';
import { trajectoryRegistry } from '../../../services/bodies/trajectoryRegistry';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { countAtOrBefore } from '../../../utils/math/countAtOrBefore';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { sampledDepthBinding } from '../../../services/engine/frame/sampledDepthBinding';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderSpheres } from '../../../services/engine/frame/sceneOccluderSpheres';
import { near0OverlayVpF32 } from '../../../services/engine/frame/near0OverlayVpF32';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../services/engine/frame/foregroundMaxDistance';
import { emphasisDim } from '../../../utils/scene/emphasisDim';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';

export function missionTrailsPass(runtime: MissionsRuntime): ContentPass {
  return {
    name: 'mission-trails',

    enabled(state, ctx, _view) {
      if (
        !state.settings.missionTrails.enabled &&
        state.subsystems.fades.opacityOf({ kind: 'missionTrails' }, ctx.snapshot.nowMs) <= 0
      ) {
        return false;
      }
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      return SAMPLED_BODIES.some(({ id }) => spacecraftPresent(id, ctx.snapshot.simDays));
    },

    draw(pass, view, ctx, state) {
      const { renderer } = runtime;
      const states = sceneBodyStates(state, ctx);
      const tracks = renderer.ensureTracks(
        trajectoryRegistry.version(),
        states.get('sun')!.positionMpc,
      );

      renderer.beginFrame(pass, {
        vp: near0OverlayVpF32(rebaseViewProj(view.slab.vp, view.camPos)),
        camPosMpc: view.camPos,
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        occluders: sceneOccluderSpheres(state, ctx),
        depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
      });
      const layerOpacity = resolveLayerOpacity(state, ctx, { kind: 'missionTrails' });
      for (const { id, trailColor } of SAMPLED_BODIES) {
        const track = tracks.get(id);
        if (track === undefined) continue;
        const dim = emphasisDim(state.settings.missions.craft, id);
        const k = countAtOrBefore(track.tDays, ctx.snapshot.simDays);
        if (k === 0) continue;
        // Past the last vertex the craft is held on it: no head segment to draw.
        const head = k < track.tDays.length ? states.get(id)!.positionMpc : null;
        renderer.drawTrail(pass, id, trailColor, layerOpacity * dim, k - 1, head);
      }
    },
  };
}
