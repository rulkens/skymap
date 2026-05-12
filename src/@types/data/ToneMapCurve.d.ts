/**
 * ToneMapCurve — selectable tone-mapping curves for the HDR post-process.
 *
 * Mirrors the pattern of the `Source` enum and `BiasMode`: the runtime
 * `const` object in `src/data/toneMapCurve.ts` carries the value-level
 * literals (0..4) that land verbatim in the shader's `curve: u32`
 * uniform.  The numeric values are part of the GPU contract — DON'T
 * renumber without also updating `toneMap.wgsl`.
 *
 * Curves:
 *   - 0 Linear / Clamp — no tone mapping; pre-HDR baseline.
 *   - 1 Reinhard-extended — smooth, "natural" highlight roll-off.
 *   - 2 Asinh stretch — Lupton-style, lifts dim filamentary structure.
 *   - 3 Gamma 2.0 — simple sqrt-style midtone lift.
 *   - 4 ACES filmic (Narkowicz approx) — cinematic S-curve.
 *
 * ### Why a literal numeric union (not `typeof ToneMapCurve[keyof typeof
 * ToneMapCurve]`)
 *
 * The runtime constant `ToneMapCurve` (an `as const` object) lives in
 * `src/data/toneMapCurve.ts`.  Deriving the type from `typeof
 * ToneMapCurve` here would force this `.d.ts` to import the value
 * module, which a `.d.ts` is supposed to avoid.  Inlining 0..4 keeps
 * the declaration self-contained; the values are part of the GPU
 * contract and won't change without a coordinated shader update.
 */

/** Literal union mirroring the runtime `ToneMapCurve` const object in `src/data/toneMapCurve.ts`. */
export type ToneMapCurve = 0 | 1 | 2 | 3 | 4;
