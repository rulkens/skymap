/**
 * packAntiqueMaskDepth — `mask.wesl` turns depth into range as near / depth, so
 * the near plane must reach it in each globe's radii, metres or Mpc row alike; a
 * row whose depth is not infinite reversed-Z, or no row, must switch the test off
 * (0), or a whole globe reads as a nearer surface and loses its print. The
 * mask and the plate must agree on the code that marks one.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { packAntiqueMaskDepth } from '../../../../src/utils/gpu/antiqueLook/packAntiqueMaskDepth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

const row = (overrides: Partial<Slab>): Slab => ({
  index: 2,
  near: 50,
  far: 1e9,
  vp: new Float64Array(16),
  frame: { kind: 'body-m', hostId: asSceneBodyId('earth') },
  distanceRangeM: [10, 100],
  precision: 'f64',
  reversedZ: true,
  ...overrides,
});

const read = (bytes: ArrayBuffer) => [...new Float32Array(bytes)];

describe('packAntiqueMaskDepth', () => {
  it('writes the forward, then the near plane in each globe’s radii', () => {
    const out = read(packAntiqueMaskDepth(row({}), [6_371_000, 1_737_400], [0, 0, 1]));
    expect(out.slice(0, 3)).toEqual([0, 0, 1]);
    expect(out[4]).toBeCloseTo(50 / 6_371_000, 12);
    expect(out[5]).toBeCloseTo(50 / 1_737_400, 12);
    expect(out.slice(6)).toEqual([0, 0]);
  });

  it('reads a world-mpc row’s near plane in Mpc', () => {
    const out = read(
      packAntiqueMaskDepth(
        row({ near: 1e-15, frame: { kind: 'world-mpc', originRelative: true } }),
        [6_371_000],
        [1, 0, 0],
      ),
    );
    expect(out[4]).toBeCloseTo((1e-15 * SCALE_UNITS.MPC_TO_M) / 6_371_000, 5);
  });

  it('switches off without a reversed-Z row', () => {
    expect(read(packAntiqueMaskDepth(null, [6_371_000], [1, 0, 0])).slice(4)).toEqual([0, 0, 0, 0]);
    expect(
      read(packAntiqueMaskDepth(row({ reversedZ: false }), [6_371_000], [1, 0, 0])).slice(4),
    ).toEqual([0, 0, 0, 0]);
  });

  it('maskFragment.wesl and plateFragment.wesl share the nearer-surface code, under reduce’s 0.5', () => {
    const code = (file: string) =>
      Number(
        /const NEARER_SURFACE: f32 = ([\d.]+);/.exec(
          readFileSync(`src/services/gpu/shaders/antiqueLook/${file}`, 'utf8'),
        )?.[1],
      );
    expect(code('passes/plateFragment.wesl')).toBe(code('passes/maskFragment.wesl'));
    expect(code('passes/maskFragment.wesl')).toBeLessThan(0.5);
  });
});
