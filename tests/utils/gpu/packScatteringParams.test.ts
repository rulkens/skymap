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
 *   7 mieScaleHeightKm  8..10 groundAlbedo  11 miePhaseG  12..14 mieScatter
 *   15 mieAbsorption  16 ozoneCenterKm  17 ozoneWidthKm  18 planetRadiusKm
 *   19 atmosphereTopKm
 *
 * `mieScatter` is a `vec3<f32>` (per-channel — see `AtmosphereParams.d.ts`'s
 * header) whose offset (slot 12) already lands on a 16-byte boundary, so the
 * struct stays a dense 80 bytes / 20 f32 with no trailing pad.
 *
 * `twilightSoftness` is NOT packed here — it rides the per-frame `SkyViewParams`
 * so the Earth slider tunes it live — so it is grouped with the other row fields
 * this physics packer ignores.
 */

import { describe, it, expect } from 'vitest';
import {
  packScatteringParams,
  SCATTERING_PARAMS_FLOATS,
} from '../../../src/utils/gpu/packScatteringParams';
import type { AtmosphereParams } from '../../../src/@types/scene/AtmosphereParams';

// One distinct dyadic sentinel per field — k/16 for k = 1..19, all exactly
// float32-representable and pairwise distinct, so a swap or a mis-slotted field
// perturbs a slot this test pins.
const PARAMS: AtmosphereParams = {
  // Ignored by this packer until the constituent switch lands; present so the
  // fixture satisfies the row type.
  constituents: [],
  rayleighScatter: [1 / 16, 2 / 16, 3 / 16], // slots 0..2
  rayleighScaleHeightKm: 4 / 16, //             slot 3
  ozoneAbsorption: [5 / 16, 6 / 16, 7 / 16], //  slots 4..6
  mieScaleHeightKm: 8 / 16, //                   slot 7
  groundAlbedo: [9 / 16, 10 / 16, 11 / 16], //   slots 8..10
  miePhaseG: 12 / 16, //                         slot 11
  mieScatter: [13 / 16, 14 / 16, 15 / 16], //    slots 12..14
  mieAbsorption: 16 / 16, //                     slot 15
  ozoneCenterKm: 17 / 16, //                     slot 16
  ozoneWidthKm: 18 / 16, //                      slot 17
  planetRadiusKm: 19 / 16, //                    slot 18
  atmosphereTopKm: 20 / 16, //                   slot 19
  // Row fields NOT part of ScatteringParams — this physics packer ignores them,
  // so they occupy no slot and any value serves. `twilightSoftness` +
  // `twilightIntensity` ride the per-frame SkyViewParams; the two look dials ride
  // AtmosphereUniforms.
  twilightSoftness: 21 / 16,
  twilightIntensity: 22 / 16,
  sunIrradiance: 23 / 16,
  exposure: 24 / 16,
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
    // mieScatter vec3 @ 12 (16-byte aligned already; its tail slot 15 holds
    // mieAbsorption), then the ozone tent and the two radii.
    expect(rec[12]).toBe(PARAMS.mieScatter[0]);
    expect(rec[13]).toBe(PARAMS.mieScatter[1]);
    expect(rec[14]).toBe(PARAMS.mieScatter[2]);
    expect(rec[15]).toBe(PARAMS.mieAbsorption);
    expect(rec[16]).toBe(PARAMS.ozoneCenterKm);
    expect(rec[17]).toBe(PARAMS.ozoneWidthKm);
    expect(rec[18]).toBe(PARAMS.planetRadiusKm);
    expect(rec[19]).toBe(PARAMS.atmosphereTopKm);
  });
});
