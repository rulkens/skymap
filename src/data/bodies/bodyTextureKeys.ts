/**
 * ALL_BODY_TEXTURE_KEYS — the full `(bodyId, kind)` key space of the
 * `bodyTextures` slot family: one entry per map a textured spherical body has,
 * plus a `surface` entry per ring strip.
 *
 * Derived from `BODY_TEXTURE_REGISTRY` (each row's `kinds`) and `SCENE_RINGS`, so
 * a new body, kind or ring joins the slot family with no third list to keep in
 * sync. `bodyTextureSlots` mints slots from it and `bodyAssetRows` maps over it.
 */

import { BODY_TEXTURE_REGISTRY } from './bodyTextureRegistry';
import { SCENE_RINGS } from './sceneRings';
import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { BodyTextureKey } from '../../@types/data/BodyTextureKey';
import type { TextureKind } from '../../@types/data/TextureKind';

export const ALL_BODY_TEXTURE_KEYS: readonly BodyTextureKey[] = [
  ...(Object.keys(BODY_TEXTURE_REGISTRY) as BodyTextureId[]).flatMap((bodyId) =>
    (Object.keys(BODY_TEXTURE_REGISTRY[bodyId].kinds) as TextureKind[]).map(
      (kind): BodyTextureKey => ({ bodyId, kind }),
    ),
  ),
  ...SCENE_RINGS.map((ring): BodyTextureKey => ({ bodyId: ring.textureId, kind: 'surface' })),
];
