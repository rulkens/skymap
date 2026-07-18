#!/usr/bin/env node
/**
 * fetchCosmicflows4 — download the Cosmicflows-4 homogenised distance
 * table from CDS Vizier (J/ApJ/944/94, Tully+ 2023) to data/raw/cf4/.
 *
 * CDS only serves `table2.dat.gz` (~2.5 MB gzipped, ~10 MB uncompressed
 * — 55,877 rows × 190 bytes/row). The fetcher downloads the .gz to disk
 * with Range: resume, then streams it through zlib to produce the
 * uncompressed `table2.dat` whose byte layout matches the byte offsets
 * documented in the CDS ReadMe (which sub-plan 02's parser depends on).
 *
 * Source layout (confirmed against the CDS ReadMe):
 *   table2.dat.gz — gzipped fixed-width ASCII (kept for re-runs)
 *   table2.dat    — uncompressed fixed-width ASCII, ~55,877 rows
 *   ReadMe        — column-offset spec (download alongside so the parser
 *                   can validate the byte ranges it assumes)
 *
 * See data/raw/cf4/README.md for the in-repo provenance header.
 */
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

import { rawDataPath } from '../utils/io/rawDataRegistry';

export const CF4_TABLE_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat.gz';
export const CF4_README_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe';

/**
 * On-disk size of the partial download, in bytes, or 0 when nothing is
 * there yet. Used as the `Range: bytes=N-` start for resume requests.
 *
 * We trust the byte count over any sidecar metadata: the OS already
 * knows exactly how many bytes hit the disk, and the HTTP Range header
 * is content-addressed by byte index so re-issuing with the same N
 * cleanly resumes if the server supports ranges.
 */
export function resumeOffsetForPath(path: string): number {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

/**
 * Download `url` to `destPath`, resuming from the current on-disk byte
 * count via `Range: bytes=N-`.
 *
 * Behaviour:
 *  - First run / empty file: requests the whole body, writes from byte 0.
 *  - Partial file: requests `Range: bytes=N-`, server returns 206 +
 *    remaining bytes, we append.
 *  - Complete file: `Range:` past EOF yields 416; we treat that as
 *    "already done" and return without touching the file.
 *
 * We use the `node:stream/promises` pipeline so a connection drop
 * surfaces as a rejected promise (rather than a silent truncation),
 * and the partial file stays on disk for the next resume attempt.
 */
export async function downloadWithResume(
  url: string,
  destPath: string,
): Promise<{ bytesAdded: number; totalBytes: number }> {
  mkdirSync(dirname(destPath), { recursive: true });
  const startOffset = resumeOffsetForPath(destPath);

  const headers: Record<string, string> = {};
  if (startOffset > 0) headers['Range'] = `bytes=${startOffset}-`;

  const res = await fetch(url, { headers });

  // 416 = Range Not Satisfiable — usually means we've already downloaded
  // the whole file. Treat as success rather than failure.
  if (res.status === 416) {
    return { bytesAdded: 0, totalBytes: startOffset };
  }
  if (!res.ok && res.status !== 206 && res.status !== 200) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText} (${url})`);
  }
  if (!res.body) {
    throw new Error(`Download failed: empty body (${url})`);
  }

  const stream = createWriteStream(destPath, {
    flags: startOffset > 0 ? 'a' : 'w',
  });

  // `res.body` is a WHATWG ReadableStream; the cast bridges the TS gap
  // between lib.dom's `ReadableStream<Uint8Array<ArrayBufferLike>>` and
  // Node's stricter `ReadableStream<any>` expectation for `fromWeb`.
  // At runtime they're the same object.
  await pipeline(Readable.fromWeb(res.body as never), stream);

  // Re-stat the file rather than threading a byte counter through the
  // pipeline: cheaper and side-steps the TransformStream typing.
  const totalBytes = statSync(destPath).size;
  return { bytesAdded: totalBytes - startOffset, totalBytes };
}

/**
 * SHA-256 hex digest of a file's contents, streamed so we don't materialise
 * a ~100 MB string in memory just to hash it.
 *
 * Stored alongside the downloaded `.dat` as `.sha256` so the parser can
 * abort with a clear error if the file is truncated or stale.
 */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

const TABLE_PATH = rawDataPath('cf4.table2');
const TABLE_GZ_PATH = `${TABLE_PATH}.gz`;
const README_PATH = rawDataPath('cf4.readme');
const SHA256_PATH = rawDataPath('cf4.sha256');

/**
 * Decompress `srcGz` to `dest`, overwriting `dest` if it exists. The .gz
 * intermediate stays on disk so a re-run hits the Range: 416 fast-path
 * instead of pulling 2.5 MB again.
 */
export async function gunzipToFile(srcGz: string, dest: string): Promise<void> {
  await pipeline(createReadStream(srcGz), createGunzip(), createWriteStream(dest));
}

async function main(): Promise<void> {
  process.stderr.write(`fetchCosmicflows4: target ${TABLE_PATH}\n`);

  // Fetch the ReadMe first — it's tiny (~20 KB) and the parser needs
  // its column-offset spec, so failing fast on the small file gives a
  // clearer error than failing mid-table.
  const readmeResult = await downloadWithResume(CF4_README_URL, README_PATH);
  process.stderr.write(
    `  ReadMe: ${readmeResult.totalBytes.toLocaleString()} bytes` +
      (readmeResult.bytesAdded > 0
        ? ` (+${readmeResult.bytesAdded.toLocaleString()})\n`
        : ' (already complete)\n'),
  );

  const tableResult = await downloadWithResume(CF4_TABLE_URL, TABLE_GZ_PATH);
  process.stderr.write(
    `  table2.dat.gz: ${tableResult.totalBytes.toLocaleString()} bytes` +
      (tableResult.bytesAdded > 0
        ? ` (+${tableResult.bytesAdded.toLocaleString()})\n`
        : ' (already complete)\n'),
  );

  await gunzipToFile(TABLE_GZ_PATH, TABLE_PATH);
  const tableBytes = statSync(TABLE_PATH).size;
  process.stderr.write(
    `  table2.dat: ${tableBytes.toLocaleString()} bytes (decompressed)\n`,
  );

  const digest = await sha256OfFile(TABLE_PATH);
  writeFileSync(SHA256_PATH, `${digest}  table2.dat\n`);
  process.stderr.write(`  sha256: ${digest}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
