/**
 * The Layer's two fade rows: the disk and its "You are here" label fade
 * independently, each seeded from its own settings toggle so a disabled row
 * never flashes in on frame 1.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';

export function milkyWayFadeRows(): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'milkyWayDisk',
      expand: () => [undefined],
      handle: () => ({ kind: 'milkyWay' }),
      seed: (s) => (s.milkyWay.enabled ? 1 : 0),
      intent: (s) => s.milkyWay.enabled,
    }),
    fadeLayerRow({
      key: 'milkyWayLabel',
      expand: () => [undefined],
      handle: () => ({ kind: 'labelLayer', layer: 'milkyWay' }),
      seed: (s) => (s.milkyWay.labelEnabled ? 1 : 0),
      intent: (s) => s.milkyWay.labelEnabled,
    }),
  ];
}
