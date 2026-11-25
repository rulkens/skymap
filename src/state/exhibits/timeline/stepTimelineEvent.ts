import { selectTimelineLane } from '../../settings/selectors';
import { selectTimeState } from '../../time/selectors';
import { stepToEvent } from '../../time/timeSlice';
import { adjacentEventId } from '../../../utils/exhibits/timeline/adjacentEventId';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { julianDaysToUnixMs } from '../../../utils/time/julianDaysToUnixMs';
import { timelineEventStepMs } from '../../../utils/exhibits/timeline/timelineEventStepMs';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import type { ExhibitTimelineData } from '../../../@types/exhibits/timeline/ExhibitTimelineData';
import type { RootState } from '../../../store/types';

/**
 * Step to the previous (-1) or next (+1) event of the selected craft on `timeline`. Null at
 * either end, so the keys are inert there.
 */
export const stepTimelineEvent = (
  state: RootState,
  timeline: ExhibitTimelineData,
  direction: -1 | 1,
) => {
  const craft = selectTimelineLane(state);
  const events = timeline.events.filter((e) => e.bodyId === craft);
  const nowMs = performance.now();
  const simMs = julianDaysToUnixMs(deriveSimDays(selectTimeState(state), nowMs));
  const event = events.find((e) => e.id === adjacentEventId(events, simMs, direction));
  if (!event) return null;
  const simDays = unixMsToJulianDays(timelineEventStepMs(event));
  return stepToEvent({ eventId: event.id, simDays, nowMs });
};
