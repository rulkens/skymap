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
 * gaps rather than a padded 24-f32 one. The slot order below is fixed by the WESL
 * `struct ScatteringParams` field order (its twin — keep the two in lockstep):
 *
 *   f32 0..2  rayleighScatter        3   rayleighScaleHeightKm
 *   f32 4..6  ozoneAbsorption        7   mieScaleHeightKm
 *   f32 8..10 groundAlbedo          11   miePhaseG
 *   f32 12    mieScatter            13   mieAbsorption
 *   f32 14    ozoneCenterKm         15   ozoneWidthKm
 *   f32 16    planetRadiusKm        17   atmosphereTopKm
 *   f32 18    _pad0 (zero)          19   _pad1 (zero, rounds to 80 / 16-byte alignment)
 *
 * The twilight knob rides the per-frame `SkyViewParams` (`skyViewLut.wesl`), NOT
 * this construction-written buffer, so it stays live-tunable; both tail slots
 * here are inert pad again.
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
  out[12] = params.mieScatter;
  out[13] = params.mieAbsorption;
  out[14] = params.ozoneCenterKm;
  out[15] = params.ozoneWidthKm;
  out[16] = params.planetRadiusKm;
  out[17] = params.atmosphereTopKm;
  // out[18] / out[19] stay zero — the two pads rounding the struct to 80 /
  // 16-byte alignment. `twilightSoftness` is NOT packed here: it rides the
  // per-frame `SkyViewParams` so the Earth slider can tune it live.
  return out;
}
