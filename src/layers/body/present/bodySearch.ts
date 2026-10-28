/**
 * bodySearch — the body Layer's `search` feed: one primary palette row per Earth, planet and
 * moon, static, so it yields once. A body's chip is its scale region (every row here reads
 * "Solar System"); the stars keep the constellation-first chip in the star Layer's own rows.
 */

import { BODY_BODY_ROWS } from '../bodies/bodyBodyRows';
import { regionOfBody } from '../../../utils/regions/regionOfBody';
import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import type { LayerSearchEntry } from '../../../@types/engine/layer/LayerSearchEntry';

export async function* bodySearch(): AsyncIterable<readonly LayerSearchEntry[]> {
  yield BODY_BODY_ROWS.map(({ body }) => ({
    id: `${BODY_FOCUS_PREFIX}${body.id}`,
    class: 'primary' as const,
    names: [body.label],
    chip: regionOfBody(body.id)?.label,
  }));
}
