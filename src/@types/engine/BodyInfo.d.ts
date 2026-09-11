/**
 * BodyInfo — the display-ready projection of a selected/hovered scene body (a
 * star, Earth, a planet, an S-star), mirroring `GalaxyInfo`'s role for the point
 * cloud: a small serializable record the engine hands React so components render
 * a body's headline without importing scene-body or physics modules.
 *
 * Membership rule: the fields the engine knows *synchronously* from the resolved
 * body. Richer properties needing a fetch (spectral type, mass, luminosity,
 * prose) live in the async `FamousStarMetaEntry` sidecar and merge in when that
 * JSON lands, so a body is always immediately selectable. `orbit` satisfies that
 * rule rather than bending it — the S-star elements it derives from are
 * compiled-in TS, so there is no loading state to model; it is optional because
 * Earth, the planets and the famous stars genuinely have no elements.
 *
 * `positionMpc` stays a `Vec3` (never a raw tuple) so it speaks the one absolute
 * heliocentric, f64-valued frame every other position site uses, letting the
 * focus button pivot without re-deriving xyz; `radiusM` sets the framing
 * distance.
 */

import type { Vec3 } from '../math/Vec3';
import type { BodyOrbitInfo } from './BodyOrbitInfo';

export type BodyInfo = {
  readonly type: 'body';
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusM: number;
  readonly orbit?: BodyOrbitInfo;
};
