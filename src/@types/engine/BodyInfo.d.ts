/**
 * BodyInfo — the display-ready projection of a selected/hovered scene body
 * (a star, Earth, or a planet), mirroring the `GalaxyInfo` role for the point
 * cloud: a small serializable record the engine hands React so components render
 * a body's headline without importing scene-body or physics modules.
 *
 * The shape is deliberately minimal — only the fields the engine can know
 * *synchronously* from the resolved body: the `'body'` discriminant so a union
 * of selection infos can switch on `type`, the stable `id`/`label` for identity
 * and headline, the absolute `positionMpc` so the focus button can pivot the
 * camera without re-deriving xyz, and `radiusKm` for the framing distance. The
 * richer physical properties (spectral type, mass, luminosity, variability,
 * prose) live in the async `FamousStarMetaEntry` sidecar and are merged in only
 * once that JSON has loaded — keeping this record free of any fetch dependency
 * means a body is always immediately selectable, and the card fills in the extra
 * rows when the meta arrives (for famous stars; a planet shows its headline
 * alone until its own card copy lands).
 *
 * `positionMpc` stays a `Vec3` (never a raw tuple) so it speaks the one
 * absolute heliocentric, f64-valued frame every other position site uses.
 */

import type { Vec3 } from '../math/Vec3';

export type BodyInfo = {
  readonly type: 'body';
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number;
};
