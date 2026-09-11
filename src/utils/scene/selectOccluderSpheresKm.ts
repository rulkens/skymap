/**
 * selectOccluderSpheresKm — the frame's opaque bodies as eye-relative spheres
 * (centre xyz + radius, kilometres), packed four floats each into `out`;
 * returns how many were written. A body occludes iff it resolves on screen
 * (`minDiameterPx`, the same threshold that decides whether it is drawn at
 * all), and when more qualify than `out` holds, the largest on screen win —
 * a dropped sphere is then the least of them, hiding at most a pixel. Bare
 * `radiusM`, not the drawn envelope: an atmosphere or ring is not opaque.
 */

import type { BodyState } from '../../@types/scene/BodyState';
import type { SceneBody } from '../../@types/scene/SceneBody';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { bodyApparentDiameterPx } from './bodyApparentDiameterPx';

const MPC_TO_KM = SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM;

export function selectOccluderSpheresKm(
  input: {
    readonly bodies: readonly SceneBody[];
    readonly bodyStates: ReadonlyMap<string, BodyState>;
    readonly camPosMpc: Readonly<Vec3>;
    readonly viewportHeightPx: number;
    readonly fovYRad: number;
    readonly minDiameterPx: number;
  },
  out: Float32Array,
): number {
  const { bodies, bodyStates, camPosMpc, viewportHeightPx, fovYRad, minDiameterPx } = input;
  const capacity = Math.floor(out.length / 4);

  const candidates: { body: SceneBody; positionMpc: Readonly<Vec3>; px: number }[] = [];
  for (const body of bodies) {
    const state = bodyStates.get(body.id);
    if (state === undefined) continue;
    const px = bodyApparentDiameterPx({
      positionMpc: state.positionMpc,
      radiusM: body.radiusM,
      camPosMpc,
      viewportHeightPx,
      fovYRad,
    });
    if (px >= minDiameterPx) candidates.push({ body, positionMpc: state.positionMpc, px });
  }
  if (candidates.length > capacity) candidates.sort((a, b) => b.px - a.px);

  const count = Math.min(candidates.length, capacity);
  for (let i = 0; i < count; i++) {
    const { body, positionMpc } = candidates[i]!;
    out[i * 4] = (positionMpc[0] - camPosMpc[0]) * MPC_TO_KM;
    out[i * 4 + 1] = (positionMpc[1] - camPosMpc[1]) * MPC_TO_KM;
    out[i * 4 + 2] = (positionMpc[2] - camPosMpc[2]) * MPC_TO_KM;
    out[i * 4 + 3] = body.radiusM * SCALE_UNITS.M_TO_KM;
  }
  return count;
}
