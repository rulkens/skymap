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

export type ReadbackStream<T> = {
  /**
   * Bump this stream's token and chain one copy/submit/map/decode. `onLand`
   * runs only if no later request on this stream superseded it — so a drag
   * coalesces to one landing rather than one per dragged frame.
   */
  request(onLand: (value: T) => void): void;
  /** How many requests this stream has made. Reported as the diagnostics' `generation`. */
  readonly generation: number;
};

export type ReadbackQueue = {
  stream<T>(spec: ReadbackStreamSpec<T>): ReadbackStream<T>;
};

export function createReadbackQueue(device: GPUDevice): ReadbackQueue {
  let chain: Promise<void> = Promise.resolve();

  return {
    stream<T>(spec: ReadbackStreamSpec<T>): ReadbackStream<T> {
      let token = 0;
      return {
        get generation(): number {
          return token;
        },

        request(onLand: (value: T) => void): void {
          const mine = ++token;
          chain = chain
            .then(async () => {
              // Superseded before the GPU work started: skip the copy entirely
              // rather than submit it and discard the result. Grid and content
              // stay paired because the copy happens immediately before its own
              // map, and callers re-request whenever they re-render the texture.
              if (mine !== token) return;
              const enc = device.createCommandEncoder({ label: spec.label });
              enc.copyTextureToBuffer(
                { texture: spec.texture },
                {
                  buffer: spec.buffer,
                  bytesPerRow: spec.bytesPerRow,
                  rowsPerImage: spec.height,
                },
                [spec.width, spec.height, 1],
              );
              device.queue.submit([enc.finish()]);

              await spec.buffer.mapAsync(GPUMapMode.READ);
              // try/finally, not a bare unmap: anything thrown between the map
              // and the unmap strands the buffer mapped forever, turning a
              // one-shot error into a permanently dead stream.
              let value: T;
              try {
                value = spec.decode(spec.buffer.getMappedRange());
              } finally {
                spec.buffer.unmap();
              }
              // Superseded while the map was pending. The later request is
              // already chained behind this one, so landing now would clobber
              // `onLand`'s target with data that request is about to overwrite.
              if (mine !== token) return;
              onLand(value);
            })
            .catch((err) => {
              console.error(`galaxy: ${spec.label} failed`, err);
            });
        },
      };
    },
  };
}
