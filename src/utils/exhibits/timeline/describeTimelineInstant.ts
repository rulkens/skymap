import { missionEventMs } from './missionEventMs';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import type { TimelineLane } from '../../../@types/exhibits/TimelineLane';

const DAY_MS = 86_400_000;

/**
 * Screen-reader text for the thumb: '12 November 1980, 23:46 UTC, Voyager 1 at Saturn'.
 * The event part appears only when one lies within a day of the instant.
 */
export function describeTimelineInstant(
  ms: number,
  events: readonly MissionEvent[],
  lanes: readonly TimelineLane[],
): string {
  const date = new Date(ms).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = new Date(ms).toISOString().slice(11, 16);
  const near = events.find((e) => Math.abs(missionEventMs(e) - ms) <= DAY_MS);
  if (!near) return `${date}, ${time} UTC`;
  const craft = lanes.find((l) => l.bodyId === near.bodyId)?.label ?? near.bodyId;
  const what = near.kind === 'flyby' ? `at ${near.label}` : near.label.toLowerCase();
  return `${date}, ${time} UTC, ${craft} ${what}`;
}
