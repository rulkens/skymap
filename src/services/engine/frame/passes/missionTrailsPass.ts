/**
 * missionTrailsPass — Voyager-style sampled-craft trails, additive into HDR
 * beside `orbitTrailsPass` (same NEAR0 step, same orbit-trails setting and fade).
 * Vertices are built once per `trajectoryRegistry.version()`; per frame the pass
 * only picks `k`, the vertices at or before the sim clock, and ends the trail on
 * the snapshot position so it welds to the mesh. The vp is rebased about the eye
 * in f64 (as `near0SelectionRingPass` does) and the shader subtracts the eye's
 * hi/lo pair from each hi/lo vertex, which keeps 160 AU inside the 1 km budget.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { MissionTrailDraw } from '../../../../@types/rendering/missionTrailRenderer/MissionTrailDraw';
import { SAMPLED_BODIES } from '../../../../data/missions/spacecraftBodies';
import {
  MISSION_TRAIL_COLOR,
  MISSION_TRAIL_WIDTH_PX,
} from '../../../../data/missions/missionTrailStyle';
import { missionTrailGeometry } from '../../../bodies/missionTrailGeometry';
import { spacecraftPresent } from '../../../../utils/scene/spacecraftPresent';
import { trailVertexCount } from '../../../../utils/orbit/trailVertexCount';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { sampledDepthBinding } from '../sampledDepthBinding';
import { sceneBodyStates } from '../sceneBodyStates';
import { sceneOccluderSpheres } from '../sceneOccluderSpheres';
import { near0OverlayVpF32 } from '../near0OverlayVpF32';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

export const missionTrailsPass: ContentPass = {
  name: 'mission-trails',

  enabled(state, ctx, _view) {
    if (state.gpu.missionTrailRenderer === null) return false;
    if (
      !state.settings.orbitTrails.enabled &&
      state.subsystems.fades.opacityOf({ kind: 'orbitTrails' }, ctx.snapshot.nowMs) <= 0
    ) {
      return false;
    }
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    return SAMPLED_BODIES.some(({ id }) => spacecraftPresent(id, ctx.snapshot.simDays));
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.missionTrailRenderer;
    if (renderer === null) return;
    const states = sceneBodyStates(state, ctx);

    const trails = missionTrailGeometry(renderer, states.get('sun')!.positionMpc);
    const layerOpacity = resolveLayerOpacity(state, ctx, { kind: 'orbitTrails' });
    const draws: MissionTrailDraw[] = [];
    for (const { id } of SAMPLED_BODIES) {
      const trail = trails.get(id);
      if (trail === undefined || !spacecraftPresent(id, ctx.snapshot.simDays)) continue;
      const k = trailVertexCount(trail.tDays, ctx.snapshot.simDays);
      if (k === 0) continue;
      const tail = trail.posMpc.subarray(3 * (k - 1), 3 * k);
      const craft = states.get(id)!.positionMpc;
      const atTail = tail[0] === craft[0] && tail[1] === craft[1] && tail[2] === craft[2];
      draws.push({
        id,
        color: MISSION_TRAIL_COLOR[id]!,
        opacity: layerOpacity,
        widthPx: MISSION_TRAIL_WIDTH_PX,
        segmentCount: k - 1,
        headPosMpc: atTail ? null : Float64Array.of(tail[0]!, tail[1]!, tail[2]!, ...craft),
      });
    }

    renderer.draw(pass, {
      trails: draws,
      vp: near0OverlayVpF32(rebaseViewProj(view.slab.vp, view.camPos)),
      camPosMpc: view.camPos,
      viewportPx: view.viewportPx,
      pxPerRad: ctx.drawPxPerRad,
      occluders: sceneOccluderSpheres(state, ctx),
      depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
    });
  },
};
