import { EARTH_SCENES_BODY_ROWS } from '../../layers/earthScenes/bodies/earthScenesBodyRows';
import { isMeshBody } from '../../utils/meshBodies/isMeshBody';

/**
 * The mesh bodies core still draws: earthScenes is bodies-only, so its rows ride core's mesh and
 * glint passes. Data may import a Layer's `bodies/` (the `layerBodyRows` precedent).
 * Delete when earthScenes draws its own rows.
 */
export const CORE_MESH_BODY_IDS: ReadonlySet<string> = new Set(
  EARTH_SCENES_BODY_ROWS.map((row) => row.body)
    .filter(isMeshBody)
    .map((body) => body.id),
);
