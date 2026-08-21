import type { Vec3 } from '../../../../src/@types/math/Vec3';

/**
 * xFastestToCOrder — reorders a grid.wesl x-fastest voxel array (`dims[0]`
 * fastest) into NumPy C-order (`dims[2]` fastest) for the SAME `dims`
 * triple. Pure index permutation, no value transform, so f16 bits pass
 * through as bits and f32 values pass through as values.
 *
 * This is the byte order `buildRhizomeVolume.ts`'s default
 * `packLogTraceVoxels(values, dims)` call expects from a `.npy` — the
 * convention a real PolyPhy-fork export already satisfies (T19 ground
 * truth: the shipped MCPM volumes, built from real fork/VAC `.npy`
 * pairs, render correctly). `exportScfd.ts` skips this because it packs
 * straight to SCFD's own x-fastest voxel order; `exportNpy.ts` needs it
 * because a `.npy`'s bytes ARE its layout — there is no header field to
 * declare "x-fastest" instead.
 */
export function xFastestToCOrder<T extends Uint16Array | Float32Array>(values: T, dims: Vec3): T {
  const [nx, ny, nz] = dims;
  const Ctor = values.constructor as new (length: number) => T;
  const out = new Ctor(values.length);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const srcIdx = k * ny * nx + j * nx + i; // x-fastest
        const dstIdx = i * ny * nz + j * nz + k; // C-order
        out[dstIdx] = values[srcIdx]!;
      }
    }
  }
  return out;
}
