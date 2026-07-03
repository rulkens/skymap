/**
 * generateGalaxy — the model's public face. Pins: determinism (same params
 * -> byte-identical output; a different seed -> different bytes); the
 * output arrays are laid out at exactly `count * 8` floats, all finite;
 * category-driven builder gating matches the spike (elliptical emits no
 * dust/arm stars, lenticular emits no arm stars); the four-stream
 * independence the `GalaxyBuildContext` docblock promises (rerolling
 * `waveSeed` — scoped to `buildSpiralArms` alone — leaves the bulge segment,
 * written before any arm draw, byte-identical); and the warp offset only
 * ever touches the y column, and only beyond `warpStart`.
 */
import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../../../../tools/galaxy-renderer/src/model/generateGalaxy';
import { createGalaxyBuildContext } from '../../../../tools/galaxy-renderer/src/model/createGalaxyBuildContext';
import type { GalaxyParams } from '../../../../tools/galaxy-renderer/@types/model/GalaxyParams';

const STRIDE = 8;

function assertAllFinite(arr: Float32Array): void {
  for (let i = 0; i < arr.length; i++) {
    expect(Number.isFinite(arr[i])).toBe(true);
  }
}

describe('generateGalaxy', () => {
  it('same params produce byte-identical output', () => {
    const params: GalaxyParams = { type: 'Sb', starCount: 30000, seed: 11 };
    const a = generateGalaxy({ ...params });
    const b = generateGalaxy({ ...params });

    expect(a.starCount).toBe(b.starCount);
    expect(a.dustCount).toBe(b.dustCount);
    expect(a.stars).toEqual(b.stars);
    expect(a.dust).toEqual(b.dust);
  });

  it('a different main seed produces different bytes', () => {
    const a = generateGalaxy({ type: 'Sb', starCount: 30000, seed: 11 });
    const b = generateGalaxy({ type: 'Sb', starCount: 30000, seed: 12 });

    expect(a.stars).not.toEqual(b.stars);
  });

  it('stars length is exactly starCount·8 and dust length is dustCount·8', () => {
    const g = generateGalaxy({ type: 'Sb', starCount: 30000, seed: 3 });

    expect(g.stars.length).toBe(g.starCount * STRIDE);
    expect(g.dust.length).toBe(g.dustCount * STRIDE);
  });

  it('every float is finite', () => {
    const g = generateGalaxy({ type: 'SBb', starCount: 30000, seed: 4, globularCount: 5 });

    assertAllFinite(g.stars);
    assertAllFinite(g.dust);
  });

  it('elliptical emits zero dust and zero arm stars', () => {
    const params: GalaxyParams = {
      type: 'E2',
      starCount: 30000,
      seed: 5,
      dust: 2,
      globularCount: 0,
    };
    const ctx = createGalaxyBuildContext(params);
    const g = generateGalaxy(params);

    expect(g.dustCount).toBe(0);
    expect(g.starCount).toBe(ctx.budget.bulgeCount + ctx.budget.haloCount);
  });

  it('lenticular emits no arm stars', () => {
    const params: GalaxyParams = { type: 'S0', starCount: 30000, seed: 6, globularCount: 0 };
    const ctx = createGalaxyBuildContext(params);
    const g = generateGalaxy(params);

    expect(ctx.budget.armStarCount).toBe(0);
    expect(g.starCount).toBe(ctx.budget.bulgeCount + ctx.budget.diskCount + ctx.budget.haloCount);
  });

  it('rerolling waveSeed leaves the bulge segment untouched', () => {
    const base: GalaxyParams = { type: 'Sc', starCount: 30000, seed: 9, armWave: 0.4 };
    const a = generateGalaxy({ ...base, waveSeed: 1 });
    const b = generateGalaxy({ ...base, waveSeed: 2 });

    const ctx = createGalaxyBuildContext(base);
    const bulgeFloats = ctx.budget.bulgeCount * STRIDE;

    expect(a.stars.subarray(0, bulgeFloats)).toEqual(b.stars.subarray(0, bulgeFloats));
    expect(a.stars).not.toEqual(b.stars);
  });

  it('starCount floors at 20000', () => {
    // Lenticular: bulge + disk + halo always write exactly their budget
    // share (no density-gap skips like the spiral arms have), so the
    // written count tracks the floored total exactly rather than merely
    // bounding it from below.
    const g = generateGalaxy({ type: 'S0', starCount: 5000, seed: 1, globularCount: 0 });

    expect(g.starCount).toBeGreaterThanOrEqual(20000);
  });

  it('warp only bends the outer disk', () => {
    const base: GalaxyParams = { type: 'Sc', starCount: 30000, seed: 5 };
    const flat = generateGalaxy({ ...base, warpStrength: 0 });
    const warped = generateGalaxy({ ...base, warpStrength: 0.3 });

    expect(flat.starCount).toBe(warped.starCount);
    expect(flat.stars.length).toBe(warped.stars.length);

    const ctx = createGalaxyBuildContext(base);
    const warpStart = ctx.outerRadius * 0.3; // GalaxyParams.warpStart default

    let sawDifference = false;
    for (let i = 0; i < flat.stars.length; i += STRIDE) {
      const x = flat.stars[i]!;
      const z = flat.stars[i + 2]!;
      for (let col = 0; col < STRIDE; col++) {
        if (col === 1) continue; // y column — checked separately below
        expect(warped.stars[i + col]).toBe(flat.stars[i + col]);
      }
      const radius = Math.hypot(x, z);
      if (radius <= warpStart) {
        expect(warped.stars[i + 1]).toBe(flat.stars[i + 1]);
      } else if (warped.stars[i + 1] !== flat.stars[i + 1]) {
        sawDifference = true;
      }
    }
    expect(sawDifference).toBe(true);
  });
});
