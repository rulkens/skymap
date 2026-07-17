#!/usr/bin/env node
/**
 * fetchTextures — download the raw planet-body texture sources (Solar
 * System Scope albedo maps, the NASA Blue Marble Earth equirect, and the
 * USGS Galilean-moon GeoTIFFs) to data/raw/textures/. See
 * data/raw/textures/README.md for the per-source provenance table and
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
 * The full raw pull is ~700 MB (the USGS mono GeoTIFFs dominate). On a
 * constrained network that is not something to kick off by accident
 * (feedback_announce_big_downloads), so the fetcher prints the total and
 * REFUSES the full pull without an explicit `--confirm`. `--dev` fetches
 * only the small subset — each SSS source's 2k variant plus the NASA
 * 5400x2700 sibling, ~7 MB — enough to exercise the whole
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

import { RAW_DATA, rawDataPath, type RawDataKey } from '../utils/io/rawDataRegistry';
import { skipIfAlreadyFetched, upsertSha256Sidecar } from './fetchDesi';

/** Approximate size of the full raw pull (all native tiers). The USGS mono
 *  GeoTIFFs (Europa 19631x9816, Callisto 15138x7569) are the bulk; the six
 *  8k SSS JPGs (~15 MB each) and the 30 MB BMNG equirect make up most of
 *  the rest. Printed by the size gate — no HEAD probe means we can't sum
 *  real Content-Lengths, so this is the spec §3 hand-tally. */
export const FULL_FETCH_APPROX_MB = 700;

/** Approximate size of the `--dev` subset (2k SSS variants + 5400x2700 BMNG). */
export const DEV_FETCH_APPROX_MB = 7;

/** One thing to download: where it lives upstream and where it lands on disk. */
export type TextureSource = {
  readonly url: string;
  readonly destPath: string;
};

/**
 * The SSS body textures: each native (full-res) registry row plus the 2k
 * filename used by the `--dev` subset. For Uranus/Neptune the native row
 * IS the 2k file (near-featureless sources capped at 2k), so `devFilename`
 * matches the native filename and the dev source resolves to the same
 * registry path — never fetched twice.
 *
 * `as const satisfies` (rather than a `readonly SssBody[]` annotation)
 * keeps each `nativeKey` a string LITERAL — so `RAW_DATA[nativeKey]`
 * narrows to a texture row (all of which carry `upstream`) instead of
 * widening to the whole registry union, where `upstream` is optional. Same
 * literal-preserving trick `fetchDesi`'s `DESI_KEYS` uses.
 */
const SSS_BODIES = [
  { nativeKey: 'textures.sssMercury8k', devFilename: '2k_mercury.jpg' },
  { nativeKey: 'textures.sssVenus4k', devFilename: '2k_venus_atmosphere.jpg' },
  { nativeKey: 'textures.sssMars8k', devFilename: '2k_mars.jpg' },
  { nativeKey: 'textures.sssJupiter8k', devFilename: '2k_jupiter.jpg' },
  { nativeKey: 'textures.sssSaturn8k', devFilename: '2k_saturn.jpg' },
  { nativeKey: 'textures.sssRing', devFilename: '2k_saturn_ring_alpha.png' },
  { nativeKey: 'textures.sssUranus2k', devFilename: '2k_uranus.jpg' },
  { nativeKey: 'textures.sssNeptune2k', devFilename: '2k_neptune.jpg' },
  { nativeKey: 'textures.sssMoon8k', devFilename: '2k_moon.jpg' },
] as const satisfies readonly { readonly nativeKey: RawDataKey; readonly devFilename: string }[];

type SssBody = (typeof SSS_BODIES)[number];

/** USGS Galilean-moon GeoTIFFs — full pull only (no small dev variant). */
const USGS_KEYS = [
  'textures.usgsIo',
  'textures.usgsEuropa',
  'textures.usgsGanymede',
  'textures.usgsCallisto',
] as const satisfies readonly RawDataKey[];

/** The native (full-res) source for an SSS body: its registered file. */
function sssFullSource(body: SssBody): TextureSource {
  return { url: RAW_DATA[body.nativeKey].upstream, destPath: rawDataPath(body.nativeKey) };
}

/**
 * The 2k dev source for an SSS body. The URL is derived from the native
 * upstream by swapping the resolution-prefixed filename (`8k_mars.jpg` ->
 * `2k_mars.jpg`), so the SSS download base stays single-sourced in the
 * registry. When the native file already IS the 2k tier (Uranus/Neptune)
 * the swap is a no-op and the dest is the native registry path — the same
 * source, not a duplicate.
 */
function sssDevSource(body: SssBody): TextureSource {
  const nativePath = rawDataPath(body.nativeKey);
  const nativeFilename = basename(nativePath);
  const nativeUpstream = RAW_DATA[body.nativeKey].upstream;
  if (nativeFilename === body.devFilename) {
    return { url: nativeUpstream, destPath: nativePath };
  }
  return {
    url: nativeUpstream.replace(nativeFilename, body.devFilename),
    destPath: join(rawDataPath('textures.dir'), body.devFilename),
  };
}

/**
 * The set of sources to fetch. `dev === false` is the full native pull
 * (every SSS body at its native tier + the full BMNG Earth equirect + the
 * four USGS moon GeoTIFFs); `dev === true` is the small visual-check subset
 * (each SSS body's 2k variant + the NASA 5400x2700 BMNG sibling).
 *
 * Pure — no filesystem or network side effects — so the subset choice is
 * unit-testable headlessly.
 */
export function textureSourcesFor(dev: boolean): readonly TextureSource[] {
  if (dev) {
    return [
      ...SSS_BODIES.map(sssDevSource),
      {
        url: RAW_DATA['textures.nasaBmngDev'].upstream,
        destPath: rawDataPath('textures.nasaBmngDev'),
      },
    ];
  }
  return [
    ...SSS_BODIES.map(sssFullSource),
    { url: RAW_DATA['textures.nasaBmng'].upstream, destPath: rawDataPath('textures.nasaBmng') },
    ...USGS_KEYS.map((key) => ({ url: RAW_DATA[key].upstream, destPath: rawDataPath(key) })),
  ];
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
 * Download `url` to `destPath` with a plain `GET` — no `HEAD`, no `Range`
 * (see the module header for why SSS breaks both). The body streams into a
 * `<destPath>.part` sibling and is renamed into place only on a clean
 * finish, so an interrupted download leaves a `.part` (re-fetched from
 * scratch next run) and never a truncated file passing as complete.
 *
 * The `node:stream/promises` pipeline surfaces a mid-transfer connection
 * drop as a rejected promise rather than a silent truncation.
 */
export async function downloadGetOnly(
  url: string,
  destPath: string,
): Promise<{ totalBytes: number }> {
  mkdirSync(dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;

  const res = await fetch(url);
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
