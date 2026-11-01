/**
 * BodyPoseProvider — per-frame lookup from a slab host id to that host's
 * `BodyRelativePose`. Null ⇒ no pose this frame (culled).
 *
 * Keyed on `PositionedId`, not `SceneBodyId`: a `body-m` row may hang off a place
 * (`PlaceId`), and this is the provider `deriveSlabs` builds its `vp` from.
 */

import type { BodyRelativePose } from './BodyRelativePose';
import type { PositionedId } from '../../scene/PositionedId';

export type BodyPoseProvider = (bodyId: PositionedId) => BodyRelativePose | null;
