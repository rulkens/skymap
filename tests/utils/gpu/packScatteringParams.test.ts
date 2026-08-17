/**
 * ScatteringParams byte-layout guard.
 *
 * The WGSL `struct ScatteringParams` in `shaders/atmosphere/scattering.wesl` and
 * the CPU-side `packScatteringParams` must agree byte-for-byte: a mismatch
 * produces no GPU error, just a wrong (or, on iOS, silently dropped) frame.
 *
 * Every field gets a distinct dyadic sentinel (k/16 — exactly float32-
 * representable, so `toBe` stays exact; pairwise distinct, so a swapped pair is
 * caught). The two constituents differ in BOTH tags, which is what pins the
 * `u32` tag words: a packer writing them as floats, or into the wrong word,
 * fails here rather than on someone's screen.
 */

import { describe, it, expect } from 'vitest';
import {
  packScatteringParams,
  SCATTERING_PARAMS_BYTES,
  MAX_CONSTITUENTS,
} from '../../../src/utils/gpu/packScatteringParams';
import type { AtmosphereParams } from '../../../src/@types/scene/AtmosphereParams';
import type { AtmosphereConstituent } from '../../../src/@types/scene/AtmosphereConstituent';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Exponential profile + Henyey-Greenstein phase — tags (0, 1).
const AEROSOL = {
  scatter: [6 / 16, 7 / 16, 8 / 16] as Vec3,
  absorb: [9 / 16, 10 / 16, 11 / 16] as Vec3,
  profile: { kind: 'exponential', scaleHeightKm: 12 / 16 },
  phase: { kind: 'henyeyGreenstein', g: 13 / 16 },
} satisfies AtmosphereConstituent;

// Tent profile + Rayleigh phase — tags (1, 0), the opposite corner.
const LAYER = {
  scatter: [14 / 16, 15 / 16, 16 / 16] as Vec3,
  absorb: [17 / 16, 18 / 16, 19 / 16] as Vec3,
  profile: { kind: 'tent', centerKm: 20 / 16, widthKm: 21 / 16 },
  phase: { kind: 'rayleigh' },
} satisfies AtmosphereConstituent;

// Only the four fields the packer reads — the look dials and the twilight knobs
// ride other buffers, and the narrowed parameter type says so.
const PARAMS = {
  planetRadiusKm: 1 / 16,
  atmosphereTopKm: 2 / 16,
  groundAlbedo: [3 / 16, 4 / 16, 5 / 16] as Vec3,
  constituents: [AEROSOL, LAYER],
} satisfies Pick<
  AtmosphereParams,
  'planetRadiusKm' | 'atmosphereTopKm' | 'groundAlbedo' | 'constituents'
>;

describe('ScatteringParams byte offsets', () => {
  it('packs a 224-byte record in the WESL struct field order', () => {
    const buf = packScatteringParams(PARAMS);
    expect(buf.byteLength).toBe(SCATTERING_PARAMS_BYTES);
    expect(buf.byteLength).toBe(224);

    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);

    // Header: groundAlbedo vec3 @ 0, its tail slot 3 filled by planetRadiusKm.
    expect(f[0]).toBe(PARAMS.groundAlbedo[0]);
    expect(f[1]).toBe(PARAMS.groundAlbedo[1]);
    expect(f[2]).toBe(PARAMS.groundAlbedo[2]);
    expect(f[3]).toBe(PARAMS.planetRadiusKm);
    expect(f[4]).toBe(PARAMS.atmosphereTopKm);
    expect(u[5]).toBe(2); // constituentCount

    // Constituent 0 at byte 32 (f32 slot 8); stride 48 B = 12 f32.
    expect(f[8]).toBe(AEROSOL.scatter[0]);
    expect(f[9]).toBe(AEROSOL.scatter[1]);
    expect(f[10]).toBe(AEROSOL.scatter[2]);
    expect(f[11]).toBe(AEROSOL.phase.g);
    expect(f[12]).toBe(AEROSOL.absorb[0]);
    expect(f[13]).toBe(AEROSOL.absorb[1]);
    expect(f[14]).toBe(AEROSOL.absorb[2]);
    expect(f[15]).toBe(AEROSOL.profile.scaleHeightKm);
    expect(f[16]).toBe(0); // centerKm — an exponential profile has none
    expect(f[17]).toBe(0); // widthKm
    expect(u[18]).toBe(0); // profileKind: exponential
    expect(u[19]).toBe(1); // phaseKind: henyeyGreenstein

    // Constituent 1 at byte 80 (f32 slot 20).
    expect(f[20]).toBe(LAYER.scatter[0]);
    expect(f[21]).toBe(LAYER.scatter[1]);
    expect(f[22]).toBe(LAYER.scatter[2]);
    expect(f[23]).toBe(0); // phaseG — the Rayleigh phase takes no parameter
    expect(f[24]).toBe(LAYER.absorb[0]);
    expect(f[25]).toBe(LAYER.absorb[1]);
    expect(f[26]).toBe(LAYER.absorb[2]);
    // A tent packs a FINITE scale height it never reads — see the packer header.
    expect(f[27]).toBe(1);
    expect(f[28]).toBe(LAYER.profile.centerKm);
    expect(f[29]).toBe(LAYER.profile.widthKm);
    expect(u[30]).toBe(1); // profileKind: tent
    expect(u[31]).toBe(0); // phaseKind: rayleigh

    // Unused slots stay zero — the shader loop bounds on constituentCount and
    // never reads them, but a non-zero here would mean a stride error.
    for (let i = 32; i < SCATTERING_PARAMS_BYTES / 4; i++) {
      expect(f[i]).toBe(0);
    }
  });

  it('rejects a row carrying more constituents than the uniform holds', () => {
    const tooMany = {
      ...PARAMS,
      constituents: Array.from({ length: MAX_CONSTITUENTS + 1 }, () => LAYER),
    };
    expect(() => packScatteringParams(tooMany)).toThrow(/MAX_CONSTITUENTS/);
  });
});
