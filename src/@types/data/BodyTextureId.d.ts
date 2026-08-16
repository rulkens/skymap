/**
 * BodyTextureId — the id of a body that carries a surface texture.
 *
 * This union is the source-of-truth for texture identity: a body is textured
 * **iff** its id appears here (and keys `BODY_TEXTURE_REGISTRY`). There is no
 * separate baked `textured` boolean on the body — the registry membership *is*
 * the flag (spec §4.2). Keeping identity in one place means adding a textured
 * body is a single registry row plus its raw-data entries, and a body maker's
 * "is this textured?" test is a registry lookup, not a second parallel list.
 *
 * The fifteen members are the textured set (spec §3): the eight major planets,
 * Earth's Moon, Jupiter's four Galilean moons, and Pluto + Charon. Emissive/flat
 * bodies (the Sun, Titan, the irregular moons) are rotation- and
 * texture-invariant and carry no id here.
 */

export type BodyTextureId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'moon'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'pluto'
  | 'charon';
