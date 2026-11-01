/**
 * earthSceneSearch — the earthScenes Layer's `search` feed: one primary palette row per scene,
 * chipped 'Earth'. Static, so it yields once; its id is the `body-<id>` the `earthScene` kind claims.
 */

import { EARTH_SCENES_BODY_ROWS } from '../bodies/earthScenesBodyRows';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import type { LayerSearchEntry } from '../../../@types/engine/layer/LayerSearchEntry';

export async function* earthSceneSearch(): AsyncIterable<readonly LayerSearchEntry[]> {
  yield EARTH_SCENES_BODY_ROWS.map((row) => row.body)
    .filter(isMeshBody)
    .map((body) => ({
      id: `${BODY_FOCUS_PREFIX}${body.id}`,
      class: 'primary' as const,
      names: [body.label],
      chip: 'Earth',
    }));
}
