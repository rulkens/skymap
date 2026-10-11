import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import { selectMissionCraft } from '../settings/core/missions/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import type { RootState } from '../../store/types';
import type { MissionEvent } from '../../@types/missions/MissionEvent';

/**
 * The events of the running exhibit's timeline section, narrowed to the emphasised craft's
 * (the exhibit's snapshot always sets one), or null when no timeline is up.
 */
export const selectTimelineEvents = (state: RootState): readonly MissionEvent[] | null => {
  const source = selectTakeoverSource(state);
  if (source?.kind !== 'exhibit') return null;
  for (const section of exhibitRegistry[source.id].body) {
    if (section.kind === 'timeline') {
      const craft = selectMissionCraft(state);
      return section.events.filter((e) => e.bodyId === craft);
    }
  }
  return null;
};
