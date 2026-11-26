/** voyagerTimeline — the Voyager exhibit's timeline section data, as its hold and camera row get it. */

import { voyagerMissions } from '../../../src/layers/missions/exhibits/voyagerMissions/voyagerMissions';
import { timelineKind } from '../../../src/components/ExhibitOverlay/kinds/timelineKind';
import type { ExhibitTimelineData } from '../../../src/@types/exhibits/timeline/ExhibitTimelineData';

export function voyagerTimeline(): ExhibitTimelineData {
  const section = voyagerMissions.body.find((s) => s.kind === timelineKind);
  if (!section) throw new Error('the Voyager exhibit has no timeline section');
  return section.data as ExhibitTimelineData;
}
