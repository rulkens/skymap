/**
 * BodyPoseProvider — per-frame lookup from a body id to that body's
 * `BodyRelativePose`. Null ⇒ this body has no pose this frame (culled).
 */

import type { BodyId } from '../../data/body/BodyId';
import type { BodyRelativePose } from './BodyRelativePose';

export type BodyPoseProvider = (bodyId: BodyId) => BodyRelativePose | null;
