/**
 * PhaseFunction — the angular distribution a constituent scatters into.
 *
 * `rayleigh` is the parameter-free molecular form; `henyeyGreenstein` is the
 * single-lobe aerosol approximation whose `g` sets how forward-peaked it is
 * (Earth's haze ≈ 0.8). A per-channel RGB `g` is for a lobe that narrows with
 * wavelength (Mars dust); a scalar is the same g in all three. A purely absorbing
 * constituent still carries a phase tag, but its `scatter` is the zero vector.
 */

import type { Vec3 } from '../math/Vec3';

export type PhaseFunction =
  | { readonly kind: 'rayleigh' }
  | { readonly kind: 'henyeyGreenstein'; readonly g: number | Vec3 };
