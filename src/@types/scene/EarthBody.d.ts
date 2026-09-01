/**
 * EarthBody — a seeded scene body standing in for planet Earth.
 *
 * The record carries authored constants only — identity, not runtime-derived
 * state: an `id`/`label` for identity and UI and the body's physical `radiusM`.
 * Earth's time-varying position and orientation live in its `BodyState`, derived
 * from the orbital elements by `deriveBodyStates`, never baked here. The Blue
 * Marble skin is no longer a per-body `textureUrl`: Earth now rides the keyed
 * `bodyTextures` slot family alongside the other textured bodies, so the texture
 * is demanded by proximity through the registry, not authored here.
 *
 * `radiusM` is authored in SI metres and resolved into a draw-space sphere by
 * `composeBodyMvp` at render time rather than being pre-scaled into Mpc here,
 * keeping the unit conversion in one place.
 */

export type EarthBody = {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number; // metres (6 371 000)
};
