import type { MissionEvent } from '../@types/MissionEvent';

export function missionEventMs(event: MissionEvent): number {
  return Date.parse(event.iso);
}
