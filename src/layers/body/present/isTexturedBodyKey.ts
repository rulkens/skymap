import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import { bodyTextureSpec } from '../../../data/bodies/bodyTextureRegistry';

/**
 * True iff `bodyId` names a textured SPHERE body other than Earth (the set
 * `texturedBodyRenderer` owns). Registry membership excludes the rings.
 */
export function isTexturedBodyKey(bodyId: BodyTextureId | RingTextureId): bodyId is BodyTextureId {
  return bodyId !== 'earth' && bodyTextureSpec(bodyId) !== null;
}
