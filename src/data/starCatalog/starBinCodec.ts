/**
 * Sealed compression codec for the star catalog `.bin` files.
 *
 * The star catalogs (`stars-{small,medium,large}.bin`) are *encoded* in Node
 * by a `tsx` build script and *decoded* in the browser at load time. The codec
 * therefore has to be isomorphic — the exact same algorithm must be reachable
 * from both runtimes with no per-environment branching. That rules out
 * `node:zlib` (Node-only) and the browser-only nothing-in-particular: the one
 * API present and identical in both is the WHATWG Compression Streams standard,
 * `CompressionStream` / `DecompressionStream`. So we build the codec on those
 * web-streams globals, not on `node:zlib`.
 *
 * This module is the ONE place the pipeline names the compression algorithm.
 * Every encoder and decoder downstream imports `STAR_BIN_CODEC` /
 * `compressStarBin` / `decompressStarBin` and never mentions `'gzip'` or
 * `'zstd'` itself. Sealing the choice behind a single constant means the
 * decision below can be revisited in exactly one file, and no reader/writer
 * pair can ever silently disagree about the format.
 *
 * ── The codec decision: `'gzip'` ──────────────────────────────────────────
 *
 * zstd compresses tighter than gzip and would have been the first choice for a
 * size-budgeted catalog. It is rejected here on two independent, measured
 * grounds — either one alone forces gzip:
 *
 *   1. Node's `CompressionStream` cannot *produce* zstd. Probed locally on Node
 *      v23.11.1: `new CompressionStream('zstd')` throws
 *      "'zstd' is not a valid enum value of type CompressionFormat"; only
 *      `gzip` / `deflate` / `deflate-raw` construct. Since the build script is
 *      the encoder, an algorithm Node can't emit is a non-starter regardless of
 *      browser support.
 *
 *   2. Browser `DecompressionStream('zstd')` is not universally present. Per
 *      MDN's `DecompressionStream` compatibility data and caniuse
 *      (`mdn-api_decompressionstream_decompressionstream_zstd`, consulted
 *      2026-07-14): the zstd *format value* of the JS Compression Streams API is
 *      inconsistent across browsers — notably Safari's `DecompressionStream`
 *      does not accept `'zstd'` (Safari added zstd only as an HTTP
 *      content-encoding in Safari 26+, which is a separate mechanism from this
 *      JS API). So the "(a) zstd in BOTH Chrome AND Safari" branch of the
 *      verification is not satisfied.
 *
 * `gzip`, by contrast, is Baseline-widely-available in every `DecompressionStream`
 * since May 2023 and constructs fine in Node — the isomorphic requirement is met.
 *
 * ── Revisiting this constant ──────────────────────────────────────────────
 *
 * gzip's weaker ratio is a size risk, not a correctness one. The real
 * gzip-vs-budget measurement is deferred to the build task, because it needs
 * Morton-sorted packed records that don't exist yet — a raw-byte ratio here
 * would be meaningless. If that measurement finds gzip missing a tier budget by
 * a wide margin, escalating to a `zstd-wasm` decoder (a ~200 kB runtime
 * dependency) is a deliberate, user-gated STOP-and-report decision, never a
 * silent swap. This constant is the single lever that decision would move.
 */

/**
 * The sealed compression algorithm for star `.bin` payloads. Nothing else in
 * the pipeline may name a codec — import this constant instead.
 */
export const STAR_BIN_CODEC: 'gzip' | 'zstd' = 'gzip';

/**
 * Drive `bytes` through a Compression/Decompression stream and collect the
 * transformed output into a single contiguous `Uint8Array`.
 *
 * The write is fired without awaiting so the readable side can be drained
 * concurrently: a `CompressionStream` may buffer its whole output until the
 * writable end closes, and awaiting `write()` before reading could deadlock a
 * large single chunk against an unread readable buffer. The discarded
 * write-chain promise still needs a rejection handler, though: if the
 * transform errors mid-flight (e.g. `decompressStarBin` fed truncated or
 * non-gzip bytes), both `write()` and the chained `close()` reject, and the
 * read loop below rejects with that same stream error — which is the
 * function's one canonical error surface, already propagated to the caller
 * via the returned promise. An unhandled rejection on the write side would
 * just be a second, redundant signal for the identical failure, and Node
 * terminates a process on an unhandled rejection by default — so it is
 * caught and swallowed here rather than left to surface twice.
 */
async function pumpThrough(
  bytes: Uint8Array,
  transform: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // The stream sink is typed `BufferSource`, which this TS lib narrows to a
  // non-shared `ArrayBuffer`-backed view; a plain `Uint8Array` is `ArrayBufferLike`
  // (potentially `SharedArrayBuffer`-backed). Our buffers never are, so the cast
  // just bridges that lib-level over-strictness, not a real runtime difference.
  void writer
    .write(bytes as BufferSource)
    .then(() => writer.close())
    .catch(() => {
      /* swallowed: the read loop below rejects with the same stream error
       * and is the canonical surface for it. */
    });

  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// `STAR_BIN_CODEC` is typed as the sealed public union `'gzip' | 'zstd'`, but
// this TS lib's `CompressionFormat` predates browser zstd and omits it. The
// cast asserts the sealed value is a format the stream accepts — true for the
// current `'gzip'` seal. Flipping the seal to `'zstd'` would still compile here
// (that is the deliberate revisit lever) but is gated on the escalation
// described in the module docblock, so the cast can't drift silently.
const CODEC = STAR_BIN_CODEC as CompressionFormat;

/** Compress a plaintext star-bin payload with the sealed codec. */
export function compressStarBin(plain: Uint8Array): Promise<Uint8Array> {
  return pumpThrough(plain, new CompressionStream(CODEC));
}

/** Inflate a packed star-bin payload produced by {@link compressStarBin}. */
export function decompressStarBin(packed: Uint8Array): Promise<Uint8Array> {
  return pumpThrough(packed, new DecompressionStream(CODEC));
}
