#!/usr/bin/env node
/**
 * fetchEoxTiles — polite, resumable harvester for EOX's `s2cloudless` WMTS
 * tile service, over a caller-supplied lon/lat bbox at a single zoom level
 * (default 13). See `data/raw/eox/README.md` for the licence, tile-index
 * convention, and `docs/superpowers/specs/2026-08-19-eox-deep-tile-bands-design.md`
 * §4 for why: EOX's WGS84 TMS grid (`columns = 2^(z+1)`, `rows = 2^z`) is the
 * same ladder as skymap's own `earthTileColumns` (`512 << z) / tilePx` at
 * `tilePx = 256`) — `earthTileColumns(13, 256) === 16384 === 2^14`, so z13
 * tiles composite straight into skymap's bake pyramid with no re-numbering.
 *
 * **Layer is hardcoded to `s2cloudless` (the 2016 edition)** — the only
 * CC BY 4.0 vintage; 2018+ is CC BY-NC-SA (ShareAlike, rejected outright for
 * this JOSS-bound repo) and 2017 is broken upstream. No CLI flag selects a
 * different layer.
 *
 * Backoff/retry (`isRetryable`, `fetchTileWithRetry`) is the same shape as
 * `fetchDesi.ts`'s `fetchChunkWithRetry` (`fetchDesi.ts:167-197`), adapted
 * from range-chunk retries to whole-tile-fetch retries — EOX serves whole
 * 256px JPEGs, no `Range:`/byte-resume machinery needed. Resume is by tile
 * file existence on disk, not a chunk-state sidecar: a tile is either fully
 * there or it isn't, so there is nothing partial to resume within one file.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { delay } from '../utils/async/delay';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_THROTTLE_MS = 500; // ~2 req/s — polite to the EOX tile service.

const EOX_LAYER = 's2cloudless'; // 2016 layer ONLY — see module header, licence.

export type EoxBbox = {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
};

export type EoxTileIndex = { readonly row: number; readonly col: number };

/**
 * Every (row, col) tile index a bbox at level `z` touches, in the WGS84 TMS
 * grid (`columns = 2^(z+1)`, `rows = 2^z`; tile origin top-left, so row 0 is
 * the north pole, increasing southward — the OGC WMTS WGS84 TileMatrixSet
 * convention). `tileDeg` (`180 / rows`, equivalently `360 / columns`) is the
 * same value in both axes, since the grid's 2:1 column:row aspect exactly
 * matches the bbox's 360:180 degree span.
 */
export function eoxTileIndicesForBbox(bbox: EoxBbox, z: number): ReadonlyArray<EoxTileIndex> {
  const rows = 2 ** z;
  const tileDeg = 180 / rows;

  const colMin = Math.floor((bbox.west + 180) / tileDeg);
  const colMax = Math.floor((bbox.east + 180) / tileDeg);
  const rowMin = Math.floor((90 - bbox.north) / tileDeg);
  const rowMax = Math.floor((90 - bbox.south) / tileDeg);

  const indices: EoxTileIndex[] = [];
  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      indices.push({ row, col });
    }
  }
  return indices;
}

/**
 * Classifies one fetch response by its `Content-Type`, without touching the
 * network — the pure half of the "abort on non-image" guard: a throttled EOX
 * origin answers with an HTML page, not a 4xx/5xx, so the real transport
 * (`httpTileTransport` below) calls this and throws when it returns `false`
 * rather than writing HTML bytes into the tile tree under a `.jpg` name.
 */
export function eoxResponseIsImage(contentType: string | null): boolean {
  return contentType !== null && contentType.startsWith('image/');
}

/**
 * Fetches the whole-tile bytes at `url`. Injected so tests never touch the
 * network — production wires this to `httpTileTransport`; tests substitute a
 * `vi.fn<EoxTileTransport>()`. Errors it throws may carry a `status?: number`
 * (the HTTP status code); an error with no `status` is a network/timeout
 * failure.
 */
export type EoxTileTransport = (url: string) => Promise<Uint8Array>;

export type HarvestResult = {
  tilesFetched: number;
  tilesSkipped: number;
};

/** Is `err`'s HTTP status one we should retry (503/429/5xx), or status-less (network/timeout)? */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  if (status === undefined) return true; // network/timeout — no status at all
  return status === 429 || status === 503 || (status >= 500 && status <= 599);
}

/**
 * Fetch one tile, retrying on retryable failures with exponential backoff
 * (`baseDelayMs · 2^attempt`, attempt counted from the first failure) — same
 * shape as `fetchDesi.ts`'s `fetchChunkWithRetry`. A non-retryable status
 * (403/404/… — including a non-image response, which `httpTileTransport`
 * surfaces with whatever status the server actually sent) rethrows
 * immediately rather than burning through `maxAttempts` on a request that
 * will never succeed.
 */
async function fetchTileWithRetry(
  url: string,
  transport: EoxTileTransport,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<Uint8Array> {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await transport(url);
    } catch (err) {
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

function eoxTileUrl(z: number, row: number, col: number): string {
  return `https://tiles.maps.eox.at/wmts/1.0.0/${EOX_LAYER}/default/WGS84/${z}/${row}/${col}.jpg`;
}

function eoxTilePath(outDir: string, z: number, row: number, col: number): string {
  return join(outDir, String(z), String(row), `${col}.jpg`);
}

/**
 * Harvest every tile `eoxTileIndicesForBbox(opts.bbox, opts.level)` touches
 * into `<outDir>/<z>/<row>/<col>.jpg`, sequentially and throttled to
 * `~1000 / throttleMs` requests/sec (`throttleMs <= 0` disables the
 * inter-tile delay entirely — used by tests). A tile already on disk is skipped
 * outright — no transport call, no bookkeeping sidecar (unlike
 * `fetchDesi.ts`'s chunk-state sidecar; a tile is atomically whole-or-absent,
 * so there's nothing partial to resume within one). Rejects immediately if
 * any tile's fetch exhausts its retries or hits a non-retryable failure —
 * the caller re-runs the same bbox/level and resumes from whatever landed.
 */
export async function harvestEoxTiles(opts: {
  bbox: EoxBbox;
  level: number;
  outDir: string;
  transport: EoxTileTransport;
  maxAttempts?: number;
  baseDelayMs?: number;
  throttleMs?: number;
}): Promise<HarvestResult> {
  const {
    bbox,
    level,
    outDir,
    transport,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    throttleMs = DEFAULT_THROTTLE_MS,
  } = opts;

  const indices = eoxTileIndicesForBbox(bbox, level);
  let tilesFetched = 0;
  let tilesSkipped = 0;

  for (const { row, col } of indices) {
    const tilePath = eoxTilePath(outDir, level, row, col);
    if (existsSync(tilePath)) {
      tilesSkipped++;
      continue;
    }

    const url = eoxTileUrl(level, row, col);
    const bytes = await fetchTileWithRetry(url, transport, maxAttempts, baseDelayMs);
    mkdirSync(dirname(tilePath), { recursive: true });
    writeFileSync(tilePath, bytes);
    tilesFetched++;
    if (throttleMs > 0) await delay(throttleMs);
  }

  return { tilesFetched, tilesSkipped };
}

// ─── CLI ────────────────────────────────────────────────────────────────

/**
 * Real `EoxTileTransport`: a plain GET against the live EOX service. A
 * non-`ok` status or a non-image `Content-Type` both throw with `.status`
 * set to the response's actual status — for the non-image case that is
 * ordinarily 200 (a throttle page served as a "successful" HTML response),
 * which `isRetryable` already treats as non-retryable, so a throttled run
 * aborts loudly on the first hit instead of writing HTML as `.jpg`.
 */
const httpTileTransport: EoxTileTransport = async (url) => {
  const res = await fetch(url);
  const contentType = res.headers.get('content-type');
  if (!res.ok || !eoxResponseIsImage(contentType)) {
    const err = new Error(
      !res.ok
        ? `HTTP ${res.status} ${res.statusText} for ${url}`
        : `non-image response for ${url}: content-type ${contentType ?? '(none)'}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return new Uint8Array(await res.arrayBuffer());
};

function parseCliArgs(argv: string[]): { bbox: EoxBbox; level: number } {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const west = Number(positional[0]);
  const south = Number(positional[1]);
  const east = Number(positional[2]);
  const north = Number(positional[3]);
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    throw new Error(
      'usage: fetchEoxTiles <west> <south> <east> <north> [--level N] (level defaults to 13)',
    );
  }
  const levelFlagIdx = argv.indexOf('--level');
  const level = levelFlagIdx !== -1 ? Number(argv[levelFlagIdx + 1]) : 13;
  if (!Number.isFinite(level)) {
    throw new Error('--level must be a number');
  }
  return { bbox: { west, south, east, north }, level };
}

async function main(): Promise<void> {
  const { bbox, level } = parseCliArgs(process.argv.slice(2));
  const outDir = rawDataPath('eox.dir');
  const indices = eoxTileIndicesForBbox(bbox, level);
  process.stderr.write(
    `fetchEoxTiles: z${level}, bbox ${JSON.stringify(bbox)}, ${indices.length} tile(s) → ${outDir}\n`,
  );

  const result = await harvestEoxTiles({ bbox, level, outDir, transport: httpTileTransport });
  process.stderr.write(
    `  ${result.tilesFetched} tile(s) fetched, ${result.tilesSkipped} already present\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
