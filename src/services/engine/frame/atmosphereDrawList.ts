/**
 * atmosphereDrawList — the ONE per-frame derivation of which seeded bodies draw
 * an atmosphere shell this frame, each paired with its `AtmosphereParams` row.
 *
 * ### Why a shared list
 *
 * Two consumers need this answer: the per-frame sky-view LUT bake
 * (`encodeAtmosphereSkyView`) and the shell draw (`atmosphereShellLayer`). If
 * each re-derived the candidate set independently they could disagree — the draw
 * could render a body whose LUT the bake skipped, sampling a stale table. Routing
 * both through this single list makes that disagreement impossible: the bake and
 * the draw walk the same entries, resolved once from `state` + `ctx`. (This is the
 * consolidation the atmosphere shell's follow-up #1 called for.)
 *
 * ### The predicate
 *
 * Candidates are `[bodies.earth, ...bodies.planets]` with a `null` Earth dropped.
 * A candidate survives iff, in order:
 *
 *   (a) it has an `ATMOSPHERE_PARAMS` row — the data-gate (Moon and gas giants
 *       have none, the same gate the ring table uses);
 *   (b) the camera is inside the shared near-field edge
 *       (`ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC`) — a whole-list
 *       short-circuit, since `ctx.cam.distance` is one scalar for the frame;
 *   (c) its SURFACE disc resolves at/above `SUB_PIXEL_BODY_CULL_PX`.
 *
 * The sub-pixel cull is measured on the body's SURFACE diameter — the opaque
 * sphere the shell haloes — NOT the atmosphere-TOP diameter. Culling on the top
 * would keep the limb a hair past the disc's own vanishing; matching the surface
 * makes the limb appear exactly when the disc does. This is the same derivation
 * the surface and cloud-shell rows use.
 *
 * ### Shape vs. reality
 *
 * The type is a general `readonly AtmosphereDrawEntry[]`, but in practice at most
 * ONE entry passes: eight bodies carry an `ATMOSPHERE_PARAMS` row today (Earth, the
 * six other planets and Pluto — the table is the data-gate), yet the near-field cull
 * keeps all-but-one culled at any real camera pose (two atmosphere bodies are never a
 * pixel across at once). The list shape costs nothing and lets the consumers iterate
 * without a special case.
 */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from './foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from './subPixelBodyCullPx';
import { sceneBodyStates } from './sceneBodyStates';

export function atmosphereDrawList(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly AtmosphereDrawEntry[] {
  // Near-field distance cull — one scalar for the frame, so it short-circuits
  // the whole list rather than being retested per body.
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return [];

  const earth = state.data.bodies.earth;
  const candidates =
    earth === null ? state.data.bodies.planets : [earth, ...state.data.bodies.planets];

  // Live position + orientation from the per-frame snapshot (keyed by id),
  // resolved ONCE for the whole candidate walk — not the baked record fields.
  // Each surviving entry captures its resolved pairing so the two consumers (the
  // sky-view bake and the shell draw) read one position and cannot diverge.
  const states = sceneBodyStates(state, ctx);

  const entries: AtmosphereDrawEntry[] = [];
  for (const body of candidates) {
    const params = ATMOSPHERE_PARAMS[body.id];
    if (params === undefined) continue; // the data-gate

    const bodyState = states.get(body.id)!;
    // Sub-pixel cull on the body's SURFACE diameter. A zero camera-to-centre
    // distance means the camera is INSIDE the body — apparentSizePx defensively
    // returns 0 there, which would read as sub-pixel, so treat it as resolved.
    const dx = bodyState.positionMpc[0] - ctx.drawCamPos[0];
    const dy = bodyState.positionMpc[1] - ctx.drawCamPos[1];
    const dz = bodyState.positionMpc[2] - ctx.drawCamPos[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    if (distanceMpc === 0) {
      entries.push({
        body,
        params,
        positionMpc: bodyState.positionMpc,
        orientation: bodyState.orientation,
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
      });
  }
  return entries;
}
