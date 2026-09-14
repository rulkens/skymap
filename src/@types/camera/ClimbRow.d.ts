import type { ClimbableKind } from './ClimbableKind';
import type { RungRow } from './RungRow';
import type { ParentOf } from './ParentOf';
import type { FrameOf } from './FrameOf';
import type { FramedPose } from './FramedPose';
import type { RungBasisCtx } from './RungBasisCtx';

/** A `RungRow` that also knows how to fold to and from its parent rung. */
export type ClimbRow<K extends ClimbableKind> = RungRow<K> & {
  readonly parent: ParentOf[K];
  toParent(framed: FramedPose<K>, ctx: RungBasisCtx): FramedPose<ParentOf[K]>;
  fromParent(parent: FramedPose<ParentOf[K]>, frame: FrameOf[K], ctx: RungBasisCtx): FramedPose<K>;
};
