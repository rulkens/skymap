/**
 * The Layer's one fade row. Its `key` and `handle` are load-bearing: the
 * tour's visibility actions and `VisibilityLayerKey` address the row by
 * them. No guard: the spheres are constants with no asset slot, so the
 * seed follows the toggle directly.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';

export function lightTimeFadeRows(): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'lightTime',
      expand: () => [undefined],
      handle: () => ({ kind: 'lightTime' }),
      seed: (s) => (s.lightTime.enabled ? 1 : 0),
      intent: (s) => s.lightTime.enabled,
    }),
  ];
}
