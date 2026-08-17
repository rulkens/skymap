/**
 * createFrameTimer — a fixed-length ring of recent frame deltas
 * (`shift()`-based; at 60 entries the copy cost is noise), read as a median.
 * Fed timestamps rather than deltas, so the previous-callback clock lives
 * here, separate from `drawFrame`'s own clamped camera dt.
 *
 * A median, not a mean: vsync quantisation, compositor hiccups, GC pauses and
 * tab housekeeping ticks land in the same stream as the renderer's own cost,
 * and a median throws an outlier away unless it's over half the window —
 * where a mean drags for a whole window on one stall.
 *
 * @param windowFrames how many recent deltas the median is taken over.
 */
export function createFrameTimer(windowFrames: number): {
  mark(nowMs: number): void;
  medianMs(): number;
} {
  const samples: number[] = [];
  // 0 marks "no previous callback": the first mark has nothing to subtract
  // from, and seeding from `performance.now()` at construction would instead
  // enter engine boot into the window as a frame.
  let lastMs = 0;

  return {
    /** One frame callback's timestamp. Deltas are UNCLAMPED — an outlier belongs in the window; the median is what rejects it. */
    mark(nowMs: number): void {
      if (lastMs !== 0) {
        samples.push(nowMs - lastMs);
        if (samples.length > windowFrames) samples.shift();
      }
      lastMs = nowMs;
    },
    /** 0 until at least one delta has been recorded. */
    medianMs(): number {
      if (samples.length === 0) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      // Even-length windows take the lower of the two middles rather than
      // averaging them: averaging would reintroduce a (tiny) sensitivity to
      // one sample's magnitude, and at this window size the two middles differ
      // by well under the display's own quantisation anyway.
      return sorted[mid]!;
    },
  };
}
