/**
 * PROXY_SCALE mirrors `analyticSphere.wesl`'s own `PROXY_SCALE`: the radial
 * blow-up the GPU applies to a body's rasterised proxy mesh so its silhouette
 * strictly circumscribes the analytic sphere the fragment stage ray-traces
 * (see that file for the derivation). `bodySlabRow` (`slabs.ts`) needs the
 * same number CPU-side to size a body-m row's near-plane margin, so a proxy
 * vertex can never fall in front of the plane meant to contain it. The WESL
 * mirror is kept in sync by `constants.parity.test.ts`, not the linker.
 */
export const PROXY_SCALE = 1.05;
