/**
 * GpuTimingFrame — one decoded snapshot of per-pass GPU timings.
 *
 * Pushed to subscribers by `gpuTimingService` once a frame's staging
 * buffer completes its async `mapAsync`.  The latency from "frame was
 * encoded" to "this snapshot fires" is 1–2 frames (the staging buffer
 * is double-buffered so a frame's resolve doesn't stall the next
 * frame's submission).
 *
 * ### Why a `ReadonlyMap` rather than a struct
 *
 * Two reasons:
 *
 *   1. Slots that didn't run this frame ("pick" when there was no
 *      hover, "filaments" when the filament cloud hasn't loaded,
 *      etc.) are simply absent from the map.  A struct would force
 *      `undefined` everywhere and lose the "the pass didn't run" /
 *      "the pass ran in 0 ms" distinction at the type level.
 *   2. Subscribers iterate by `TimingSlotName` keys (e.g. the
 *      `GpuTimingsSection` component renders one row per active
 *      slot).  Map iteration order is insertion order — the
 *      decode loop inserts in the table-defined order, so the UI
 *      doesn't have to re-sort.
 *
 * ### Units
 *
 * `perPassMs` values are floating-point milliseconds, derived from
 * `(endTicks - beginTicks) * device.queue.timestampPeriod / 1e6`
 * where `timestampPeriod` is the nanoseconds-per-tick figure WebGPU
 * exposes.  Sub-millisecond resolution is normal (most passes will
 * land in the 0.1–5 ms range).
 */

import type { TimingSlotName } from './TimingSlotName';

export type GpuTimingFrame = {
  /**
   * Monotonic counter incremented once per `beginFrame` call.  The
   * subscriber uses this to ignore out-of-order map-completions
   * (theoretically the double-buffered staging buffers should land
   * in order, but driver quirks make a defensive check cheap).
   */
  readonly frameIndex: number;
  /**
   * Decoded per-pass durations.  A missing key means the pass didn't
   * run this frame (its `descriptorFor` wasn't consumed).
   */
  readonly perPassMs: ReadonlyMap<TimingSlotName, number>;
};
