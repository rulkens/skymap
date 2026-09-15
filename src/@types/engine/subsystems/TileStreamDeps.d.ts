/**
 * TileStreamDeps<T> — construction config for `createTileStreamSubsystem`.
 * `upload`/`release` are the one payload-specific seam: writing a landed
 * payload into the shared `TextureAtlas`, and freeing one that arrives
 * after its slot (or the whole stream) has already been recycled.
 */

import type { TextureAtlas } from '../../../services/gpu/resources/textureAtlas';

export type TileStreamDeps<T> = {
  readonly device: GPUDevice;
  /** Side length, in pixels, of the square atlas texture. */
  readonly atlasSide: number;
  /** Side length, in pixels, of each square slot within the atlas. */
  readonly slotSide: number;
  /** Pixel format of the underlying GPUTexture. */
  readonly format: GPUTextureFormat;
  /** GPU debug label for the atlas texture (see `TextureAtlas`). */
  readonly label: string;
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
  /** Write a landed payload into `atlas` at `slotIdx`. */
  readonly upload: (atlas: TextureAtlas, slotIdx: number, payload: T) => void;
  /** Free a payload that has nowhere to go: its slot was recycled before
   *  `upload` ran, or it landed after the stream was destroyed. */
  readonly release: (payload: T) => void;
};
