import { selectTimelineEvents } from './selectTimelineEvents';
import { selectTimeState } from '../time/selectors';
import { stepToEvent } from '../time/timeSlice';
import { adjacentEventId } from '../../utils/exhibits/timeline/adjacentEventId';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { missionEventStepMs } from '../../utils/exhibits/timeline/missionEventStepMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
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
  const event = events.find((e) => e.id === adjacentEventId(events, simMs, direction));
  if (!event) return null;
  const simDays = unixMsToJulianDays(missionEventStepMs(event));
  return stepToEvent({ eventId: event.id, simDays, nowMs });
};
