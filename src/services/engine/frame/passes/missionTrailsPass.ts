/**
 * missionTrailsPass — Voyager-style sampled-craft trails, additive into HDR
 * beside `orbitTrailsPass` (same NEAR0 step, same orbit-trails setting and fade).
 * The renderer builds and uploads vertices once per `trajectoryRegistry.version()`;
 * per frame the pass only picks `k`, the vertices at or before the sim clock, and
 * ends the trail on the snapshot position so it welds to the mesh. The vp is
 * rebased about the eye in f64 (as `near0SelectionRingPass` does) and the shader
 * subtracts the eye's hi/lo pair from each hi/lo vertex, keeping 160 AU in 1 km.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { SAMPLED_BODIES } from '../../../../data/missions/spacecraftBodies';
import { trajectoryRegistry } from '../../../bodies/trajectoryRegistry';
import { buildMissionTrails } from '../../../bodies/buildMissionTrails';
import { spacecraftPresent } from '../../../../utils/scene/spacecraftPresent';
import { trailVertexCount } from '../../../../utils/orbit/trailVertexCount';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { sampledDepthBinding } from '../sampledDepthBinding';
import { sceneBodyStates } from '../sceneBodyStates';
import { sceneOccluderSpheres } from '../sceneOccluderSpheres';
import { near0OverlayVpF32 } from '../near0OverlayVpF32';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { emphasisDim } from '../../../../utils/scene/emphasisDim';
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
    const tracks = renderer.ensureTracks(
      trajectoryRegistry.version(),
      states.get('sun')!.positionMpc,
      buildMissionTrails,
    );

    renderer.beginFrame(pass, {
      vp: near0OverlayVpF32(rebaseViewProj(view.slab.vp, view.camPos)),
      camPosMpc: view.camPos,
      viewportPx: view.viewportPx,
      pxPerRad: ctx.drawPxPerRad,
      occluders: sceneOccluderSpheres(state, ctx),
      depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
    });
    const layerOpacity = resolveLayerOpacity(state, ctx, { kind: 'orbitTrails' });
    for (const { id, trailColor } of SAMPLED_BODIES) {
      const track = tracks.get(id);
      if (track === undefined) continue;
      const dim = emphasisDim(state.settings.orbitTrails.emphasis, id);
      const k = trailVertexCount(track.tDays, ctx.snapshot.simDays);
      if (k === 0) continue;
      // Past the last vertex the craft is held on it: no head segment to draw.
      const head = k < track.tDays.length ? states.get(id)!.positionMpc : null;
      renderer.drawTrail(pass, id, trailColor, layerOpacity * dim, k - 1, head);
    }
  },
};
