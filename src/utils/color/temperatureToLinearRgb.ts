/**
 * temperatureToLinearRgb — map a stellar effective temperature (Kelvin)
 * to a LINEAR RGB tint along the Planckian (blackbody) locus.
 *
 * ## Why the blackbody locus
 *
 * A star radiates very nearly as a blackbody, so its *hue* is fixed by
 * one number: its effective temperature. Hot O/B stars (~30000 K) sit at
 * the blue end of the locus, the Sun (~5772 K) near white, and cool M
 * dwarfs (~3000 K) at the red end. Encoding that curve here lets the star
 * maker paint each body from its temperature alone — the same mapping the
 * eye makes when it calls Rigel blue and Betelgeuse red. We keep the
 * *chromaticity* only; the star's brightness (absMag → radiance) is scaled
 * elsewhere, so this function normalises the brightest channel to 1.0 and
 * returns a pure tint.
 *
 * ## Why LINEAR RGB (not sRGB)
 *
 * The renderer composites stars in an HDR pass that works in linear light
 * — additive glow, tone-mapping, and bloom all assume linear radiance.
 * `StarBody.color` is consumed in that space, so the classic
 * temperature→sRGB fits (which target a gamma-encoded 8-bit display) would
 * come out too dark and desaturated once the pipeline linearises them a
 * second time. We run the sRGB fit, then apply the sRGB→linear transfer
 * function so the value we hand back is already in the space the shaders
 * expect.
 *
 * ## Approach
 *
 * Tanner Helland's widely-used piecewise polynomial fit to the Planckian
 * locus (valid ~1000–40000 K), which approximates the CIE-derived curve
 * with cheap `log`/`pow` terms. See
 * http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code/
 * The fit yields 0–255 sRGB channels; we scale to [0,1], undo sRGB gamma,
 * then max-normalise.
 *
 * ## Future reuse (spec §6)
 *
 * This is a leaf util rather than inlined in the star maker because the
 * Gaia catalog carries `teff_gspphot` per source — the same function will
 * tint the survey-scale star point cloud straight from that column.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** Undo the sRGB gamma transfer for one [0,1] channel → linear light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Effective temperature in Kelvin → linear RGB tint, brightest channel
 * pinned to 1.0. Temperatures outside ~1000–40000 K are clamped into the
 * range the polynomial fit was tuned for.
 */
export function temperatureToLinearRgb(kelvin: number): Vec3 {
  // The Helland fit is parameterised in hundreds of Kelvin.
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;

  // --- Red (sRGB 0–255) ---
  let r: number;
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  // --- Green (sRGB 0–255) ---
  let g: number;
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  // --- Blue (sRGB 0–255) ---
  let b: number;
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  // Clamp to the display range, normalise to [0,1], then linearise.
  const clamp = (c: number) => Math.min(255, Math.max(0, c)) / 255;
  const lin: Vec3 = [srgbToLinear(clamp(r)), srgbToLinear(clamp(g)), srgbToLinear(clamp(b))];

  // Pin the brightest channel to 1.0 so this is a pure tint; the star's
  // absolute brightness is applied downstream, not here.
  const max = Math.max(lin[0], lin[1], lin[2]);
  if (max > 0) {
    lin[0] /= max;
    lin[1] /= max;
    lin[2] /= max;
  }
  return lin;
}
