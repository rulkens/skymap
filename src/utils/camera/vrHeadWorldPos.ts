import type { Vec3 } from '../../@types/math/Vec3';
import type { VrEye } from '../../services/xr/vrSpikeState';

/**
 * vrHeadWorldPos — average eye position across an XR frame's eyes, world Mpc.
 * Shared by `produceVrLabels` (the placement anchor `H`) and the NEAR0 label
 * pass's per-eye camera-rebase, so both agree on one head estimate per frame.
 */
export function vrHeadWorldPos(eyes: readonly VrEye[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const eye of eyes) {
    x += eye.camPos[0];
    y += eye.camPos[1];
    z += eye.camPos[2];
  }
  const count = eyes.length || 1;
  return [x / count, y / count, z / count];
}
