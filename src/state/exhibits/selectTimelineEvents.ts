import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import { missionTimelineKind } from '../../components/ExhibitOverlay/kinds/missionTimelineKind';
import { selectMissionCraft } from '../settings/core/missions/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import type { RootState } from '../../store/types';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';

/**
 * The events of the running exhibit's timeline section, narrowed to the emphasised craft's
 * (the exhibit's snapshot always sets one), or null when no timeline is up.
 */
export const selectTimelineEvents = (state: RootState): readonly MissionEvent[] | null => {
  const source = selectTakeoverSource(state);
  if (source?.kind !== 'exhibit') return null;
  for (const section of exhibitRegistry[source.id].body) {
    if (section.kind === missionTimelineKind) {
      const craft = selectMissionCraft(state);
      return (section.data as ExhibitTimelineSection).events.filter((e) => e.bodyId === craft);
    }
  }
  return null;
};
