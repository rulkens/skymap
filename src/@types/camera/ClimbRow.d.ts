import type { ClimbableKind } from './ClimbableKind';
import type { RungRow } from './RungRow';
import type { ParentOf } from './ParentOf';
import type { FrameOf } from './FrameOf';
import type { FramedPose } from './FramedPose';
import type { RungBasisCtx } from './RungBasisCtx';
import type { RungCtx } from './RungCtx';

/** A `RungRow` that also knows how to fold to and from its parent rung, and when to cross. */
export type ClimbRow<K extends ClimbableKind> = RungRow<K> & {
  readonly parent: ParentOf[K];
  toParent(framed: FramedPose<K>, ctx: RungBasisCtx): FramedPose<ParentOf[K]>;
  fromParent(parent: FramedPose<ParentOf[K]>, frame: FrameOf[K], ctx: RungBasisCtx): FramedPose<K>;
  /** Band-in against the parent, focus rule included; null = stay put. */
  engage(parent: FramedPose<ParentOf[K]>, ctx: RungCtx): FrameOf[K] | null;
  /** Band-out; wider than `engage` by construction. */
  release(framed: FramedPose<K>, ctx: RungCtx): boolean;
};
