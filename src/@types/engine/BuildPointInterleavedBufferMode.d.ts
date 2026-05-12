/**
 * BuildPointInterleavedBufferMode — selector for the bake's
 * Schechter-ratio strategy.
 *
 *   - `'fast'` — slot 10 (per-vertex `schechterRatio`) is filled with 1.0,
 *                so the shader's bias-mode branch is a no-op when None /
 *                VolumeLimited / V_max are selected.  All three modes
 *                ignore slot 10 anyway, so this is correct AS LONG AS the
 *                user hasn't picked Schechter LF.  This is the default at
 *                upload time — the .bin lands fast (~2 s saved on a
 *                fully-loaded deck).
 *   - `'with-schechter'` — slot 10 holds the real `min(1, sqrt(nRef/n(d)))`
 *                          ratio, computed via `computeSchechterRatios`.
 *                          Used either when an upload happens *while*
 *                          Schechter mode is already active, or as part
 *                          of the lazy `setBiasMode(BiasMode.Schechter)`
 *                          re-bake.
 */
export type BuildPointInterleavedBufferMode = 'fast' | 'with-schechter';
