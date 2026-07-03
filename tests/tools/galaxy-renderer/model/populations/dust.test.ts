/**
 * createDustField / buildArmDust / buildBarDust / buildLenticularDust /
 * buildIrregularDust — the dust field and its four category builders,
 * ported from galaxy-model.js:505-598. Pins: construction is draw-free (the
 * noise sampler is pure, unlike the mutable `rand`/`randNormal` streams);
 * `dustMod` biases `keep` toward high-noise locations; each builder's
 * particle-count budget is a hard cap, not a target (arm/irregular loops
 * stop early, they don't resample); the bar/ring gates are true no-ops
 * (barLength 0, dustRingStrength 0) rather than zero-probability loops.
 */
import { describe, expect, it } from 'vitest';
import { createDustField } from '../../../../../tools/galaxy-renderer/src/model/createDustField';
import { buildArmDust } from '../../../../../tools/galaxy-renderer/src/model/populations/armDust';
import { buildBarDust } from '../../../../../tools/galaxy-renderer/src/model/populations/barDust';
import { buildLenticularDust } from '../../../../../tools/galaxy-renderer/src/model/populations/lenticularDust';
import { buildIrregularDust } from '../../../../../tools/galaxy-renderer/src/model/populations/irregularDust';
import { createGalaxyBuildContext } from '../../../../../tools/galaxy-renderer/src/model/createGalaxyBuildContext';
import { makeValueNoise } from '../../../../../src/utils/random/makeValueNoise';
import type { DustSeed } from '../../../../../tools/galaxy-renderer/@types/model/DustSeed';

const STRIDE = 8; // x,y,z,size,r,g,b,opacity — see dustWriter.ts

/** Reconstitute {x,y,z} triples from a tight dust Float32Array. */
function positions(view: Float32Array): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < view.length; i += STRIDE) {
    out.push({ x: view[i]!, y: view[i + 1]!, z: view[i + 2]! });
  }
  return out;
}

describe('createDustField', () => {
  it('draws nothing from the main stream at construction', () => {
    const ctxA = createGalaxyBuildContext({ type: 'Sb', starCount: 30000, seed: 7 });
    const ctxB = createGalaxyBuildContext({ type: 'Sb', starCount: 30000, seed: 7 });

    createDustField(ctxA);

    expect(ctxA.rand()).toBe(ctxB.rand());
  });

  it('keep-rate rises with the noise value', () => {
    const params = { type: 'Sb', starCount: 30000, seed: 3, dustNoise: 1 } as const;
    const outerRadius = 10 * 1; // radius default 1 -> model.js:85

    // Reconstruct the same noise field the production code builds, purely to
    // locate a high-f and a low-f probe point — the field's internal noise
    // sampler isn't part of the public DustField surface.
    const dnoise = makeValueNoise(((params.seed | 0) ^ 0x9e3779b9) >>> 0);
    const nfreq = (2.4 * 1) / outerRadius;
    const noiseAt = (x: number, y: number, z: number): number =>
      (dnoise(x * nfreq, y * nfreq * 0.5, z * nfreq) +
        0.5 * dnoise(x * nfreq * 2.3, y * nfreq, z * nfreq * 2.3)) /
      1.5;

    let highest: { x: number; y: number; z: number; f: number } | null = null;
    let lowest: { x: number; y: number; z: number; f: number } | null = null;
    for (let x = -outerRadius; x <= outerRadius; x += 1) {
      for (let z = -outerRadius; z <= outerRadius; z += 1) {
        const f = noiseAt(x, 0, z);
        if (!highest || f > highest.f) highest = { x, y: 0, z, f };
        if (!lowest || f < lowest.f) lowest = { x, y: 0, z, f };
      }
    }
    expect(highest).not.toBeNull();
    expect(lowest).not.toBeNull();

    const ctx = createGalaxyBuildContext(params);
    const field = createDustField(ctx);
    const samples = 500;
    let highKeeps = 0;
    let lowKeeps = 0;
    for (let i = 0; i < samples; i++) {
      if (field.dustMod(highest!.x, highest!.y, highest!.z).keep) highKeeps++;
      if (field.dustMod(lowest!.x, lowest!.y, lowest!.z).keep) lowKeeps++;
    }
    expect(highKeeps).toBeGreaterThan(lowKeeps);
  });
});

describe('buildArmDust', () => {
  it('respects its budget', () => {
    // grainScale 1 at the default starCount (400000) -> budget floor(30000*1/1) = 30000.
    const ctx = createGalaxyBuildContext({ type: 'Sb', seed: 1, dust: 1 });
    expect(ctx.grainScale).toBeCloseTo(1, 6);
    const field = createDustField(ctx);

    const seeds: DustSeed[] = [];
    for (let i = 0; i < 50000; i++) {
      seeds.push({ x: 1, y: 0.2, z: -1, radius: Math.SQRT2, angle: Math.PI / 4, armFade: 1 });
    }
    buildArmDust(ctx, field, seeds);

    expect(ctx.dust.count()).toBeLessThanOrEqual(30000);
    expect(ctx.dust.count()).toBeGreaterThan(0);
  });

  it('is a no-op for an empty seed list', () => {
    const ctx = createGalaxyBuildContext({ type: 'Sb', seed: 1 });
    const field = createDustField(ctx);
    buildArmDust(ctx, field, []);
    expect(ctx.dust.count()).toBe(0);
  });
});

describe('buildBarDust', () => {
  it('is a no-op when the bar has zero length', () => {
    const ctx = createGalaxyBuildContext({ type: 'SBb', seed: 1 });
    const field = createDustField(ctx);
    buildBarDust(ctx, field, { barLength: 0, cosBar: 1, sinBar: 0 });
    expect(ctx.dust.count()).toBe(0);
  });

  it('writes lane particles for a barred galaxy', () => {
    const ctx = createGalaxyBuildContext({ type: 'SBb', seed: 1, dust: 1 });
    const field = createDustField(ctx);
    buildBarDust(ctx, field, { barLength: ctx.outerRadius * 0.42, cosBar: 1, sinBar: 0 });
    expect(ctx.dust.count()).toBeGreaterThan(0);
  });
});

describe('buildLenticularDust', () => {
  it('emits no ring particles when dustRingStrength is 0', () => {
    const ctx = createGalaxyBuildContext({ type: 'S0', seed: 1, dust: 0, dustRingStrength: 0 });
    const field = createDustField(ctx);
    buildLenticularDust(ctx, field);
    expect(ctx.dust.count()).toBe(0);
  });

  it('ring particles cluster at the ring radius when dustRingStrength > 0', () => {
    // dust: 0 zeroes the nuclear-dust budget so every particle written comes
    // from the ring pass — isolating the ring without touching the ring gate.
    const ctx = createGalaxyBuildContext({ type: 'S0', seed: 1, dust: 0, dustRingStrength: 0.5 });
    const field = createDustField(ctx);
    buildLenticularDust(ctx, field);

    expect(ctx.dust.count()).toBeGreaterThan(0);
    const ringR = ctx.outerRadius * 0.72; // dustRing default
    const ringW = ctx.outerRadius * 0.12; // dustRingWidth default

    const pts = positions(ctx.dust.toFloat32Array());
    const meanR = pts.reduce((sum, p) => sum + Math.hypot(p.x, p.z), 0) / pts.length;
    expect(meanR).toBeGreaterThan(ringR - 2 * ringW);
    expect(meanR).toBeLessThan(ringR + 2 * ringW);
  });
});

describe('buildIrregularDust', () => {
  it('tracks its seeds', () => {
    const ctx = createGalaxyBuildContext({ type: 'Irr', seed: 1, dust: 1 });
    const field = createDustField(ctx);
    const seeds: DustSeed[] = [
      { x: 5, y: 0, z: 5, radius: Math.SQRT2 * 5, angle: Math.PI / 4, armFade: 1 },
      { x: -5, y: 1, z: -5, radius: Math.SQRT2 * 5, angle: -3 * (Math.PI / 4), armFade: 1 },
    ];
    buildIrregularDust(ctx, field, seeds);

    expect(ctx.dust.count()).toBeGreaterThan(0);
    // Gaussian spreads are outerRadius*0.03 (x/z) and diskHeight*0.6 (y); a
    // few sigma of either bound how far a particle can land from its seed.
    const maxSpread = Math.max(ctx.outerRadius * 0.03, ctx.diskHeight * 0.6) * 6 + 0.001;

    const pts = positions(ctx.dust.toFloat32Array());
    for (const p of pts) {
      const nearestSeed = seeds.some(
        (s) => Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) <= maxSpread,
      );
      expect(nearestSeed).toBe(true);
    }
  });

  it('is a no-op for an empty seed list', () => {
    const ctx = createGalaxyBuildContext({ type: 'Irr', seed: 1, dust: 1 });
    const field = createDustField(ctx);
    buildIrregularDust(ctx, field, []);
    expect(ctx.dust.count()).toBe(0);
  });
});
