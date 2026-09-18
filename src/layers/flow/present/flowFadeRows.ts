/**
 * The Layer's one fade row, `fadeLayers.ts`'s flow row verbatim. Its `key` and
 * `handle` are load-bearing: the tour's visibility actions and
 * `VisibilityLayerKey` address the row by them. Seeds at 0 and fades IN on
 * arrival — the demand-loaded asymmetry every asset-backed row carries.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { FlowRuntime } from '../types/FlowRuntime';

export function flowFadeRows(runtime: FlowRuntime): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'flow',
      expand: () => [undefined],
      handle: () => ({ kind: 'flow' }),
      seed: () => 0,
      intent: (s) => s.flow.enabled,
      // Keyed on the renderer's own "cube loaded" truth — correct for both the toggle and the slot commit.
      guard: () => runtime.renderer.fieldLoaded(),
    }),
  ];
}
