/**
 * BiasMode — runtime selector for Malmquist-bias correction.
 *
 * ---
 * ### What is the Malmquist bias?
 *
 * Astronomers call the "we see brighter galaxies further away" effect the
 * Malmquist bias.  At a fixed flux limit (the galaxy catalog's faint cut-off), only
 * the intrinsically luminous galaxies in the back of the volume make it into
 * the catalog — so any naive count-as-density rendering overweights nearby
 * faint galaxies and undercounts the volume in a way that distorts the
 * apparent shape of large-scale structure.
 *
 * ---
 * ### Mode summary
 *
 *   - `None` (0):           no correction, render every galaxy.
 *   - `VolumeLimited` (1):  vertex stage discards any galaxy whose absolute
 *                           magnitude is fainter (numerically larger) than
 *                           `absMagLimit` — produces a "complete sample"
 *                           sub-set that all reach the same flux limit at
 *                           the same maximum distance.
 *   - `VMax` (2):           weight each surviving galaxy by 1/V_max so
 *                           denser local structure isn't double-counted.
 *   - `Schechter` (3):      reweight by the expected Schechter luminosity
 *                           function so the rendered density tracks the
 *                           predicted galaxy density.
 *   - `AngularReweight` (4): per-galaxy-catalog HEALPix angular re-weighting.
 *                           Bins each cloud's galaxies into (HEALPix cell,
 *                           log-distance shell) pairs and modulates alpha
 *                           by the ratio of median-cell density to local
 *                           density — flattens the pencil-beam-like
 *                           "jets" GLADE shows from non-uniform parent-
 *                           catalogue coverage.
 *
 * ---
 * ### Why a literal numeric union (not `typeof BiasMode[keyof typeof BiasMode]`)
 *
 * The runtime constant `BiasMode` (an `as const` object) lives in
 * `src/data/biasMode.ts`.  Deriving the type from `typeof BiasMode` there
 * would force this `.d.ts` to `import type { BiasMode as BiasModeRuntime }`,
 * which couples the type's location to a value module — fine for a `.ts`
 * file, but a `.d.ts` is supposed to be value-free.  Inlining the literal
 * union keeps the declaration self-contained; the values 0..4 are part of
 * the GPU contract (the WGSL shader compares against `1u`/`2u`/`3u`/`4u`)
 * and won't change without a coordinated shader update either way.
 */

/** Literal union mirroring the runtime `BiasMode` const object in `src/data/biasMode.ts`. */
export type BiasMode = 0 | 1 | 2 | 3 | 4;
