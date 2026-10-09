import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import { selectMissionEmphasis } from '../settings/core/orbitTrails/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import type { RootState } from '../../store/types';
import type { MissionEvent } from '../../@types/missions/MissionEvent';

/**
 * The events of the running exhibit's timeline section, narrowed to the emphasised craft's
 * (the first craft's when none is, as the timeline UI reads it), or null when no timeline is up.
 */
export const selectTimelineEvents = (state: RootState): readonly MissionEvent[] | null => {
  const source = selectTakeoverSource(state);
  if (source?.kind !== 'exhibit') return null;
  for (const section of exhibitRegistry[source.id].body) {
    if (section.kind === 'timeline') {
      const craft = selectMissionEmphasis(state) ?? section.crafts[0]!.bodyId;
      return section.events.filter((e) => e.bodyId === craft);
    }
  }
  return null;
};
