/**
 * packLogTraceVoxels — shared value transform for SCFD volume builders
 * whose source field is non-negative and heavy-tailed (MCPM trace
 * density; the rhizome SCFD importer reuses this so the two builders
 * cannot drift apart on normalisation).
 *
 * Maps log(1+v)/log(1+max) → [0,1] so a heavy tail (MCPM: min=0,
 * max≈40000, mean≈16, p99≈320) spans the LUT instead of collapsing to
 * one colour — a linear map put 99% of voxels under contrast's first
 * click. Packs the result to f16 while transposing C-order → x-fastest.
 */
import { f32ToF16Bits } from '../math/f32ToF16Bits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function packLogTraceVoxels(
  values: Float32Array | Float64Array,
  dims: Vec3,
): { voxels: Uint16Array; valueMin: number; valueMax: number } {
  let valueMin = +Infinity;
  let valueMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < valueMin) valueMin = v;
    if (v > valueMax) valueMax = v;
  }

  const safeMax = Math.max(0, valueMax);
  const logMax = Math.log(1 + safeMax);
  const invLogMax = logMax > 0 ? 1 / logMax : 0;
  const voxels = new Uint16Array(values.length);

  // C-order (axis 0 slowest, axis 2 fastest) → WebGPU x-fastest; a
  // straight copy would swap X and Z.
  for (let i = 0; i < dims[0]; i++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let k = 0; k < dims[2]; k++) {
        const inputIdx = i * dims[1] * dims[2] + j * dims[2] + k;
        const outputIdx = k * dims[1] * dims[0] + j * dims[0] + i;
        const v = Math.max(0, values[inputIdx]!);
        const normalised = Math.log(1 + v) * invLogMax;
        const clamped = normalised < 0 ? 0 : normalised > 1 ? 1 : normalised;
        voxels[outputIdx] = f32ToF16Bits(clamped);
      }
    }
  }

  return { voxels, valueMin, valueMax };
}
