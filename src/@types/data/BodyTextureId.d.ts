/**
 * BodyTextureId — the id of a body that carries a surface texture. A body is
 * textured **iff** its id appears here and keys `BODY_TEXTURE_REGISTRY`; there is
 * no separate baked `textured` flag (spec §4.2). Closed union by design: adding a
 * member forces every downstream `Record<BodyTextureId, …>` table to grow with
 * it, so the compiler names the sites a reviewer would have to find.
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
