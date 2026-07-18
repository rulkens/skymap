#!/usr/bin/env node
/**
 * fetchDesi — chunked, resumable, rate-limited downloader for the DESI
 * DR1 LSS clustering catalogs (see `data/raw/desi/README.md` for the
 * per-tracer row counts and column layout, and
 * `docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md` for why
 * DESI's NGC clustering catalogs are the deep-cone source).
 *
 * ## Why chunked at all
 *
 * The four `.fits` files run 100–350 MB each (~820 MB combined). A plain
 * `fetch()` holds the whole response body in memory and, worse, treats any
 * mid-transfer network blip as a total loss — the entire multi-hundred-MB
 * file has to restart from byte 0. `data.desi.lbl.gov` also drops long
 * single-connection reads under load. Splitting each file into 8 MiB
 * `Range:` requests bounds per-request memory, lets a dropped chunk retry
 * in isolation, and lets a whole aborted run resume from wherever it left
 * off instead of re-fetching gigabytes that already landed.
 *
 * ## Why concurrency defaults to 6, not higher
 *
 * Live-verified against the server on 2026-07-07: pushing concurrent range
 * requests past ~6 per file reliably drew HTTP 503s. 6 is the largest
 * concurrency that held up in repeated spikes: fast enough to pull ~820 MB
 * in a reasonable time, low enough to stay under whatever per-client
 * connection cap the server enforces. `concurrency` is still a parameter
 * (not a hardcoded constant) so a future, more forgiving mirror doesn't
 * need a code change — but the *default* encodes the finding, and
 * `main()` never raises it above the default when chaining files (see the
 * sequential-files note below).
 *
 * ## Resume model
 *
 * Each chunk that lands successfully is recorded immediately — both the
 * bytes themselves (written at their absolute offset into `<dest>.part`)
 * and the chunk's index in a small JSON state sidecar,
 * `<dest>.chunks.json`. A chunk that fails every retry is simply never
 * added to that sidecar. Re-running `downloadChunked` against the same
 * `destPath` re-reads the sidecar, skips every already-completed chunk
 * (reported back as `chunksResumed`), and only asks the transport for the
 * chunks still missing. This mirrors the `fetchHyperLeda` resume rule
 * (write success, never write failure, let the next run pick up the
 * remainder) adapted from "one row per line" to "one byte range per
 * offset". On the run that completes every chunk, the `.part` file is
 * renamed to its final name and the state sidecar is deleted — there is
 * nothing left to resume.
 *
 * ## sha256 sidecar
 *
 * After each file finishes, its SHA-256 is upserted into the combined
 * `desi.sha256` sidecar (one `<hex>  <filename>` line per tracer file),
 * playing the same "detect a truncated or stale download" role the
 * CF-4 (`fetchCosmicflows4.ts`) and structures (`fetchStructureCatalogs.ts`)
 * sidecars play. Unlike those two, this sidecar isn't a maintainer-pinned
 * expected value checked into git ahead of time — DESI's DR1 catalogs
 * aren't hand-verified against a paper the way CF-4's table is. Instead
 * the *first* successful fetch writes the line, and every subsequent
 * fetch (a contributor re-running `fetch-desi`, or a CI re-fetch) must
 * reproduce the same hash. A mismatch means the file changed underfoot —
 * almost always a truncated or interrupted download — and the script
 * exits non-zero rather than silently accepting corrupt bytes into the
 * build pipeline.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { delay } from '../utils/async/delay';
import { RAW_DATA, rawDataPath } from '../utils/io/rawDataRegistry';
import { sha256OfFile } from './fetchCosmicflows4';

const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB — see module header.
const DEFAULT_CONCURRENCY = 6; // server 503s above this — see module header.
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_DELAY_MS = 1000;

/** One `Range:` slice of a file: `bytes=start-endInclusive`. */
export type RangeChunk = { index: number; start: number; endInclusive: number };

/**
 * Split `totalBytes` into contiguous, non-overlapping `RangeChunk`s of at
 * most `chunkBytes` each. The last chunk is whatever remains — it is
 * shorter than `chunkBytes` unless `totalBytes` is an exact multiple, in
 * which case there is no trailing zero-length chunk (the loop simply stops
 * once `start` reaches `totalBytes`).
 */
export function planChunks(
  totalBytes: number,
  chunkBytes: number = DEFAULT_CHUNK_BYTES,
): RangeChunk[] {
  const chunks: RangeChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < totalBytes) {
    const endInclusive = Math.min(start + chunkBytes, totalBytes) - 1;
    chunks.push({ index, start, endInclusive });
    start += chunkBytes;
    index++;
  }
  return chunks;
}

/**
 * Fetches the byte range `[start, endInclusive]` of `url` and resolves
 * with those bytes. Injected so tests never touch the network — production
 * wires this to a real `fetch()` with a `Range:` header (see
 * `httpRangeTransport` below); tests substitute a `vi.fn<RangeTransport>()`.
 *
 * Errors it throws may carry a `status?: number` (the HTTP status code);
 * an error with no `status` is treated as a network/timeout failure.
 */
export type RangeTransport = (
  url: string,
  start: number,
  endInclusive: number,
) => Promise<Uint8Array>;

export type DownloadResult = {
  bytesWritten: number;
  chunksFetched: number;
  chunksResumed: number;
};

/** `<dest>.part` — the in-progress download; renamed to `dest` on completion. */
function partPathFor(destPath: string): string {
  return `${destPath}.part`;
}

/** `<dest>.chunks.json` — durable record of which chunk indices have landed. */
function statePathFor(destPath: string): string {
  return `${destPath}.chunks.json`;
}

type ChunkState = { completed: number[] };

/**
 * Read the completed-chunk-index sidecar, if any. A missing or malformed
 * sidecar is treated as "nothing completed yet" — the safe default, since
 * it only costs a few re-fetched chunks rather than risking a resume that
 * trusts data that was never actually recorded.
 */
function readChunkState(statePath: string): Set<number> {
  if (!existsSync(statePath)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as ChunkState;
    return new Set(parsed.completed);
  } catch {
    return new Set();
  }
}

/**
 * Overwrite the state sidecar with the current completed-chunk set.
 * Called synchronously, right after a chunk's bytes are durably on disk —
 * `writeFileSync` blocks the single JS thread for the (tiny) duration of
 * the write, so concurrent workers can never interleave a partial write of
 * this file the way they could with an async write.
 */
function writeChunkState(statePath: string, completed: Set<number>): void {
  const sorted = Array.from(completed).sort((a, b) => a - b);
  writeFileSync(statePath, JSON.stringify({ completed: sorted } satisfies ChunkState));
}

/** Is `err`'s HTTP status one we should retry (503/429/5xx), or status-less (network/timeout)? */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  if (status === undefined) return true; // network/timeout — no status at all
  return status === 429 || status === 503 || (status >= 500 && status <= 599);
}

/**
 * Fetch one chunk, retrying on retryable failures with exponential backoff
 * (`baseDelayMs · 2^attempt`, attempt counted from the first failure). A
 * non-retryable status (403/404/…) rethrows immediately — a wrong URL or a
 * permission problem should fail loudly, not burn through eight attempts
 * over several minutes only to fail anyway.
 */
async function fetchChunkWithRetry(
  url: string,
  chunk: RangeChunk,
  transport: RangeTransport,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<Uint8Array> {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await transport(url, chunk.start, chunk.endInclusive);
    } catch (err) {
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

/**
 * The slice of `fs/promises.FileHandle` that `writeAll` needs — structural,
 * so tests can drive the short-write loop with a plain mock instead of a
 * real file handle.
 */
export type PositionalWriter = {
  write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesWritten: number }>;
};

/**
 * Write ALL of `bytes` at absolute `position`, looping on short writes.
 *
 * POSIX write(2) may accept fewer bytes than requested (signal
 * interruption, disk pressure) and Node surfaces that as `bytesWritten <
 * length` rather than an error — a single unchecked `handle.write` could
 * mark a chunk complete with a hole in the middle of the part file. A
 * write that makes zero progress throws instead of spinning forever.
 */
export async function writeAll(
  handle: PositionalWriter,
  bytes: Uint8Array,
  position: number,
): Promise<number> {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
      position + offset,
    );
    if (bytesWritten <= 0) {
      throw new Error(`short write stalled at offset ${offset}/${bytes.length}`);
    }
    offset += bytesWritten;
  }
  return bytes.length;
}

/**
 * Download `opts.url` to `opts.destPath` as a set of parallel `Range:`
 * chunks, resuming from whatever `<destPath>.chunks.json` already records
 * as complete.
 *
 * Concurrency is a worker-pool over a shared cursor (the same idiom
 * `fetchHyperLeda` uses for its PGC fetches) rather than `Promise.all` over
 * every chunk at once — the whole point of capping concurrency is to never
 * have more than `concurrency` requests in flight simultaneously.
 */
export async function downloadChunked(opts: {
  url: string;
  destPath: string;
  totalBytes: number;
  transport: RangeTransport;
  concurrency?: number;
  chunkBytes?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}): Promise<DownloadResult> {
  const {
    url,
    destPath,
    totalBytes,
    transport,
    concurrency = DEFAULT_CONCURRENCY,
    chunkBytes = DEFAULT_CHUNK_BYTES,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
  } = opts;

  mkdirSync(dirname(destPath), { recursive: true });

  const partPath = partPathFor(destPath);
  const statePath = statePathFor(destPath);
  const allChunks = planChunks(totalBytes, chunkBytes);

  // Stale-state guard: the chunk state is only meaningful while its .part
  // file exists — the completed indices describe byte ranges written INTO
  // that file. A chunks.json with no .part means a previous run crashed in
  // its completion window. If the final file is already in place, trusting
  // the stale state would be catastrophic: this run would open a fresh
  // EMPTY part file, see zero pending chunks, and rename the empty file
  // over the completed download — silent data loss. Discard the orphaned
  // state; keep the completed file if present, else fall through to a
  // fresh full download.
  if (existsSync(statePath) && !existsSync(partPath)) {
    rmSync(statePath, { force: true });
    if (existsSync(destPath)) {
      return { bytesWritten: totalBytes, chunksFetched: 0, chunksResumed: allChunks.length };
    }
  }

  const completed = readChunkState(statePath);
  const resumedChunks = allChunks.filter((c) => completed.has(c.index));
  const chunksResumed = resumedChunks.length;
  const resumedBytes = resumedChunks.reduce((sum, c) => sum + (c.endInclusive - c.start + 1), 0);
  const pending = allChunks.filter((c) => !completed.has(c.index));

  // Trivial zero-byte file: nothing to range-request, nothing to resume.
  if (allChunks.length === 0) {
    writeFileSync(destPath, new Uint8Array(0));
    return { bytesWritten: 0, chunksFetched: 0, chunksResumed: 0 };
  }

  // Open (or create) the part file for random-access writes. `r+` preserves
  // whatever bytes a prior interrupted run already wrote; `w+` creates a
  // fresh (empty, sparse-on-write) file when there's nothing to resume yet.
  const handle = await open(partPath, existsSync(partPath) ? 'r+' : 'w+');

  let chunksFetched = 0;
  let bytesWrittenThisRun = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const my = cursor++;
      if (my >= pending.length) return;
      const chunk = pending[my]!;
      const bytes = await fetchChunkWithRetry(url, chunk, transport, maxAttempts, baseDelayMs);
      // Length check deliberately OUTSIDE the retry loop: a wrong-length
      // body is not a transient server condition — it means the response
      // was truncated in a way the transport didn't surface, or the server
      // mishandled the Range. Retrying would re-download the same wrong
      // bytes; fail loudly instead.
      const expectedLength = chunk.endInclusive - chunk.start + 1;
      if (bytes.length !== expectedLength) {
        throw new Error(
          `chunk ${chunk.index} of ${url}: expected ${expectedLength} bytes ` +
            `(range ${chunk.start}-${chunk.endInclusive}), transport returned ${bytes.length}`,
        );
      }
      // Await FIRST, then accumulate. 'x += await f()' reads x BEFORE the
      // await suspends, so two workers can both read the same stale value
      // and the later resume silently overwrites the earlier addition —
      // the classic read-modify-write race, even single-threaded.
      const written = await writeAll(handle, bytes, chunk.start);
      bytesWrittenThisRun += written;
      // Durable "this chunk landed" record — written before moving on to
      // the next chunk this worker slot picks up, so a crash immediately
      // after never loses a completed chunk's bookkeeping. (Durability is
      // process-crash level, not fsync'd power-loss level — deliberate for
      // a resumable download tool; worst case is re-fetching a chunk.)
      completed.add(chunk.index);
      writeChunkState(statePath, completed);
      chunksFetched++;
    }
  }

  // allSettled, not all: a chunk that exhausts its retries should not tear
  // down the other in-flight workers mid-write (racing the failed worker's
  // rejection against a healthy worker's `handle.write` would either lose
  // that worker's completed-chunk bookkeeping or throw from a write against
  // an already-closed handle). Letting every worker run to completion first
  // maximises how much resumable progress a partially-failed run leaves
  // behind, then we surface the first failure (if any) once it's safe to
  // close the handle.
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()),
  );
  await handle.close();

  const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason;

  // Every chunk (this run's + prior resumed) is now on disk — the part
  // file is complete. Delete the state sidecar BEFORE renaming: a crash
  // between the two then leaves "complete .part, no state", and the next
  // run merely re-fetches this one file from scratch. The other order
  // leaves "final file + orphaned state", the exact configuration the
  // stale-state guard above exists to defuse — a cheap refetch beats any
  // chance of clobbering a good download.
  rmSync(statePath, { force: true });
  renameSync(partPath, destPath);

  return { bytesWritten: bytesWrittenThisRun + resumedBytes, chunksFetched, chunksResumed };
}

/**
 * Compute `filePath`'s SHA-256 and upsert a `<hex>  <filename>` line for it
 * into the combined sidecar at `sidecarPath`. If the sidecar already pins a
 * different hash for `filename`, throws rather than overwriting it — see
 * the module header's sha256-sidecar section for why a mismatch here means
 * "investigate", not "just update the line".
 *
 * Lifecycle is bootstrap-then-guard, not pre-pinned: the first real fetch
 * WRITES the line (there is nothing to verify against yet), that sidecar
 * then gets committed, and every later fetch must reproduce the committed
 * hash or fail — unlike CF-4's fetcher, whose expected hash is a constant
 * pinned in source before any download happens.
 */
export async function upsertSha256Sidecar(
  filePath: string,
  filename: string,
  sidecarPath: string,
): Promise<string> {
  const digest = await sha256OfFile(filePath);
  const lines = existsSync(sidecarPath)
    ? readFileSync(sidecarPath, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '')
    : [];
  const existingIdx = lines.findIndex((l) => l.trim().endsWith(`  ${filename}`));

  if (existingIdx !== -1) {
    const existingHash = lines[existingIdx]!.trim().split(/\s+/)[0];
    if (existingHash !== digest) {
      throw new Error(
        `sha256 mismatch for ${filename}:\n` +
          `  sidecar pins: ${existingHash}\n` +
          `  fresh hash:   ${digest}\n` +
          `This usually means a truncated or stale download. Delete the file ` +
          `and re-run \`npm run fetch-desi\` to refetch it from scratch.`,
      );
    }
    return digest; // already correct — nothing to write
  }

  lines.push(`${digest}  ${filename}`);
  mkdirSync(dirname(sidecarPath), { recursive: true });
  writeFileSync(sidecarPath, lines.join('\n') + '\n');
  return digest;
}

/**
 * Pre-download guard: when `destPath` already exists, verify it against
 * the sidecar instead of re-downloading a few hundred MB that is already
 * on disk. Returns true when the caller should skip the download:
 *
 *  - sidecar line matches the file's fresh hash → verified, skip;
 *  - no sidecar line yet → bootstrap one (first fetch, or a contributor
 *    who curled the file manually), then skip;
 *  - sidecar pins a DIFFERENT hash → throws (`upsertSha256Sidecar`'s
 *    stale/truncated rule; the CLI surfaces it as a non-zero exit).
 *
 * Returns false when the file is absent — download it.
 */
export async function skipIfAlreadyFetched(
  destPath: string,
  filename: string,
  sidecarPath: string,
): Promise<boolean> {
  if (!existsSync(destPath)) return false;
  await upsertSha256Sidecar(destPath, filename, sidecarPath);
  return true;
}

// ─── CLI ────────────────────────────────────────────────────────────────

// `as const` (rather than a `readonly RawDataKey[]` annotation) keeps the
// literal key types, so `RAW_DATA[key]` narrows to the four desi entries —
// all of which carry `upstream` in the registry's `as const` table. Widening
// to `RawDataKey` would union in entries without `upstream` and lose the
// compile-time guarantee that every URL below exists.
const DESI_KEYS = ['desi.bgs', 'desi.lrg', 'desi.elg', 'desi.qso'] as const;

/** HEAD the URL for `Content-Length` — the byte count `planChunks` needs. */
async function headContentLength(url: string): Promise<number> {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) {
    throw new Error(`HEAD ${url} failed: HTTP ${res.status} ${res.statusText}`);
  }
  const len = res.headers.get('content-length');
  if (!len) {
    throw new Error(`HEAD ${url} returned no Content-Length header`);
  }
  return Number(len);
}

/** Real `RangeTransport`: a GET with a `Range:` header against the live server. */
const httpRangeTransport: RangeTransport = async (url, start, endInclusive) => {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${endInclusive}` } });
  // 206 Partial Content is the ONLY acceptable answer to a Range request.
  // In particular a 200 means the server IGNORED the Range header and is
  // streaming the entire multi-hundred-MB file — buffering that and writing
  // it at a chunk offset would corrupt the part file. Carrying status 200
  // on the error makes it non-retryable (not in the 503/429/5xx set):
  // a server that ignores Range once will ignore it every time.
  if (res.status !== 206) {
    const err = new Error(
      res.status === 200
        ? `server ignored the Range header for ${url} (HTTP 200 full body instead of 206)`
        : `HTTP ${res.status} ${res.statusText} for ${url}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return new Uint8Array(await res.arrayBuffer());
};

async function main(): Promise<void> {
  const sha256Path = rawDataPath('desi.sha256');

  // Sequential over files — chunks within one file are already parallel up
  // to `concurrency` (default 6). Downloading two files at once would mean
  // 2×6 = 12 concurrent range requests hitting the same server, right back
  // into the 503s the concurrency cap exists to avoid.
  for (const key of DESI_KEYS) {
    const url = RAW_DATA[key].upstream;
    const destPath = rawDataPath(key);
    const filename = basename(destPath);

    // Already on disk from a prior run → verify (or bootstrap) its sidecar
    // line and move on instead of re-downloading a few hundred MB. A
    // pinned-hash mismatch throws through to the CLI catch → exit 1.
    if (await skipIfAlreadyFetched(destPath, filename, sha256Path)) {
      process.stderr.write(`fetchDesi: ${filename} already present — verified, skipping\n`);
      continue;
    }

    process.stderr.write(`fetchDesi: HEAD ${url}\n`);
    const totalBytes = await headContentLength(url);
    process.stderr.write(`  ${totalBytes.toLocaleString()} bytes\n`);

    const result = await downloadChunked({
      url,
      destPath,
      totalBytes,
      transport: httpRangeTransport,
    });
    process.stderr.write(
      `  ${filename}: ${result.chunksFetched} chunk(s) fetched, ` +
        `${result.chunksResumed} resumed from a prior run\n`,
    );

    const digest = await upsertSha256Sidecar(destPath, filename, sha256Path);
    process.stderr.write(`  sha256: ${digest}\n`);
  }

  process.stderr.write(`done; sidecar at ${sha256Path}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
