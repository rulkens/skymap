import { EARTH_SCENES_BODY_ROWS } from '../../layers/earthScenes/bodies/earthScenesBodyRows';
import { isMeshBody } from '../../utils/meshBodies/isMeshBody';

/**
 * The mesh bodies of the earthScenes Layer: its draw roster, and the ids its `earthScene`
 * selection kind claims. Data may import a Layer's `bodies/` (the `layerBodyRows` precedent).
 */
export const EARTH_SCENE_BODY_IDS: ReadonlySet<string> = new Set(
  EARTH_SCENES_BODY_ROWS.map((row) => row.body)
    .filter(isMeshBody)
    .map((body) => body.id),
);
