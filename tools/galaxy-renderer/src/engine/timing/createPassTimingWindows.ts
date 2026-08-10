/**
 * createPassTimingWindows — per-slot rolling means over `gpuTimingService`
 * frames, in the shape the HUD reads.
 *
 *  - `timings()` walks `slots` in the caller's declared order rather than
 *    Map-insertion order: a slot that only starts running later (the tool's
 *    grade trailer) would otherwise insert at the end and pin itself there,
 *    shuffling the HUD's row order against the frame's actual pass order.
 *  - a slot is dropped after `staleFrames` unreported frames: the query set
 *    RETAINS a gated-off pass's last tick values, so a row that stops running
 *    has to disappear rather than freeze at a stale-but-plausible number.
 */

import type { GpuTimingFrame } from '../../../../../src/@types/gpu/timing/GpuTimingFrame';
import type { PassTiming } from '../../../@types/engine/PassTiming';

type PassWindow = { samples: number[]; lastSeenFrame: number };

/**
 * @param slots the declared slot order `timings()` rows come out in.
 * @param windowSize samples per slot kept for the rolling mean.
 * @param staleFrames frames a slot may go unreported before its row drops.
 */
export function createPassTimingWindows(
  slots: readonly string[],
  windowSize: number,
  staleFrames: number,
): {
  record(frame: GpuTimingFrame): void;
  timings(): readonly PassTiming[];
} {
  const passWindows = new Map<string, PassWindow>();

  return {
    record(frame: GpuTimingFrame): void {
      for (const [slot, ms] of frame.perPassMs) {
        let window = passWindows.get(slot);
        if (!window) {
          window = { samples: [], lastSeenFrame: frame.frameIndex };
          passWindows.set(slot, window);
        }
        window.samples.push(ms);
        if (window.samples.length > windowSize) window.samples.shift();
        window.lastSeenFrame = frame.frameIndex;
      }
      for (const [slot, window] of passWindows) {
        if (frame.frameIndex - window.lastSeenFrame > staleFrames) passWindows.delete(slot);
      }
    },

    timings(): readonly PassTiming[] {
      return slots.flatMap((slot) => {
        const window = passWindows.get(slot);
        if (!window || window.samples.length === 0) return [];
        const mean = window.samples.reduce((sum, ms) => sum + ms, 0) / window.samples.length;
        return [{ slot, ms: mean }];
      });
    },
  };
}
