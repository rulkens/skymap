/**
 * aerialBakeIsRead — whether the apply reads the froxel volume this frame. The same
 * horizon-over-reach ratio `aerialPerspective/fragment.wesl` hands off to the shell
 * with: at `HANDOFF_HORIZON_END` its `shellWeight` is 1 on every pixel, so the bake
 * would be marched and never sampled (Earth above ~20 km, Mars above ~38 km).
 */

import type { AtmosphereDrawEntry } from '../@types/AtmosphereDrawEntry';
import { FROXEL_DIMS, FROXEL_SLICE_KM, HANDOFF_HORIZON_END } from '../data/froxelVolume';

export function aerialBakeIsRead(entry: AtmosphereDrawEntry): boolean {
  const { planetRadiusKm, atmosphereTopKm } = entry.params;
  const [x, y, z] = entry.camLocal;
  // camLocal is in atmosphere-top radii; the shader scales its horizon the same way.
  const camRadiusKm = Math.hypot(x, y, z) * atmosphereTopKm;
  const horizonKmSq = Math.max(camRadiusKm * camRadiusKm - planetRadiusKm * planetRadiusKm, 0);
  const reachKm = FROXEL_DIMS.z * FROXEL_SLICE_KM * HANDOFF_HORIZON_END;
  return horizonKmSq < reachKm * reachKm;
}
