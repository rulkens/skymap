/**
 * depthClearValueFor — the depth-buffer clear value for a slab's depth
 * convention, i.e. the value that encodes the FAR plane.
 *
 * Non-reversed depth runs near→0, far→1, so clearing to the far plane means
 * clearing to `1`. Reversed-Z swaps the ends (near→1, far→0), so its far-plane
 * clear is `0`. The clear value must always match the far end of whatever
 * `depthCompare` direction the slab's pipelines use — otherwise the first
 * fragment tested compares against a clear that sits on the *near* side and
 * every draw is rejected (or accepted) wrongly.
 *
 * Single-sourced here so the two clear sites — the `executeFrame` foreground
 * pass and the `pickProgram` per-slab pick pass — can never disagree with the
 * `depthCompare` direction (the same single-source rationale as
 * `resolveDepthCompare`). The rejected alternative was a hardcoded literal `1`
 * at each clear site (the pre-refactor state): correct only while depth is
 * non-reversed, and a silent depth-fight the moment a slab flips to reversed-Z
 * with one clear site left un-updated.
 */

export function depthClearValueFor(reversedZ: boolean): number {
  return reversedZ ? 0 : 1;
}
