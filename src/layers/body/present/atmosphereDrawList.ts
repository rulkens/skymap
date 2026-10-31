/**
 * atmosphereDrawList — ONE derivation per frame context of which bodies draw an
 * atmosphere shell, with their `ATMOSPHERE_PARAMS` row and pose-dependent values.
 * `encodeAtmosphereSkyView`'s LUT bake and `atmosphereShellPass` both read this
 * memoised list, so neither works off a body the other skipped (a stale table
 * sampled silently). Its roster is the frame's active slab rows, so a body whose
 * row has yielded draws no shell. Memo keys on `ctx`; `state` is a live getter.
 * The sub-pixel cull measures the SURFACE diameter, NOT the atmosphere-TOP one:
 * that would hold the limb past the disc's own vanishing.
 */

import type { AtmosphereDrawEntry } from '../@types/AtmosphereDrawEntry';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from './atmosphereParams';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { hostBandOpen } from '../../../utils/frame/hostBandOpen';
import { atmosphereInsideBand } from './atmosphereInsideBand';
import { lightDirLocal } from '../../../utils/camera/lightDirLocal';
import { lightSourceMpc } from '../../../utils/scene/lightSourceMpc';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { outerBoundRadiusM } from '../../../utils/occlusion/outerBoundRadiusM';
import { SUB_PIXEL_BODY_CULL_PX } from '../../../services/engine/frame/subPixelBodyCullPx';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { atmosphereDrawListCache } from './atmosphereDrawListCache';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

export function atmosphereDrawList(
  state: PassState,
  ctx: FrameView,
): readonly AtmosphereDrawEntry[] {
  const cached = atmosphereDrawListCache.get(ctx);
  if (cached !== undefined) return cached;

  const entries: AtmosphereDrawEntry[] = [];
  atmosphereDrawListCache.set(ctx, entries);

  const activeIds = new Set(ctx.snapshot.slabBodyCandidates.map((row) => row.anchorId));
  const candidates = [SCENE_EARTH, ...SCENE_PLANETS].filter((body) => activeIds.has(body.id));

  // Live position + orientation from the per-frame snapshot, not baked record fields.
  const states = sceneBodyStates(state, ctx);

  for (const body of candidates) {
    const params = ATMOSPHERE_PARAMS[body.id];
    if (params === undefined) continue; // the data-gate

    const bodyState = states.get(body.id)!;
    // The pose `deriveSlabs` built this body's row from; a poseless body is no entry, so consumers read fields unguarded.
    const pose = ctx.bodyPose(body.id);
    if (pose === null) continue;
    const atmosphereTopM = params.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
    const camLocal = bodySlabCamLocal(pose.eyeRelBodyM, atmosphereTopM);
    const entry: AtmosphereDrawEntry = {
      body,
      params,
      atmosphereTopM,
      camLocal,
      sunLocal: lightDirLocal(
        bodyState.positionMpc,
        lightSourceMpc(body.id, states),
        bodyState.orientation,
      ),
      // The rule the body's slab row hosts the aerial line by, so the two agree.
      inside: hostBandOpen(atmosphereInsideBand(body.id), ctx, body.id),
    };

    // Zero distance = camera INSIDE the body, where apparentSizePx returns 0 and would read as sub-pixel.
    const dx = bodyState.positionMpc[0] - ctx.drawCamPos[0];
    const dy = bodyState.positionMpc[1] - ctx.drawCamPos[1];
    const dz = bodyState.positionMpc[2] - ctx.drawCamPos[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    if (distanceMpc === 0) {
      entries.push(entry);
      continue;
    }
    const diameterPx = apparentSizePx({
      diameterKpc:
        (2 * outerBoundRadiusM(body.surface) * SCALE_UNITS.M_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
      distanceMpc,
      pxPerRad: ctx.drawPxPerRad,
    });
    if (diameterPx >= SUB_PIXEL_BODY_CULL_PX) entries.push(entry);
  }
  return entries;
}
