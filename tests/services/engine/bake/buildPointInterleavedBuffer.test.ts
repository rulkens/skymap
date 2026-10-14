/**
 * Unit tests for the pure `buildPointInterleavedBuffer` function, run inline
 * (Vitest's Node has no Worker). The 12-slot record layout is documented on
 * `SLOTS_PER_GALAXY_POINT` in the bake and pinned against the GPU table in
 * `galaxyPointVertexLayout.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { buildPointInterleavedBuffer } from '../../../../src/services/engine/bake/buildPointInterleavedBuffer';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

/** Build a tiny synthetic cloud with three galaxies at known coordinates. */
function makeCloud(count: number): GalaxyCatalog {
  return makeGalaxyCatalog(count, {
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
  });
}

const SLOTS = 12;

describe('buildPointInterleavedBuffer', () => {
  it('produces an interleaved Float32Array of the expected length (12 slots × 4 bytes)', () => {
    const cloud = makeCloud(3);
    const result = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(result.interleaved).toBeInstanceOf(Float32Array);
    expect(result.interleaved.length).toBe(3 * SLOTS);
    expect(result.interleaved.byteLength).toBe(3 * SLOTS * 4);
  });

  it('writes positions into slots 0..2 of each vertex record', () => {
    const cloud = makeCloud(2);
    cloud.positions.set([10, 20, 30, -5, -10, -15]);
    cloud.magG.set([18, 18]); // identical so per-galaxy-catalog shift is zero
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(interleaved[0 * SLOTS + 0]).toBeCloseTo(10);
    expect(interleaved[0 * SLOTS + 1]).toBeCloseTo(20);
    expect(interleaved[0 * SLOTS + 2]).toBeCloseTo(30);
    expect(interleaved[1 * SLOTS + 0]).toBeCloseTo(-5);
    expect(interleaved[1 * SLOTS + 1]).toBeCloseTo(-10);
    expect(interleaved[1 * SLOTS + 2]).toBeCloseTo(-15);
  });

  it('writes axisRatio at slot 5 with positive sign when orientationIsFallback is 0', () => {
    // makeCloud leaves orientationIsFallback all-zero, so the bake keeps every
    // axisRatio positive (no sign-bit flip) and echoes the persisted flag.
    const cloud = makeCloud(3);
    cloud.magG.set([18, 18, 18]);
    const { interleaved, isFallbackArr } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    for (let i = 0; i < 3; i++) {
      expect(isFallbackArr[i]).toBe(0);
      const ab = interleaved[i * SLOTS + 5]!;
      expect(ab).toBeGreaterThan(0);
      expect(ab).toBeCloseTo(0.7, 5);
    }
  });

  it('flips the slot-5 sign bit for rows whose persisted orientationIsFallback is 1', () => {
    // The authoritative build-side flag drives the packing directly — no
    // re-hashing of position.  Row 1 is marked fallback, rows 0/2 are not.
    const cloud = makeCloud(3);
    cloud.magG.set([18, 18, 18]);
    cloud.orientationIsFallback.set([0, 1, 0]);
    const { interleaved, isFallbackArr } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(Array.from(isFallbackArr)).toEqual([0, 1, 0]);
    expect(interleaved[0 * SLOTS + 5]).toBeCloseTo(0.7, 5);
    expect(interleaved[1 * SLOTS + 5]).toBeCloseTo(-0.7, 5); // sign bit flipped
    expect(interleaved[2 * SLOTS + 5]).toBeCloseTo(0.7, 5);
  });

  it('flips the slot-8 (radiusMpc) sign bit for rows whose persisted diameterIsFallback is 1', () => {
    // Same authoritative-byte contract as orientationIsFallback/slot 5, one
    // slot over: the padded radius is always positive, so a fallback
    // diameter negates it. Row 1 is marked fallback, rows 0/2 are not.
    const cloud = makeCloud(3);
    cloud.magG.set([18, 18, 18]);
    cloud.diameterIsFallback.set([0, 1, 0]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(interleaved[0 * SLOTS + 8]).toBeGreaterThan(0);
    expect(interleaved[1 * SLOTS + 8]).toBeLessThan(0);
    expect(interleaved[2 * SLOTS + 8]).toBeGreaterThan(0);
  });

  it('writes the decoded angular weight into slot 9 (raw 128 → 1, raw 255 → 10, raw 0 → 1)', () => {
    const cloud = makeCloud(3);
    cloud.angularWeight.set([128, 255, 0]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(interleaved[0 * SLOTS + 9]).toBe(1);
    expect(interleaved[1 * SLOTS + 9]).toBeCloseTo(10, 4);
    expect(interleaved[2 * SLOTS + 9]).toBe(1);
  });

  it('bakes cos/sin of the negated position angle into slots 6/7', () => {
    // PA = 45° east-of-north.  The shader used to compute
    // 'paRad = -PA · π/180' per vertex; the bake folds the same negation
    // in, so slot 6 = cos(-45°) = +√2/2 and slot 7 = sin(-45°) = -√2/2.
    const cloud = makeCloud(1);
    cloud.magG.set([18]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(interleaved[6]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(interleaved[7]).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it('bakes absMag from the OFFSET-normalised magnitude into slot 10', () => {
    // Single galaxy → per-catalog mean shift snaps its slot-3 magnitude to
    // the SDSS target (18).  At d = 100 Mpc the distance modulus is
    // 5·log10(100) + 25 = 35, so absMag = 18 − 35 = −17.  Using the raw
    // magnitude (16) would give −19 — the assertion pins the OFFSET
    // convention, which is what the shader's Malmquist gate historically
    // computed from slot 3.
    const cloud = makeCloud(1);
    cloud.positions.set([100, 0, 0]);
    cloud.magG.set([16]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(interleaved[3]).toBeCloseTo(18, 5);
    expect(interleaved[10]).toBeCloseTo(-17, 5);
  });

  it('shifts the per-galaxy-catalog magG mean toward the SDSS target (≈18)', () => {
    // Build a cloud whose mean magG is far from 18 — verify the bake's
    // output mean (slot 3 across all rows) lands close to 18.
    const cloud = makeCloud(3);
    cloud.magG.set([5, 6, 7]); // 2MRS-like J-band brightnesses
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.TwoMRS,
    });
    const mags = [
      interleaved[0 * SLOTS + 3]!,
      interleaved[1 * SLOTS + 3]!,
      interleaved[2 * SLOTS + 3]!,
    ];
    const meanOut = (mags[0]! + mags[1]! + mags[2]!) / 3;
    expect(meanOut).toBeCloseTo(18, 5);
  });

  it('writes the unknown-colour fallback (1.05) when the row lacks usable bands', () => {
    const cloud = makeCloud(1);
    // SDSS picks u−g.  Setting both bands to NaN forces pickColourIndex
    // to return null, which the bake maps to UNKNOWN_COLOUR_RAMP_POSITION
    // (1.05) — the shared neutral-ramp value both renderers substitute.
    cloud.magU.set([NaN]);
    cloud.magG.set([NaN]);
    cloud.magR.set([NaN]);
    cloud.magI.set([NaN]);
    cloud.magZ.set([NaN]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    expect(interleaved[4]).toBeCloseTo(1.05, 5);
  });
});
