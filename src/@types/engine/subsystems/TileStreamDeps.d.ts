/**
 * TileStreamDeps<T, S> — construction config for `createTileStreamSubsystem`.
 * `slots` is the store the stream allocates into and owns the evict handler
 * of. `upload`/`release` are the one payload-specific seam: writing a landed
 * payload into that store, and freeing one that arrives after its slot (or
 * the whole stream) has already been recycled.
 */

import type { SlotStore } from '../../cache/SlotStore';

export type TileStreamDeps<T, S extends SlotStore> = {
  readonly slots: S;
  /**
   * How many fetches this stream runs at once. Omitted falls through to
   * `PriorityQueue`'s own default. Belongs to the stream, not the queue:
   * each consumer fetches a different SHAPE of thing against the same
   * shared browser connection cap, and only the consumer knows which.
   */
  readonly concurrency?: number;
  /**
   * Wake the engine's render loop for the next frame. Called when a fetch
   * completes (so the payload can render) and when a fetch fails (so the
   * still-animating predicate re-checks `inFlightCount`).
   */
  readonly requestRender: () => void;
  /** Write a landed payload into `slots` at `slotIdx`. */
  readonly upload: (slots: S, slotIdx: number, payload: T) => void;
  /** Free a payload that has nowhere to go: its slot was recycled before
   *  `upload` ran, or it landed after the stream was destroyed. */
  readonly release: (payload: T) => void;
};
