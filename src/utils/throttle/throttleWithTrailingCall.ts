/**
 * throttleWithTrailingCall — `throttleByTime`'s gate, plus a trailing edge: a call the
 * gate turns away schedules `onTrailing` (once) for the moment the window reopens. A
 * caller that only runs when woken (the demand loop asleep) otherwise leaves its last
 * turned-away state unpublished until something unrelated wakes it. The gate reads only
 * the caller's `nowMs`; the timer's delay is the window's remainder in that same clock.
 */

import type { TrailingThrottle } from '../../@types/utils/TrailingThrottle';

export function throttleWithTrailingCall(
  minIntervalMs: number,
  onTrailing: () => void,
): TrailingThrottle {
  let lastOpenedMs: number | null = null;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  return {
    pass(nowMs) {
      if (lastOpenedMs === null || nowMs - lastOpenedMs >= minIntervalMs) {
        lastOpenedMs = nowMs;
        return true;
      }
      trailing ??= setTimeout(
        () => {
          trailing = null;
          onTrailing();
        },
        lastOpenedMs + minIntervalMs - nowMs,
      );
      return false;
    },
    cancel() {
      if (trailing !== null) clearTimeout(trailing);
      trailing = null;
    },
  };
}
