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
 *   | textured-impostors    | 4         | 5       |
 *   | filaments             | 6         | 7       |
 *   | scalar-volume         | 8         | 9       |
 *   | milky-way             | 10        | 11      |
 *   | marker-lines          | 12        | 13      |
 *   | labels                | 14        | 15      |
 *   | tone-map              | 16        | 17      |
 *   | pick                  | 18        | 19      |
 *   | _reserved_            | 20–31     |         |
 *
 * 10 slots × 2 indices = 20.  The query set is sized 32 (see
 * `TIMING_QUERY_SET_SIZE` below) for headroom — splitting
 * `textured-impostors` into `textured-quads` + `textured-disks`, or
 * adding a future post-tone-map overlay, fits without resizing the
 * GPU resources.
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
 * Size of the underlying `GPUQuerySet`.  20 slots in use + 12 reserved
 * for future inhabitants.  Sizing the query set once at construction
 * (rather than growing later) keeps the resolve buffer + staging
 * buffers right-sized from frame 1 — they're allocated `count * 8`
 * bytes since each timestamp is a `u64`.
 */
export const TIMING_QUERY_SET_SIZE = 32;

/** Slot→(begin idx, end idx) map.  See module header for the spec table. */
export const TIMING_SLOT_NAMES: ReadonlyMap<TimingSlotName, readonly [number, number]> = new Map<
  TimingSlotName,
  readonly [number, number]
>([
  ['point-sprites', [0, 1]],
  ['procedural-disks', [2, 3]],
  ['textured-impostors', [4, 5]],
  ['filaments', [6, 7]],
  ['scalar-volume', [8, 9]],
  ['milky-way', [10, 11]],
  ['marker-lines', [12, 13]],
  ['labels', [14, 15]],
  ['tone-map', [16, 17]],
  ['pick', [18, 19]],
]);
