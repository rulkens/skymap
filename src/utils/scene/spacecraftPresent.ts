/**
 * spacecraftPresent — whether a body exists in the scene at `simDays`: never before
 * its row's `presentFromIso` (a sampled craft's launch), and a sampled craft only
 * once its track is loaded. An absent body still has a snapshot
 * position so lookups stay total; this gate is what keeps it undrawn.
 */

import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import { SAMPLED_BODY_IDS } from '../../data/missions/sampledBodyIds';
import { trajectoryRegistry } from '../../services/bodies/trajectoryRegistry';
import { unixMsToJulianDays } from '../time/unixMsToJulianDays';

const PRESENT_FROM_DAYS = new Map(
  SCENE_MESH_BODIES.flatMap(({ id, presentFromIso }) =>
    presentFromIso === undefined ? [] : [[id, unixMsToJulianDays(Date.parse(presentFromIso))]],
  ),
);

export function spacecraftPresent(id: string, simDays: number): boolean {
  if (simDays < (PRESENT_FROM_DAYS.get(id) ?? -Infinity)) return false;
  return !SAMPLED_BODY_IDS.includes(id) || trajectoryRegistry.get(id) !== undefined;
}
