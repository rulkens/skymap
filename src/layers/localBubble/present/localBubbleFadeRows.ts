/**
 * The Layer's one fade row. Its `key` and `handle` are load-bearing: the
 * tour's visibility actions and `VisibilityLayerKey` address the row by
 * them. It seeds at 0 and fades IN on arrival — the demand-loaded asymmetry
 * every asset-backed row carries.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { LocalBubbleRuntime } from '../@types/LocalBubbleRuntime';

export function localBubbleFadeRows(runtime: LocalBubbleRuntime): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'localBubble',
      expand: () => [undefined],
      handle: () => ({ kind: 'localBubble' }),
      seed: () => 0,
      intent: (s) => s.localBubble.enabled,
      // Unguarded, a tour reveal whose download is still in flight starts the
      // fade over an empty renderer, and the slot commit's default-duration
      // re-sync then stomps the authored ramp — the layer pops in wherever
      // the invisible fade got.
      guard: () => runtime.renderer.hasMesh(),
    }),
  ];
}
