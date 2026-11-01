/**
 * throttleWithTrailingCall — `throttleByTime`'s gate, plus a trailing edge: a call the
 * gate turns away schedules `onTrailing` (once), one full interval later, by which time
 * the window has reopened. A caller that only runs when woken (the demand loop asleep)
 * otherwise leaves its last turned-away state unpublished until something unrelated wakes it.
 */

import type { TrailingThrottle } from '../../@types/utils/TrailingThrottle';
import { throttleByTime } from './throttleByTime';

export function throttleWithTrailingCall(
  minIntervalMs: number,
  onTrailing: () => void,
): TrailingThrottle {
  const gate = throttleByTime(minIntervalMs);
  let trailing: ReturnType<typeof setTimeout> | null = null;
  return {
    pass(nowMs) {
      if (gate(nowMs)) return true;
      trailing ??= setTimeout(() => {
        trailing = null;
        onTrailing();
      }, minIntervalMs);
      return false;
    },
    cancel() {
      if (trailing !== null) clearTimeout(trailing);
      trailing = null;
    },
  };
}
