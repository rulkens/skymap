/**
 * sampledTrailsPass — the trails of bodies on sampled tracks, additive into HDR beside
 * `orbitTrailsPass` (same NEAR0 step). No pass-level `fade`: each group carries its own show key.
 * The renderer builds and uploads vertices once per `trajectoryRegistry.version()`;
 * per frame `trailDrawsAt` picks each body's one trail (the Sun trail, or a planet
 * stay where the group's `nearPlanets` asks) and the head ends on the snapshot position.
 * The vp is rebased about the eye in f64 (as `near0SelectionRingPass` does) and the
 * shader subtracts the eye's hi/lo pair from each hi/lo vertex, keeping 160 AU in
 * 1 km. Vertices and eye are both relative to the piece's centre body, so it rides
 * that body: a stay curves around its planet while the planet moves.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { trajectoryRegistry } from '../../../bodies/trajectoryRegistry';
import { spacecraftPresent } from '../../../../utils/scene/spacecraftPresent';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { sampledDepthBinding } from '../sampledDepthBinding';
import { sceneBodyStates } from '../sceneBodyStates';
import { sceneOccluderSpheres } from '../sceneOccluderSpheres';
import { near0OverlayClipScale } from '../near0OverlayClipScale';
import { near0OverlayVpF32 } from '../near0OverlayVpF32';
import { trailDrawsAt } from '../../../../utils/trails/trailDrawsAt';

export const sampledTrailsPass: ContentPass = {
  name: 'sampled-trails',

  enabled(state, ctx, _view) {
    if (state.gpu.sampledTrailRenderer === null) return false;
    const groups = state.sampledTrailGroups;
    if (groups.every((group) => group.fade(ctx) === 0)) return false;
    const { simDays } = ctx.snapshot;
    return groups.some((group) => group.rows.some(({ id }) => spacecraftPresent(id, simDays)));
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.sampledTrailRenderer;
    if (renderer === null) return;
    const groups = state.sampledTrailGroups;
    const states = sceneBodyStates(state, ctx);
    const ids = groups.flatMap((group) => group.rows.map((row) => row.id));
    const trails = renderer.ensureTracks(trajectoryRegistry.version(), ids);
    const fadeMpc: Vec3 = [0, 0, 0];

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
    for (const group of groups) {
      const fade = group.fade(ctx);
      if (fade === 0) continue;
      const nearPlanets = group.nearPlanets?.(state) ?? false;
      for (const { id, color } of group.rows) {
        const trail = trails.find((t) => t.id === id);
        if (trail === undefined) continue;
        const opacity = fade * (group.dim?.(state, id) ?? 1);
        const bodyMpc = states.get(id)!.positionMpc;
        for (const draw of trailDrawsAt(trail, ctx.snapshot.simDays, nearPlanets)) {
          const { piece, segmentCount } = draw;
          const centre = states.get(piece.centreId)!.positionMpc;
          // The fade grows with the body's distance from the entry, so entering shows no jump.
          let fadeRadius = 0;
          if (draw.fadeMaxMpc > 0) {
            for (let k = 0; k < 3; k++) fadeMpc[k] = centre[k]! + piece.relMpc[k]!;
            const away = Math.hypot(
              bodyMpc[0] - fadeMpc[0],
              bodyMpc[1] - fadeMpc[1],
              bodyMpc[2] - fadeMpc[2],
            );
            fadeRadius = Math.min(draw.fadeMaxMpc, away);
          }
          renderer.drawTrail(
            pass,
            piece,
            color,
            opacity * draw.weight,
            segmentCount,
            centre,
            draw.head ? bodyMpc : null,
            fadeMpc,
            fadeRadius,
          );
        }
      }
    }
  },
};
