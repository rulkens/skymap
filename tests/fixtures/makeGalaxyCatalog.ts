/**
 * makeGalaxyCatalog — one shared builder for the 17-field `GalaxyCatalog`
 * struct-of-arrays that ~40 test files otherwise hand-assemble inline.
 *
 * The churn this kills: every test that constructs a catalog restates the full
 * field list, so the day the on-disk format grows a field, all of them break
 * identically. Centralising the field list here makes the next field one edit.
 *
 * Defaults are neutral zero-fill, NOT the pipeline's semantic fallbacks
 * (0.7 axis ratio, 30 kpc diameter, etc.). The alternative — seeding
 * "realistic" values — would make tests silently pass on a default they never
 * asserted on; instead each test passes exactly the values it exercises via
 * `overrides`, and the zeros stand in for "don't care". The one non-zero
 * default is `objIDs`, seeded distinct and non-zero (i + 1) because an all-zero
 * BigUint64Array would collide every id and mask ordering / dedup bugs.
 *
 * `count` is forced AFTER the `...overrides` spread: an override may supply its
 * own arrays (e.g. a hand-built `positions`) without also having to restate
 * `count`, and the forced write keeps `count` from desyncing from those arrays.
 */

import type { GalaxyCatalog } from '../../src/@types/data/galaxyCatalog/GalaxyCatalog';

export function makeGalaxyCatalog(
  count: number,
  overrides: Partial<GalaxyCatalog> = {},
): GalaxyCatalog {
  return {
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
    orientationIsFallback: new Uint8Array(count),
    diameterIsFallback: new Uint8Array(count),
    // NaN, not the neutral-zero default every other column uses: 0 would
    // mean "1 solar mass" AND would set the on-disk estimated-mass bit on
    // every fixture row, corrupting the flags-byte tests.
    log10StellarMass: new Float32Array(count).fill(NaN),
    ...overrides,
    count,
  };
}
