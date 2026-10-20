/**
 * LAYER_BODY_ROWS: every composed Layer's body rows, folded by direct import
 * as `data/sources.ts` folds source rows. Append-only per Layer, in
 * composition order: the static body tables append this after core's own rows.
 */

import type { LayerBody } from '../../@types/engine/layer/LayerBody';
import { EARTH_SCENES_BODY_ROWS } from '../../layers/earthScenes/bodies/earthScenesBodyRows';

export const LAYER_BODY_ROWS: readonly LayerBody[] = [...EARTH_SCENES_BODY_ROWS];
