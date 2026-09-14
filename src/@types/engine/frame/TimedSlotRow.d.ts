/**
 * TimedSlotRow — one derived GPU-timing slot: its `name` (what the timing
 * service allocates a query pair for) plus the `groupKey` of the step that
 * produced it — `'<target>·<SLAB>'` for a render slot, the literal
 * `'composite'` for a whole-texture merge, `'pick'` for the pick program. The
 * DebugPanel buckets on the groupKey, so a new pass lands in the right group
 * via its step.
 */

export type TimedSlotRow = { readonly name: string; readonly groupKey: string };
