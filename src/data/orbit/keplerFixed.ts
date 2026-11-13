/** The fixed-step Kepler solver's tuning, mirrored by hand in `shaders/lib/kepler.wesl` and pinned by its parity test. */
export const KEPLER_FIXED = {
  steps: 5,
  /** |ΔE| clamp per Halley step, rad. */
  maxStep: 1,
  /** Danby's start factor: E₀ = M + danbyStart·e·sign(M). */
  danbyStart: 0.85,
} as const;
