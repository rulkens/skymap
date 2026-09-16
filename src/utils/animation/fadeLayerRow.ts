/**
 * Erases a fade row's `Item` type for the heterogeneous manifest while KEEPING
 * its literal `key`, so a type-level test can still assert the rows cover
 * `VisibilityLayerKey` exactly. Sound because the seed walk only ever feeds a
 * row's own `expand()` output back into that same row.
 */

import type { FadeLayer } from '../../@types/animation/FadeLayer';
import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';

export function fadeLayerRow<Item, K extends VisibilityLayerKey>(
  row: FadeLayer<Item> & { readonly key: K },
): FadeLayer<unknown> & { readonly key: K } {
  return row as FadeLayer<unknown> & { readonly key: K };
}
