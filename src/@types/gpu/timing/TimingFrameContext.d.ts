/**
 * TimingFrameContext — opaque per-frame handle returned by
 * `gpuTimingService.beginFrame()` and consumed by `endFrame()`.
 *
 * Carries the staging-buffer rotation cursor for *this* frame.  The
 * caller is encouraged to treat it as opaque — every field is
 * `readonly` and the orchestrator only ever passes it back into
 * `endFrame` unmodified.
 *
 * ### Why a struct rather than an integer
 *
 * The bag is small now (frame index + buffer slot) but is the natural
 * site for future per-frame metadata (e.g. a "this frame should also
 * sample the experimental inside-pass query" toggle if we revisit the
 * rejected `timestamp-query-inside-passes` feature in v2).  Keeping
 * the type a struct from day one means the future addition is a
 * non-breaking field add.
 */

export type TimingFrameContext = {
  /** Matches `GpuTimingFrame.frameIndex` for the frame that started. */
  readonly frameIndex: number;
  /**
   * Which of the two staging buffers this frame writes its resolved
   * timestamps into.  Either 0 or 1.  Set by `beginFrame` (incremented
   * mod 2 from the previous frame's slot).
   */
  readonly stagingSlot: 0 | 1;
};
