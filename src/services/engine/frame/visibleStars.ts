/**
 * visibleStars — the seeded star set the near-field star layers actually draw
 * this frame, after the famous-star map's visibility gate.
 *
 * Both star content rows (`starPointsLayer`, `starSpheresLayer`) feed their
 * `partitionStarsByResolution` call this set rather than `state.data.bodies.stars`
 * directly, so the map's visibility gate is honoured in ONE place shared across
 * all four call sites (each layer's `enabled` gate + its `draw`), keeping the
 * enable gate and the drawn set from ever disagreeing — the same
 * one-partition-consumed-twice discipline the partition module keeps.
 *
 * ### Both halves of the visibility axis
 *
 * The gate is the cluster master AND the row's own bit, because a star catalog's
 * visibility is a two-level fact everywhere else in the engine: the asset-demand
 * predicate (`assetWiring`'s star-catalog row) and the survey draw path
 * (`starCatalogLayer`) both require `starCatalogs.enabled` before consulting
 * `items[id].enabled`. A cluster master that governed the survey row but not the
 * seeded one would be a master over PART of its own cluster — the Stars panel
 * derives its header tri-state over every star-catalog id, so it would show a
 * checkbox claiming authority it did not have. `foregroundLabelsLayer` composes
 * the same two bits for the map's captions, keeping dots and names in lockstep.
 *
 * ### The Sun is exempt
 *
 * The toggle hides the SEEDED FAMOUS-STAR MAP, not the solar system: with the
 * gate off this returns the Sun ALONE. The Sun anchors the final descent (it is
 * the render origin, and Earth/planets ride their own layers), so muting the
 * curated neighbourhood must never make the destination vanish. The filter is
 * over the ≤130 static seed bodies, cheap enough to run per frame — no cached
 * sun-only array to keep in sync with a reseed.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StarBody } from '../../../@types/scene/StarBody';

/** The body id of the Sun in the seeded star set — the one star exempt from the gate. */
const SUN_BODY_ID = 'sun';

export function visibleStars(state: EngineState): readonly StarBody[] {
  const stars = state.data.bodies.stars;
  const { enabled, items } = state.settings.starCatalogs;
  if (enabled && items.famousStar.enabled) return stars;
  return stars.filter((star) => star.id === SUN_BODY_ID);
}
