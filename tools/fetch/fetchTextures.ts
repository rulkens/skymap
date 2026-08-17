#!/usr/bin/env node
/**
 * fetchTextures — download the raw planet-body texture sources (Solar
 * System Scope albedo maps, the NASA Blue Marble Earth equirect and its eight
 * deep quadrants, the USGS Galilean-moon GeoTIFFs, and the NASA PIA11707
 * chroma source for the calibrated Pluto colour build) to data/raw/textures/.
 * See data/raw/textures/README.md for the per-source provenance table and
 * docs/superpowers/specs/2026-07-17-planet-rendering.md §3 for the URL
 * verification that pins these exact files.
 *
 * ## Why GET-only — no HEAD, no Range
 *
 * The catalog fetchers (fetchCosmicflows4, fetchDesi) resume partial
 * downloads with a `Range: bytes=N-` header, and probe file sizes with a
 * `HEAD`. Neither works against solarsystemscope.com: it returns
 * `200 text/html` to a `HEAD` (an error page, not the asset) and it
 * IGNORES `Range` entirely, replying `200` with the whole body from byte 0
 * (spec §3, live-verified 2026-07-17). Appending that full body onto a
 * partial file — the shape `downloadWithResume` assumes — would corrupt it.
 * So this fetcher speaks plain `GET` to every source (NASA and USGS honour
 * ranges, but a uniform GET-only path keeps one code shape and can't be
 * tripped by the SSS quirk) and tracks completeness at FILE granularity
 * instead of byte granularity: each download lands in a `<dest>.part`
 * sibling and is renamed into place only once the body has fully streamed,
 * so a half-written file can never masquerade as complete. Resume is then
 * "skip the sources already fully on disk" — verified against the
 * committed `.sha256` sidecar (`skipIfAlreadyFetched`, reused from
 * fetchDesi), which is the honest GET-only analogue of byte-count resume.
 *
 * ## Size gate + the --dev subset
 *
 * The full raw pull is ~1.2 GB: ~700 MB of body/ring maps (the USGS mono
 * GeoTIFFs dominate) plus the ~421 MB BMNG quadrant set the Earth surface
 * tile pyramid is baked from. On a constrained network that is not something
 * to kick off by accident (feedback_announce_big_downloads), so the fetcher
 * prints the total and REFUSES the full pull without an explicit `--confirm`.
 * `--dev` fetches only the small subset — each SSS source's 2k variant plus
 * the NASA 5400x2700 sibling, ~7 MB — enough to exercise the whole
 * fetch -> build -> R2 pipeline and verify the bodies visually without the
 * full download; the dev subset needs no `--confirm`.
 *
 * ## .sha256 sidecar
 *
 * Each completed file's SHA-256 is upserted into the combined committed
 * sidecar `textures.sha256` (one `<hex>  <filename>` line each), reusing
 * fetchDesi's `upsertSha256Sidecar` — the same "detect a truncated or
 * stale download on re-run" role the CF-4 and DESI sidecars play. The
 * first fetch writes the line; every later fetch must reproduce it.
 *
 * All paths go through `rawDataPath('textures.*')` (or, for the 2k dev
 * variants that are not their own registry rows, `join(rawDataPath(
 * 'textures.dir'), <filename>)` per the `<catalog>.dir` convention).
 */

import { createWriteStream, mkdirSync, renameSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import type { BodyTextureId } from '../../src/@types/data/BodyTextureId';
import type { RingTextureId } from '../../src/@types/data/RingTextureId';
import type { TextureKind } from '../../src/@types/data/TextureKind';
import { ALL_BODY_TEXTURE_KEYS } from '../../src/data/bodies/bodyTextureKeys';
import { BMNG_QUADRANT_KEYS } from '../utils/io/bmngQuadrantKeys';
import { RAW_DATA, rawDataPath } from '../utils/io/rawDataRegistry';
import { TEXTURE_SOURCES, type TextureSourceRow } from '../utils/io/textureSources';
import { skipIfAlreadyFetched, upsertSha256Sidecar } from './fetchDesi';

/** Approximate size of the body/ring native tiers (spec §3 hand-tally — no
 *  HEAD probe means no real Content-Lengths to sum). */
const BODY_SOURCES_APPROX_MB = 700;

/** Approximate size of the eight BMNG quadrants (real on-disk total). */
const BMNG_QUADRANTS_APPROX_MB = 421;

/** Approximate size of `CHROMA_SOURCES` (PIA11707 at 30 MB plus the 57 MB
 *  true-colour calibration reference, real Content-Lengths). */
const CHROMA_SOURCES_APPROX_MB = 87;

/** Approximate size of the full raw pull, printed by the size gate. */
export const FULL_FETCH_APPROX_MB =
  BODY_SOURCES_APPROX_MB + BMNG_QUADRANTS_APPROX_MB + CHROMA_SOURCES_APPROX_MB;

/** Approximate size of the `--dev` subset (2k SSS variants + 5400x2700 BMNG). */
export const DEV_FETCH_APPROX_MB = 7;

/** One thing to download: where it lives upstream and where it lands on disk. */
export type TextureSource = {
  readonly url: string;
  readonly destPath: string;
};

/** The native (full-res) source for a body/ring: its registered file. */
function fullSource(entry: TextureSourceRow): TextureSource {
  return { url: RAW_DATA[entry.native].upstream, destPath: rawDataPath(entry.native) };
}

/**
 * The `--dev` source for a body/ring, or `null` if it has none (the USGS
 * moons). Two shapes:
 *
 *  - `devKey` — the dev source is its OWN registry row (Earth's 5400x2700 BMNG
 *    sibling): fetch it at its registered path.
 *  - `devFilename` — the dev source is a loose 2k file in `textures.dir`. Its
 *    URL is derived from the native upstream by swapping the resolution-prefixed
 *    filename (`8k_mars.jpg` -> `2k_mars.jpg`), so the SSS download base stays
 *    single-sourced in the registry. When the native file already IS the 2k
 *    tier (Uranus/Neptune) the swap is a no-op and the dest is the native
 *    registry path — the same source, not a duplicate.
 */
function devSource(entry: TextureSourceRow): TextureSource | null {
  if ('devKey' in entry) {
    return { url: RAW_DATA[entry.devKey].upstream, destPath: rawDataPath(entry.devKey) };
  }
  if ('devFilename' in entry) {
    const nativePath = rawDataPath(entry.native);
    const nativeFilename = basename(nativePath);
    const nativeUpstream = RAW_DATA[entry.native].upstream;
    if (nativeFilename === entry.devFilename) {
      return { url: nativeUpstream, destPath: nativePath };
    }
    return {
      url: nativeUpstream.replace(nativeFilename, entry.devFilename),
      destPath: join(rawDataPath('textures.dir'), entry.devFilename),
    };
  }
  return null;
}

/**
 * `TEXTURE_SOURCES` viewed by the wide `(bodyId, kind)` key space
 * `ALL_BODY_TEXTURE_KEYS` ranges over. The const table's per-body key set is
 * narrower than the whole `TextureKind` union (today just `surface`), so the
 * variable-kind lookup below needs this view. Every key `ALL_BODY_TEXTURE_KEYS`
 * yields is populated — that list is minted from the same registry the table
 * mirrors — so each access is defined (the `!` asserts it).
 */
const SOURCE_TABLE = TEXTURE_SOURCES as Record<
  BodyTextureId | RingTextureId,
  Partial<Record<TextureKind, TextureSourceRow>>
>;

/** The raw source of every `(body, kind)` texture key, in family-key order — one
 *  entry per map every textured body carries plus each ring's surface. A new map
 *  kind on a body joins this list via `ALL_BODY_TEXTURE_KEYS`, no edit here. */
const TEXTURE_ENTRIES: readonly TextureSourceRow[] = ALL_BODY_TEXTURE_KEYS.map(
  ({ bodyId, kind }) => SOURCE_TABLE[bodyId][kind]!,
);

/**
 * The eight BMNG quadrants the Earth surface tile pyramid is baked from. Not
 * a `(body, kind)` source — no whole-globe runtime texture is built from
 * them — so they can't ride `TEXTURE_SOURCES`; they belong in the full pull
 * for the same reason every other raw does ("obtainable by command"), with
 * the size gate keeping the extra 421 MB from being a surprise.
 * `BMNG_QUADRANT_KEYS` is the one enumeration of the set, shared with the bake.
 */
const QUADRANT_SOURCES: readonly TextureSource[] = Object.values(BMNG_QUADRANT_KEYS).map((key) => ({
  url: RAW_DATA[key].upstream,
  destPath: rawDataPath(key),
}));

/**
 * The second (chroma) input of every `panSharpen` body — today just Pluto's
 * PIA11707, whose published enhancement the build's calibration inverts.
 * Appended after the natives, so the emitted order is unchanged; no `--dev`
 * variant, as the 2k quick-check subset has no calibrated counterpart.
 *
 * The true-colour REFERENCE the calibration was fitted against is appended by
 * hand rather than folded out of `TEXTURE_ENTRIES`: nothing is built from it, so
 * it has no `TEXTURE_SOURCES` row to derive from. It rides the pull anyway —
 * a raw the pipeline's numbers came from that no command can otherwise obtain.
 */
const CHROMA_SOURCES: readonly TextureSource[] = [
  ...TEXTURE_ENTRIES.flatMap((entry) =>
    'chroma' in entry
      ? [{ url: RAW_DATA[entry.chroma].upstream, destPath: rawDataPath(entry.chroma) }]
      : [],
  ),
  {
    url: RAW_DATA['textures.nasaPlutoTrueColorRef'].upstream,
    destPath: rawDataPath('textures.nasaPlutoTrueColorRef'),
  },
];

/**
 * The set of sources to fetch. `dev === false` is the full native pull (every
 * body/ring plus the eight BMNG quadrants plus the Pluto chroma source);
 * `dev === true` is the small visual-check subset (2k SSS variants + the
 * 5400x2700 BMNG sibling — the USGS moons, the quadrants, and the chroma
 * source have no dev variant; `--dev` tile bake reads the whole-globe
 * equirect instead).
 *
 * Both derive from `TEXTURE_SOURCES`, so the download set can't drift from
 * the runtime registry. Pure, so the subset choice is unit-testable headlessly.
 */
export function textureSourcesFor(dev: boolean): readonly TextureSource[] {
  if (dev) {
    return TEXTURE_ENTRIES.map(devSource).filter((s): s is TextureSource => s !== null);
  }
  return [...TEXTURE_ENTRIES.map(fullSource), ...QUADRANT_SOURCES, ...CHROMA_SOURCES];
}

/**
 * Does this invocation need `--confirm` before it may proceed? Only the
 * full pull does — it is the ~700 MB download the size gate guards. The
 * `--dev` subset (~7 MB) is always allowed. Pure predicate so the gate is
 * testable without spawning the CLI.
 */
export function requiresConfirm(dev: boolean, confirm: boolean): boolean {
  return !dev && !confirm;
}

/**
 * Fetches `url` and resolves with the response's completeness signals plus
 * its streaming body. Injected so tests never touch the network — production
 * wires this to the global `fetch` (the default below); tests substitute a
 * fake that yields a scripted body (or an erroring stream) without a socket.
 * Structural rather than `typeof fetch` so a fake needs only the handful of
 * fields `downloadGetOnly` reads, the same way `fetchDesi`'s `RangeTransport`
 * keeps its mock surface minimal.
 */
export type FetchTransport = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly body: ReadableStream<Uint8Array> | null;
}>;

/**
 * Download `url` to `destPath` with a plain `GET` — no `HEAD`, no `Range`
 * (see the module header for why SSS breaks both). The body streams into a
 * `<destPath>.part` sibling and is renamed into place only on a clean
 * finish, so an interrupted download leaves a `.part` (re-fetched from
 * scratch next run) and never a truncated file passing as complete.
 *
 * The `node:stream/promises` pipeline surfaces a mid-transfer connection
 * drop as a rejected promise rather than a silent truncation — so the
 * `renameSync` past it only runs when the whole body has landed.
 */
export async function downloadGetOnly(
  url: string,
  destPath: string,
  transport: FetchTransport = fetch,
): Promise<{ totalBytes: number }> {
  mkdirSync(dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;

  const res = await transport(url);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText} (${url})`);
  }
  if (!res.body) {
    throw new Error(`Download failed: empty body (${url})`);
  }

  const out = createWriteStream(partPath, { flags: 'w' });
  // `res.body` is a WHATWG ReadableStream; the cast bridges lib.dom's
  // typing and Node's stricter `fromWeb` signature — same object at runtime.
  await pipeline(Readable.fromWeb(res.body as never), out);

  renameSync(partPath, destPath);
  return { totalBytes: statSync(destPath).size };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dev = args.includes('--dev');
  const confirm = args.includes('--confirm');

  const sources = textureSourcesFor(dev);

  if (requiresConfirm(dev, confirm)) {
    process.stderr.write(
      `fetchTextures: the full raw texture pull is ~${FULL_FETCH_APPROX_MB} MB across ` +
        `${sources.length} sources.\n` +
        `  Re-run with --confirm to proceed, or --dev for the ~${DEV_FETCH_APPROX_MB} MB ` +
        `dev subset (2k SSS variants + the 5400x2700 BMNG Earth).\n`,
    );
    process.exit(1);
  }

  const sidecarPath = rawDataPath('textures.sha256');
  process.stderr.write(
    `fetchTextures: ${dev ? 'dev subset' : 'full pull'} — ${sources.length} source(s) ` +
      `-> ${dirname(sources[0]!.destPath)}\n`,
  );

  for (const { url, destPath } of sources) {
    const filename = basename(destPath);

    // Already fully on disk from a prior run -> verify (or bootstrap) its
    // sidecar line and skip, instead of re-streaming the whole body. A
    // pinned-hash mismatch throws through to the CLI catch -> exit 1.
    if (await skipIfAlreadyFetched(destPath, filename, sidecarPath)) {
      process.stderr.write(`  ${filename}: already present — verified, skipping\n`);
      continue;
    }

    process.stderr.write(`  ${filename}: GET ${url}\n`);
    const { totalBytes } = await downloadGetOnly(url, destPath);
    const digest = await upsertSha256Sidecar(destPath, filename, sidecarPath);
    process.stderr.write(`    ${totalBytes.toLocaleString()} bytes, sha256 ${digest}\n`);
  }

  process.stderr.write(`done; sidecar at ${sidecarPath}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
