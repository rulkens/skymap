import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import { eyeMpcOf } from './eyeMpcOf';

/**
 * Recompute `cam.position` from the current yaw, pitch, distance and target —
 * call after mutating any of them. `eyeMpcOf` owns the whole derivation, so the
 * regime predicate and this camera read one eye, not two; `cam.position` is
 * passed as its `out` to keep this per-frame path allocation-free.
 */
export function updatePosition(cam: OrbitCamera): void {
  eyeMpcOf(cam, cam.poseBasis, cam.position);
}
