import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';
import { bodyTextureSpec } from '../../data/bodies/bodyTextureRegistry';

/**
 * True iff `bodyId` names a textured SPHERE body other than Earth — the set the
 * shared `texturedBodyRenderer` owns. Registry membership, not a hardcoded ring id,
 * is what excludes the rings, so a second ring joins with no dispatch edit.
 */
export function isTexturedBodyKey(bodyId: BodyTextureId | RingTextureId): bodyId is BodyTextureId {
  return bodyId !== 'earth' && bodyTextureSpec(bodyId) !== null;
}
