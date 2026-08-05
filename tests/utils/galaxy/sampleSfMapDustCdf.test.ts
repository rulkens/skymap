/**
 * Statistical check on S1's CDF sampler: a single hot texel confines every
 * draw to its own footprint (guards the binary search + jitter formulas),
 * and two texels of very different bin width (log-spaced rings) split draws
 * in proportion to their `texelArea x density`, not their raw count (guards
 * the area weighting the old rejection sampler didn't need).
 */
import { describe, expect, it } from 'vitest';
import { buildSfMapDustCdf } from '../../../src/utils/galaxy/buildSfMapDustCdf';
import { sampleSfMapDustCdf } from '../../../src/utils/galaxy/sampleSfMapDustCdf';
import { sfMapDustDensity } from '../../../src/utils/galaxy/sfMapDustDensity';
import { sfMapDustRingEdges } from '../../../src/utils/galaxy/sfMapDustRingEdges';
import { mulberry32 } from '../../../src/utils/random/mulberry32';
import type { GalaxySfMap } from '../../../src/@types/galaxy/GalaxySfMap';

/** Every fixture here only fills gas/oldActivity, so this is dust's own density exactly. */
const buildCdf = (map: GalaxySfMap) =>
  buildSfMapDustCdf(map, (gas, _recentSf, oldActivity) => sfMapDustDensity(gas, oldActivity));

const AZ = 4;
const RINGS = 4;
const R_MIN = 1;
const R_MAX = 8;

function makeMap(fill: (data: Uint8Array) => void): GalaxySfMap {
  const data = new Uint8Array(RINGS * AZ * 4);
  fill(data);
  return { az: AZ, rings: RINGS, rMin: R_MIN, rMax: R_MAX, data };
}

/** `sfMapDustDensity` reads gas (R) x oldActivity (B); set both to the same level. */
function setDensity(data: Uint8Array, ring: number, azIdx: number, density: number): void {
  const i = (ring * AZ + azIdx) * 4;
  const level = Math.round(density * 255);
  data[i] = level;
  data[i + 2] = level;
}

describe('sampleSfMapDustCdf', () => {
  it('confines every draw to a single hot texel', () => {
    const ring = 2;
    const azIdx = 1;
    const map = makeMap((data) => setDensity(data, ring, azIdx, 1));
    const cdf = buildCdf(map);
    const rng = mulberry32(7);

    const { rInner, rOuter } = sfMapDustRingEdges(ring, RINGS, R_MIN, R_MAX);
    const dTheta = (2 * Math.PI) / AZ;
    const angleInner = azIdx * dTheta;
    const angleOuter = angleInner + dTheta;

    for (let i = 0; i < 200; i++) {
      const { radius, angle } = sampleSfMapDustCdf(cdf, rng);
      expect(radius).toBeGreaterThanOrEqual(rInner);
      expect(radius).toBeLessThanOrEqual(rOuter);
      expect(angle).toBeGreaterThanOrEqual(angleInner);
      expect(angle).toBeLessThan(angleOuter);
    }
  });

  it('splits draws between two texels in proportion to their mass, not their count', () => {
    // Ring 0's bin is a sliver near rMin; ring 3's is wide near rMax (log
    // spacing) — equal density but wildly different texelArea, so an
    // area-blind sampler would land close to 50/50 instead.
    const map = makeMap((data) => {
      setDensity(data, 0, 0, 1);
      setDensity(data, 3, 0, 1);
    });
    const cdf = buildCdf(map);
    const rng = mulberry32(11);

    const edgesA = sfMapDustRingEdges(0, RINGS, R_MIN, R_MAX);
    const edgesB = sfMapDustRingEdges(3, RINGS, R_MIN, R_MAX);
    const areaA = 0.5 * ((2 * Math.PI) / AZ) * (edgesA.rOuter ** 2 - edgesA.rInner ** 2);
    const areaB = 0.5 * ((2 * Math.PI) / AZ) * (edgesB.rOuter ** 2 - edgesB.rInner ** 2);
    const expectedFracA = areaA / (areaA + areaB);
    expect(expectedFracA).toBeLessThan(0.1); // sanity: the two bins are NOT comparable in size

    const N = 4000;
    let countA = 0;
    for (let i = 0; i < N; i++) {
      const { radius } = sampleSfMapDustCdf(cdf, rng);
      if (radius <= edgesA.rOuter) countA++;
    }
    expect(countA / N).toBeCloseTo(expectedFracA, 1);
  });
});
