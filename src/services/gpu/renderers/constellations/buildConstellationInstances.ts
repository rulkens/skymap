/**
 * buildConstellationInstances — flatten a `ConstellationsArtifact` into the flat
 * per-instance vertex buffer the constellation vertex shader reads.
 *
 * One instance per line segment across ALL figures (the shader composes the
 * per-figure identity from nothing — a segment carries only geometry + the two
 * endpoint magnitudes). Each instance is 8 f32 / 32 bytes, matching the pinned
 * stride in `shaders/constellations/io.wesl`:
 *
 *   [0..2] aWorld  vec3<f32>  endpoint A, world Mpc   (bytes  0..11)
 *   [3]    aAppMag f32        endpoint A apparent mag (bytes 12..15)
 *   [4..6] bWorld  vec3<f32>  endpoint B, world Mpc   (bytes 16..27)
 *   [7]    bAppMag f32        endpoint B apparent mag (bytes 28..31)
 *
 * ### Parsecs → Mpc here, not in the shader
 *
 * The artifact ships endpoints in PARSECS (the near-field stellar neighbourhood
 * scale); the NEAR0 view-projection the shader multiplies by is in Mpc. Scaling
 * on the CPU at upload — through the single `SCALE_UNITS.PC_TO_MPC` source of
 * truth — keeps the vertex stage a pure geometry shader that receives world Mpc
 * like every other world-space renderer (filaments, markerLines), rather than
 * carrying a WESL twin of the unit constant.
 */

import type { ConstellationsArtifact } from '../../../../@types/loading/ConstellationsArtifact';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

/** f32 per instance — mirrors the 32-byte stride in `constellations/io.wesl`. */
export const FLOATS_PER_SEGMENT = 8;

/** The flattened instance buffer plus its segment count (== instance count). */
export type ConstellationInstances = {
  readonly data: Float32Array;
  readonly segmentCount: number;
};

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
