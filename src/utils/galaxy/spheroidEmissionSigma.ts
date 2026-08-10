/**
 * spheroidEmissionSigma — per-axis Gaussian sigma matching the
 * emission-weighted second moment of `generate.wesl`'s spheroid draws
 * (`buildBulge`, `buildHalo`): radius = scale * pow(-log(1 - u*uClamp),
 * exponent), rejected past maxRadius, weighted by exp(-radius/falloffLength).
 *
 * Quadrature, not closed form: the falloff weight moves with the
 * `bulgeFalloff` knob and roughly halves the RMS radius, so a moment
 * computed without it is wrong by a preset-dependent factor.
 */

/** Enough for a smooth, cheap integral of a monotone weight — this runs once per regeneration. */
const SAMPLES = 1024;

export function spheroidEmissionSigma(spec: {
  readonly scale: number;
  readonly exponent: number;
  readonly uClamp: number;
  readonly maxRadius: number;
  readonly falloffLength: number;
}): number {
  let weight = 0;
  let secondMoment = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const u = (i + 0.5) / SAMPLES;
    const radius = spec.scale * Math.pow(-Math.log(1 - u * spec.uClamp), spec.exponent);
    if (radius > spec.maxRadius) continue;
    const emission = Math.exp(-radius / spec.falloffLength);
    weight += emission;
    secondMoment += emission * radius * radius;
  }
  if (weight <= 0) return 0;
  // The draw is isotropic in 3D, so E[r^2] splits evenly over the three axes.
  return Math.sqrt(secondMoment / weight / 3);
}
