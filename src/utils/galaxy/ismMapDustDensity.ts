/**
 * ismMapDustDensity — a texel's `gas * activity` product, where `activity` is
 * the ISM map's ACCUMULATED trace (EMA of event stamps). FORMERLY dust
 * placement's own density and its S3 survival filter's criterion; both now
 * key off the swept `dust` channel directly (see `dustParticleCloud.ts`'s
 * header for why). This stays as a two-channel density fixture in
 * `buildIsmMapDustCdf`'s own tests.
 *
 * No blend weight against a `1` floor: that floor is `gas` alone once
 * `activity` is discounted, and `gas` sits near 1 across most of a quiet
 * disc, so any weight below 1 turns it into a near-uniform acceptance
 * pedestal. The blend has one correct value, so there is no knob.
 */
export function ismMapDustDensity(gas: number, activity: number): number {
  return gas * activity;
}
