/**
 * validateSingleWriter — registration-time check that no two BASE-layer writers
 * on the same camera channel have overlapping time windows.
 *
 * ### The base-single-writer rule
 *
 * Within a clip, camera motion is modelled as three additive layers:
 *
 *   - BASE  (`set` / `setVec` / `spin`): sets an absolute position or spins a
 *     delta. At most ONE base writer may be active on a channel at any instant.
 *   - VELOCITY (`rate`): adds an offset velocity; multiple ramps on the same
 *     channel are allowed and override each other.
 *   - OSCILLATION (`osc`): zero-mean sine bob; multiple on the same channel
 *     simply sum.
 *
 * The velocity and oscillation layers are NEVER checked here — only
 * `baseTracks` is inspected. So `set('yaw') + rate('yaw') + oscillate('yaw')`
 * is perfectly legal: one base writer, one velocity ramp, one sine bob, all on
 * the same channel, all additive.
 *
 * ### Why a runtime walk, not a compile-time type scheme?
 *
 * Type narrowing can catch same-leaf repetition in a literal, but clips are
 * frequently built dynamically — a function that splices a zoom into a
 * timeline, or a fork that adds a spinning layer, can produce overlaps that no
 * static analysis sees. `compileClip` flattens the full effect tree into sorted
 * `BaseSegment[]` arrays; scanning those arrays once at registration time is
 * complete over ALL construction patterns, whether literal, templated, or
 * programmatically forked.
 *
 * ### Overlap semantics
 *
 * Windows are HALF-OPEN: `[startSec, endSec)`. Two segments that TOUCH at an
 * endpoint (e.g. `[0, 4)` and `[4, 8)`) do NOT overlap — a `seq` of two ramps
 * must pass cleanly. The predicate is `a.startSec < b.endSec && b.startSec < a.endSec`.
 *
 * ### How it is called
 *
 * `compileClip` calls this function on the fully built (and preroll-shifted)
 * `baseTracks` record before returning the `CompiledClip`. Any clash throws
 * immediately, surfacing the authoring error at registration time rather than
 * silently producing a malformed clip that produces visual glitches at playback.
 */

import type { BaseSegment } from '../../../@types/animation/CompiledClip';
import type { Channel } from '../../../@types/animation/Channel';

/**
 * validateSingleWriter — assert that no two `[startSec, endSec)` windows on
 * the same channel's base track overlap.
 *
 * `baseTracks` comes from `compileClip` with each channel's segments already
 * sorted ascending by `startSec`. The scan therefore only needs to compare
 * each segment against the one immediately following it on the same channel —
 * a linear O(n) pass per channel.
 *
 * @param baseTracks  The per-channel base-segment arrays from `CompiledClip`.
 * @throws            `Error` naming the channel and both overlapping windows
 *                    when a clash is detected.
 */
export function validateSingleWriter(baseTracks: Record<Channel, BaseSegment[]>): void {
  const channels: Channel[] = ['distance', 'yaw', 'pitch', 'target'];

  for (const ch of channels) {
    const segs = baseTracks[ch];
    // Segments are pre-sorted by startSec ascending (compileClip guarantees
    // this). Consecutive-pair scan is sufficient by contrapositive: if segment i
    // does NOT overlap i+1, then segs[i].endSec <= segs[i+1].startSec, so by
    // sorted order segs[i] cannot overlap i+2 or any later segment either.
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i]!;
      const b = segs[i + 1]!;
      // Half-open overlap: [a.start, a.end) ∩ [b.start, b.end) is non-empty
      // iff a.start < b.end AND b.start < a.end.
      if (a.startSec < b.endSec && b.startSec < a.endSec) {
        throw new Error(
          `single-writer violation on channel '${ch}': ` +
            `[${a.startSec},${a.endSec}) overlaps [${b.startSec},${b.endSec})`,
        );
      }
    }
  }
}
