import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import { SCENE_RINGS } from '../../../data/bodies/sceneRings';

/**
 * hostBodyId: the spherical body a texture key rides on. A `RingTextureId` maps to
 * its host (Saturn's ring to Saturn), since a ring has no orientation, position or
 * radius of its own; the ring-to-host link has ONE authored home (`SCENE_RINGS`).
 */
export function hostBodyId(id: BodyTextureId | RingTextureId): BodyTextureId {
  const ring = SCENE_RINGS.find((r) => r.textureId === id);
  return ring ? ring.bodyId : (id as BodyTextureId);
}
