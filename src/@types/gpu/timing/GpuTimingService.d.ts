/**
 * GpuTimingService — the public handle returned by
 * `createGpuTimingService(device)`.
 *
 * Two-mode lifecycle:
 *
 *   - **Active mode** — feature is supported AND `?gpuTimings` is set.
 *     `descriptorFor` returns a `RenderPassTimestampWrites` referencing
 *     the shared query set; `endFrame` issues resolve + copy commands
 *     into the supplied encoder and queues a `mapAsync` on the rotated
 *     staging buffer.  Subscribers fire 1–2 frames after each
 *     `endFrame`.
 *
 *   - **No-op mode** — feature is missing OR the gate is off (the gate
 *     is checked by the *caller* before constructing the service, so
 *     in practice the service only no-ops when the adapter lacks
 *     `timestamp-query`).  Every method short-circuits:
 *     `descriptorFor` returns `undefined`, `endFrame` does nothing,
 *     subscribers never fire.  Pass-orchestrator code reads the
 *     undefined return value and simply doesn't set
 *     `timestampWrites` on its render-pass descriptor — WebGPU
 *     interprets the missing field as "no timing requested".
 *
 * ### Why a single object exposing both modes
 *
 * Wrapping the no-op path in the same shape as the active path means
 * `renderFrame.ts` doesn't branch on availability — it always calls
 * `descriptorFor(...)` and lets the optional return value flow into
 * the descriptor literal via `...maybe`.  The branching collapses to
 * one site (service construction) instead of being repeated at every
 * call site.
 *
 * ### Subscriber lifetime
 *
 * `subscribe` returns an unsubscribe function in the now-standard
 * skymap pattern (matches `AssetSlot.subscribe`, `engineHandle.*.subscribe`).
 * The service holds listeners in a `Set`; unsubscribing inside a
 * dispatch is safe because the dispatch loop materialises the listener
 * array up-front each call.
 */

import type { TimingSlotName } from './TimingSlotName';
import type { TimingFrameContext } from './TimingFrameContext';
import type { GpuTimingFrame } from './GpuTimingFrame';

export type GpuTimingService = {
  /**
   * True when the underlying `timestamp-query` feature is available on
   * `device.features`.  Consumers (the DebugPanel) read this to choose
   * between the "unavailable on this adapter" message and the live
   * readout.
   */
  readonly available: boolean;
  /**
   * Start a frame's timing window.  Rotates the staging-buffer cursor
   * and returns an opaque context the orchestrator threads back into
   * `endFrame`.
   *
   * Cheap: integer arithmetic + a Map.clear().  No GPU work.
   */
  beginFrame(): TimingFrameContext;
  /**
   * Build the `RenderPassTimestampWrites` descriptor for the named
   * slot.  Returns `undefined` in no-op mode.
   *
   * The slot-to-index mapping is static (see
   * `src/services/gpu/timing/TIMING_SLOT_NAMES.ts`), so this method
   * doesn't need the frame context.
   */
  descriptorFor(slot: TimingSlotName): GPURenderPassTimestampWrites | undefined;
  /**
   * Record the `resolveQuerySet` + `copyBufferToBuffer` commands into
   * the supplied encoder, using `ctx` to pick the destination staging
   * buffer.  After `device.queue.submit(...)` runs (caller's
   * responsibility), the service queues an asynchronous `mapAsync` on
   * that staging buffer; when it completes, subscribers are notified.
   *
   * In no-op mode this is a no-op.
   */
  endFrame(ctx: TimingFrameContext, encoder: GPUCommandEncoder): void;
  /**
   * Register a `GpuTimingFrame` listener.  Returns an unsubscribe
   * function.  In no-op mode the subscription is recorded but never
   * fires.
   */
  subscribe(listener: (frame: GpuTimingFrame) => void): () => void;
  /**
   * Release the GPU query set and buffers.  After `destroy`, every
   * method except a redundant `destroy` is a no-op.  Called by the
   * engine's `destroy` chain.
   */
  destroy(): void;
};
