/**
 * createReadbackQueue — texture-to-CPU readbacks, serialized through ONE
 * promise chain no matter how many streams share the queue.
 *
 * `mapAsync` throws if the buffer is already mapped, so a fast slider drag
 * that re-requests before the last map lands must queue rather than race —
 * and the copy/submit must sit INSIDE the chain with the map, not run
 * eagerly, or a later request submits into a buffer an earlier one still has
 * mapped. Two independent chains reintroduce exactly that, which is why
 * `stream()` hands out separate TOKENS but never a separate chain — tokens
 * are per-stream, so an unrelated trigger cannot drop a still-pending
 * readback.
 */

/** One readback source: a texture, its staging buffer, and how to turn the mapped bytes into a result. */
export type ReadbackStreamSpec<T> = {
  /** Command-encoder label, also used to name the stream in a failure log. */
  readonly label: string;
  readonly texture: GPUTexture;
  /** Staging buffer, sized `bytesPerRow * height` and created COPY_DST | MAP_READ. */
  readonly buffer: GPUBuffer;
  /** Device-aligned row stride — see `alignedBytesPerRow`; `decode` is responsible for stripping the padding. */
  readonly bytesPerRow: number;
  readonly width: number;
  readonly height: number;
  /** Runs while the buffer is mapped; must copy out anything it wants to keep, since the range is invalid after unmap. */
  readonly decode: (mapped: ArrayBuffer) => T;
};

/** Same contract as `ReadbackStreamSpec`, sourced from a plain GPUBuffer (`copyBufferToBuffer`) rather than a texture — no row alignment, so `size` is the exact byte count. */
export type BufferReadbackStreamSpec<T> = {
  readonly label: string;
  readonly sourceBuffer: GPUBuffer;
  /** Staging buffer, sized `size` bytes and created COPY_DST | MAP_READ. */
  readonly buffer: GPUBuffer;
  readonly size: number;
  readonly decode: (mapped: ArrayBuffer) => T;
};

export type ReadbackStream<T> = {
  /**
   * Bump this stream's token and chain one copy/submit/map/decode. `onLand`
   * runs only if no later request on this stream superseded it — so a drag
   * coalesces to one landing rather than one per dragged frame.
   *
   * `onError` is optional and defaults to the pre-existing log-and-continue
   * behaviour (correct for every fire-and-forget cache-update caller this
   * had before — a dropped copy just leaves the cache one rebuild stale).
   * Pass it only from a caller that AWAITS this specific request (wrapping
   * it in a `Promise`, e.g. a debug readback) — one request's failure never
   * poisons the shared chain for the next caller either way, `onError` or
   * not.
   */
  request(onLand: (value: T) => void, onError?: (err: unknown) => void): void;
  /** How many requests this stream has made. Reported as the diagnostics' `generation`. */
  readonly generation: number;
};

export type ReadbackQueue = {
  stream<T>(spec: ReadbackStreamSpec<T>): ReadbackStream<T>;
  /** Buffer-sourced sibling of `stream` — same shared chain, so a buffer readback (e.g. a debug-only compute-output check) can never race a texture one for the same mapped-buffer reason. */
  bufferStream<T>(spec: BufferReadbackStreamSpec<T>): ReadbackStream<T>;
};

export function createReadbackQueue(device: GPUDevice): ReadbackQueue {
  let chain: Promise<void> = Promise.resolve();

  // Shared by both `stream` and `bufferStream`: only the copy command differs
  // (texture->buffer vs buffer->buffer), everything about queuing/mapping/
  // unmapping — the part this module's header calls load-bearing — is common.
  function chainedStream<T>(
    label: string,
    stagingBuffer: GPUBuffer,
    decode: (mapped: ArrayBuffer) => T,
    encodeCopy: (enc: GPUCommandEncoder) => void,
  ): ReadbackStream<T> {
    let token = 0;
    return {
      get generation(): number {
        return token;
      },

      request(onLand: (value: T) => void, onError?: (err: unknown) => void): void {
        const mine = ++token;
        chain = chain
          .then(async () => {
            // Superseded before the GPU work started: skip the copy entirely
            // rather than submit it and discard the result. Grid and content
            // stay paired because the copy happens immediately before its own
            // map, and callers re-request whenever they re-render the source.
            if (mine !== token) return;
            const enc = device.createCommandEncoder({ label });
            encodeCopy(enc);
            device.queue.submit([enc.finish()]);

            await stagingBuffer.mapAsync(GPUMapMode.READ);
            // try/finally, not a bare unmap: anything thrown between the map
            // and the unmap strands the buffer mapped forever, turning a
            // one-shot error into a permanently dead stream.
            let value: T;
            try {
              value = decode(stagingBuffer.getMappedRange());
            } finally {
              stagingBuffer.unmap();
            }
            // Superseded while the map was pending. The later request is
            // already chained behind this one, so landing now would clobber
            // `onLand`'s target with data that request is about to overwrite.
            if (mine !== token) return;
            onLand(value);
          })
          .catch((err) => {
            // Always logged (pre-existing behaviour for every caller), and
            // ALSO forwarded to whoever is awaiting `mine`'s own attempt —
            // `mine` never got superseded away from here, since a superseded
            // request returns above before doing any work worth failing at.
            console.error(`galaxy: ${label} failed`, err);
            onError?.(err);
          });
      },
    };
  }

  return {
    stream<T>(spec: ReadbackStreamSpec<T>): ReadbackStream<T> {
      return chainedStream(spec.label, spec.buffer, spec.decode, (enc) => {
        enc.copyTextureToBuffer(
          { texture: spec.texture },
          { buffer: spec.buffer, bytesPerRow: spec.bytesPerRow, rowsPerImage: spec.height },
          [spec.width, spec.height, 1],
        );
      });
    },

    bufferStream<T>(spec: BufferReadbackStreamSpec<T>): ReadbackStream<T> {
      return chainedStream(spec.label, spec.buffer, spec.decode, (enc) => {
        enc.copyBufferToBuffer(spec.sourceBuffer, 0, spec.buffer, 0, spec.size);
      });
    },
  };
}
