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
 * ### Three gates, no exemption
 *
 * The store's star list holds the curated map, the Sun and the Galactic-Centre
 * S-stars, each answering to its own registry row: the map iff its star-catalog
 * row is on, the Sun iff `bodies.items.sun.enabled`, an S-star iff
 * `bodies.items['s-star'].enabled`. Muting the neighbourhood therefore leaves
 * the descent's aim point and the S-stars on screen as a consequence of
 * MEMBERSHIP — neither is in the set the map's gate governs — rather than a
 * hardcoded id exemption threaded through every gate the list touches. The
 * filter runs over the ≤200 static seed bodies, cheap enough per frame; no
 * cached array to keep in sync with a reseed.
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
 * keeping dots and names in lockstep — and reads `bodies.items.sun.enabled`
 * for the Sun's caption the same way it reads it here for the Sun's dot, so
 * the same lockstep holds for the Sun even though nothing writes that flag
 * today.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StarBody } from '../../../@types/scene/StarBody';
import { SUN_ENTRY } from '../../../data/sources/sun';
import { S_STAR_ENTRY } from '../../../data/sources/s-star';
import { SCENE_S_STARS } from '../../../data/bodies/sceneSStars';

/** Which registry row governs a star, when it is not the curated map's. */
type StarGate = 'sun' | 'sStar';

// The store's star list is a flat concatenation with no per-star source tag, so
// membership is what routes a star to its gate. A DATA table rather than a
// predicate chain: the Sun was the first exception and the S-stars are the
// second, which is the point at which a branch pair becomes a lookup.
const GATE_BY_STAR_ID: ReadonlyMap<string, StarGate> = new Map<string, StarGate>([
  [SUN_ENTRY.id, 'sun'],
  ...SCENE_S_STARS.map((star) => [star.id, 'sStar' as const] as const),
]);

export function visibleStars(state: EngineState): readonly StarBody[] {
  const starCatalogs = state.settings.starCatalogs;
  const mapOn = starCatalogs.enabled && starCatalogs.items.famousStar.enabled;
  const gateOn: Readonly<Record<StarGate, boolean>> = {
    sun: state.settings.bodies.items[SUN_ENTRY.id].enabled,
    sStar: state.settings.bodies.items[S_STAR_ENTRY.id].enabled,
  };
  return state.data.bodies.stars.filter((star) => {
    const gate = GATE_BY_STAR_ID.get(star.id);
    return gate === undefined ? mapOn : gateOn[gate];
  });
}
