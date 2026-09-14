import type { RungKind } from './RungKind';
import type { FrameOf } from './FrameOf';
import type { MemOf } from './MemOf';
import type { RungBasisCtx } from './RungBasisCtx';
import type { HostBody } from './HostBody';

/** One rung's table row: its kind, how to resolve its current host body, and its empty memory. */
export type RungRow<K extends RungKind> = {
  readonly kind: K;
  host(frame: FrameOf[K], ctx: RungBasisCtx): HostBody | null;
  /** Rung-local gesture memory; the runtime wipes it when `frameKey` changes. */
  readonly emptyMemory: MemOf[K];
};
