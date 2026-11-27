/**
 * siteBodyOfRow — the mesh body a selection row names when that body stands on a surface (a
 * `surfaceFixed` driver), else null. Returns the shared `SCENE_MESH_BODIES` record, so a store
 * selector built on it hands back the same reference until the row names another body.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import { positionDriverOrNull } from '../../data/bodies/positionDrivers';
import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import { selectionDriver } from './selectionDriver';

export function siteBodyOfRow(row: SelectionRowBase | null): MeshBody | null {
  const id = selectionDriver(row)?.poseId ?? null;
  if (id === null || positionDriverOrNull(id)?.kind !== 'surfaceFixed') return null;
  return SCENE_MESH_BODIES.find((body) => body.id === id) ?? null;
}
