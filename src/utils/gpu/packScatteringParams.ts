/**
 * packScatteringParams — pure packer for the 80-byte `ScatteringParams` uniform
 * struct (`shaders/atmosphere/scattering.wesl`).
 *
 * The atmosphere shell's three LUT bakes (transmittance, multi-scatter, sky-view)
 * all read one `ScatteringParams` uniform carrying the body's authored scattering
 * constants — Rayleigh/Mie/ozone coefficients, scale heights, phase asymmetry,
 * ground albedo, and the ground / atmosphere-top radii. This is the single source
 * of truth for that byte layout: the renderer packs through here so the CPU write
 * can never drift from the WGSL struct (a drift the GPU would not report; on iOS
 * it would drop the frame silently — the same trap every uniform packer guards).
 *
 * ## Dense vec3-tail packing (the `RingUniforms.planetRadiusRatio` trick)
 *
 * Each `vec3<f32>` is 16-byte aligned and its trailing 4-byte slot is filled by
 * the following scalar, so the struct is a dense 20-f32 write with no interior
 * gaps rather than a padded 24-f32 one. `mieScatter` is itself a `vec3<f32>`
 * (Mie is per-channel — see `AtmosphereParams.d.ts`'s header) whose own offset
 * (slot 12) already lands on a 16-byte boundary, so it needs no padding of its
 * own; its tail slot (15) is filled by `mieAbsorption`, which stays a scalar
 * (Mie absorption has no measured spectral dependence for any authored body).
 * The slot order below is fixed by the WESL `struct ScatteringParams` field
 * order (its twin — keep the two in lockstep):
 *
 *   f32 0..2   rayleighScatter        3   rayleighScaleHeightKm
 *   f32 4..6   ozoneAbsorption        7   mieScaleHeightKm
 *   f32 8..10  groundAlbedo          11   miePhaseG
 *   f32 12..14 mieScatter            15   mieAbsorption
 *   f32 16     ozoneCenterKm         17   ozoneWidthKm
 *   f32 18     planetRadiusKm        19   atmosphereTopKm
 *
 * That's a dense 80-byte / 20-f32 struct with no trailing pad: the four
 * scalars after `mieScatter`'s tail (ozone tent + the two radii) need no
 * further 16-byte alignment, so `SCATTERING_PARAMS_FLOATS` is unchanged.
 *
 * The twilight knob rides the per-frame `SkyViewParams` (`skyViewLut.wesl`), NOT
 * this construction-written buffer, so it stays live-tunable.
 *
 * @param params The body's authored `AtmosphereParams` row (`atmosphereParams.ts`).
 */

import type { AtmosphereParams } from '../../@types/scene/AtmosphereParams';

/** f32 count of `ScatteringParams` — 80 bytes / 20 f32 (see `scattering.wesl`). */
export const SCATTERING_PARAMS_FLOATS = 20;

export function packScatteringParams(params: AtmosphereParams): Float32Array {
  const out = new Float32Array(SCATTERING_PARAMS_FLOATS);
  out[0] = params.rayleighScatter[0];
  out[1] = params.rayleighScatter[1];
  out[2] = params.rayleighScatter[2];
  out[3] = params.rayleighScaleHeightKm;
  out[4] = params.ozoneAbsorption[0];
  out[5] = params.ozoneAbsorption[1];
  out[6] = params.ozoneAbsorption[2];
  out[7] = params.mieScaleHeightKm;
  out[8] = params.groundAlbedo[0];
  out[9] = params.groundAlbedo[1];
  out[10] = params.groundAlbedo[2];
  out[11] = params.miePhaseG;
  out[12] = params.mieScatter[0];
  out[13] = params.mieScatter[1];
  out[14] = params.mieScatter[2];
  out[15] = params.mieAbsorption;
  out[16] = params.ozoneCenterKm;
  out[17] = params.ozoneWidthKm;
  out[18] = params.planetRadiusKm;
  out[19] = params.atmosphereTopKm;
  // `twilightSoftness` is NOT packed here: it rides the per-frame
  // `SkyViewParams` so the Earth slider can tune it live.
  return out;
}
