import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';
import { SCENE_RINGS } from '../../data/bodies/sceneRings';

/**
 * hostBodyId — the spherical body a texture key rides on.
 *
 * A `BodyTextureId` maps to itself; a `RingTextureId` maps to its host body
 * (Saturn's ring → Saturn), because a ring carries no orientation, position, or
 * radius of its own — it rides the host body's (spec §4.4). Every consumer that
 * needs the ring's host — the load-radius derivation, the demand/release
 * proximity read, the tier ceiling — routes through here, so the ring→host link
 * has ONE authored home (`SCENE_RINGS`, keyed by `textureId`) rather than a
 * `'saturn-ring' → 'saturn'` literal re-spelled at each call site.
 */
export function hostBodyId(id: BodyTextureId | RingTextureId): BodyTextureId {
  const ring = SCENE_RINGS.find((r) => r.textureId === id);
  return ring ? ring.bodyId : (id as BodyTextureId);
}
