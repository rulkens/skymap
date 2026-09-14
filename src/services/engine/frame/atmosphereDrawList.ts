/**
 * atmosphereDrawList — ONE derivation per frame context of which seeded bodies draw
 * an atmosphere shell, paired with its `ATMOSPHERE_PARAMS` row and the pose-dependent
 * values its consumers march along. `encodeAtmosphereSkyView`'s LUT bake and
 * `atmosphereShellPass`'s draw both read that one memoised list, so neither can work
 * off a body the other skipped — a stale table sampled with no error anywhere. The
 * memo keys on `ctx`, the object a frame IS; `state` is a live getter read through.
 * The sub-pixel cull measures the body's SURFACE diameter, NOT the atmosphere-TOP
 * one: culling on the top would hold the limb past the disc's own vanishing.
 */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { isInsideAtmosphereShell } from '../../../utils/camera/isInsideAtmosphereShell';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from './foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from './subPixelBodyCullPx';
import { sceneBodyStates } from './sceneBodyStates';
import { atmosphereDrawListCache } from './atmosphereDrawListCache';

export function atmosphereDrawList(
  state: PassState,
  ctx: ReadyFrameContext,
): readonly AtmosphereDrawEntry[] {
  const cached = atmosphereDrawListCache.get(ctx);
  if (cached !== undefined) return cached;

  // Cached before it is filled: every exit returns this same array, so one `set`
  // covers them all — the near-field short-circuit below included, whose empty
  // list is this frame's answer like any other.
  const entries: AtmosphereDrawEntry[] = [];
  atmosphereDrawListCache.set(ctx, entries);

  // One scalar for the frame, so the near-field cull short-circuits the whole list.
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return entries;

  const earth = state.data.bodies.earth;
  const candidates =
    earth === null ? state.data.bodies.planets : [earth, ...state.data.bodies.planets];

  // Live position + orientation from the per-frame snapshot, not the baked record
  // fields; each entry carries its pairing so both consumers read one position.
  const states = sceneBodyStates(state, ctx);

  for (const body of candidates) {
    const params = ATMOSPHERE_PARAMS[body.id];
    if (params === undefined) continue; // the data-gate

    const bodyState = states.get(body.id)!;
    // The body-slab pose seam `deriveSlabs` built this body's row from. Every
    // derived field below hangs off it, so a poseless body is no entry at all —
    // which is what lets both consumers read an entry without a guard.
    const pose = ctx.bodyPose(body.id as BodyId);
    if (pose === null) continue;
    const atmosphereTopM = params.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
    const camLocal = bodySlabCamLocal(pose.eyeRelBodyM, atmosphereTopM);
    // Built before the cull branches below so the two push sites cannot drift.
    const entry: AtmosphereDrawEntry = {
      body,
      params,
      positionMpc: bodyState.positionMpc,
      orientation: bodyState.orientation,
      atmosphereTopM,
      camLocal,
      sunLocal: sunDirLocal(bodyState.positionMpc, RENDER_ORIGIN_MPC, bodyState.orientation),
      inside: isInsideAtmosphereShell(camLocal),
    };

    // A zero camera-to-centre distance means the camera is INSIDE the body, where
    // apparentSizePx defensively returns 0 — which would read as sub-pixel, so the
    // branch below treats it as resolved instead.
    const dx = bodyState.positionMpc[0] - ctx.drawCamPos[0];
    const dy = bodyState.positionMpc[1] - ctx.drawCamPos[1];
    const dz = bodyState.positionMpc[2] - ctx.drawCamPos[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    if (distanceMpc === 0) {
      entries.push(entry);
      continue;
    }
    const diameterPx = apparentSizePx({
      diameterKpc: (2 * body.radiusM * SCALE_UNITS.M_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
      distanceMpc,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad: ctx.fovYRad,
    });
    if (diameterPx >= SUB_PIXEL_BODY_CULL_PX) entries.push(entry);
  }
  return entries;
}
