/** voyagerTimeline — the Voyager exhibit's timeline section data, as its hold and camera row get it. */

import { voyagerMissions } from '../../../src/layers/missions/exhibits/voyagerMissions';
import { missionTimelineKind } from '../../../src/layers/missions/exhibits/timeline/missionTimelineKind';
import type { MissionTimeline } from '../../../src/@types/exhibits/MissionTimeline';

export function voyagerTimeline(): MissionTimeline {
  const section = voyagerMissions.body.find((s) => s.kind === missionTimelineKind);
  if (!section) throw new Error('the Voyager exhibit has no timeline section');
  return section.data as MissionTimeline;
}
