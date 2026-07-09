/**
 * sceneBodies — authored seeds for the scene's true-scale foreground bodies.
 *
 * These are data, not runtime state: constants the descent renders against
 * once the zoom reaches the local (sub-kiloparsec) neighbourhood. Positions
 * are authored in the units a human reads them in — Earth "1 AU from the
 * Sun" — and stored canonically in Megaparsecs via `SCALE_UNITS`, the same
 * absolute heliocentric frame every catalogue position lives in. Keeping the
 * conversion explicit (never an inline magic Mpc number) means the physical
 * relationship stays legible at the seed site, and every position speaks the
 * one draw-space language the renderer expects.
 *
 * `radiusKm` stays in kilometres — the body's native unit — and is resolved
 * into a draw-space sphere at render time, so the authored number remains the
 * one a reader recognises (Earth's 6371 km) rather than a pre-scaled decimal.
 *
 * Only Earth is seeded here for now; star and planet seeds join this module in
 * a later phase, which is why it is a data table rather than a single const.
 */

import { SCALE_UNITS } from '../scaleUnits';
import type { EarthBody } from '../../@types/scene/EarthBody';

/**
 * Earth at 1 AU along +X from the Sun (the render origin), Earth-sized.
 *
 * The real Earth orbits; this fixed placeholder position is what the descent
 * lands on. Authored `1 * SCALE_UNITS.AU_TO_MPC` so the AU → Mpc conversion is
 * the contract, not a buried constant.
 */
export const SCENE_EARTH: EarthBody = {
  id: 'earth',
  label: 'Earth',
  positionMpc: [1 * SCALE_UNITS.AU_TO_MPC, 0, 0],
  radiusKm: 6371,
  textureUrl: '/images/earth/blue-marble-4k.jpg',
};
