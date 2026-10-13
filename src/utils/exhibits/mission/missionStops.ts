/**
 * missionStops — one craft's events grouped into leg boundaries: an event less than a day after
 * the stop's first joins it (Voyager 1's Titan and Saturn are one stop). A stop frames the
 * planet it flew past — of a moon-and-planet stop, the planet, the body that orbits the Sun.
 */

import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import type { MissionStop } from '../../../@types/missions/MissionStop';
import { bodyHostId } from '../../../data/bodies/positionDrivers';
import { DAY_MS } from '../../../data/time/dayMs';
import { missionEventMs } from '../timeline/missionEventMs';

function stopOf(events: readonly MissionEvent[]): MissionStop {
  const flybys = events.filter((e) => e.kind === 'flyby' && e.targetId !== undefined);
  const encounter = flybys.find((e) => bodyHostId(e.targetId!) === 'sun') ?? flybys[0] ?? null;
  const launched = events.some((e) => e.kind === 'launch');
  return {
    ms: missionEventMs(events[0]!),
    events,
    planetId: encounter?.targetId ?? (launched ? 'earth' : null),
    encounter,
  };
}

export function missionStops(events: readonly MissionEvent[]): MissionStop[] {
  const sorted = [...events].sort((a, b) => missionEventMs(a) - missionEventMs(b));
  const groups: MissionEvent[][] = [];
  for (const event of sorted) {
    const group = groups.at(-1);
    if (group && missionEventMs(event) - missionEventMs(group[0]!) < DAY_MS) group.push(event);
    else groups.push([event]);
  }
  return groups.map(stopOf);
}
