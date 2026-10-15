/**
 * Web-worker entry for the point-cloud bake: ~10 s of CPU at full deck
 * (~3.5 M galaxies) would otherwise freeze the main thread as the UI comes up.
 * Inputs and outputs travel as transferred ArrayBuffers — a BigUint64Array is
 * not Transferable but its buffer is, and a plain structured clone of a 100 MB
 * upload stalls the main thread ~5 s. The caller (`catalogStore`'s
 * `defaultWorkerRunner`) slice-copies the cloud before transferring, and
 * spawns one worker per upload: one message in, one out, then `terminate()`.
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

  // Transfer both ArrayBuffers back to the caller — avoids a copy of the
  // per-vertex bytes (~170 MB at 3.5 M points × 48 B) and the fallback-flag
  // array (~3.5 MB).
  const transfer: Transferable[] = [result.interleaved.buffer, result.isFallbackArr.buffer];
  (self as unknown as Worker).postMessage(result, transfer);
};
