/**
 * BodyRegionId — the scale regimes the scene's bodies sit in.
 *
 * A regime, not a place: `solar-system` and `solar-neighbourhood` share the
 * Sun's position and are separated only by seven orders of magnitude of extent.
 */

export type BodyRegionId = 'solar-system' | 'solar-neighbourhood' | 'galactic-centre';
