/**
 * ALL_BODY_TEXTURE_KEYS — the full `(bodyId, kind)` key space of the
 * `bodyTextures` slot family: one entry per map a textured spherical body has,
 * plus a `surface` entry per ring strip.
 *
 * Derived from the two authored tables (`BODY_TEXTURE_REGISTRY` for the bodies,
 * where each row's `kinds` names the maps that body carries; `SCENE_RINGS` for
 * the rings) rather than hand-listed, so a new textured body, a new map kind on
 * an existing body, or a new ring joins the slot family, its demand/release
 * wiring row, and its `slotFor` routing automatically — one edit in an authored
 * table, no third list to keep in sync. This IS the iteration list `initGpu`
 * mints slots from and `assetWiring` maps `bodyTextureRow` over. Today every body
 * has only a `surface` kind, so this yields one entry per body plus the ring.
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
