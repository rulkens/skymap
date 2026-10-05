import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import { selectTakeoverSource } from '../takeover/selectors';
import type { RootState } from '../../store/types';
import type { MissionEvent } from '../../@types/missions/MissionEvent';

/** The events of the running exhibit's timeline section, or null when none is up. */
export const selectTimelineEvents = (state: RootState): readonly MissionEvent[] | null => {
  const source = selectTakeoverSource(state);
  if (source?.kind !== 'exhibit') return null;
  for (const section of exhibitRegistry[source.id].body) {
    if (section.kind === 'timeline') return section.events;
  }
  return null;
};
