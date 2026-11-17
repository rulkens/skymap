/** The metre-space descent floor above a body's datum sphere. The standoff has
 * no default on purpose: one would let a call site silently keep reading the
 * Earth-tuned global past a body that overrides it (spec §3.7). */

export function surfaceFloorM(datumRadiusM: number, standoffRadii: number): number {
  return datumRadiusM * standoffRadii;
}
