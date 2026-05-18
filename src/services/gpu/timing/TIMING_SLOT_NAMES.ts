/**
 * TIMING_SLOT_NAMES — the static slot→index map for `gpuTimingService`.
 *
 * The slot table is compile-time fixed, matching the spec's "Static
 * slot assignment" section verbatim:
 *
 *   | Slot name             | Begin idx | End idx |
 *   | --------------------- | --------- | ------- |
 *   | point-sprites         | 0         | 1       |
 *   | procedural-disks      | 2         | 3       |
 *   | textured-quads        | 4         | 5       |
 *   | filaments             | 6         | 7       |
 *   | scalar-volume         | 8         | 9       |
 *   | milky-way             | 10        | 11      |
 *   | tone-map              | 12        | 13      |
 *   | ui-overlay            | 14        | 15      |
 *   | pick                  | 16        | 17      |
 *   | volume-upsample       | 18        | 19      |
 *   | textured-disks        | 20        | 21      |
 *   | _reserved_            | 22–31     |         |
 *
 * 11 slots × 2 indices = 22.  The query set is sized 32 (see
 * `TIMING_QUERY_SET_SIZE` below) for headroom.  `ui-overlay` is the
 * combined marker-lines + labels pass — they share one swap-chain
 * `beginRenderPass` for OVER-blend coherency, so they bill against a
 * single timing slot.
 *
 * `textured-quads` keeps the legacy `textured-impostors` slot indices
 * (4, 5) so existing timestamp histories stay comparable across the
 * split (2026-05-18); the new `textured-disks` half claims the next
 * free pair from the formerly-reserved range (20, 21).  Out-of-order
 * indices vs the HDR draw order are fine — the decoder is
 * map-iteration order, and the DebugPanel orders rows from
 * `HDR_PASSES`, not the slot table.
 *
 * ### Why a `Map` rather than a plain object
 *
 * Iteration order matters: the decode loop in `gpuTimingService`
 * walks this map and inserts the resulting `(slot, ms)` pairs into
 * the published `GpuTimingFrame.perPassMs` map.  `Map` guarantees
 * insertion order; `{}` does technically too (numeric-key
 * complications notwithstanding), but `Map<TimingSlotName, [number, number]>`
 * carries its own type and reads cleanly at every consumer.
 *
 * ### Why exported as `readonly` Map
 *
 * The map is constructed once at module load and shared across the
 * whole process — there's no legitimate reason for a consumer to
 * mutate it.  The `ReadonlyMap` type signature catches the mistake
 * at compile time.
 */

import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';

/**
 * Size of the underlying `GPUQuerySet`.  22 indices in use (11 named
 * slots × 2 begin/end) + 10 reserved for future inhabitants.  Sizing
 * the query set once at construction (rather than growing later)
 * keeps the resolve buffer + staging buffers right-sized from frame 1
 * — they're allocated `count * 8` bytes since each timestamp is a
 * `u64`.
 */
export const TIMING_QUERY_SET_SIZE = 32;

/**
 * Slot→(begin idx, end idx) map.  See module header for the spec
 * table.  Insertion order here matches the HDR draw order so
 * `DebugPanel`'s `GpuTimingsSection` rows fall out naturally — even
 * though `textured-disks` claims out-of-order slot indices (20, 21),
 * the map entry sits between `textured-quads` and `milky-way`.
 */
export const TIMING_SLOT_NAMES: ReadonlyMap<TimingSlotName, readonly [number, number]> = new Map<
  TimingSlotName,
  readonly [number, number]
>([
  ['point-sprites', [0, 1]],
  ['procedural-disks', [2, 3]],
  ['textured-quads', [4, 5]],
  ['textured-disks', [20, 21]],
  ['filaments', [6, 7]],
  ['scalar-volume', [8, 9]],
  ['milky-way', [10, 11]],
  ['tone-map', [12, 13]],
  ['ui-overlay', [14, 15]],
  ['pick', [16, 17]],
  ['volume-upsample', [18, 19]],
]);
