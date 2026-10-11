/**
 * The Layer's one fade row. Its `key` and `handle` are load-bearing: the
 * exhibit's visibility actions and `VisibilityLayerKey` address the row by
 * them. No guard: the seed follows the toggle; the pass gates on the tracks.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';

export function missionTrailsFadeRows(): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'missionTrails',
      expand: () => [undefined],
      handle: () => ({ kind: 'missionTrails' }),
      seed: (s) => (s.missions.trails ? 1 : 0),
      intent: (s) => s.missions.trails,
    }),
  ];
}
