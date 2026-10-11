/**
 * The Layer's two fade rows, one handle per category each: a category's rings
 * and its labels fade independently, each seeded from its own settings toggle
 * so a disabled row never flashes in on frame 1.
 */

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';

export function structureFadeRows(): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'structureRing',
      expand: () => STRUCTURE_IDS,
      handle: (id) => ({ kind: 'structure', id }),
      seed: (s, id) => (s.structures.items[id].enabled ? 1 : 0),
      intent: (s, id) => s.structures.items[id].enabled,
    }),
    fadeLayerRow({
      key: 'structureLabel',
      expand: () => STRUCTURE_IDS,
      handle: (id) => ({ kind: 'labelLayer', layer: 'structure', item: id }),
      seed: (s, id) => (s.structures.items[id].labelEnabled ? 1 : 0),
      intent: (s, id) => s.structures.items[id].labelEnabled,
    }),
  ];
}
