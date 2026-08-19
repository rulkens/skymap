/**
 * Web-worker entry point for the point-cloud bake.
 *
 * ### Why this file exists
 *
 * Baking the interleaved vertex buffer for every loaded galaxy catalog costs
 * roughly 10 seconds of CPU at full deck (~3.5 M galaxies) — right when
 * the user expects the UI to come alive.  On the main thread that would
 * be *the* worst-felt freeze in the app, so the bake runs here,
 * off-thread.  Vite's `?worker` import suffix produces a class whose
 * instances run a fresh JS context; `postMessage` carries inputs and
 * outputs via structured clone (with an optional Transferable list to
 * avoid the copy).
 *
 * ### Why Transferable for both directions
 *
 * BigInt typed arrays (the cloud's `BigUint64Array` of object IDs) are
 * not on the Transferable allowlist — but the typed-array *wrapper*
 * doesn't need to be transferable, only its underlying `ArrayBuffer`
 * does, and ArrayBuffer IS on the allowlist.  Structured clone correctly
 * serialises typed-array views over transferred buffers (HTML spec
 * §StructuredSerialize step "If value has [[ArrayBufferData]]…").
 *
 * Cloning without transferring freezes the main thread for ~5 s on a
 * 100 MB SDSS+GLADE upload, blocking the `engineSourceCountReported` dispatch.  The
 * caller (`galaxyPointRenderer.defaultWorkerRunner`) therefore slices each
 * typed array's buffer to produce an owned copy and transfers those
 * slices via the `postMessage` transfer list — a one-shot ~50 ms memcpy
 * instead of a multi-second structured clone.
 *
 * On the way back the result's `interleaved` and `isFallbackArr`
 * ArrayBuffers are transferred — the worker has no further use for
 * them and the renderer treats the received bytes as authoritative.
 *
 * ### Lifecycle
 *
 * One message in, one message out, then the caller calls `worker.terminate()`
 * to free the JS context.  No long-running state here — every upload spawns
 * a fresh worker.  See `galaxyPointRenderer.upload()` for why.
 *
 * @module
 */

import { buildPointInterleavedBuffer } from './buildPointInterleavedBuffer';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';

// `self` inside a worker is the WorkerGlobalScope; we type-narrow via
// `as Worker`-style cast at the call site for `postMessage`.  The
// `onmessage` setter on the global scope itself is fine to type as
// `MessageEvent<T>` — TypeScript's lib.webworker.d.ts gives us the
// structural type when this file is bundled with the worker target.
self.onmessage = (event: MessageEvent<BuildPointInterleavedBufferInput>) => {
  const result: BuildPointInterleavedBufferResult = buildPointInterleavedBuffer(event.data);

  // Transfer the two large ArrayBuffers back to the caller — avoids a
  // copy of the per-vertex bytes (~14 MB at 3.5 M points × 48 B) and the
  // fallback-flag array (~3.5 MB).  The Schechter triple, mLim and nRef
  // are scalars; they ride along by structured clone.
  const transfer: Transferable[] = [result.interleaved.buffer, result.isFallbackArr.buffer];
  (self as unknown as Worker).postMessage(result, transfer);
};
