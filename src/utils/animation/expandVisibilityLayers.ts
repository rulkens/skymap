/**
 * expandVisibilityLayers — expand the clip authoring vocabulary
 * (`VisibilityLayerArg`) into the atomic `VisibilityLayerKey`s the fade system
 * understands.
 *
 * `show`/`hide`/`fade` accept authoring AGGREGATES (`'labels'`) alongside atomic
 * keys so a tour can say `hide(['labels'])` instead of listing every label
 * layer. This function is the single expansion point: an aggregate maps to its
 * fixed key list; an atomic key passes through as a one-element list. Because
 * expansion happens at effect-construction time, the stored `SceneEffect.layers`
 * is always atomic — the fade registry, the settings bridge (`syncVisibilityFades`),
 * and the opacity channel never learn that aggregates exist.
 *
 * Aggregates live in a DATA TABLE (not a branch chain) so a second aggregate is
 * one row, not a new `if` — the same table-over-conditionals convention the
 * visibility action rows follow.
 */

import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { VisibilityLayerArg } from '../../@types/animation/VisibilityLayerArg';

/**
 * Authoring aggregate → the atomic layer keys it stands for, in reveal order
 * (cosmological outward-in: survey names, structure names, the YOU-ARE-HERE
 * pin, then the near-field star-map and scene-body captions).
 *
 * `labels` is TOTAL over the label-layer keys, which is the whole promise of
 * writing `hide(['labels'])` instead of listing them: a caption left out here
 * survives a cue that says it hid every label, and nothing in the type system
 * catches the omission. So a new label-layer `VisibilityLayerKey` belongs in
 * this list.
 */
const LAYER_GROUPS = {
  labels: ['surveyLabel', 'structureLabel', 'milkyWayLabel', 'starCatalogLabel', 'bodyLabel'],
} as const satisfies Record<string, readonly VisibilityLayerKey[]>;

export function expandVisibilityLayers(args: readonly VisibilityLayerArg[]): VisibilityLayerKey[] {
  // An aggregate resolves to its key list; anything else is already atomic. The
  // `?? [arg]` arm keys off the table being total over aggregates only — a
  // concrete VisibilityLayerKey misses the lookup and falls through as itself.
  return args.flatMap(
    (arg) => LAYER_GROUPS[arg as keyof typeof LAYER_GROUPS] ?? [arg as VisibilityLayerKey],
  );
}
