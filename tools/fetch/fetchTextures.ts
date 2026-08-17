#!/usr/bin/env node
/**
 * fetchTextures — download the raw body/ring texture sources to
 * data/raw/textures/; per-source provenance in data/raw/textures/README.md.
 *
 * GET-only, never HEAD or Range (spec §3, live-verified 2026-07-17):
 * solarsystemscope.com answers a HEAD with `200 text/html` (an error page, not
 * the asset) and IGNORES `Range`, replying 200 with the whole body from byte 0 —
 * so `downloadWithResume` would append a full body onto a partial file and
 * corrupt it. Completeness is tracked per FILE (`.part` + rename, `.sha256`).
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

/** MB, spec §3 hand-tally — GET-only means no Content-Lengths to sum. */
const BODY_SOURCES_APPROX_MB = 700;

/** MB, real on-disk total of the eight BMNG quadrants. */
const BMNG_QUADRANTS_APPROX_MB = 421;

/** MB, real Content-Lengths: PIA11707 30 + the true-colour reference 57. */
const CHROMA_SOURCES_APPROX_MB = 87;

export const FULL_FETCH_APPROX_MB =
  BODY_SOURCES_APPROX_MB + BMNG_QUADRANTS_APPROX_MB + CHROMA_SOURCES_APPROX_MB;

/** MB: the 2k SSS variants + the 5400x2700 BMNG sibling. */
export const DEV_FETCH_APPROX_MB = 7;

export type TextureSource = {
  readonly url: string;
  readonly destPath: string;
};

function fullSource(entry: TextureSourceRow): TextureSource {
  return { url: RAW_DATA[entry.native].upstream, destPath: rawDataPath(entry.native) };
}

/**
 * The `--dev` source for a body/ring, or `null` where the row names none. A
 * `devFilename`'s URL is derived from the native upstream by swapping the
 * resolution-prefixed filename (`8k_mars.jpg` -> `2k_mars.jpg`), so the SSS
 * download base stays single-sourced in the registry; where the native already
 * IS the 2k tier the swap is a no-op onto the native path, not a duplicate.
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

/** `TEXTURE_SOURCES` widened to the whole `(bodyId, kind)` key space so the
 *  variable-kind lookup type-checks; every key `ALL_BODY_TEXTURE_KEYS` yields is
 *  populated (same registry behind both), so the `!` holds. */
const SOURCE_TABLE = TEXTURE_SOURCES as Record<
  BodyTextureId | RingTextureId,
  Partial<Record<TextureKind, TextureSourceRow>>
>;

/** One entry per `(body, kind)` texture key, in family-key order. A new map kind
 *  on a body joins via `ALL_BODY_TEXTURE_KEYS`, with no edit here. */
const TEXTURE_ENTRIES: readonly TextureSourceRow[] = ALL_BODY_TEXTURE_KEYS.map(
  ({ bodyId, kind }) => SOURCE_TABLE[bodyId][kind]!,
);

/**
 * The eight BMNG quadrants the Earth tile pyramid is baked from. No whole-globe
 * runtime texture is built from them, so they are not a `(body, kind)` source
 * and cannot ride `TEXTURE_SOURCES` — but they must stay obtainable by command,
 * hence this second list. `BMNG_QUADRANT_KEYS` is shared with the bake.
 */
const QUADRANT_SOURCES: readonly TextureSource[] = Object.values(BMNG_QUADRANT_KEYS).map((key) => ({
  url: RAW_DATA[key].upstream,
  destPath: rawDataPath(key),
}));

/**
 * The second (chroma) input of every `panSharpen` body, plus — appended by hand,
 * since nothing is built from it and so it has no `TEXTURE_SOURCES` row to
 * derive from — the true-colour REFERENCE the chroma calibration was fitted
 * against. The reference rides the pull anyway: the pipeline's numbers came from
 * it, and no other command obtains it. No `--dev` variants here.
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
 * The set of sources to fetch — the full native pull, or the small `--dev`
 * visual-check subset. Both derive from `TEXTURE_SOURCES`, so the download set
 * can't drift from the runtime registry. Pure, so the subset choice is
 * unit-testable headlessly.
 */
export function textureSourcesFor(dev: boolean): readonly TextureSource[] {
  if (dev) {
    return TEXTURE_ENTRIES.map(devSource).filter((s): s is TextureSource => s !== null);
  }
  return [...TEXTURE_ENTRIES.map(fullSource), ...QUADRANT_SOURCES, ...CHROMA_SOURCES];
}

/**
 * The size gate: a ~1.2 GB pull is not something to start by accident
 * (feedback_announce_big_downloads), so the full set REFUSES without an explicit
 * `--confirm`; the ~7 MB `--dev` subset is always allowed. Pure so the gate is
 * testable without spawning the CLI.
 */
export function requiresConfirm(dev: boolean, confirm: boolean): boolean {
  return !dev && !confirm;
}

/**
 * Injected so tests never touch the network. Structural rather than
 * `typeof fetch` so a fake needs only the fields `downloadGetOnly` reads — the
 * same minimal mock surface as `fetchDesi`'s `RangeTransport`.
 */
export type FetchTransport = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly body: ReadableStream<Uint8Array> | null;
}>;

/**
 * Download `url` to `destPath` with a plain `GET` (module header: why no HEAD or
 * Range). The body streams into a `<destPath>.part` sibling and is renamed into
 * place only on a clean finish, so an interrupted download leaves a `.part`,
 * never a truncated file passing as complete. `node:stream/promises` is what
 * makes that hold: it rejects on a mid-transfer drop instead of truncating
 * silently, so the `renameSync` past it only runs on a whole body.
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

    // Resume, GET-only style: skip what is already whole on disk. A pinned-hash
    // mismatch throws through to the CLI catch -> exit 1.
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
