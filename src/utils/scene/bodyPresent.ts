/**
 * bodyPresent — whether a body exists in the scene at `simDays`: never before its row's
 * `presentFromIso`, and a sampled body only while its loaded track covers the instant (from its
 * launch when it has one, else from the first sample, to the last sample). An absent body still
 * has a snapshot position so lookups stay total; this gate is what keeps it undrawn. Runs per
 * body per frame, so every instant that can be parsed ahead is parsed here at load.
 */

import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import { SAMPLED_BODIES } from '../../data/bodies/sampledBodies';
import { trajectoryRegistry } from '../../services/bodies/trajectoryRegistry';
import { isoToJulianDays } from '../time/isoToJulianDays';

const PRESENT_FROM_DAYS = new Map<string, number>(
  SCENE_MESH_BODIES.flatMap(({ id, presentFromIso }) =>
    presentFromIso === undefined ? [] : [[id, isoToJulianDays(presentFromIso)]],
  ),
);

// NaN for a body never launched: its window opens on its track's first sample.
const LAUNCH_DAYS = new Map<string, number>(
  SAMPLED_BODIES.map(({ id, launch }) => [id, launch ? isoToJulianDays(launch.iso) : NaN]),
);

export function bodyPresent(id: string, simDays: number): boolean {
  if (simDays < (PRESENT_FROM_DAYS.get(id) ?? -Infinity)) return false;
  const launchDays = LAUNCH_DAYS.get(id);
  if (launchDays === undefined) return true;
  const track = trajectoryRegistry.get(id);
  if (track === undefined) return false;
  const { tDays } = track;
  const from = Number.isNaN(launchDays) ? tDays[0]! : launchDays;
  return simDays >= from && simDays <= tDays[tDays.length - 1]!;
}
