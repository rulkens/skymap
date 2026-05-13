/**
 * GpuTimingService — the public handle returned by
 * `createGpuTimingService(device, wanted)`.
 *
 * Two-mode lifecycle:
 *
 *   - **Active mode** (`enabled === true`) — `?gpuTimings` is set AND
 *     the adapter supports `timestamp-query`.  `descriptorFor` returns
 *     a `RenderPassTimestampWrites` referencing the shared query set;
 *     `endFrame` issues resolve + copy commands into the supplied
 *     encoder and queues a `mapAsync` on the rotated staging buffer.
 *     Subscribers fire 1–2 frames after each `endFrame`.
 *
 *   - **No-op mode** (`enabled === false`) — either the URL gate is
 *     off OR the adapter lacks `timestamp-query`.  Every method
 *     short-circuits: `descriptorFor` returns `undefined`, `endFrame`
 *     does nothing, subscribers never fire.  Pass-orchestrator code
 *     reads the undefined return value and simply doesn't set
 *     `timestampWrites` on its render-pass descriptor — WebGPU
 *     interprets the missing field as "no timing requested".
 *
 * ### Why always-constructed with a single flag
 *
 * The engine handle's `timingService` is non-nullable; the URL gate
 * decision is folded into the factory's `wanted` argument.  Consumers
 * gate work behind one check (`if (timingService.enabled) { ... }`)
 * rather than juggling `service === null`, `service.available`, AND
 * optional-chains at every call site.  In no-op mode no GPU resources
 * are allocated — the constructor takes the same short-circuit path
 * as it did when the URL gate was checked by the caller.
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
   * True when GPU timing is fully wired (the URL gate is on AND the
   * adapter supports `timestamp-query`).  Consumers gate their work
   * behind a single check: `if (timingService.enabled) { ... }`.
   * False covers both "user didn't opt in" and "feature missing on
   * this adapter"; the DebugPanel shows one combined message.
   */
  readonly enabled: boolean;
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
