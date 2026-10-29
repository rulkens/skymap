/**
 * LAYER_BODY_ROWS: every composed Layer's body rows, folded by direct import as
 * `data/sources.ts` does. A host's Layer comes before the Layers hanging off it; the solver
 * reorders by focus, so this is reading order only.
 */

import type { LayerBody } from '../../@types/engine/layer/LayerBody';
import { BODY_BODY_ROWS } from '../../layers/body/bodies/bodyBodyRows';
import { MISSIONS_BODY_ROWS } from '../../layers/missions/bodies/missionsBodyRows';
import { EARTH_SCENES_BODY_ROWS } from '../../layers/earthScenes/bodies/earthScenesBodyRows';

export const LAYER_BODY_ROWS: readonly LayerBody[] = [
  ...BODY_BODY_ROWS,
  ...MISSIONS_BODY_ROWS,
  ...EARTH_SCENES_BODY_ROWS,
];
