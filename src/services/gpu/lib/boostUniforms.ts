/**
 * boostUniforms — the CPU writer for `lib/boost.wesl`'s `BoostUniforms`, the 32-byte block each
 * recolouring renderer appends to its own uniform tail (never to `CameraUniforms`):
 *
 *   byte 0 dir vec3 · 12 beta · 16 gamma · 20 doppler (0/1) · 24 contraction (0/1) · 28 headlight k
 *
 * A null boost writes all zeros, the identity block a zero-init buffer already holds.
 */

import type { FrameBoost } from '../../../@types/engine/frame/FrameBoost';
import type { Vec3 } from '../../../@types/math/Vec3';

export const BOOST_UNIFORM_BYTES = 32;

/** `dir` overrides `boost.dir` for a renderer drawing in its own space (the Milky Way's model). */
export function writeBoostUniforms(
  target: Float32Array,
  floatIndex: number,
  boost: FrameBoost | null,
  dir?: Readonly<Vec3>,
): void {
  if (boost === null) {
    target.fill(0, floatIndex, floatIndex + BOOST_UNIFORM_BYTES / 4);
    return;
  }
  target.set(dir ?? boost.dir, floatIndex);
  target[floatIndex + 3] = boost.beta;
  target[floatIndex + 4] = boost.gamma;
  target[floatIndex + 5] = boost.doppler ? 1 : 0;
  target[floatIndex + 6] = boost.contraction ? 1 : 0;
  target[floatIndex + 7] = boost.headlight;
}
