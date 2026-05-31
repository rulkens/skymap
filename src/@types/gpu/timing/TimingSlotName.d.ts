/**
 * TimingSlotName — the kebab-case identifier of one timed render pass.
 *
 * The set of timing slots is DERIVED at runtime from the render-pass
 * registry (`TIMED_SLOT_NAMES` in
 * `services/engine/frame/passes/index.ts`): every `HDR_PASSES` entry's
 * `name`, plus the four framework slots `scalar-volume`, `tone-map`,
 * `ui-overlay`, and `pick`.  Because `Pass.name` is typed `string`, the
 * slot set cannot be a closed literal union — so this is a `string`
 * alias rather than an enumerated type.  It keeps the *intent* legible
 * at every signature (`descriptorFor(slot: TimingSlotName)`,
 * `Map<TimingSlotName, number>`) while letting a new renderer register a
 * slot purely by joining `HDR_PASSES`.
 *
 * Unknown slots degrade gracefully: `gpuTimingService.descriptorFor`
 * returns `undefined` for a name with no allocated index pair, so the
 * pass simply isn't measured and still draws.
 *
 * The strings match the `name` fields on `Pass` objects (e.g.
 * `pointSpritesPass.name === 'point-sprites'`).
 */

export type TimingSlotName = string;
