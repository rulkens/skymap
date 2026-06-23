/**
 * packLensingUniforms — byte-layout guard tests.
 *
 * Every written offset is asserted against a known fixture so a layout drift
 * (reordering the header scalars, changing the vec4 base, forgetting a write)
 * fails loudly here rather than silently producing a bad frame.
 *
 * The function is a pure ArrayBuffer packer: no GPU device, no WebGPU
 * globals needed.
 */

import { describe, it, expect } from 'vitest';
import {
  packLensingUniforms,
  LENSING_UNIFORM_BYTES,
  MAX_LENSES,
} from '../../../src/utils/gpu/packLensingUniforms';
import type { LensingUniformsValue } from '../../../src/@types/rendering/LensingUniformsValue';

// ─── Fixture ──────────────────────────────────────────────────────────────────

// Two lenses with distinct, recognisable values so a mis-placed write shows
// up in the byte-offset assertions below.
const VALUE: LensingUniformsValue = {
  enabled: true,
  lenses: [
    { center: [11, 22, 33], thetaERad: 0.05 },
    { center: [44, 55, 66], thetaERad: 0.08 },
  ],
  mode: 'nfw',
  scaleRadiusMpc: 0.7,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('packLensingUniforms — byteLength', () => {
  it('returns a buffer of exactly LENSING_UNIFORM_BYTES (272 at MAX_LENSES=16)', () => {
    const buf = packLensingUniforms(VALUE);
    expect(buf.byteLength).toBe(LENSING_UNIFORM_BYTES);
    expect(buf.byteLength).toBe(272);
  });
});

describe('packLensingUniforms — header (bytes 0..15)', () => {
  it('writes enabled as 1 at byte 0 (u32 index 0)', () => {
    const buf = packLensingUniforms(VALUE);
    const u32 = new Uint32Array(buf);
    expect(u32[0]).toBe(1);
  });

  it('writes enabled as 0 when disabled', () => {
    const buf = packLensingUniforms({ ...VALUE, enabled: false });
    const u32 = new Uint32Array(buf);
    expect(u32[0]).toBe(0);
  });

  it('writes count at byte 4 (u32 index 1)', () => {
    const buf = packLensingUniforms(VALUE);
    const u32 = new Uint32Array(buf);
    expect(u32[1]).toBe(2); // two lenses in the fixture
  });

  it('writes mode at byte 8 (u32 index 2) — 1 for NFW', () => {
    const buf = packLensingUniforms(VALUE);
    const u32 = new Uint32Array(buf);
    expect(u32[2]).toBe(1);
  });

  it('writes mode as 0 for SIS', () => {
    const buf = packLensingUniforms({ ...VALUE, mode: 'sis' });
    const u32 = new Uint32Array(buf);
    expect(u32[2]).toBe(0);
  });

  it('writes scaleRadius at byte 12 (float index 3)', () => {
    const buf = packLensingUniforms(VALUE);
    const f32 = new Float32Array(buf);
    expect(f32[3]).toBeCloseTo(0.7);
  });
});

describe('packLensingUniforms — lens array (bytes 16..)', () => {
  it('packs lens[0] as a vec4 (centre.xyz, thetaE) at float indices 4..7', () => {
    const buf = packLensingUniforms(VALUE);
    const f32 = new Float32Array(buf);
    expect(f32[4]).toBe(11);
    expect(f32[5]).toBe(22);
    expect(f32[6]).toBe(33);
    expect(f32[7]).toBeCloseTo(0.05);
  });

  it('packs lens[1] as a vec4 at float indices 8..11', () => {
    const buf = packLensingUniforms(VALUE);
    const f32 = new Float32Array(buf);
    expect(f32[8]).toBe(44);
    expect(f32[9]).toBe(55);
    expect(f32[10]).toBe(66);
    expect(f32[11]).toBeCloseTo(0.08);
  });

  it('leaves unused lens slots (float index 12+) as zero', () => {
    const buf = packLensingUniforms(VALUE);
    const f32 = new Float32Array(buf);
    for (let i = 12; i < LENSING_UNIFORM_BYTES / 4; i++) {
      expect(f32[i]).toBe(0);
    }
  });
});

describe('packLensingUniforms — count cap', () => {
  it('caps count at MAX_LENSES even when handed more lenses', () => {
    const many = Array.from({ length: MAX_LENSES + 4 }, () => ({
      center: [1, 2, 3] as const,
      thetaERad: 0.01,
    }));
    const buf = packLensingUniforms({ ...VALUE, lenses: many });
    const u32 = new Uint32Array(buf);
    expect(u32[1]).toBe(MAX_LENSES);
  });
});
