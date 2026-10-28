/**
 * LAYER_BODY_ROWS: every composed Layer's body rows, folded by direct import
 * as `data/sources.ts` folds source rows. Rule: a host's Layer before the
 * Layers whose rows hang off it (the body Layer's Earth before the craft that
 * orbit it). The solver reorders by focus, so this is reading order, not a
 * correctness need; the composition's order is not read here.
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
