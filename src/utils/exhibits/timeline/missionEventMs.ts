import type { MissionEvent } from '../../../@types/exhibits/timeline/MissionEvent';

export function missionEventMs(event: MissionEvent): number {
  return Date.parse(event.iso);
}
