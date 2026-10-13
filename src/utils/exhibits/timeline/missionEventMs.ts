import type { MissionEvent } from '../../../@types/missions/MissionEvent';

export function missionEventMs(event: MissionEvent): number {
  return Date.parse(event.iso);
}
