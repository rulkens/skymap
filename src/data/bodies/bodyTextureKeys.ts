/**
 * ALL_BODY_TEXTURE_KEYS — the full key space of the `bodyTextures` slot family:
 * every textured spherical body plus every ring strip.
 *
 * Derived from the two authored tables (`BODY_TEXTURE_REGISTRY` for the bodies,
 * `SCENE_RINGS` for the rings) rather than hand-listed, so a new textured body
 * or ring joins the slot family, its demand/release wiring row, and its
 * `slotFor` routing automatically — one row in an authored table, no third list
 * to keep in sync. This IS the iteration list `initGpu` mints slots from and
 * `assetWiring` maps `bodyTextureRow` over.
 */

import { BODY_TEXTURE_REGISTRY } from './bodyTextureRegistry';
import { SCENE_RINGS } from './sceneRings';
import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';

export const ALL_BODY_TEXTURE_KEYS: readonly (BodyTextureId | RingTextureId)[] = [
  ...(Object.keys(BODY_TEXTURE_REGISTRY) as BodyTextureId[]),
  ...SCENE_RINGS.map((ring) => ring.textureId),
];
