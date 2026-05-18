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
 * The 11 inhabitants below cover the 7 HDR sub-passes (`HDR_PASSES`),
 * the tone-map post-process, the combined UI-overlay pass (marker-
 * lines + labels merged into one swap-chain render pass for blend
 * coherency), the pick render pass, and the volume-upsample pass that
 * composites the half-resolution scalar-volume render target back to
 * full resolution.  Slots 22–31 of the GPUQuerySet are reserved for
 * future inhabitants without forcing a query-set resize.
 *
 * The strings match the `name` fields on `Pass` objects (e.g.
 * `pointSpritesPass.name === 'point-sprites'`).  Tests in Task 9 lean
 * on that equality to assert each pass plumbs its timing descriptor.
 *
 * `textured-quads` and `textured-disks` are split halves of the former
 * `textured-impostors` slot (2026-05-18).  The split lets the debug
 * panel toggle each impostor style independently.  `textured-quads`
 * keeps the legacy slot indices (4, 5); `textured-disks` claims the
 * next free pair from the formerly-reserved range (20, 21).
 */

export type TimingSlotName =
  | 'point-sprites'
  | 'procedural-disks'
  | 'textured-quads'
  | 'textured-disks'
  | 'filaments'
  | 'scalar-volume'
  | 'milky-way'
  | 'tone-map'
  | 'ui-overlay'
  | 'pick'
  | 'volume-upsample';
