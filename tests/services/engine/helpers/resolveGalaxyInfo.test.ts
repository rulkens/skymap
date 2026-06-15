/**
 * Unit tests for `resolveGalaxyInfo` — the pure `(cloud, localIdx, source)` →
 * `GalaxyInfo | null` lookup used by the selection subsystem.
 *
 * The null cases pin the tier-swap-window race guard: an undefined cloud and an
 * out-of-range local index (negative or >= count) must both return null rather
 * than indexing past the end of a freshly-swapped smaller tier's typed arrays.
 * The happy path confirms the delegation to `buildGalaxyInfo` is wired through.
 */

import { describe, it, expect } from 'vitest';
import { resolveGalaxyInfo } from '../../../../src/services/engine/helpers/resolveGalaxyInfo';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

/**
 * Build a synthetic `GalaxyCatalog` of `count` rows, all zeroed except objIDs
 * (sequential 1..N).  Mirrors the fixture in `galaxyInfoBuilder.test.ts` so the
 * two suites stay copy-pasteable.
 */
function makeCloud(count: number): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
  };
}

describe('resolveGalaxyInfo', () => {
  it('returns null when the cloud is undefined', () => {
    expect(resolveGalaxyInfo(undefined, 0, Source.SDSS)).toBeNull();
  });

  it('returns null for a negative localIdx', () => {
    const cloud = makeCloud(3);
    expect(resolveGalaxyInfo(cloud, -1, Source.SDSS)).toBeNull();
  });

  it('returns null when localIdx >= cloud.count (the tier-swap race guard)', () => {
    // A stale pick decoded against a larger layout indexes past the end of a
    // freshly-swapped smaller cloud; the guard returns null instead of crashing.
    const cloud = makeCloud(3);
    expect(resolveGalaxyInfo(cloud, 3, Source.SDSS)).toBeNull();
  });

  it('delegates to buildGalaxyInfo for an in-range index', () => {
    const cloud = makeCloud(3);
    cloud.positions.set([100, 0, 0], 3); // place row 1 on the +x axis
    const info = resolveGalaxyInfo(cloud, 1, Source.SDSS);
    expect(info).not.toBeNull();
    expect(info!.index).toBe(1);
    expect(info!.source).toBe(Source.SDSS);
    expect(info!.type).toBe('galaxyCatalog');
  });
});
