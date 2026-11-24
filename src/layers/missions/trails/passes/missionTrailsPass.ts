/**
 * missionTrailsPass — Voyager-style sampled-craft trails, additive into HDR
 * beside `orbitTrailsPass` (same NEAR0 step) but on its own `missionTrails` show entry.
 * The renderer builds and uploads vertices once per `trajectoryRegistry.version()`;
 * per frame `trailDrawsAt` picks each craft's pieces (the Sun trail, or it plus a
 * planet stay) and the head ends on the snapshot position so it welds to the mesh.
 * The vp is rebased about the eye in f64 (as `near0SelectionRingPass` does) and the
 * shader subtracts the eye's hi/lo pair from each hi/lo vertex, keeping 160 AU in
 * 1 km. Vertices and eye are both relative to the piece's centre body, so it rides
 * that body: a stay curves around its planet while the planet moves.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { MissionsRuntime } from '../../@types/MissionsRuntime';
import { SAMPLED_BODIES } from '../../../../data/bodies/sampledBodies';
import { trajectoryRegistry } from '../../../../services/bodies/trajectoryRegistry';
import { spacecraftPresent } from '../../../../utils/scene/spacecraftPresent';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { sampledDepthBinding } from '../../../../services/engine/frame/sampledDepthBinding';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderSpheres } from '../../../../services/engine/frame/sceneOccluderSpheres';
import { near0OverlayClipScale } from '../../../../services/engine/frame/near0OverlayClipScale';
import { near0OverlayVpF32 } from '../../../../services/engine/frame/near0OverlayVpF32';
import { emphasisDim } from '../utils/emphasisDim';
import { trailDrawsAt } from '../utils/trailDrawsAt';

export function missionTrailsPass(runtime: MissionsRuntime): ContentPass<'missionTrails'> {
  return {
    name: 'mission-trails',
    fade: 'missionTrails',

    enabled(_state, ctx, _view) {
      return SAMPLED_BODIES.some(({ id }) => spacecraftPresent(id, ctx.snapshot.simDays));
    },

    draw(pass, view, ctx, state, fade) {
      const renderer = runtime.trailRenderer;
      const states = sceneBodyStates(state, ctx);
      const tracks = renderer.ensureTracks(trajectoryRegistry.version());

      renderer.beginFrame(pass, {
        vp: near0OverlayVpF32(
          rebaseViewProj(view.slab.vp, view.camPos),
          near0OverlayClipScale(view.slab.near),
        ),
        camPosMpc: view.camPos,
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        occluders: sceneOccluderSpheres(state, ctx),
        depth: sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets),
      });
      for (const { id, trailColor } of SAMPLED_BODIES) {
        const trail = tracks.get(id);
        if (trail === undefined) continue;
        const opacity = fade * emphasisDim(state.settings.missions.craft, id);
        for (const { piece, segmentCount, head } of trailDrawsAt(trail, ctx.snapshot.simDays)) {
          const centre = states.get(piece.centreId)!.positionMpc;
          const headMpc = head ? states.get(id)!.positionMpc : null;
          renderer.drawTrail(pass, piece, trailColor, opacity, segmentCount, centre, headMpc);
        }
      }
    },
  };
}
