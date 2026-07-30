/**
 * PerfReport — the engine's periodic performance snapshot, in two tiers that
 * answer different questions.
 *
 * `frameMs` / `fps` are measured from requestAnimationFrame deltas: the total
 * wall time one displayed frame took, everything included. That is the number
 * that answers "is variant A faster than variant B", and it is the only number
 * here that is additive or convertible to a frame rate.
 *
 * `passes` are per-pass GPU timestamp spans, and they are ORDINAL — see
 * `PassTiming`. They say which pass to look at; `frameMs` says whether the
 * looking paid off.
 */

import type { PassTiming } from './PassTiming';

export type PerfReport = {
  /** Rolling median of recent rAF-to-rAF deltas, in milliseconds. */
  readonly frameMs: number;
  /** `1000 / frameMs`, i.e. the same measurement in frames per second. */
  readonly fps: number;
  /**
   * Per-pass GPU spans in frame-encode order, omitting passes that did not run
   * recently. Empty when `timingEnabled` is false, or before the first
   * timestamp readback lands (a frame's staging buffer maps 1-2 frames late).
   */
  readonly passes: readonly PassTiming[];
  /**
   * Whether GPU timestamps are being collected at all — false when the
   * `?gpuTimings` URL gate is absent or the adapter lacks `timestamp-query`.
   */
  readonly timingEnabled: boolean;
};
