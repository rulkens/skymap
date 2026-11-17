/**
 * ProvenanceFilter — which half of a provenance axis survives to the screen.
 *
 *   - `all`       — draw every galaxy (the default; no cull).
 *   - `measured`  — draw only galaxies whose value on this axis is a real
 *                   catalog measurement; cull the estimated ones.
 *   - `estimated` — the complement: draw only the fallback estimates, so the
 *                   spatial footprint of a catalog's guesswork is visible on
 *                   its own.
 *
 * A tri-state rather than a boolean "only measured" because auditing data
 * quality needs both halves: "where is the real photometry?" and "where did
 * we make it up?" are equally interesting questions, and a boolean can only
 * answer the first.
 */
export type ProvenanceFilter = 'all' | 'measured' | 'estimated';
