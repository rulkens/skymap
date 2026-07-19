/**
 * ScatteringParams byte-layout guard.
 *
 * The WGSL `struct ScatteringParams` in `shaders/atmosphere/scattering.wesl` and
 * the CPU-side `packScatteringParams` must agree byte-for-byte: a mismatch
 * produces no GPU error, just a wrong (or, on iOS, silently dropped) frame. This
 * is the `testing.md` keep-rule for uniform layouts — it fails on a real drift no
 * compiler check catches. It was the only atmosphere byte mirror WITHOUT a parity
 * test before this file (the extraction from `atmosphereShellRenderer.ts`).
 *
 * The test drives the real packer with a distinct dyadic sentinel in every field
 * (no two equal, so a swapped pair of fields is caught; dyadic ⇒ exactly float32-
 * representable so `toBe` stays exact) and pins every returned slot index against
 * the WESL struct field order:
 *
 *   0..2 rayleighScatter  3 rayleighScaleHeightKm  4..6 ozoneAbsorption
 *   7 mieScaleHeightKm  8..10 groundAlbedo  11 miePhaseG  12 mieScatter
 *   13 mieAbsorption  14 ozoneCenterKm  15 ozoneWidthKm  16 planetRadiusKm
 *   17 atmosphereTopKm  18/19 pad
 */

import { describe, it, expect } from 'vitest';
import {
  packScatteringParams,
  SCATTERING_PARAMS_FLOATS,
} from '../../../src/utils/gpu/packScatteringParams';
import type { AtmosphereParams } from '../../../src/@types/scene/AtmosphereParams';

// One distinct dyadic sentinel per field — k/16 for k = 1..18, all exactly
// float32-representable and pairwise distinct, so a swap or a mis-slotted field
// perturbs a slot this test pins.
const PARAMS: AtmosphereParams = {
  rayleighScatter: [1 / 16, 2 / 16, 3 / 16], // slots 0..2
  rayleighScaleHeightKm: 4 / 16, //             slot 3
  ozoneAbsorption: [5 / 16, 6 / 16, 7 / 16], //  slots 4..6
  mieScaleHeightKm: 8 / 16, //                   slot 7
  groundAlbedo: [9 / 16, 10 / 16, 11 / 16], //   slots 8..10
  miePhaseG: 12 / 16, //                         slot 11
  mieScatter: 13 / 16, //                        slot 12
  mieAbsorption: 14 / 16, //                     slot 13
  ozoneCenterKm: 15 / 16, //                     slot 14
  ozoneWidthKm: 16 / 16, //                      slot 15
  planetRadiusKm: 17 / 16, //                    slot 16
  atmosphereTopKm: 18 / 16, //                   slot 17
  // Look dials on the row but NOT part of ScatteringParams — this physics packer
  // ignores them, so they occupy no slot and any value serves.
  sunIrradiance: 19 / 16,
  exposure: 20 / 16,
};

describe('ScatteringParams byte offsets', () => {
  it('packs an 80-byte / 20-f32 record in the WESL struct field order', () => {
    const rec = packScatteringParams(PARAMS);
    expect(rec.length).toBe(SCATTERING_PARAMS_FLOATS);
    expect(rec.length).toBe(20); // 80 bytes
    expect(rec.byteLength).toBe(80);

    // rayleighScatter vec3 @ 0 (its tail slot 3 holds the next scalar).
    expect(rec[0]).toBe(PARAMS.rayleighScatter[0]);
    expect(rec[1]).toBe(PARAMS.rayleighScatter[1]);
    expect(rec[2]).toBe(PARAMS.rayleighScatter[2]);
    expect(rec[3]).toBe(PARAMS.rayleighScaleHeightKm);
    // ozoneAbsorption vec3 @ 4, mieScaleHeightKm in its tail.
    expect(rec[4]).toBe(PARAMS.ozoneAbsorption[0]);
    expect(rec[5]).toBe(PARAMS.ozoneAbsorption[1]);
    expect(rec[6]).toBe(PARAMS.ozoneAbsorption[2]);
    expect(rec[7]).toBe(PARAMS.mieScaleHeightKm);
    // groundAlbedo vec3 @ 8, miePhaseG in its tail.
    expect(rec[8]).toBe(PARAMS.groundAlbedo[0]);
    expect(rec[9]).toBe(PARAMS.groundAlbedo[1]);
    expect(rec[10]).toBe(PARAMS.groundAlbedo[2]);
    expect(rec[11]).toBe(PARAMS.miePhaseG);
    // Scalar tail: the two Mie scatter/absorb, the ozone tent, the two radii.
    expect(rec[12]).toBe(PARAMS.mieScatter);
    expect(rec[13]).toBe(PARAMS.mieAbsorption);
    expect(rec[14]).toBe(PARAMS.ozoneCenterKm);
    expect(rec[15]).toBe(PARAMS.ozoneWidthKm);
    expect(rec[16]).toBe(PARAMS.planetRadiusKm);
    expect(rec[17]).toBe(PARAMS.atmosphereTopKm);

    // Trailing pads zeroed — round the struct to 80 / 16-byte alignment.
    expect(rec[18]).toBe(0);
    expect(rec[19]).toBe(0);
  });
});
