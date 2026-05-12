/**
 * BiasMode — runtime selector for Malmquist-bias correction.
 *
 * ---
 * ### What is the Malmquist bias?
 *
 * Astronomers call the "we see brighter galaxies further away" effect the
 * Malmquist bias.  At a fixed flux limit (the survey's faint cut-off), only
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
 *                           the same maximum distance.  Implemented in
 *                           Task 2.
 *   - `VMax` (2):           weight each surviving galaxy by 1/V_max so
 *                           denser local structure isn't double-counted.
 *                           Reserved for Task 3.
 *   - `Schechter` (3):      reweight by the expected Schechter luminosity
 *                           function so the rendered density tracks the
 *                           predicted galaxy density.  Reserved for Task 4.
 *   - `AngularReweight` (4): per-survey HEALPix angular re-weighting.
 *                           Bins each cloud's galaxies into (HEALPix cell,
 *                           log-distance shell) pairs and modulates alpha
 *                           by the ratio of median-cell density to local
 *                           density — flattens the pencil-beam-like
 *                           "jets" GLADE shows from non-uniform parent-
 *                           catalogue coverage.  Per-cloud, never global,
 *                           so SDSS's footprint can't contaminate GLADE's
 *                           correction.  Implemented in Task 8 of the
 *                           malmquist-bias plan as a per-vertex baked
 *                           weight (lazy, mirrors the Schechter pattern).
 *
 * ---
 * ### Why a numeric `as const` object instead of a TS `enum`?
 *
 * The skymap codebase prefers `type` aliases over `interface` / `enum` (see
 * CLAUDE.md).  A `const` object frozen with `as const` plus a derived type
 * gives us the best of both worlds:
 *
 *   - `BiasMode.VolumeLimited` is a literal `1` at the value level — usable
 *     directly as the uniform value sent to the shader.
 *   - `BiasMode` as a *type* is the union `0 | 1 | 2 | 3`, so any function
 *     parameter typed `BiasMode` only accepts the four legal values.
 *
 * (Same pattern is used for `LodMode` further up in the @types tree, except
 * that one is a string-literal union — a numeric union makes more sense
 * here because the values are sent verbatim to the GPU and string→number
 * conversion would be wasted work.)
 *
 * ---
 * ### Why the values must match the WGSL shader
 *
 * The `points.wgsl` vertex stage compares `u.biasMode` against literal
 * `1u`/`2u`/`3u` to choose its discard / weighting branch.  Renumbering
 * this enum without updating the shader would silently break the mode
 * selector.  Treat these integers as part of the GPU contract.
 */
export const BiasMode = {
  None: 0,
  VolumeLimited: 1,
  VMax: 2,
  Schechter: 3,
  AngularReweight: 4,
} as const;

// Type lives in @types/data/BiasMode (inlined literal union for value-free .d.ts);
// consumers deep-import the type directly from there.  The runtime const above
// stays as the value-level export.
