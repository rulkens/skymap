/**
 * ismMapDustDensity — `gas * activity`, where `activity` is the ISM map's
 * accumulated trace (EMA of event stamps). Used only as a two-channel
 * density fixture in `buildIsmMapDustCdf`'s tests; production dust placement
 * keys off the map's raw `dust` channel directly (`dustParticleCloud.ts`).
 *
 * No blend weight against a floor: `gas` alone sits near 1 across a quiet
 * disc, so any weight below 1 turns the blend into a near-uniform pedestal
 * — there's one correct value, not a tunable knob.
 */
export function ismMapDustDensity(gas: number, activity: number): number {
  return gas * activity;
}
