/**
 * LensMode — which gravitational-lensing profile the points vertex stage
 * applies.
 *
 *   - `'sis'` — singular isothermal sphere: constant Einstein deflection,
 *     one tangential ring. Closed-form, one knob (θ_E).
 *   - `'nfw'` — Navarro–Frenk–White: deflection rises, peaks near the scale
 *     radius, then falls (g(x)/x). Adds an inner radial critical curve —
 *     the curvature SIS can't produce. Second knob: the scale radius r_s.
 *
 * The shader maps these to a u32 (`0 = sis`, `1 = nfw`) in the points
 * uniform buffer. String at the settings layer (legible in the store /
 * DebugPanel), numeric only at the GPU boundary.
 */
export type LensMode = 'sis' | 'nfw';
