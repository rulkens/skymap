#!/usr/bin/env node
/**
 * fetchDhm — download the Søndermarken DHM/Punktsky LAS tiles from the
 * Datafordeler Fildownload REST endpoint into `data/raw/dhm/` (see
 * `data/raw/dhm/README.md` for endpoint shape, licence, and landmines).
 *
 * The server ignores `Range` (verified: a ranged GET still returns the
 * full body with `200`, never `206`) — every download is a whole-file GET,
 * never a resumed partial. Because of that, and because the entitlement
 * probe caught a ~13 MB truncated tile passing a naive "non-zero size"
 * resume check, every tile — freshly downloaded or already on disk — is
 * verified via `validateLasHeader` before it's trusted; a tile that fails
 * is deleted rather than left for a future run to mistake for done.
 */
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOENDERMARKEN } from '../scene-recon/groups/soendermarken';
import {
  validateLasHeader,
  type LasValidationResult,
} from '../scene-recon/lidar/validateLasHeader';
import { delay } from '../utils/async/delay';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readKeychainSecret } from '../utils/io/readKeychainSecret';
import { redactSecret } from '../utils/io/redactSecret';

const ENDPOINT = 'https://api.datafordeler.dk/FileDownloads/GetPointCloudFile';
const KEYCHAIN_SERVICE = 'skymap-datafordeler-apikey';
const HEADER_READ_BYTES = 227; // LAS 1.2+ public header block through the Z-bounds field
const AUTH_RETRY_WINDOW_MS = 20 * 60 * 1000; // key propagation window — README "Apikey" note
const AUTH_RETRY_BASE_DELAY_MS = 15_000;
const AUTH_RETRY_MAX_DELAY_MS = 120_000;

type TileOutcome =
  | {
      readonly tile: string;
      readonly status: 'verified-existing' | 'downloaded';
      readonly bytes: number;
      readonly pointCount: number;
    }
  | { readonly tile: string; readonly status: 'failed'; readonly reason: string };

function urlForTile(tile: string, apiKey: string): string {
  // Plain interpolation, not URLSearchParams — the key must appear
  // byte-for-byte so redactSecret's substring match always finds it, even
  // if a future key contains characters URLSearchParams would encode.
  return `${ENDPOINT}?FileName=${tile}.las&apiKey=${apiKey}`;
}

function readHeaderBytes(path: string): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(HEADER_READ_BYTES);
    const bytesRead = readSync(fd, buf, 0, HEADER_READ_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

function validateFileOnDisk(path: string): LasValidationResult {
  return validateLasHeader(readHeaderBytes(path), statSync(path).size);
}

/**
 * GET `url`, retrying a 401 for up to `AUTH_RETRY_WINDOW_MS` with backoff —
 * a freshly registered Datafordeler key propagates per gateway node for
 * roughly 20 minutes (data/raw/geodanmark/README.md:70-72), so an early 401
 * is transient. Any other non-OK status is not retried.
 */
async function fetchWithAuthRetry(url: string, apiKey: string): Promise<Response> {
  const deadline = Date.now() + AUTH_RETRY_WINDOW_MS;
  let attempt = 0;
  for (;;) {
    const res = await fetch(url);
    if (res.status !== 401) return res;
    attempt++;
    if (Date.now() >= deadline) {
      throw new Error(
        redactSecret(
          `HTTP 401 from ${url} after ${attempt} attempt(s) over the key-propagation window`,
          apiKey,
        ),
      );
    }
    const backoffMs = Math.min(
      AUTH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      AUTH_RETRY_MAX_DELAY_MS,
    );
    process.stderr.write(
      `  401 (attempt ${attempt}) — retrying in ${Math.round(backoffMs / 1000)}s\n`,
    );
    await delay(backoffMs);
  }
}

/** Stream `res.body` to `destPath`, returning the bytes actually written. */
async function streamBodyToFile(res: Response, destPath: string): Promise<number> {
  if (!res.body) throw new Error('response has no body');
  const sink = createWriteStream(destPath);
  const reader = res.body.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (!sink.write(value)) {
      await new Promise<void>((res2) => sink.once('drain', () => res2()));
    }
  }
  await new Promise<void>((res2) => sink.end(() => res2()));
  return bytes;
}

async function downloadTile(tile: string, destDir: string, apiKey: string): Promise<TileOutcome> {
  const destPath = join(destDir, `${tile}.las`);

  if (existsSync(destPath) && statSync(destPath).size > 0) {
    const check = validateFileOnDisk(destPath);
    if (check.ok) {
      return {
        tile,
        status: 'verified-existing',
        bytes: statSync(destPath).size,
        pointCount: check.header.pointCount,
      };
    }
    process.stderr.write(
      `  ${tile}: on-disk file failed completeness check (${check.reason}) — deleting, re-fetching\n`,
    );
    rmSync(destPath, { force: true });
  }

  const url = urlForTile(tile, apiKey);
  const res = await fetchWithAuthRetry(url, apiKey);
  if (!res.ok) {
    return {
      tile,
      status: 'failed',
      reason: redactSecret(`HTTP ${res.status} ${res.statusText} for ${url}`, apiKey),
    };
  }

  const contentLength = res.headers.get('content-length');
  const tmpPath = `${destPath}.tmp`;
  const bytes = await streamBodyToFile(res, tmpPath);

  if (contentLength !== null && Number(contentLength) !== bytes) {
    rmSync(tmpPath, { force: true });
    return {
      tile,
      status: 'failed',
      reason: `byte-size mismatch: Content-Length said ${contentLength}, wrote ${bytes}`,
    };
  }

  const check = validateLasHeader(readHeaderBytes(tmpPath), bytes);
  if (!check.ok) {
    rmSync(tmpPath, { force: true });
    return { tile, status: 'failed', reason: check.reason };
  }

  renameSync(tmpPath, destPath);
  return { tile, status: 'downloaded', bytes, pointCount: check.header.pointCount };
}

let capturedApiKey: string | undefined;

async function main(): Promise<void> {
  const apiKey = readKeychainSecret(KEYCHAIN_SERVICE);
  capturedApiKey = apiKey;

  const destDir = rawDataPath('dhm.dir');
  mkdirSync(destDir, { recursive: true });

  process.stderr.write(`fetchDhm: ${SOENDERMARKEN.dhmTiles.length} tile(s) → ${destDir}\n`);

  const outcomes: TileOutcome[] = [];
  for (const tile of SOENDERMARKEN.dhmTiles) {
    try {
      const outcome = await downloadTile(tile, destDir, apiKey);
      outcomes.push(outcome);
      if (outcome.status === 'failed') {
        process.stderr.write(`${tile}: FAILED — ${outcome.reason}\n`);
      } else {
        const mb = (outcome.bytes / (1024 * 1024)).toFixed(1);
        process.stderr.write(
          `${tile}: ${outcome.status} — ${mb} MB, ${outcome.pointCount.toLocaleString()} pts\n`,
        );
      }
    } catch (err) {
      const reason = redactSecret((err as Error).message, apiKey);
      outcomes.push({ tile, status: 'failed', reason });
      process.stderr.write(`${tile}: FAILED — ${reason}\n`);
    }
  }

  const failed = outcomes.filter((o) => o.status === 'failed');
  const totalBytes = outcomes.reduce((sum, o) => sum + (o.status === 'failed' ? 0 : o.bytes), 0);
  process.stderr.write(
    `done: ${outcomes.length - failed.length}/${outcomes.length} tile(s) OK, ` +
      `${(totalBytes / (1024 * 1024)).toFixed(1)} MB total\n`,
  );
  if (failed.length > 0) {
    process.stderr.write(`${failed.length} tile(s) failed — re-run to retry.\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    const raw = (err as Error).stack ?? (err as Error).message;
    process.stderr.write(`error: ${capturedApiKey ? redactSecret(raw, capturedApiKey) : raw}\n`);
    process.exit(1);
  });
}
