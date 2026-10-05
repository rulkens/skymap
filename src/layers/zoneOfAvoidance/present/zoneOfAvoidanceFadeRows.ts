/**
 * The Layer's one fade row. Its `key` and `handle` are load-bearing: the
 * tour's visibility actions and `VisibilityLayerKey` address the row by
 * them. One toggle drives both the band and its lettering. No guard: the
 * band is a compile-time constant with no asset slot, so nothing is
 * demand-loaded and the seed follows the toggle directly.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';

export function zoneOfAvoidanceFadeRows(): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'zoneOfAvoidance',
      expand: () => [undefined],
      handle: () => ({ kind: 'zoneOfAvoidance' }),
      seed: (s) => (s.zoneOfAvoidance.enabled ? 1 : 0),
      intent: (s) => s.zoneOfAvoidance.enabled,
    }),
  ];
}
