/**
 * craftSearch — the missions Layer's `search` feed: one primary palette row per
 * craft, static, so it yields once. `CRAFT_SEARCH_NAMES` is also read by the
 * website's object catalogue, so a reader's nickname for a craft is authored here
 * once. A query matches a NAME verbatim, so designations and nicknames are listed
 * beside the label (petunias' are what a reader who knows the joke will type).
 */

import { MISSIONS_BODY_ROWS } from '../bodies/missionsBodyRows';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import type { LayerSearchEntry } from '../../../@types/engine/layer/LayerSearchEntry';

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  petunias: ['petunias', 'oh no not again'],
  voyager1: ['Voyager'],
  voyager2: ['Voyager'],
  hubble: ['HST', 'Hubble Space Telescope'],
  curiosity: ['MSL', 'Mars Science Laboratory'],
  perseverance: ['Percy', 'Mars 2020'],
  spirit: ['MER-A'],
  opportunity: ['Oppy', 'MER-B'],
};

export const CRAFT_SEARCH_NAMES: ReadonlyMap<string, readonly string[]> = new Map(
  MISSIONS_BODY_ROWS.map((row) => row.body)
    .filter(isMeshBody)
    .map((body) => [body.id, [body.label, ...(ALIASES[body.id] ?? [])]] as const),
);

export async function* craftSearch(): AsyncIterable<readonly LayerSearchEntry[]> {
  yield [...CRAFT_SEARCH_NAMES].map(([id, names]) => ({
    id: `${BODY_FOCUS_PREFIX}${id}`,
    class: 'primary' as const,
    names,
  }));
}
