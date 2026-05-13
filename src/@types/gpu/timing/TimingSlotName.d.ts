/**
 * TimingSlotName — the kebab-case identifier of one timed render pass.
 *
 * Each value pairs with a fixed begin/end slot pair in the
 * `TIMING_SLOT_NAMES` table (`src/services/gpu/timing/TIMING_SLOT_NAMES.ts`).
 * The union is closed at the type level because the slot table is
 * compile-time-fixed (the spec's "Static slot assignment" section);
 * adding a new pass means editing the union AND the table in one
 * commit — the type checker enforces both edits.
 *
 * The 9 inhabitants below cover the 6 HDR sub-passes (`HDR_PASSES`),
 * the tone-map post-process, the combined UI-overlay pass (marker-
 * lines + labels merged into one swap-chain render pass for blend
 * coherency), and the pick render pass.  Slots 16–31 of the
 * GPUQuerySet are reserved for future inhabitants without forcing a
 * query-set resize.
 *
 * The strings match the `name` fields on `Pass` objects (e.g.
 * `pointSpritesPass.name === 'point-sprites'`).  Tests in Task 9 lean
 * on that equality to assert each pass plumbs its timing descriptor.
 */

export type TimingSlotName =
  | 'point-sprites'
  | 'procedural-disks'
  | 'textured-impostors'
  | 'filaments'
  | 'scalar-volume'
  | 'milky-way'
  | 'tone-map'
  | 'ui-overlay'
  | 'pick';
