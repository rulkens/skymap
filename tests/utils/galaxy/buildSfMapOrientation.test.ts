/**
 * buildSfMapOrientation / sampleSfMapOrientation — the only tests in this
 * otherwise test-free spike, because a wrong orientation field (missed
 * aspect correction, swapped along/across gradient, a broken π-wrap) still
 * renders as a plausible-looking structured overlay; nothing else would
 * catch it. Fixtures are synthetic sinusoidal ridges authored directly in
 * the physical tangent plane (`ridgeSfMap`), never by restating the
 * builder's own formula.
 */
import { describe, it, expect } from 'vitest';
import { buildSfMapOrientation } from '../../../src/utils/galaxy/buildSfMapOrientation';
import { sampleSfMapOrientation } from '../../../src/utils/galaxy/sampleSfMapOrientation';
import { sfMapRingRadius } from '../../../src/utils/galaxy/sfMapRingRadius';
import { mulberry32 } from '../../../src/utils/random/mulberry32';
import type { GalaxySfMap } from '../../../src/@types/galaxy/GalaxySfMap';

// Small explicit dims for speed — deliberately NOT SF_MAP_AZ/SF_MAP_RINGS,
// which another agent is changing concurrently.
const AZ = 128;
const RINGS = 64;
const R_MIN = 0.3;
const R_MAX = 15;
const CENTER_ANGLE = Math.PI; // az/2 — an exact texel centre, no interpolation ambiguity

// Log-polar aspect: physical span of one ring-texel vs one azimuth-texel,
// radius-independent because the grid is conformal. Uses the shared
// sfMapRingRadius, same as the builder — this is fixture setup (what
// physical pattern to paint), not a restatement of the result under test.
function logPolarAspect(az: number, rings: number, rMin: number, rMax: number): number {
  const azTexelSize = (2 * Math.PI) / az;
  const ringTexelSize = Math.log(
    sfMapRingRadius(1, rings, rMin, rMax) / sfMapRingRadius(0, rings, rMin, rMax),
  );
  return ringTexelSize / azTexelSize;
}

/**
 * A sinusoidal ridge in the physical tangent plane at a given pitch (from
 * the azimuth axis) and wavelength. `pitchDegAt` lets a test paint
 * different pitches into different ring bands (used by the π-wrap case).
 * Phase is the projection onto the ACROSS-ridge direction `(-sin psi, cos
 * psi)`, so the field is constant ALONG psi and periodic across it — the
 * crest itself runs along psi, which is the angle a correct builder must
 * recover.
 */
function ridgeSfMap(
  az: number,
  rings: number,
  rMin: number,
  rMax: number,
  wavelengthTexels: number,
  pitchDegAt: (ring: number) => number,
): GalaxySfMap {
  const aspect = logPolarAspect(az, rings, rMin, rMax);
  const data = new Uint8Array(az * rings * 4);
  for (let ring = 0; ring < rings; ring++) {
    const pitchRad = (pitchDegAt(ring) * Math.PI) / 180;
    const yEquiv = ring * aspect;
    for (let a = 0; a < az; a++) {
      const phase = (-a * Math.sin(pitchRad) + yEquiv * Math.cos(pitchRad)) / wavelengthTexels;
      const b = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase);
      const i = (ring * az + a) * 4;
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  return { az, rings, rMin, rMax, data };
}

describe('buildSfMapOrientation + sampleSfMapOrientation', () => {
  it('recovers a known ridge pitch at three well-separated radii (conformality, not radius-dependent drift)', () => {
    // A single radius can't distinguish "no aspect correction" (a CONSTANT
    // bias) from "wrong radius-dependent correction" (DRIFT) — both are
    // real bugs someone could introduce. Three radii spanning the ring
    // range catch both. Measured: <=0.16deg error at all three, flat.
    const pitchDeg = 30;
    const map = ridgeSfMap(AZ, RINGS, R_MIN, R_MAX, 40, () => pitchDeg);
    const orientation = buildSfMapOrientation(map, 1.5);

    for (const ring of [10, 32, 56]) {
      const radius = sfMapRingRadius(ring, RINGS, R_MIN, R_MAX);
      const sample = sampleSfMapOrientation(orientation, radius, CENTER_ANGLE);
      const recoveredDeg = (sample.angle * 180) / Math.PI;
      expect(Math.abs(recoveredDeg - pitchDeg)).toBeLessThan(0.5);
      expect(sample.coherence).toBeGreaterThan(0.99);
    }
  });

  it('recovers an along-azimuth ridge as pitch ~0, not the perpendicular ~90', () => {
    // The single likeliest bug in the file: reporting the ACROSS-ridge
    // (gradient) direction instead of ALONG it. A ridge running purely
    // along azimuth has zero azimuthal gradient, so this fails loudly
    // (~90, not ~0) if the along/across negation in the builder is ever
    // dropped or flipped — invisible by eye, obvious here.
    const map = ridgeSfMap(AZ, RINGS, R_MIN, R_MAX, 16, () => 0);
    const orientation = buildSfMapOrientation(map, 1.5);

    for (const ring of [16, 32, 48]) {
      const radius = sfMapRingRadius(ring, RINGS, R_MIN, R_MAX);
      const sample = sampleSfMapOrientation(orientation, radius, CENTER_ANGLE);
      const recoveredDeg = (sample.angle * 180) / Math.PI;
      expect(Math.abs(recoveredDeg)).toBeLessThan(3);
    }
  });

  it('does not collapse +80/-80 (nearly parallel, 20deg apart mod pi) toward 0 at the boundary', () => {
    // Orientation wraps at π, not 2π: a +80deg and a -80deg line are 20deg
    // apart as UNDIRECTED lines (-80 == 100 mod 180), not 160deg apart.
    // The double-angle (cos2θ,sin2θ) representation blends them correctly
    // through the shared ±90 wrap point. A future "simplification" to a
    // bare angle would linearly average +80 and -80 to ~0 — a result
    // nowhere near either input. This pins that representation choice.
    const boundaryRing = 32;
    const map = ridgeSfMap(AZ, RINGS, R_MIN, R_MAX, 10, (ring) => (ring < boundaryRing ? 80 : -80));
    const orientation = buildSfMapOrientation(map, 1.5);

    const expectDeep = (ring: number, expectedDeg: number) => {
      const radius = sfMapRingRadius(ring, RINGS, R_MIN, R_MAX);
      const sample = sampleSfMapOrientation(orientation, radius, CENTER_ANGLE);
      const recoveredDeg = (sample.angle * 180) / Math.PI;
      expect(Math.abs(recoveredDeg - expectedDeg)).toBeLessThan(3);
      expect(sample.coherence).toBeGreaterThan(0.99);
    };
    expectDeep(20, 80);
    expectDeep(44, -80);

    // At the boundary the two bands blend under the same Gaussian window;
    // the correct wrap keeps the result near the shared ±90 edge, never
    // collapsing toward 0. Measured ~82deg, coherence ~0.96.
    const boundaryRadius = sfMapRingRadius(boundaryRing, RINGS, R_MIN, R_MAX);
    const boundarySample = sampleSfMapOrientation(orientation, boundaryRadius, CENTER_ANGLE);
    const boundaryDeg = (boundarySample.angle * 180) / Math.PI;
    expect(Math.abs(boundaryDeg)).toBeGreaterThan(60);
    expect(boundarySample.coherence).toBeGreaterThan(0.5);
  });

  it('coherence separates isotropic noise (low) from a clean ridge (near 1)', () => {
    // Coherence gates the planned fallback to the analytic arm frame; a
    // broken coherence (e.g. pinned near 1, or near 0, regardless of
    // input) would silently disable or permanently force that fallback.
    // mulberry32, never Math.random, so a failure reproduces.
    const rng = mulberry32(20260802);
    const noiseData = new Uint8Array(AZ * RINGS * 4);
    for (let i = 0; i < AZ * RINGS; i++) {
      noiseData[i * 4 + 2] = Math.floor(rng() * 256);
      noiseData[i * 4 + 3] = 255;
    }
    const noiseOrientation = buildSfMapOrientation(
      { az: AZ, rings: RINGS, rMin: R_MIN, rMax: R_MAX, data: noiseData },
      1.5,
    );
    let coherenceSum = 0;
    let n = 0;
    // Border rings skipped: radial clamp-at-edge (not wrap, unlike azimuth)
    // biases the gradient there regardless of signal, which would muddy a
    // noise-vs-ridge comparison unrelated to what this case is testing.
    for (let ring = 12; ring < RINGS - 12; ring += 4) {
      const radius = sfMapRingRadius(ring, RINGS, R_MIN, R_MAX);
      for (let a = 0; a < AZ; a += 8) {
        const angle = (a / AZ) * 2 * Math.PI;
        coherenceSum += sampleSfMapOrientation(noiseOrientation, radius, angle).coherence;
        n++;
      }
    }
    // Measured ~0.5 mean, not "~0" a per-pixel gradient direction would
    // suggest — the two-stage (field then tensor) blur has a floor bias at
    // this window size, stable across seeds. What's behaviourally
    // load-bearing, and what this asserts, is the SEPARATION from a clean
    // ridge's ~1.0 — wide enough for a fallback threshold to sit between.
    expect(coherenceSum / n).toBeLessThan(0.65);

    const cleanRidge = ridgeSfMap(AZ, RINGS, R_MIN, R_MAX, 20, () => 35);
    const ridgeOrientation = buildSfMapOrientation(cleanRidge, 1.5);
    for (const ring of [16, 32, 48]) {
      const radius = sfMapRingRadius(ring, RINGS, R_MIN, R_MAX);
      const sample = sampleSfMapOrientation(ridgeOrientation, radius, CENTER_ANGLE);
      expect(sample.coherence).toBeGreaterThan(0.95);
    }
  });
});
