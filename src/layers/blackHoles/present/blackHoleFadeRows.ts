/**
 * The Layer's one fade row: the holes' captions, so a Labels toggle eases the
 * name out rather than popping it. Keyed `bodyLabel`, whose tour action row
 * writes `blackHoles.items` beside `bodies.items`, so a `hide(['labels'])` cue
 * hides the Galactic Centre caption and the snapshot restores it.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';
import { BLACK_HOLE_SOURCE_ROWS } from '../sources/blackHoleSourceRows';

const BLACK_HOLE_IDS = BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => entry.id);

export function blackHoleFadeRows(): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'bodyLabel',
      expand: () => BLACK_HOLE_IDS,
      handle: (id) => ({ kind: 'labelLayer', layer: 'blackHoles', item: id }),
      seed: (s, id) => (s.blackHoles.items[id].labelEnabled ? 1 : 0),
      intent: (s, id) => s.blackHoles.items[id].labelEnabled,
    }),
  ];
}
