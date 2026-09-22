/**
 * The Layer's one fade row. Its `key` and `handle` are load-bearing: the tour's
 * visibility actions and `VisibilityLayerKey` address the row by them.
 * It seeds at 0 and fades IN on arrival — the demand-loaded asymmetry every
 * asset-backed row carries.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { FilamentsRuntime } from '../@types/FilamentsRuntime';

export function filamentsFadeRows(runtime: FilamentsRuntime): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'filaments',
      expand: () => [undefined],
      handle: () => ({ kind: 'filament' }),
      seed: () => 0,
      intent: (s) => s.filaments.enabled,
      // Unguarded, a tour reveal whose download is still in flight starts the fade
      // over an empty renderer, and the slot commit's default-duration re-sync then
      // stomps the authored ramp — the layer pops in wherever the invisible fade got.
      guard: () => runtime.renderer.hasCloud(),
    }),
  ];
}
