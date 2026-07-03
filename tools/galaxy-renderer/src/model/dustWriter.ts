/**
 * createDustWriter — pure stride-8 interleaving into a growable array,
 * extracted from galaxy-model.js:488-500's `dustData` push array. Each
 * `write()` call appends one record in field order
 * x,y,z,size,r,g,b,opacity — size before colour, which is the opposite
 * order from `starWriter`'s colour-before-size. That mismatch is the GPU
 * dust-quad vertex layout's, not a typo here, so it's carried over as-is
 * rather than "fixed" to match stars.
 *
 * Unlike stars, the dust count isn't knowable up front — it depends on how
 * many `DustSeed` candidates the noise/ring gates accept per-galaxy — so
 * this accumulates into a plain growable `number[]` instead of a pre-sized
 * Float32Array. `toFloat32Array()` snapshots a tight copy sized to exactly
 * what was written; there's no over-allocated backing array to alias.
 */
import type { DustWriter } from '../../@types/model/DustWriter';

export function createDustWriter(): DustWriter {
  const values: number[] = [];
  let recordCount = 0;

  return {
    write(x, y, z, size, r, g, b, opacity) {
      values.push(x, y, z, size, r, g, b, opacity);
      recordCount++;
    },
    count: () => recordCount,
    toFloat32Array: () => Float32Array.from(values),
  };
}
