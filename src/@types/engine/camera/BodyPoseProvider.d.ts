/**
 * BodyPoseProvider — per-frame lookup from a slab host id to that host's
 * `BodyRelativePose`. Null ⇒ no pose this frame (culled).
 *
 * Keyed on `SlabHostId`, not `BodyId`: a `body-m` row may hang off a place
 * (`PlaceId`), and this is the provider `deriveSlabs` builds its `vp` from.
 */

import type { SlabHostId } from '../frame/SlabHostId';
import type { BodyRelativePose } from './BodyRelativePose';

export type BodyPoseProvider = (bodyId: SlabHostId) => BodyRelativePose | null;
