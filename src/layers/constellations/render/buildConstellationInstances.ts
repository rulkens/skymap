/**
 * buildConstellationInstances — flattens a `ConstellationsArtifact` into the
 * per-instance vertex buffer for `constellations/io.wesl`. Byte-layout
 * contract, over budget by convention — must match the shader's stride
 * exactly, one instance (32 bytes) per segment across all figures:
 *
 *   [0..2] aWorld  vec3<f32>  endpoint A, world Mpc   (bytes  0..11)
 *   [3]    aAppMag f32        endpoint A apparent mag (bytes 12..15)
 *   [4..6] bWorld  vec3<f32>  endpoint B, world Mpc   (bytes 16..27)
 *   [7]    bAppMag f32        endpoint B apparent mag (bytes 28..31)
 *
 * Parsecs → Mpc conversion happens here through the single
 * `SCALE_UNITS.PC_TO_MPC` source, not in the shader — the vertex stage stays
 * a plain geometry shader receiving world Mpc, like every other world-space
 * renderer.
 */

import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import type { ConstellationInstances } from '../@types/ConstellationInstances';
import { SCALE_UNITS } from '../../../data/scaleUnits';

/** f32 per instance — mirrors the 32-byte stride in `constellations/io.wesl`. */
export const FLOATS_PER_SEGMENT = 8;

export function buildConstellationInstances(
  artifact: ConstellationsArtifact,
): ConstellationInstances {
  const pcToMpc = SCALE_UNITS.PC_TO_MPC;

  let segmentCount = 0;
  for (const figure of artifact.constellations) segmentCount += figure.segments.length;

  const data = new Float32Array(segmentCount * FLOATS_PER_SEGMENT);
  let o = 0;
  for (const figure of artifact.constellations) {
    for (const seg of figure.segments) {
      data[o + 0] = seg.aPc[0] * pcToMpc;
      data[o + 1] = seg.aPc[1] * pcToMpc;
      data[o + 2] = seg.aPc[2] * pcToMpc;
      data[o + 3] = seg.aAppMag;
      data[o + 4] = seg.bPc[0] * pcToMpc;
      data[o + 5] = seg.bPc[1] * pcToMpc;
      data[o + 6] = seg.bPc[2] * pcToMpc;
      data[o + 7] = seg.bAppMag;
      o += FLOATS_PER_SEGMENT;
    }
  }

  return { data, segmentCount };
}
