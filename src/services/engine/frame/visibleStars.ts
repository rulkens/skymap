/**
 * visibleStars — the seeded star set the near-field star layers actually draw
 * this frame.
 *
 * Both star content rows (`starPointsLayer`, `starSpheresLayer`) feed their
 * `partitionStarsByResolution` call this set rather than `state.data.bodies.stars`
 * directly, so the gates are honoured in ONE place shared across all four call
 * sites (each layer's `enabled` gate + its `draw`), keeping the enable gate and
 * the drawn set from ever disagreeing — the same one-partition-consumed-twice
 * discipline the partition module keeps.
 *
 * ### Two gates, no exemption
 *
 * The seed table holds the curated map AND the Sun, but they answer to
 * different registry rows: the map contributes iff its star-catalog row is on,
 * the Sun iff `bodies.items.sun.enabled`. Muting the neighbourhood therefore
 * leaves the descent's aim point on screen as a consequence of MEMBERSHIP — the
 * Sun is simply not in the set the map's gate governs — rather than a hardcoded
 * id exemption threaded through every gate the table touches. The filter runs
 * over the ≤130 static seed bodies, cheap enough per frame; no cached array to
 * keep in sync with a reseed.
 *
 * ### Both halves of the map's visibility axis
 *
 * The map's gate is the cluster master AND the row's own bit, because a star
 * catalog's visibility is a two-level fact everywhere else in the engine: the
 * asset-demand predicate (`assetWiring`'s star-catalog row) and the survey draw
 * path (`starCatalogLayer`) both require `starCatalogs.enabled` before
 * consulting `items[id].enabled`. A cluster master that governed the survey row
 * but not the seeded one would be a master over PART of its own cluster — the
 * Stars panel derives its header tri-state over every star-catalog id, so it
 * would show a checkbox claiming authority it did not have.
 * `foregroundLabelsLayer` composes the same two bits for the map's captions,
 * keeping dots and names in lockstep.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StarBody } from '../../../@types/scene/StarBody';
import { SUN_ENTRY } from '../../../data/sources/sun';

export function visibleStars(state: EngineState): readonly StarBody[] {
  const starCatalogs = state.settings.starCatalogs;
  const mapOn = starCatalogs.enabled && starCatalogs.items.famousStar.enabled;
  const sunOn = state.settings.bodies.items.sun.enabled;
  // The seed table is a flat star list with no per-star source tag, so the id
  // is how a reader tells the Sun's row from the map's — a lookup key against
  // the registry row, not an exemption.
  return state.data.bodies.stars.filter((star) => (star.id === SUN_ENTRY.id ? sunOn : mapOn));
}
