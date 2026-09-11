/**
 * OrbitTrailsSettings — near-field Keplerian orbit-trails singleton overlay
 * (Earth / Jupiter / Moon …). A flat `enabled` field, mirroring `milkyWay` /
 * `filaments` / `flow` rather than the per-record source-type clusters: one
 * compile-time conic table, not a per-catalog fan-out. Read by
 * `orbitTrailsPass`, whose per-orbit fade multiplies this gate's fade
 * opacity so the layer dissolves on toggle rather than popping. Defaults on.
 */

export type OrbitTrailsSettings = {
  enabled: boolean;
};
