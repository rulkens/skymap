/**
 * BodyInfo — the display-ready projection of a selected/hovered scene body
 * (Earth, a planet, a moon, a mesh body), mirroring `GalaxyInfo`'s role for the
 * point cloud: a small serializable record the engine hands React so components
 * render a body's headline without importing scene-body or physics modules.
 * Stars are not bodies here — they carry `StarInfo`.
 *
 * Membership rule: the fields the engine knows *synchronously* from the resolved
 * body. Richer properties needing a fetch live in an async sidecar and merge in
 * when that JSON lands, so a body is always immediately selectable.
 *
 * `positionMpc` stays a `Vec3` (never a raw tuple) so it speaks the one absolute
 * heliocentric, f64-valued frame every other position site uses, letting the
 * focus button pivot without re-deriving xyz. Size is NOT here (see
 * `MeshBody.boundingRadiusM`); the card resolves the seed by `id` instead.
 */

import type { Vec3 } from '../math/Vec3';

export type BodyInfo = {
  readonly type: 'body';
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
};
