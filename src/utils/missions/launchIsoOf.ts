import { MISSION_EVENTS } from '../../data/missions/missionEvents.generated';

// The cited launch instant, not a re-typed copy of it.
export function launchIsoOf(craftId: string): string {
  const launch = MISSION_EVENTS.find((e) => e.bodyId === craftId && e.kind === 'launch');
  if (!launch) throw new Error(`launchIsoOf: no launch event for '${craftId}'`);
  return launch.iso;
}
