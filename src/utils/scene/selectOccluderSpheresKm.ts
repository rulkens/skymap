/**
 * selectOccluderSpheresKm — pack `occluders` as eye-relative spheres (centre
 * xyz + radius, kilometres), four floats each into `out`; returns how many
 * were written. WHICH bodies are opaque is the caller's call
 * (`sceneOccluderSpheres`); this only selects and packs.
 *
 * Over capacity the widest on screen win — a dropped sphere is then the least
 * of them, hiding at most a pixel. Ranked by angular radius, which orders
 * exactly as apparent pixels do without needing the projection.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';

const MPC_TO_KM = SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM;

type Occluder = { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number };

export function selectOccluderSpheresKm(
  input: {
    readonly occluders: readonly Occluder[];
    readonly camPosMpc: Readonly<Vec3>;
  },
  out: Float32Array,
): number {
  const { occluders, camPosMpc } = input;
  const capacity = Math.floor(out.length / 4);

  // Mixed units (m over Mpc) cancel in a RANK: every candidate is scaled by
  // the same constant, so the order is the true angular one.
  const angularRank = (o: Occluder): number =>
    o.radiusM /
    Math.hypot(
      o.positionMpc[0] - camPosMpc[0],
      o.positionMpc[1] - camPosMpc[1],
      o.positionMpc[2] - camPosMpc[2],
    );

  const selected =
    occluders.length > capacity
      ? [...occluders].sort((a, b) => angularRank(b) - angularRank(a))
      : occluders;

  const count = Math.min(selected.length, capacity);
  for (let i = 0; i < count; i++) {
    const { positionMpc, radiusM } = selected[i]!;
    out[i * 4] = (positionMpc[0] - camPosMpc[0]) * MPC_TO_KM;
    out[i * 4 + 1] = (positionMpc[1] - camPosMpc[1]) * MPC_TO_KM;
    out[i * 4 + 2] = (positionMpc[2] - camPosMpc[2]) * MPC_TO_KM;
    out[i * 4 + 3] = radiusM * SCALE_UNITS.M_TO_KM;
  }
  return count;
}
