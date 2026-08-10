/**
 * blockAverageCube — linear-space N×N×N block-average downsample for
 * rhizome shell tiers (spec, Decision 5). Unwired by design: `--shell`
 * stays inert this plan (Task 8).
 *
 * Averages on LINEAR values before any log normalisation — matches the
 * Python VAC pipeline's downscale_local_mean ordering
 * (extractMcpmCube.py:126-140); each tier is normalised independently
 * later.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function blockAverageCube(args: {
  values: Float32Array | Float64Array;
  dims: Vec3;
  origin: Vec3;
  voxelSizeMpc: number;
  factor: number;
}): { values: Float32Array; dims: Vec3; origin: Vec3; voxelSizeMpc: number } {
  const { values, dims, origin, voxelSizeMpc, factor } = args;
  for (const d of dims) {
    if (d % factor !== 0) {
      throw new Error(
        `blockAverageCube: dims [${dims.join(',')}] not divisible by ${factor} — shell cubes must be 256³`,
      );
    }
  }

  const outDims: Vec3 = [dims[0] / factor, dims[1] / factor, dims[2] / factor];
  const out = new Float32Array(outDims[0] * outDims[1] * outDims[2]);
  const blockCount = factor * factor * factor;

  // C-order (axis 0 slowest, axis 2 fastest), matching the input layout.
  for (let oi = 0; oi < outDims[0]; oi++) {
    for (let oj = 0; oj < outDims[1]; oj++) {
      for (let ok = 0; ok < outDims[2]; ok++) {
        let sum = 0;
        for (let bi = 0; bi < factor; bi++) {
          const i = oi * factor + bi;
          for (let bj = 0; bj < factor; bj++) {
            const j = oj * factor + bj;
            for (let bk = 0; bk < factor; bk++) {
              const k = ok * factor + bk;
              sum += values[i * dims[1] * dims[2] + j * dims[2] + k]!;
            }
          }
        }
        out[oi * outDims[1] * outDims[2] + oj * outDims[2] + ok] = sum / blockCount;
      }
    }
  }

  return {
    values: out,
    dims: outDims,
    origin: [...origin] as Vec3,
    voxelSizeMpc: voxelSizeMpc * factor,
  };
}
