#!/usr/bin/env node
/**
 * buildTextures — turn the raw planet-body texture sources fetched into
 * data/raw/textures/ (see fetchTextures.ts) into the tiered runtime files the
 * browser loads on close approach: `public/data/images/textures/<bodyId>-<px>.jpg`
 * for the 13 spherical bodies, plus `saturn-ring-<px>.png` for the ring strip.
 *
 * The output name comes from the shared `bodyTextureFilename` helper — the SAME
 * helper the runtime fetcher (`bodyTextureFetcher`) calls to build its request
 * URL — so the emitted file and the requested URL can never drift onto different
 * names (a mismatch would 404 every body). Only the `surface` (day/albedo) kind
 * is built here; because `surface` is the helper's unsegmented default, the
 * emitted names are byte-identical to the historical `<bodyId>-<px>.jpg` /
 * `saturn-ring-<px>.png`, so re-running this tool needs no R2 re-sync. Non-surface
 * feature maps land with their own PRs.
 *
 * ## Three source formats, one sharp path
 *
 * The raws arrive in three shapes, all read by the same sharp/libvips pipeline:
 *
 *  - **SSS JPEG** — Solar System Scope albedo maps (the eight planets + Moon),
 *    2:1 equirectangular RGB JPEGs at 2k/4k/8k.
 *  - **NASA BMNG JPEG** — the Blue Marble Earth equirect (21600×10800 full, or a
 *    5400×2700 dev sibling), same 2:1 RGB shape.
 *  - **USGS GeoTIFF** — the four Galilean moons as plain 8-bit TIFFs. Io and
 *    Ganymede are RGB; Europa and Callisto ship single-channel (mono). sharp
 *    reads TIFF natively (no ISIS toolchain), so a `.tif` flows through the exact
 *    same `sharp(src)` entry as a JPEG — the format is transparent to the build.
 *
 * ## Grayscale tint for the mono USGS moons
 *
 * Europa and Callisto have no global colour mosaic — their USGS sources are
 * single-channel. `BODY_TEXTURE_REGISTRY` carries a `grayscaleTint` (a per-body
 * Vec3) for exactly those two; we expand the mono source to sRGB and multiply the
 * tint into it (`.linear(tint, 0)`), restoring a plausible hue the map lacks. The
 * tint's presence in the registry IS the mono-source marker — every full-colour
 * source has none and passes through untinted.
 *
 * ## Non-upscaled tier downsample (the source-cap intersection)
 *
 * Each body emits `emittedTiersForBody(id, 'surface')` — its registry policy
 * ceiling (Uranus/Neptune 2k, Venus 4k, else 8k) — INTERSECTED with
 * `tiersFittingSourceWidth(sourceWidth)`, the tiers the source on disk can make
 * without upscaling. The intersection is what lets a `--dev` fetch (only the 2 k
 * SSS files + the 5400×2700 Earth sibling on disk) build correctly: a 2 k source
 * emits only the `small` tier; the 5400-wide Earth dev source emits `small` +
 * `medium` but not `large`. We NEVER upscale — a wider source downsamples to a
 * narrower tier, never the reverse (spec §3). A body with no source on disk is
 * logged and skipped; the run emits whatever it can rather than crashing.
 *
 * ## Ring PNG — alpha passthrough
 *
 * Saturn's ring is a radial alpha strip (transparent gaps between the ring
 * bands), so it ships as PNG, not JPEG — a JPEG cannot carry the alpha channel.
 * The strip is resized to each tier width preserving its aspect and re-encoded as
 * PNG with the alpha untouched (no flatten). It rides Saturn's `large` ceiling,
 * so its emitted set is purely the source cap. The runtime samples it by radius
 * and uploads it as an N×1 `texture_2d`.
 *
 * All raw reads resolve through `rawDataPath('textures.*')` (or, for the loose
 * 2 k dev variants that are not their own registry rows, `join(rawDataPath(
 * 'textures.dir'), <filename>)`, per the `<catalog>.dir` convention). The output
 * dir `public/data/images/textures/` is a build artefact (like `public/data/*.bin`)
 * resolved relative to the repo root, exactly as `buildAllBins` / `fetchFamousImages`
 * resolve their `public/` outputs.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { BodyTextureId } from '../../src/@types/data/BodyTextureId';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { BODY_TEXTURE_REGISTRY } from '../../src/data/bodies/bodyTextureRegistry';
import { tierToTexturePx } from '../../src/utils/math/tierToTexturePx';
import { bodyTextureFilename } from '../../src/utils/scene/bodyTextureFilename';
import { RAW_DATA, rawDataPath, type RawDataKey } from '../utils/io/rawDataRegistry';
import { emittedTiersForBody } from './emittedTiersForBody';
import { tiersFittingSourceWidth } from './tiersFittingSourceWidth';

/** Output JPEG quality for the spherical body textures (spec §10, ~80). */
const JPEG_QUALITY = 80;

/**
 * Per-body raw-source keys, best-first. `native` is the full-res registry row;
 * the optional dev variant is the smaller source a `--dev` fetch leaves on disk
 * — either its own registry row (Earth's 5400×2700 BMNG sibling, `devKey`) or a
 * loose 2 k file in `textures.dir` (the SSS bodies, `devFilename`). Uranus /
 * Neptune have neither: their native SSS map IS the 2 k file, so a dev fetch
 * lands it at the native path. The USGS moons have no dev subset (full pull only).
 *
 * This is the build-side view of the raw sources — bodyId → source file — which
 * `fetchTextures`'s flat download list does not carry (it maps registry key →
 * URL, with no body identity), so the mapping is authored once here.
 */
type BodySourceKeys = {
  readonly native: RawDataKey;
  readonly devKey?: RawDataKey;
  readonly devFilename?: string;
};

const BODY_SOURCE_KEYS = {
  mercury: { native: 'textures.sssMercury8k', devFilename: '2k_mercury.jpg' },
  venus: { native: 'textures.sssVenus4k', devFilename: '2k_venus_atmosphere.jpg' },
  earth: { native: 'textures.nasaBmng', devKey: 'textures.nasaBmngDev' },
  mars: { native: 'textures.sssMars8k', devFilename: '2k_mars.jpg' },
  jupiter: { native: 'textures.sssJupiter8k', devFilename: '2k_jupiter.jpg' },
  saturn: { native: 'textures.sssSaturn8k', devFilename: '2k_saturn.jpg' },
  uranus: { native: 'textures.sssUranus2k' },
  neptune: { native: 'textures.sssNeptune2k' },
  moon: { native: 'textures.sssMoon8k', devFilename: '2k_moon.jpg' },
  io: { native: 'textures.usgsIo' },
  europa: { native: 'textures.usgsEuropa' },
  ganymede: { native: 'textures.usgsGanymede' },
  callisto: { native: 'textures.usgsCallisto' },
} as const satisfies Record<BodyTextureId, BodySourceKeys>;

/** The ring strip's raw sources, best-first: full 8 k, then the 2 k dev variant. */
const RING_SOURCE_FILENAME_DEV = '2k_saturn_ring_alpha.png';

/** Ordered candidate paths for a body's source, best (native) first. */
function sourcePathsFor(id: BodyTextureId): readonly string[] {
  const keys: BodySourceKeys = BODY_SOURCE_KEYS[id];
  const paths = [rawDataPath(keys.native)];
  if (keys.devKey !== undefined) {
    paths.push(rawDataPath(keys.devKey));
  } else if (keys.devFilename !== undefined) {
    paths.push(join(rawDataPath('textures.dir'), keys.devFilename));
  }
  return paths;
}

/** Ordered candidate paths for the Saturn ring strip, best (full) first. */
function ringSourcePaths(): readonly string[] {
  return [
    rawDataPath('textures.sssRing'),
    join(rawDataPath('textures.dir'), RING_SOURCE_FILENAME_DEV),
  ];
}

/** The first candidate path that exists on disk, or `null` if none do. */
function firstExisting(paths: readonly string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Read a source image's pixel width (0 if sharp can't report it). */
async function sourceWidth(srcPath: string): Promise<number> {
  const meta = await sharp(srcPath, { limitInputPixels: false }).metadata();
  return meta.width ?? 0;
}

/**
 * Multiply a grayscale tint into a single-channel mono source and write the
 * JPEG. Europa and Callisto ship one-channel USGS mosaics with no global colour;
 * the tint restores a plausible per-channel hue the map lacks.
 *
 * This runs as TWO sharp passes, not one, because libvips fixes its internal
 * operation order: within a single pipeline `linear` executes BEFORE the
 * band-expansion that `toColourspace('srgb')` implies for a 1-band image, so a
 * `linear` with three coefficients on a still-mono pipeline throws
 * 'Band expansion using linear is unsupported'. Splitting the work sidesteps the
 * ordering entirely — pass 1 resizes-to-tier (keeping the raw buffer small; the
 * full Europa source is 19631×9816, a ~578 MB raw buffer at native width) and
 * band-expands mono→sRGB into a raw RGB buffer; pass 2 re-reads that already
 * 3-channel buffer, where `linear` with three coefficients is well-defined, and
 * applies the per-channel multiply (`a·input + b` with b = 0) before encoding.
 */
export async function writeTintedMonoTier(
  srcPath: string,
  tint: Vec3,
  widthPx: number,
  outPath: string,
): Promise<void> {
  const rgb = await sharp(srcPath, { limitInputPixels: false })
    .resize({ width: widthPx })
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  await sharp(rgb.data, { raw: rgb.info })
    .linear([tint[0], tint[1], tint[2]], [0, 0, 0])
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outPath);
}

/**
 * Downsample one body source to a tier and write the JPEG. Resizes by width
 * only (the sources are exactly 2:1, so height follows). Mono sources carrying a
 * grayscale tint take the two-pass tint path (`writeTintedMonoTier`); full-colour
 * RGB sources encode in a single pass at `JPEG_QUALITY`.
 */
async function writeBodyTier(
  srcPath: string,
  tint: Vec3 | undefined,
  widthPx: number,
  outPath: string,
): Promise<void> {
  if (tint !== undefined) {
    await writeTintedMonoTier(srcPath, tint, widthPx, outPath);
    return;
  }
  await sharp(srcPath, { limitInputPixels: false })
    .resize({ width: widthPx })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outPath);
}

/**
 * Downsample the ring strip to a tier and write the PNG. Width-only resize
 * preserves the radial aspect; PNG keeps the alpha channel intact (no flatten).
 */
async function writeRingTier(srcPath: string, widthPx: number, outPath: string): Promise<void> {
  await sharp(srcPath, { limitInputPixels: false })
    .resize({ width: widthPx })
    .png()
    .toFile(outPath);
}

/** Build every body + the ring into `outDir`, logging per-source progress. */
export async function buildTextures(outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  for (const id of Object.keys(BODY_TEXTURE_REGISTRY) as BodyTextureId[]) {
    const srcPath = firstExisting(sourcePathsFor(id));
    if (srcPath === null) {
      process.stderr.write(`  skip ${id}: no source on disk\n`);
      continue;
    }
    const width = await sourceWidth(srcPath);
    const fitting = tiersFittingSourceWidth(width);
    const tiers = emittedTiersForBody(id, 'surface').filter((tier) => fitting.includes(tier));
    const tint = BODY_TEXTURE_REGISTRY[id].grayscaleTint;
    if (tiers.length === 0) {
      process.stderr.write(`  warn ${id}: source ${width}px too small for any tier — skipping\n`);
      continue;
    }
    for (const tier of tiers) {
      const px = tierToTexturePx(tier);
      const filename = bodyTextureFilename(id, 'surface', tier);
      await writeBodyTier(srcPath, tint, px, join(outDir, filename));
      process.stderr.write(`  ok   ${filename}${tint ? '  (tinted)' : ''}\n`);
    }
  }

  const ringSrc = firstExisting(ringSourcePaths());
  if (ringSrc === null) {
    process.stderr.write(`  skip saturn-ring: no source on disk\n`);
  } else {
    const width = await sourceWidth(ringSrc);
    const ringTiers = tiersFittingSourceWidth(width);
    for (const tier of ringTiers) {
      const px = tierToTexturePx(tier);
      const filename = bodyTextureFilename('saturn-ring', 'surface', tier);
      await writeRingTier(ringSrc, px, join(outDir, filename));
      process.stderr.write(`  ok   ${filename}\n`);
    }
  }
}

async function main(): Promise<void> {
  const outDir = resolve('public/data/images/textures');
  process.stderr.write(`buildTextures: reading ${RAW_DATA['textures.dir'].path} -> ${outDir}\n`);
  await buildTextures(outDir);
  process.stderr.write(`done; textures under ${outDir}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
