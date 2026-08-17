// src/data/bodies/bodyAtlas.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-textures
// Source of truth:  src/data/bodies/bodyTextureRegistry.ts
import type { BodyTextureId } from '../../@types/data/BodyTextureId';

/** The atlas file this build wrote, under the textures directory. */
export const BODY_ATLAS_FILENAME = 'body-atlas.webp';

/** Each body's tile index in the atlas, row-major from the top-left cell. */
export const BODY_ATLAS_LAYOUT: Readonly<Record<BodyTextureId, number>> = {
  mercury: 0,
  venus: 1,
  earth: 2,
  mars: 3,
  jupiter: 4,
  saturn: 5,
  uranus: 6,
  neptune: 7,
  moon: 8,
  io: 9,
  europa: 10,
  ganymede: 11,
  callisto: 12,
  pluto: 13,
  charon: 14,
};

/** The grid those indices address. Feed it to `atlasTileRect` for a crop rect. */
export const BODY_ATLAS_GRID: Readonly<{ columns: number; tileW: number; tileH: number }> = {
  columns: 4,
  tileW: 512,
  tileH: 256,
};
