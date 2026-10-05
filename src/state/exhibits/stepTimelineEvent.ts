import { selectTimelineEvents } from './selectTimelineEvents';
import { selectTimeState } from '../time/selectors';
import { setSimDays } from '../time/timeSlice';
import { adjacentMissionEvent } from '../../utils/exhibits/timeline/adjacentMissionEvent';
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import type { RootState } from '../../store/types';

/**
 * Set the clock to the previous (-1) or next (+1) event of the running exhibit's timeline.
 * Null outside such an exhibit and at either end, so the keys are inert there.
 */
export const stepTimelineEvent = (state: RootState, direction: -1 | 1) => {
  const events = selectTimelineEvents(state);
  if (!events) return null;
  const nowMs = performance.now();
  const simMs = julianDaysToUnixMs(deriveSimDays(selectTimeState(state), nowMs));
  const target = adjacentMissionEvent(events, simMs, direction);
  return target ? setSimDays({ simDays: unixMsToJulianDays(missionEventMs(target)), nowMs }) : null;
};
