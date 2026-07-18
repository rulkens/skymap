/**
 * seedIndexOfBody — a body's STABLE index into its authored seed table, the
 * durable identity the foreground-body `drawPick`s stamp into the pick texture.
 *
 * ### Why the seed index, not `@builtin(instance_index)` (spec §8.1)
 *
 * The catalogue point cloud composes each galaxy's pick id on the GPU from a
 * per-draw source code and the draw's `instance_index`. The foreground bodies
 * cannot: the set they draw is camera-dependent. `planetsLayer` packs only the
 * planets clearing the sub-pixel cull; the star layers draw
 * `partitionStarsByResolution`'s `spheres`/`points` split, which shifts every
 * frame as a body crosses `STAR_RESOLVE_PX`. An `instance_index` into that
 * moving subset would rename a body the instant a sibling enters or leaves it —
 * so the pick id would point at the wrong star between frames.
 *
 * The fix is to carry the body's index into its FULL, order-stable seed table
 * (`SCENE_PLANETS` / `SCENE_STARS`) rather than its slot in the frame's drawn
 * subset. That index never moves — it is a property of the authored data, not
 * the camera — so a saved selection survives the body dropping out of and back
 * into the resolved set. The resolve side (Task 12) decodes the same index
 * back into `seeds[index]` to name the body.
 *
 * ### The −1 contract
 *
 * `indexOf` returns −1 for an id absent from the table. Each caller SKIPS a −1
 * rather than stamping a pick id from it: `seedIndex + PICK_SENTINEL_OFFSET`
 * would be `0`, which packs to another body's id band (or the no-hit sentinel),
 * aliasing the pick. A drawn body whose id is missing from its seed table is a
 * seed/draw-set desync that should drop out of picking, not mis-resolve.
 */

/**
 * The index of the body with `id` in `seeds`, or −1 if none matches. A thin
 * `findIndex` by id — its own module so both the star layers and the planet
 * layer share the one lookup and the −1 contract lives in one place.
 */
export function seedIndexOfBody(id: string, seeds: readonly { id: string }[]): number {
  return seeds.findIndex((seed) => seed.id === id);
}
