/**
 * gpuTimingService — owns a single shared GPUQuerySet + resolve buffer
 * + two double-buffered staging buffers, exposes a no-side-effect API
 * for the renderFrame orchestrator.
 *
 * ### Architecture (see spec for full rationale)
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ GPUQuerySet (32 × timestamp slots)                           │
 *   │   ↑ writes (per-pass beginningOf / endOfPassWriteIndex)      │
 *   │                                                              │
 *   │ Resolve buffer  (32 × u64, COPY_DST | QUERY_RESOLVE)         │
 *   │   ← resolveQuerySet(querySet, 0, 32, resolve, 0)             │
 *   │                                                              │
 *   │ Staging buffers ×2  (32 × u64, COPY_DST | MAP_READ)          │
 *   │   ← copyBufferToBuffer(resolve, 0, staging[ctx.slot], 0,256) │
 *   │   ↓ device.queue submits; staging.mapAsync() later resolves  │
 *   │ ▼                                                            │
 *   │ decodeTimestampBuffer(...) → Map<slot, ms>                   │
 *   │ ▼                                                            │
 *   │ subscribers(frame: GpuTimingFrame)                           │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Double-buffering matters because a frame's `mapAsync` doesn't
 * resolve immediately — it resolves once the GPU has executed every
 * submitted command up to and including the buffer's copy target,
 * which is typically 1–2 frames after submit.  Without two buffers
 * the next frame's resolve would race against the still-mapped one.
 *
 * ### Sentinel guarantee
 *
 * The decoder treats `(begin === 0n && end === 0n)` as "this slot
 * didn't run".  We rely on staging buffers starting zeroed and being
 * implicitly re-zeroed via the GPU's resolveQuerySet (which writes
 * only the slots the pass touched; untouched slots stay at their
 * zero-init value because the staging buffer was zero-initialised on
 * allocation).
 *
 * ### No-op mode
 *
 * When `device.features.has('timestamp-query')` is false, the
 * constructor short-circuits before any GPU resources are allocated.
 * Every method returns a sensible stub so callers can drop
 * `descriptorFor(slot)` into a pass descriptor unconditionally.
 */

import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import type { GpuTimingFrame } from '../../../@types/gpu/timing/GpuTimingFrame';
import type { TimingFrameContext } from '../../../@types/gpu/timing/TimingFrameContext';
import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';
import { TIMING_SLOT_NAMES, TIMING_QUERY_SET_SIZE } from './TIMING_SLOT_NAMES';
import { decodeTimestampBuffer } from './decodeTimestampBuffer';

/** 32 × u64 = 256 bytes. */
const BUFFER_BYTES = TIMING_QUERY_SET_SIZE * 8;

export function createGpuTimingService(device: GPUDevice): GpuTimingService {
  const available = device.features.has('timestamp-query');
  const listeners = new Set<(frame: GpuTimingFrame) => void>();

  // ── No-op short-circuit ──────────────────────────────────────────
  //
  // When the adapter lacks the feature, every method is a stub.
  // Returning these stubs from the same `createGpuTimingService` API
  // collapses availability branching to one site (the constructor)
  // rather than every consumer.  The renderFrame orchestrator can
  // call `svc.descriptorFor(...)` unconditionally and rely on the
  // optional-spread pattern.
  if (!available) {
    return {
      available: false,
      beginFrame(): TimingFrameContext {
        return { frameIndex: 0, stagingSlot: 0 };
      },
      descriptorFor(): GPURenderPassTimestampWrites | undefined {
        return undefined;
      },
      endFrame(): void {
        /* no-op */
      },
      subscribe(listener): () => void {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      destroy(): void {
        listeners.clear();
      },
    };
  }

  // ── Active mode: allocate GPU resources once ─────────────────────
  const querySet = device.createQuerySet({
    type: 'timestamp',
    count: TIMING_QUERY_SET_SIZE,
    label: 'gpuTimingService.querySet',
  });

  const resolveBuffer = device.createBuffer({
    size: BUFFER_BYTES,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
    label: 'gpuTimingService.resolve',
  });

  const stagingBuffers: [GPUBuffer, GPUBuffer] = [
    device.createBuffer({
      size: BUFFER_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      label: 'gpuTimingService.staging[0]',
    }),
    device.createBuffer({
      size: BUFFER_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      label: 'gpuTimingService.staging[1]',
    }),
  ];
  const inFlight: [boolean, boolean] = [false, false];

  // Pre-built per-slot descriptors.  The slot mapping is static, so
  // each descriptor object is constructed once and reused per frame.
  const slotDescriptors = new Map<TimingSlotName, GPURenderPassTimestampWrites>();
  for (const [slot, [begin, end]] of TIMING_SLOT_NAMES) {
    slotDescriptors.set(slot, {
      querySet,
      beginningOfPassWriteIndex: begin,
      endOfPassWriteIndex: end,
    });
  }

  // timestampPeriod is a per-queue scalar (nanoseconds per tick).
  // Most desktop adapters expose 1.0; some browsers expose a coarse
  // value (38.5 typical) for fingerprint resistance.
  const timestampPeriod =
    (device.queue as GPUQueue & { timestampPeriod?: number }).timestampPeriod ?? 1;

  let nextFrameIndex = 0;
  let nextStagingSlot: 0 | 1 = 0;
  let destroyed = false;

  function beginFrame(): TimingFrameContext {
    const ctx: TimingFrameContext = {
      frameIndex: nextFrameIndex,
      stagingSlot: nextStagingSlot,
    };
    nextFrameIndex++;
    nextStagingSlot = nextStagingSlot === 0 ? 1 : 0;
    return ctx;
  }

  function descriptorFor(slot: TimingSlotName): GPURenderPassTimestampWrites | undefined {
    if (destroyed) return undefined;
    return slotDescriptors.get(slot);
  }

  function endFrame(ctx: TimingFrameContext, encoder: GPUCommandEncoder): void {
    if (destroyed) return;
    // If the destination staging buffer is still mapped from a previous
    // frame (mapAsync hasn't resolved yet), skip this frame's resolve.
    if (inFlight[ctx.stagingSlot]) return;

    encoder.resolveQuerySet(querySet, 0, TIMING_QUERY_SET_SIZE, resolveBuffer, 0);
    encoder.copyBufferToBuffer(resolveBuffer, 0, stagingBuffers[ctx.stagingSlot], 0, BUFFER_BYTES);

    inFlight[ctx.stagingSlot] = true;
    const slot = ctx.stagingSlot;
    const capturedFrameIndex = ctx.frameIndex;
    const buf = stagingBuffers[slot];

    void buf
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (destroyed) return;
        const mapped = buf.getMappedRange();
        // Copy out the mapped bytes before unmap so the listener pump
        // can decode after the buffer is unmapped.
        const copy = mapped.slice(0);
        buf.unmap();

        const perPassMs = decodeTimestampBuffer(copy, timestampPeriod);
        // Materialise the listener set into an array before dispatch
        // so an unsubscribe inside a listener doesn't mutate the
        // iterator we're walking.
        const snapshot = Array.from(listeners);
        const frame: GpuTimingFrame = {
          frameIndex: capturedFrameIndex,
          perPassMs,
        };
        for (const l of snapshot) l(frame);
      })
      .catch(() => {
        // Device-lost or destroyed-mid-map: silently drop.
      })
      .finally(() => {
        inFlight[slot] = false;
      });
  }

  function subscribe(listener: (frame: GpuTimingFrame) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    listeners.clear();
    querySet.destroy();
    resolveBuffer.destroy();
    stagingBuffers[0].destroy();
    stagingBuffers[1].destroy();
  }

  return {
    available: true,
    beginFrame,
    descriptorFor,
    endFrame,
    subscribe,
    destroy,
  };
}
