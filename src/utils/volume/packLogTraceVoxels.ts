/**
 * packLogTraceVoxels — shared value transform for SCFD volume builders
 * whose source field is non-negative and heavy-tailed (MCPM trace
 * density; the rhizome SCFD importer reuses this so the two builders
 * cannot drift apart on normalisation).
 *
 * Maps log(1+v)/log(1+max) → [0,1] so a heavy tail (MCPM: min=0,
 * max≈40000, mean≈16, p99≈320) spans the LUT instead of collapsing to
 * one colour — a linear map put 99% of voxels under contrast's first
 * click. Packs the result to f16. `inputLayout` (default `'c-order'`,
 * every existing caller's contract, unchanged) also transposes C-order
 * → WebGPU x-fastest; `'x-fastest'` is for a caller whose `values` are
 * ALREADY x-fastest (an MCPM trace-buffer GPU readback, grid.wesl's own
 * layout) — transposing that too would swap X and Z a second time.
 */
import { f32ToF16Bits } from '../math/f32ToF16Bits';
import type { Vec3 } from '../../@types/math/Vec3';

export type PackedTraceInputLayout = 'c-order' | 'x-fastest';

function normalizeLog(v: number, invLogMax: number): number {
  // Guards a possible future negative noise floor; today's data is non-negative by construction.
  const normalised = Math.log(1 + Math.max(0, v)) * invLogMax;
  return normalised < 0 ? 0 : normalised > 1 ? 1 : normalised;
}

export function packLogTraceVoxels(
  values: Float32Array | Float64Array,
  dims: Vec3,
  inputLayout: PackedTraceInputLayout = 'c-order',
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

  if (inputLayout === 'x-fastest') {
    // No reorder — `values` already sits in the order `voxels` needs to end up in.
    for (let i = 0; i < values.length; i++) {
      voxels[i] = f32ToF16Bits(normalizeLog(values[i]!, invLogMax));
    }
    return { voxels, valueMin, valueMax };
  }

  // C-order (axis 0 slowest, axis 2 fastest) → WebGPU x-fastest; a
  // straight copy would swap X and Z.
  for (let i = 0; i < dims[0]; i++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let k = 0; k < dims[2]; k++) {
        const inputIdx = i * dims[1] * dims[2] + j * dims[2] + k;
        const outputIdx = k * dims[1] * dims[0] + j * dims[0] + i;
        voxels[outputIdx] = f32ToF16Bits(normalizeLog(values[inputIdx]!, invLogMax));
      }
    }
  }

  return { voxels, valueMin, valueMax };
}
