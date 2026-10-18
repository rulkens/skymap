/**
 * claimedLabelItemsOf — the ids a Layer's label entries claim from core's scene-body captions:
 * the `items` of every label entry but `own`. `own` is excluded because core's `label:body`
 * items are caption categories, and the Earth category's id is also Earth's body id.
 */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export function claimedLabelItemsOf(
  entries: readonly VisibilityEntry[],
  own: string,
): ReadonlySet<string> {
  return new Set(
    entries.flatMap((entry) =>
      'label' in entry && entry.label !== own ? (entry.items ?? []) : [],
    ),
  );
}
