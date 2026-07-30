/**
 * frameUp — the reference up vector every camera-up consumer rolls about: the
 * orientation frame's north pole.
 *
 *   frameBasis  →  (this module)  →  pole (frame-local +Y expressed in world)
 *
 * ### Why the middle column IS the pole
 *
 * `ORIENTATION_FRAMES` assembles every basis as `mat3FromColumns(col0, pole,
 * col2)` — the frame's north pole lives in the MIDDLE column so the orbit
 * camera's (azimuth, elevation) decode, whose zenith is local +Y, looks
 * straight down that pole at elevation 90° with no extra rotation. This helper
 * reads that same convention back out: the frame up is `frameBasis · [0,1,0]`,
 * which for a column-major 3×3 is exactly column 1 — flat indices 3, 4, 5.
 *
 * An absent basis is the identity frame (the pre-feature camera, and every
 * non-engine caller: synthetic clouds, focus tween, dev-tool cameras). There
 * the frame up IS world +Y, so we return `[0, 1, 0]` — the literal the
 * consumers used to hardcode. Feeding that back into `imagePlaneBasis` leaves
 * those paths byte-for-byte unchanged.
 *
 * Pairs with `imagePlaneBasis`: `frameUp` supplies the base up (WHICH pole),
 * `imagePlaneBasis` composes the authored `roll` over it (HOW tilted). So the
 * orientation-frame switch's pole and a clip's roll compose in one formula.
 *
 * Pure and allocation-friendly for hot per-frame callers: pass a caller-owned
 * scratch as `out` and it is written in place (same pattern as `yawPitchToDir`).
 *
 * @param frameBasis  Frame-local → world basis (column-major 3×3), or undefined
 *                    for the identity frame.
 * @param out         Optional destination written in place and returned; a fresh
 *                    `Vec3` is allocated when omitted.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function frameUp(frameBasis: Readonly<Mat3> | undefined, out?: Vec3): Vec3 {
  const dst = out ?? ([0, 0, 0] as Vec3);
  if (frameBasis === undefined) {
    // Identity frame: the frame up is world +Y.
    dst[0] = 0;
    dst[1] = 1;
    dst[2] = 0;
    return dst;
  }
  // Middle column (indices 3, 4, 5) = the frame's north pole.
  dst[0] = frameBasis[3];
  dst[1] = frameBasis[4];
  dst[2] = frameBasis[5];
  return dst;
}
