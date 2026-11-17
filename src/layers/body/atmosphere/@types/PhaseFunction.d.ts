/**
 * PhaseFunction — the angular distribution a constituent scatters into.
 *
 * `rayleigh` is the parameter-free molecular form; `henyeyGreenstein` is the
 * single-lobe aerosol approximation whose `g` sets how forward-peaked it is
 * (Earth's haze ≈ 0.8). A purely absorbing constituent still carries a phase tag,
 * but it never evaluates to anything but zero — its `scatter` is the zero vector.
 */

export type PhaseFunction =
  | { readonly kind: 'rayleigh' }
  | { readonly kind: 'henyeyGreenstein'; readonly g: number };
