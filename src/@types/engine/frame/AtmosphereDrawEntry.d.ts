/**
 * AtmosphereDrawEntry — one atmosphere body resolved for this frame: the seeded
 * body (Earth or a planet) paired with the `AtmosphereParams` row the shell
 * renderer integrates.
 *
 * The pairing exists so the sky-view bake and the shell draw walk the SAME
 * resolved list. Both consumers need the body's live position + orientation (for
 * the MVP, the sun rotation, and the camera-in-local-frame), its identity (for the
 * atmosphere-top radius scale, the id-keyed LUT, and the ring lookup), and its
 * params (for the atmosphere-top radius and the scattering coefficients); binding
 * them into one entry, derived once by `atmosphereDrawList`, is what keeps the bake
 * and the draw from ever disagreeing on which bodies have a live atmosphere this
 * frame — nor on WHERE it is.
 *
 * `positionMpc` + `orientation` are resolved ONCE from the per-frame body-state
 * snapshot (`sceneBodyStates`) at derivation, so the two consumers read one
 * resolved pairing and cannot drift to two positions. `body` is the union
 * `EarthBody | PlanetBody` carried for its authored identity alone — the derivation
 * reads only fields common to both (`id`, `radiusKm`), so an atmosphere body may be
 * Earth or any seeded planet with a params row.
 */

import type { EarthBody } from '../../scene/EarthBody';
import type { PlanetBody } from '../../scene/PlanetBody';
import type { AtmosphereParams } from '../../scene/AtmosphereParams';
import type { Vec3 } from '../../math/Vec3';
import type { Mat3 } from '../../math/Mat3';

export type AtmosphereDrawEntry = {
  readonly body: EarthBody | PlanetBody;
  readonly params: AtmosphereParams;
  /** Live heliocentric position, in Mpc — resolved from the per-frame snapshot. */
  readonly positionMpc: Vec3;
  /** Live local → equatorial-world rotation — resolved from the per-frame snapshot. */
  readonly orientation: Mat3;
  /** Camera position in atmosphere-top-radius units, body-local frame —
   *  derived once here instead of independently by atmosphereShellLayer.draw
   *  and encodeAtmosphereSkyView (was two call sites, same five inputs). */
  readonly camPosLocal: Vec3;
  /** Sun direction in the body's local frame — same hoist rationale. */
  readonly sunDirLocal: Vec3;
};
