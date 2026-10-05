/**
 * The Layer's one fade row. Its `key` and `handle` are load-bearing: the tour's
 * visibility actions and `VisibilityLayerKey` address the row by them.
 * It seeds at 0 and fades IN on arrival — the demand-loaded asymmetry every
 * asset-backed row carries.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { ConstellationsRuntime } from '../@types/ConstellationsRuntime';

export function constellationsFadeRows(
  runtime: ConstellationsRuntime,
): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'constellations',
      expand: () => [undefined],
      handle: () => ({ kind: 'constellations' }),
      seed: () => 0,
      intent: (s) => s.constellations.enabled,
      guard: () => runtime.renderer.hasData(),
    }),
  ];
}
