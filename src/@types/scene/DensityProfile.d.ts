/**
 * DensityProfile — how a constituent's density falls off with altitude.
 *
 * `exponential` is the well-mixed / scale-height case (molecules, most aerosol);
 * `tent` is a discrete layer at an altitude (Earth's ozone, a detached haze).
 * Density is normalised to 1 at the ground, so a constituent's `scatter`/`absorb`
 * are its coefficients THERE, not column integrals.
 */

export type DensityProfile =
  | { readonly kind: 'exponential'; readonly scaleHeightKm: number }
  | { readonly kind: 'tent'; readonly centerKm: number; readonly widthKm: number };
