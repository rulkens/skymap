/**
 * packLensingUniforms — byte-layout guard tests for the two-vec4 (528-byte)
 * lens stride. Every written offset is asserted against a known fixture so a
 * layout drift fails loudly here rather than silently producing a bad frame.
 */

import { describe, it, expect } from 'vitest';
import {
  packLensingUniforms,
  LENSING_UNIFORM_BYTES,
  MAX_LENSES,
} from '../../../src/utils/gpu/packLensingUniforms';
import type { LensingUniformsValue } from '../../../src/@types/rendering/LensingUniformsValue';

const VALUE: LensingUniformsValue = {
  enabled: true,
  lenses: [
    { dirLens: [1, 0, 0], dL: 10, thetaERad: 0.05, rsMpc: 0.4 },
    { dirLens: [0, 1, 0], dL: 20, thetaERad: 0.08, rsMpc: 0.6 },
  ],
  mode: 'nfw',
};

describe('packLensingUniforms — byteLength', () => {
  it('returns a buffer of exactly LENSING_UNIFORM_BYTES (528 at MAX_LENSES=16)', () => {
    const buf = packLensingUniforms(VALUE);
    expect(buf.byteLength).toBe(LENSING_UNIFORM_BYTES);
    expect(buf.byteLength).toBe(528);
  });
});

describe('packLensingUniforms — header (bytes 0..15)', () => {
  it('writes enabled as 1 at byte 0 (u32 index 0)', () => {
    const u32 = new Uint32Array(packLensingUniforms(VALUE));
    expect(u32[0]).toBe(1);
  });

  it('writes enabled as 0 when disabled', () => {
    const u32 = new Uint32Array(packLensingUniforms({ ...VALUE, enabled: false }));
    expect(u32[0]).toBe(0);
  });

  it('writes count at byte 4 (u32 index 1)', () => {
    const u32 = new Uint32Array(packLensingUniforms(VALUE));
    expect(u32[1]).toBe(2);
  });

  it('writes mode at byte 8 (u32 index 2) — 1 for NFW', () => {
    const u32 = new Uint32Array(packLensingUniforms(VALUE));
    expect(u32[2]).toBe(1);
  });

  it('writes mode as 0 for SIS', () => {
    const u32 = new Uint32Array(packLensingUniforms({ ...VALUE, mode: 'sis' }));
    expect(u32[2]).toBe(0);
  });

  it('leaves the retired scaleRadius word (byte 12, float index 3) zero', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    expect(f32[3]).toBe(0);
  });
});

describe('packLensingUniforms — lens array (two vec4 per lens, bytes 16..)', () => {
  it('packs lens[0] geom (dirLens+dL) at float indices 4..7 and params (thetaE,r_s) at 8..9', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    expect(f32[4]).toBe(1); // dirLens.x
    expect(f32[5]).toBe(0); // dirLens.y
    expect(f32[6]).toBe(0); // dirLens.z
    expect(f32[7]).toBe(10); // dL
    expect(f32[8]).toBeCloseTo(0.05); // thetaERad
    expect(f32[9]).toBeCloseTo(0.4); // r_s
    expect(f32[10]).toBe(0); // reserved
    expect(f32[11]).toBe(0);
  });

  it('packs lens[1] geom (dirLens+dL) at float indices 12..15 and params (thetaE,r_s) at 16..17', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    expect(f32[12]).toBe(0); // dirLens.x
    expect(f32[13]).toBe(1); // dirLens.y
    expect(f32[14]).toBe(0); // dirLens.z
    expect(f32[15]).toBe(20); // dL
    expect(f32[16]).toBeCloseTo(0.08); // thetaERad
    expect(f32[17]).toBeCloseTo(0.6); // r_s
  });

  it('leaves unused lens slots (float index 20+) zero', () => {
    const f32 = new Float32Array(packLensingUniforms(VALUE));
    for (let i = 20; i < LENSING_UNIFORM_BYTES / 4; i++) {
      expect(f32[i]).toBe(0);
    }
  });
});

describe('packLensingUniforms — count cap', () => {
  it('caps count at MAX_LENSES even when handed more lenses', () => {
    const many = Array.from({ length: MAX_LENSES + 4 }, () => ({
      dirLens: [1, 0, 0] as const,
      dL: 10,
      thetaERad: 0.01,
      rsMpc: 0.5,
    }));
    const u32 = new Uint32Array(packLensingUniforms({ ...VALUE, lenses: many }));
    expect(u32[1]).toBe(MAX_LENSES);
  });
});
