/**
 * atmosphereDrawList — the ONE per-frame derivation of which seeded bodies draw an
 * atmosphere shell, each paired with its `ATMOSPHERE_PARAMS` row. Two consumers
 * need that answer: the sky-view LUT bake (`encodeAtmosphereSkyView`) and the shell
 * draw (`atmosphereShellLayer`). Derived separately they could disagree, and the
 * draw would render a body whose LUT the bake skipped — a stale table sampled with
 * no error anywhere. The sub-pixel cull below measures the body's SURFACE diameter,
 * NOT the atmosphere-TOP diameter: culling on the top holds the limb a hair past the
 * disc's own vanishing, so limb and disc vanish together only on the surface.
 */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { camPosLocal } from '../../../utils/camera/camPosLocal';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { FOREGROUND_MAX_DISTANCE_MPC } from './foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from './subPixelBodyCullPx';
import { sceneBodyStates } from './sceneBodyStates';

export function atmosphereDrawList(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly AtmosphereDrawEntry[] {
  // One scalar for the frame, so the near-field cull short-circuits the whole list.
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return [];

  const earth = state.data.bodies.earth;
  const candidates =
    earth === null ? state.data.bodies.planets : [earth, ...state.data.bodies.planets];

  // Live position + orientation from the per-frame snapshot, not the baked record
  // fields; each entry carries its pairing so both consumers read one position.
  const states = sceneBodyStates(state, ctx);

  const entries: AtmosphereDrawEntry[] = [];
  for (const body of candidates) {
    const params = ATMOSPHERE_PARAMS[body.id];
    if (params === undefined) continue; // the data-gate

    const bodyState = states.get(body.id)!;
    // A zero camera-to-centre distance means the camera is INSIDE the body, where
    // apparentSizePx defensively returns 0 — which would read as sub-pixel, so the
    // branch below treats it as resolved instead.
    const dx = bodyState.positionMpc[0] - ctx.drawCamPos[0];
    const dy = bodyState.positionMpc[1] - ctx.drawCamPos[1];
    const dz = bodyState.positionMpc[2] - ctx.drawCamPos[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    const atmosphereTopMpc = params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC;
    if (distanceMpc === 0) {
      entries.push({
        body,
        params,
        positionMpc: bodyState.positionMpc,
        orientation: bodyState.orientation,
        camPosLocal: camPosLocal(
          ctx.drawCamPos,
          bodyState.positionMpc,
          atmosphereTopMpc,
          bodyState.orientation,
        ),
        sunDirLocal: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation),
      });
      continue;
    }
    const diameterPx = apparentSizePx({
      diameterKpc: (2 * body.radiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
      distanceMpc,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad: ctx.fovYRad,
    });
    if (diameterPx >= SUB_PIXEL_BODY_CULL_PX)
      entries.push({
        body,
        params,
        positionMpc: bodyState.positionMpc,
        orientation: bodyState.orientation,
        camPosLocal: camPosLocal(
          ctx.drawCamPos,
          bodyState.positionMpc,
          atmosphereTopMpc,
          bodyState.orientation,
        ),
        sunDirLocal: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation),
      });
  }
  return entries;
}
