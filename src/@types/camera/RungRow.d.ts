import type { RungKind } from './RungKind';
import type { FrameOf } from './FrameOf';
import type { RungBasisCtx } from './RungBasisCtx';
import type { HostBody } from './HostBody';

/** One rung's table row: its kind and how to resolve its current host body. */
export type RungRow<K extends RungKind> = {
  readonly kind: K;
  host(frame: FrameOf[K], ctx: RungBasisCtx): HostBody | null;
};
