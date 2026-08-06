/**
 * Statistical check on S1's CDF sampler: a single hot texel confines every
 * draw to its own footprint (guards the binary search + jitter formulas),
 * and two texels of very different bin width (log-spaced rings) split draws
 * in proportion to their `texelArea x density`, not their raw count (guards
 * the area weighting the old rejection sampler didn't need).
 */
import { describe, expect, it } from 'vitest';
import { buildIsmMapDustCdf } from '../../../src/utils/galaxy/buildIsmMapDustCdf';
import { sampleIsmMapDustCdf } from '../../../src/utils/galaxy/sampleIsmMapDustCdf';
import { ismMapDustDensity } from '../../../src/utils/galaxy/ismMapDustDensity';
import { ismMapDustRingEdges } from '../../../src/utils/galaxy/ismMapDustRingEdges';
import { mulberry32 } from '../../../src/utils/random/mulberry32';
import type { GalaxyIsmMap } from '../../../src/@types/galaxy/GalaxyIsmMap';

/** Every fixture here only fills gas/activity, so this is dust's own density exactly. */
const buildCdf = (map: GalaxyIsmMap) =>
  buildIsmMapDustCdf(map, (texel) => ismMapDustDensity(texel.gas, texel.activity));

const AZ = 4;
const RINGS = 4;
const R_MIN = 1;
const R_MAX = 8;

function makeMap(fill: (data: Float32Array) => void): GalaxyIsmMap {
  const data = new Float32Array(RINGS * AZ * 4);
  fill(data);
  return { az: AZ, rings: RINGS, rMin: R_MIN, rMax: R_MAX, data };
}

/** `ismMapDustDensity` reads gas (R) x activity (B); set both to the same level. */
function setDensity(data: Float32Array, ring: number, azIdx: number, density: number): void {
  const i = (ring * AZ + azIdx) * 4;
  data[i] = density;
  data[i + 2] = density;
}

describe('sampleIsmMapDustCdf', () => {
  it('confines every draw to a single hot texel', () => {
    const ring = 2;
    const azIdx = 1;
    const map = makeMap((data) => setDensity(data, ring, azIdx, 1));
    const cdf = buildCdf(map);
    const rng = mulberry32(7);

    const { rInner, rOuter } = ismMapDustRingEdges(ring, RINGS, R_MIN, R_MAX);
    const dTheta = (2 * Math.PI) / AZ;
    const angleInner = azIdx * dTheta;
    const angleOuter = angleInner + dTheta;

    for (let i = 0; i < 200; i++) {
      const { radius, angle } = sampleIsmMapDustCdf(cdf, rng);
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

    const edgesA = ismMapDustRingEdges(0, RINGS, R_MIN, R_MAX);
    const edgesB = ismMapDustRingEdges(3, RINGS, R_MIN, R_MAX);
    const areaA = 0.5 * ((2 * Math.PI) / AZ) * (edgesA.rOuter ** 2 - edgesA.rInner ** 2);
    const areaB = 0.5 * ((2 * Math.PI) / AZ) * (edgesB.rOuter ** 2 - edgesB.rInner ** 2);
    const expectedFracA = areaA / (areaA + areaB);
    expect(expectedFracA).toBeLessThan(0.1); // sanity: the two bins are NOT comparable in size

    const N = 4000;
    let countA = 0;
    for (let i = 0; i < N; i++) {
      const { radius } = sampleIsmMapDustCdf(cdf, rng);
      if (radius <= edgesA.rOuter) countA++;
    }
    expect(countA / N).toBeCloseTo(expectedFracA, 1);
  });
});
