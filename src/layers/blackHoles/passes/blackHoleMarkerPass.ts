/**
 * blackHoleMarkerPass — one additive glint per `BLACK_HOLES` row at its anchor,
 * the hole's far-field presence until its lens engages, drawn through the
 * Layer's own `bodyGlintRenderer` instance. It carries none of the seeded
 * glints' apparent-size or solar-system backdrop fades: a hole is meant to read
 * from anywhere in the foreground range. NEAR0 + camera-relative anchors paired
 * with a rebased vp, the same f64 seam as `bodyGlintsPass`.
 * `drawPick` stamps each hole while `blackHolePickable` holds, which reaches
 * inside the band where only the caption shows.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { BodyPointPick } from '../../../@types/rendering/bodyPickRenderer/BodyPointPick';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BlackHolesRuntime } from '../@types/BlackHolesRuntime';
import { BLACK_HOLES } from '../data/blackHoles';
import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { GLINT_MIN_BRIGHTNESS } from '../../../data/rendering/glintMinBrightness';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../services/engine/frame/foregroundMaxDistance';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { INSTANCE_FLOATS } from '../../../services/gpu/renderers/bodies/bodyGlintRenderer';
import { rebaseViewProj } from '../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { blackHoleMarkerBrightness } from '../present/blackHoleMarkerBrightness';
import { blackHolePickable } from '../present/blackHolePickable';

export function blackHoleMarkerPass(runtime: BlackHolesRuntime): ContentPass {
  // Reused across frames: the hot path allocates nothing.
  const staging = new Float32Array(BLACK_HOLES.length * INSTANCE_FLOATS);

  return {
    name: 'black-hole-marker',

    enabled(state, ctx, _view) {
      if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
      const states = sceneBodyStates(state, ctx);
      return BLACK_HOLES.some(
        (row) => blackHoleMarkerBrightness(row, ctx.drawCamPos, states) > GLINT_MIN_BRIGHTNESS,
      );
    },

    pickEnabled(state, ctx, _view) {
      if (state.gpu.bodyPickRenderer === null) return false;
      return BLACK_HOLES.some((row) => blackHolePickable(row, state, ctx));
    },

    draw(pass, view, ctx, state) {
      const states = sceneBodyStates(state, ctx);
      const camPos = view.camPos;
      let count = 0;
      for (const row of BLACK_HOLES) {
        const brightness = blackHoleMarkerBrightness(row, camPos, states);
        if (brightness <= GLINT_MIN_BRIGHTNESS) continue;
        const positionMpc = states.get(row.anchorId)!.positionMpc;
        const base = count * INSTANCE_FLOATS;
        staging[base + 0] = positionMpc[0] - camPos[0];
        staging[base + 1] = positionMpc[1] - camPos[1];
        staging[base + 2] = positionMpc[2] - camPos[2];
        staging[base + 3] = row.glintTint[0];
        staging[base + 4] = row.glintTint[1];
        staging[base + 5] = row.glintTint[2];
        staging[base + 6] = brightness;
        count++;
      }
      if (count === 0) return;
      const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
      runtime.markerRenderer.draw(
        pass,
        staging,
        count,
        rebasedVp,
        view.viewportPx,
        ctx.drawPxPerRad,
      );
    },

    drawPick(pass, view, ctx, state) {
      const pickRenderer = state.gpu.bodyPickRenderer;
      if (pickRenderer === null) return;
      const states = sceneBodyStates(state, ctx);
      const camPos = view.camPos;
      const points: BodyPointPick[] = [];
      BLACK_HOLES.forEach((row, rowIndex) => {
        if (!blackHolePickable(row, state, ctx)) return;
        const positionMpc = states.get(row.anchorId)!.positionMpc;
        points.push({
          posRelCamMpc: [
            positionMpc[0] - camPos[0],
            positionMpc[1] - camPos[1],
            positionMpc[2] - camPos[2],
          ] as Vec3,
          // The code + row index `blackHoleSelectionRow` resolves.
          packedId: packSelection(Source.SgrAStar, rowIndex + PICK_SENTINEL_OFFSET),
        });
      });
      if (points.length === 0) return;
      pickRenderer.drawPoints(pass, {
        vp: narrowMat4(rebaseViewProj(view.slab.vp, camPos)),
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        points,
      });
    },
  };
}
