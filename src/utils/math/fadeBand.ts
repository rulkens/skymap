/**
 * fadeBand — the ONE directional crossfade primitive every scale transition
 * leans on: a smoothstep over a `FadeBand`, with the fade DIRECTION inferred
 * from the edge ordering.
 *
 * The descent from cosmic scale to Earth's surface crosses several content
 * "scales" that must dissolve in and out — the Milky-Way impostor yields as
 * the camera dives into the disc, the star-map captions fade as the camera
 * leaves the neighbourhood, the galaxy point cloud recedes once local stars
 * fill the near field. Each of those grew its OWN hand-rolled smoothstep: one
 * used `smoothstep(inner, outer, x)` for an approach fade, another
 * `1 - smoothstep(full, gone, x)` for a recede fade — the same three-line
 * clamp copied with a `1 -` flip bolted on wherever the fade ran the other
 * way. The flip is exactly the kind of accidental asymmetry that drifts: a
 * fourth transition would copy whichever neighbour it happened to sit next to.
 *
 * Folding all of them into one primitive means the direction is DATA, not
 * code. `fullAt > goneAt` → alpha 1 at/above `fullAt`, 0 at/below `goneAt`
 * (fades out as the value drops — an approach fade). `fullAt < goneAt` → the
 * reverse (fades out as the value rises — a recede fade). One function serves
 * both; a `SCALE_FADE_BANDS` row picks the direction just by which edge is
 * larger, so a new transition is a declared band, not a new mechanism.
 *
 * Built on `smoothstep` (the shared cubic-Hermite ease, matching the WGSL
 * built-in) so CPU-side fades keep the same perceptually-soft ramp — and the
 * same curve — as any shader-side fade over the equivalent band. Returns a
 * number in `[0, 1]`.
 */

import type { FadeBand } from '../../@types/math/FadeBand';
import { smoothstep } from './smoothstep';

export function fadeBand(band: FadeBand, value: number): number {
  const { fullAt, goneAt, floor = 0 } = band;
  // smoothstep needs edge0 < edge1; feed it the sorted edges and let the
  // ordering of the ORIGINAL edges decide whether the ramp rises or is
  // mirrored. `fullAt > goneAt` (approach fade) uses the ramp as-is — 1 at the
  // high edge; otherwise (recede fade) the `1 -` flips it so full sits at the
  // low edge.
  const s = smoothstep(Math.min(fullAt, goneAt), Math.max(fullAt, goneAt), value);
  const raw = fullAt > goneAt ? s : 1 - s;
  // Remap the OUTPUT, not the ramp: `floor` rescales [0, 1] to [floor, 1] so a
  // band whose content nothing replaces at its dissolved end stays dimly
  // visible instead of reaching 0.
  return floor + (1 - floor) * raw;
}
