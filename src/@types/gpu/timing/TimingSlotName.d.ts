/**
 * TimingSlotName — the kebab-case identifier of one timed render pass.
 *
 * The set of timing slots is DERIVED at runtime from the FRAME program +
 * the content-layer registry (`TIMED_SLOTS` in
 * `services/engine/frame/frameProgram.ts`): one slot per timed layer, a
 * `'<source>→<dest>'` slot per composite, and a trailing `'pick'`.  Because
 * `ContentLayer.name` is typed `string`, the slot set cannot be a closed
 * literal union — so this is a `string` alias rather than an enumerated type.
 * It keeps the *intent* legible at every signature
 * (`descriptorFor(slot: TimingSlotName)`, `Map<TimingSlotName, number>`) while
 * letting a new renderer register a slot purely by joining the registry.
 *
 * Unknown slots degrade gracefully: `gpuTimingService.descriptorFor`
 * returns `undefined` for a name with no allocated index pair, so the
 * pass simply isn't measured and still draws.
 *
 * The strings match the `name` fields on `ContentLayer` objects (e.g.
 * `galaxyPointSpritesLayer.name === 'point-sprites'`).
 */

export type TimingSlotName = string;
