/**
 * The IAU H,G phase law (Bowell et al. 1989): Φᵢ = exp(−Aᵢ·tan(α/2)^Bᵢ). Mirrored by hand into
 * `shaders/asteroids/lib/apparentMagnitude.wesl`; a parity test keeps the two equal.
 * The guards keep V finite where the law is not: α = 180° divides by zero, WGSL's pow(0, y) is
 * undefined, and a G above 1 (the format holds up to 2.05) drives (1−G)·Φ₁ + G·Φ₂ negative at large α.
 */
export const HG_PHASE_LAW = {
  a1: 3.33,
  a2: 1.87,
  b1: 0.63,
  b2: 1.22,
  cosPhaseMin: -0.9999,
  halfTanFloor: 1e-12,
  phaseSumFloor: 1e-30,
} as const;
