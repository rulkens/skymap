import type { ClimbableKind } from '../../@types/ClimbableKind';
import type { CameraArmRow } from './CameraArmRow';
import type { ParentOf } from './ParentOf';
import type { FrameOf } from '../../../../../@types/camera/arms/FrameOf';
import type { FramedPose } from '../../../../../@types/camera/pose/FramedPose';
import type { CameraArmBasisCtx } from '../../../../../@types/camera/arms/CameraArmBasisCtx';
import type { CameraArmCtx } from '../../../../../@types/camera/arms/CameraArmCtx';

/** A `CameraArmRow` that also knows how to fold to and from its parent arm, and when to cross. */
export type ClimbRow<K extends ClimbableKind> = CameraArmRow<K> & {
  readonly parent: ParentOf[K];
  toParent(framed: FramedPose<K>, ctx: CameraArmBasisCtx): FramedPose<ParentOf[K]>;
  fromParent(
    parent: FramedPose<ParentOf[K]>,
    frame: FrameOf[K],
    ctx: CameraArmBasisCtx,
  ): FramedPose<K>;
  /** Band-in against the parent, focus rule included; null = stay put. */
  engage(parent: FramedPose<ParentOf[K]>, ctx: CameraArmCtx): FrameOf[K] | null;
  /** Band-out; wider than `engage` by construction. */
  release(framed: FramedPose<K>, ctx: CameraArmCtx): boolean;
};
