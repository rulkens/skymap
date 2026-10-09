import { selectTimelineEvents } from './selectTimelineEvents';
import { stepToMissionEvent } from './stepToMissionEvent';
import { selectTimeState } from '../time/selectors';
import { adjacentEventId } from '../../utils/exhibits/timeline/adjacentEventId';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import type { RootState } from '../../store/types';

/**
 * Step to the previous (-1) or next (+1) event of the running exhibit's timeline.
 * Null outside such an exhibit and at either end, so the keys are inert there.
 */
export const stepTimelineEvent = (state: RootState, direction: -1 | 1) => {
  const events = selectTimelineEvents(state);
  if (!events) return null;
  const nowMs = performance.now();
  const simMs = julianDaysToUnixMs(deriveSimDays(selectTimeState(state), nowMs));
  const eventId = adjacentEventId(events, simMs, direction);
  return eventId ? stepToMissionEvent({ eventId, nowMs }) : null;
};
