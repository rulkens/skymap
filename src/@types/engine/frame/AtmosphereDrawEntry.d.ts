/**
 * AtmosphereDrawEntry — one atmosphere body resolved for this frame: the seeded
 * body (Earth or a planet) paired with the `AtmosphereParams` row the shell
 * renderer integrates.
 *
 * The pairing exists so the sky-view bake and the shell draw walk the SAME
 * resolved list. Both consumers need the body (for its position, radius, and
 * baked orientation) and its params (for the atmosphere-top radius and the
 * scattering coefficients); binding them into one entry, derived once by
 * `atmosphereDrawList`, is what keeps the bake and the draw from ever disagreeing
 * on which bodies have a live atmosphere this frame.
 *
 * `body` is the union `EarthBody | PlanetBody`: the derivation reads only the
 * fields common to both (`id`, `positionMpc`, `radiusKm`), so an atmosphere body
 * may be Earth or any seeded planet with a params row. The entry carries the whole
 * body because its consumers (the sky-view bake and the shell draw) additionally
 * read its baked `orientation`.
 */

import type { EarthBody } from '../../scene/EarthBody';
import type { PlanetBody } from '../../scene/PlanetBody';
import type { AtmosphereParams } from '../../scene/AtmosphereParams';

export type AtmosphereDrawEntry = {
  readonly body: EarthBody | PlanetBody;
  readonly params: AtmosphereParams;
};
