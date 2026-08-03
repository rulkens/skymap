/**
 * createFrameTimer — a fixed-length ring of recent frame deltas, read as a
 * median. Fed timestamps rather than deltas, so the previous-callback clock
 * lives here: the engine's OTHER now-difference (`drawFrame`'s clamped camera
 * dt) must stay separate, and the two are easier to conflate side by side than
 * one field apart.
 *
 * ### Why a median and not the latest delta
 *
 * An instantaneous rAF delta is unreadable: vsync quantisation, a compositor
 * hiccup, a GC pause and a browser tab housekeeping tick all land in the same
 * stream as the renderer's own cost, and the number flickers by whole
 * milliseconds several times a second. A median over ~1 second of frames throws
 * those away by construction — an outlier has to be more than half the window
 * to move the answer — while still settling within a second of a real change,
 * which is what an iteration loop needs.
 *
 * A mean was the alternative and is worse here for exactly the reason the
 * median is good: one 200 ms stall from a shader recompile drags a 60-frame
 * mean by 3 ms and keeps it there for a second, which reads as "the change made
 * it slower". A trimmed mean would also work; the median is the same idea with
 * nothing to tune.
 *
 * The ring is a plain array with `shift()` rather than an index-wrapped buffer:
 * at 60 entries the copy is a handful of pointer moves per frame, far below the
 * noise floor of what it is measuring, and the array reads directly as "the
 * samples, oldest first".
 */

/**
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
