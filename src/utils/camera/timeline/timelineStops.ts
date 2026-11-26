/**
 * timelineStops — one craft's events grouped into leg boundaries: an event less than a day after
 * the stop's first joins it (Voyager 1's Titan and Saturn are one stop). A stop frames the
 * planet it flew past — of a moon-and-planet stop, the planet, the body that orbits the Sun —
 * else the body any of its events names (`targetId`), else Earth at a launch.
 */

import type { TimelineEvent } from '../../../@types/exhibits/timeline/TimelineEvent';
import type { TimelineStop } from '../../../@types/camera/timeline/TimelineStop';
import { bodyHostId } from '../../../data/bodies/positionDrivers';
import { DAY_MS } from '../../../data/time/dayMs';
import { timelineEventMs } from '../../exhibits/timeline/timelineEventMs';

function stopOf(events: readonly TimelineEvent[]): TimelineStop {
  const flybys = events.filter((e) => e.kind === 'flyby' && e.targetId !== undefined);
  const encounter = flybys.find((e) => bodyHostId(e.targetId!) === 'sun') ?? flybys[0] ?? null;
  const launched = events.some((e) => e.kind === 'launch');
  return {
    ms: timelineEventMs(events[0]!),
    events,
    planetId:
      encounter?.targetId ??
      events.find((e) => e.targetId !== undefined)?.targetId ??
      (launched ? 'earth' : null),
    encounter,
  };
}

export function timelineStops(events: readonly TimelineEvent[]): TimelineStop[] {
  const sorted = [...events].sort((a, b) => timelineEventMs(a) - timelineEventMs(b));
  const groups: TimelineEvent[][] = [];
  for (const event of sorted) {
    const group = groups.at(-1);
    if (group && timelineEventMs(event) - timelineEventMs(group[0]!) < DAY_MS) group.push(event);
    else groups.push([event]);
  }
  return groups.map(stopOf);
}
