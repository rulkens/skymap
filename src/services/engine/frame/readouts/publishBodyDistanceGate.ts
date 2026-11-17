import { throttleByTime } from '../../../../utils/throttle/throttleByTime';

/**
 * ~4 Hz gate for the InfoCard's live distance row. Module scope on purpose: a
 * per-frame `throttleByTime(250)` would reset its closure and defeat itself.
 */
export const publishBodyDistanceGate = throttleByTime(250);
