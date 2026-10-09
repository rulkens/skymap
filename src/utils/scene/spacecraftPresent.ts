/**
 * spacecraftPresent — whether a body exists in the scene at `simDays`: never before
 * its row's `presentFromIso`, and a sampled craft only once its track is loaded and
 * the clock has reached its first sample. An absent body still has a snapshot
 * position so lookups stay total; this gate is what keeps it undrawn.
 */

import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import { SAMPLED_BODIES } from '../../data/missions/spacecraftBodies';
import { trajectoryRegistry } from '../../services/bodies/trajectoryRegistry';
import { unixMsToJulianDays } from '../time/unixMsToJulianDays';

const SAMPLED_IDS = new Set(SAMPLED_BODIES.map((body) => body.id));
const PRESENT_FROM_DAYS = new Map(
  SCENE_MESH_BODIES.flatMap(({ id, presentFromIso }) =>
    presentFromIso === undefined ? [] : [[id, unixMsToJulianDays(Date.parse(presentFromIso))]],
  ),
);

export function spacecraftPresent(id: string, simDays: number): boolean {
  if (simDays < (PRESENT_FROM_DAYS.get(id) ?? -Infinity)) return false;
  if (!SAMPLED_IDS.has(id)) return true;
  const track = trajectoryRegistry.get(id);
  return track !== undefined && simDays >= track.tDays[0]!;
}
