/**
 * decodeTimestampBuffer — pure ArrayBuffer → Map<slot, ms> transform.
 *
 * The mapped staging buffer is an N × u64 view of timestamp ticks in
 * raw GPU clock units.  We iterate the caller-supplied `slotIndices`
 * table and, for each slot, read its (begin, end) tick pair, compute the
 * delta, scale by `timestampPeriod` (nanoseconds per tick), and convert
 * to milliseconds.  The map is passed in (not imported) so this stays a
 * pure function with no dependency on the dynamically-derived slot
 * registry — the `gpuTimingService` owns the one map and hands it here.
 *
 * ### Sentinel: begin === 0n AND end === 0n means "the pass didn't run"
 *
 * WebGPU's spec doesn't specify what `timestampWrites` does when its
 * descriptor is absent from a pass — in practice the slot's u64 stays
 * at whatever the staging buffer was zeroed to before its first map.
 * Our staging buffers are explicitly zero-initialised once at
 * construction, so an absent slot reliably reads (0n, 0n).  We treat
 * a fully-zero pair as "skip this slot".
 *
 * A `begin === 0n` with a non-zero `end` is plausible too — the GPU
 * tick counter can be sampled at boot before the device's first
 * pipelined command — so we don't skip on `begin` alone.  The risk
 * of a real run producing exactly (0n, 0n) by coincidence is
 * negligible (the GPU clock would have to roll back through zero
 * mid-frame and land both stamps on the same tick).
 *
 * ### Negative-delta clamp
 *
 * On long-running sessions some adapters wrap their u64 tick counter
 * (the spec doesn't guarantee monotonicity across device-loss / power
 * cycles).  Reading `end - begin` as a `BigInt` and then converting
 * to `Number` will silently underflow into a huge positive number —
 * not what we want.  Clamping `end < begin` to 0 ms gives us a
 * one-frame artefact and self-corrects on the next sample.
 *
 * ### Purity
 *
 * The function takes an `ArrayBuffer` and a `number`, returns a
 * `Map`.  No DOM, no device, no closures.  Reusable in tests via the
 * fixtures in `decodeTimestampBuffer.test.ts`.
 */

import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';

export function decodeTimestampBuffer(
  buffer: ArrayBuffer,
  timestampPeriodNs: number,
  slotIndices: ReadonlyMap<TimingSlotName, readonly [number, number]>,
): Map<TimingSlotName, number> {
  const u64 = new BigUint64Array(buffer);
  const out = new Map<TimingSlotName, number>();

  for (const [slot, [beginIdx, endIdx]] of slotIndices) {
    const begin = u64[beginIdx]!;
    const end = u64[endIdx]!;

    // Sentinel: an all-zero (begin, end) pair means the slot's pass
    // didn't run this frame (or the staging buffer was never written
    // into for this index).  Skip — `GpuTimingFrame.perPassMs`
    // exposes "absent" by simply not setting the key.
    if (begin === 0n && end === 0n) continue;

    // BigInt-safe subtraction; clamps wrap-around to 0.
    if (end < begin) {
      out.set(slot, 0);
      continue;
    }

    // Tick delta * ns-per-tick = ns total; / 1e6 = ms.
    // `Number()` is safe here because the delta is bounded by realistic
    // GPU frame durations (~50 ms wallclock at worst, well within the
    // 2^53 lossless-integer range of `Number`).
    const deltaTicks = Number(end - begin);
    out.set(slot, (deltaTicks * timestampPeriodNs) / 1e6);
  }

  return out;
}
