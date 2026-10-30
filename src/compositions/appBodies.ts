/**
 * LAYER_BODY_ROWS: every composed Layer's body rows, collected by direct import of
 * each Layer's `bodies/` file, never `layer.ts` or `APP_COMPOSITION` (see `appVisibility.ts`).
 * A host's Layer (body's Earth) comes before the Layers whose rows orbit it; the solver
 * reorders by focus, so this is reading order only.
 */

import type { LayerBody } from '../@types/engine/layer/LayerBody';
import { BODY_BODY_ROWS } from '../layers/body/bodies/bodyBodyRows';
import { MISSIONS_BODY_ROWS } from '../layers/missions/bodies/missionsBodyRows';
import { EARTH_SCENES_BODY_ROWS } from '../layers/earthScenes/bodies/earthScenesBodyRows';

export const LAYER_BODY_ROWS: readonly LayerBody[] = [
  ...BODY_BODY_ROWS,
  ...MISSIONS_BODY_ROWS,
  ...EARTH_SCENES_BODY_ROWS,
];
