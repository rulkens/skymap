/**
 * visibleStars — the seeded star set the near-field star layers actually draw
 * this frame, after the famous-stars master gate.
 *
 * Both star content rows (`starPointsLayer`, `starSpheresLayer`) feed their
 * `partitionStarsByResolution` call this set rather than `state.data.bodies.stars`
 * directly, so the `settings.famousStars.enabled` toggle is honoured in ONE
 * place shared across all four call sites (each layer's `enabled` gate + its
 * `draw`), keeping the enable gate and the drawn set from ever disagreeing —
 * the same one-partition-consumed-twice discipline the partition module keeps.
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
  if (state.settings.famousStars.enabled) return stars;
  return stars.filter((star) => star.id === SUN_BODY_ID);
}
