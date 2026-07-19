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
import type { RingTextureId } from '../../src/@types/data/RingTextureId';
import type { TextureKind } from '../../src/@types/data/TextureKind';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { BODY_TEXTURE_REGISTRY } from '../../src/data/bodies/bodyTextureRegistry';
import { tierToTexturePx } from '../../src/utils/math/tierToTexturePx';
import { bodyTextureFilename } from '../../src/utils/scene/bodyTextureFilename';
import { RAW_DATA, rawDataPath } from '../utils/io/rawDataRegistry';
import { TEXTURE_SOURCES, type TextureSourceRow } from '../utils/io/textureSources';
import { emittedTiersForBody } from './emittedTiersForBody';
import { tiersFittingSourceWidth } from './tiersFittingSourceWidth';
import { writeLinearTier } from './writeLinearTier';

/** Output JPEG quality for the spherical body textures (spec §10, ~80). */
const JPEG_QUALITY = 80;

/**
 * The material map's R channel packs perceptual roughness in [0,1] (0 = a
 * mirror, 1 = fully diffuse), ramped across the water mask: open ocean is a
 * near-mirror glossy surface, land is rough. The ramp is linear in the mask's
 * land fraction, so an antialiased coastline gets an in-between roughness rather
 * than a hard specular seam.
 *
 * The shader's 'lib/pbr.wesl' `OCEAN_ROUGHNESS` overrides the ocean end via the
 * G-mask mix on pure-ocean pixels, so this baked ramp value only shapes the
 * coastline blend where the mask is fractional — tune glint tightness in the
 * shader const, not here.
 */
const OCEAN_RAMP_ROUGHNESS = 0.3;
const LAND_ROUGHNESS = 0.95;

/**
 * `TEXTURE_SOURCES` viewed by the wide `(bodyId, kind)` key space the build loop
 * ranges over. The const table's per-body key set is narrower than the whole
 * `TextureKind` union (today just `surface`), so the variable-kind lookup needs
 * this view; every `(bodyId, kind)` the build derives is populated, so the `!`
 * holds.
 */
const SOURCE_TABLE = TEXTURE_SOURCES as Record<
  BodyTextureId | RingTextureId,
  Partial<Record<TextureKind, TextureSourceRow>>
>;

/**
 * Ordered candidate paths for a source, best (native full-res) first, then the
 * `--dev` variant if any. `devKey` is its own registry row (Earth's BMNG
 * sibling); `devFilename` is a loose 2 k file under `textures.dir` (the SSS
 * bodies and the ring). Uranus/Neptune's `devFilename` resolves to the same
 * on-disk path as native (their native IS the 2 k file), so the extra candidate
 * is a harmless duplicate; the USGS moons carry neither.
 */
function candidatePaths(entry: TextureSourceRow): readonly string[] {
  const paths = [rawDataPath(entry.native)];
  if ('devKey' in entry) {
    paths.push(rawDataPath(entry.devKey));
  } else if ('devFilename' in entry) {
    paths.push(join(rawDataPath('textures.dir'), entry.devFilename));
  }
  return paths;
}

/** Ordered candidate paths for a body's `(kind)` source, best (native) first. */
function sourcePathsFor(id: BodyTextureId, kind: TextureKind): readonly string[] {
  return candidatePaths(SOURCE_TABLE[id][kind]!);
}

/** Ordered candidate paths for the Saturn ring strip, best (full) first. */
function ringSourcePaths(): readonly string[] {
  return candidatePaths(TEXTURE_SOURCES['saturn-ring'].surface);
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
 * Compose Earth's material map from the NASA water mask and write one tier.
 *
 * The mask is a single-channel image where land = 255 and water = 0. We resize
 * it to the tier width FIRST (keeping the working buffer small — the native mask
 * is 21600×10800), read it raw, and pack a linear RGBA:
 *
 *  - **R** = roughness, ramped `OCEAN_RAMP_ROUGHNESS → LAND_ROUGHNESS` by the mask's
 *    land fraction, so calm ocean is glossy and land is diffuse;
 *  - **G** = ocean mask, `255` where the pixel is water (`255 - land`), so 1 = ocean;
 *  - **B**, **A** = spare (0 / opaque) for a future plan to claim.
 *
 * The packed buffer goes through `writeLinearTier`, which encodes PNG with NO
 * sRGB gamma — the channels are numeric fields, not colour, so a gamma curve
 * would corrupt them. Resizing before packing means `writeLinearTier`'s own
 * resize is an identity op here; it stays general for a source that hands it a
 * full-res buffer to downsample.
 */
async function writeMaterialTier(srcPath: string, widthPx: number, outPath: string): Promise<void> {
  const mask = await sharp(srcPath, { limitInputPixels: false })
    .resize({ width: widthPx })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = mask.info;
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const land = mask.data[i * channels] ?? 0; // 0 = water, 255 = land
    const landFraction = land / 255;
    const roughness = OCEAN_RAMP_ROUGHNESS + (LAND_ROUGHNESS - OCEAN_RAMP_ROUGHNESS) * landFraction;
    rgba[i * 4 + 0] = Math.round(roughness * 255);
    rgba[i * 4 + 1] = 255 - land; // 255 where water — G's "1 = ocean"
    rgba[i * 4 + 2] = 0; // B spare
    rgba[i * 4 + 3] = 255; // A spare (opaque)
  }

  await writeLinearTier({ data: rgba, info: { width, height, channels: 4 } }, widthPx, outPath);
}

/**
 * Write one `(body, kind)` tier, dispatched by kind, and return a short log note.
 * `surface` takes the existing albedo path — mono USGS sources (Europa/Callisto,
 * carrying a registry `grayscaleTint`) go through the two-pass tint; full-colour
 * sources encode in one pass. `material` composes a linear roughness/ocean-mask
 * PNG (Earth's PBR map) via `writeMaterialTier`. An unhandled kind is a build
 * error, never a silent skip that would leave a body's map unbuilt.
 */
async function writeBodyKindTier(
  bodyId: BodyTextureId,
  kind: TextureKind,
  srcPath: string,
  widthPx: number,
  outPath: string,
): Promise<string> {
  if (kind === 'surface') {
    const tint = BODY_TEXTURE_REGISTRY[bodyId].grayscaleTint;
    await writeBodyTier(srcPath, tint, widthPx, outPath);
    return tint ? '  (tinted)' : '';
  }
  if (kind === 'night') {
    // Night lights are sRGB colour like the day albedo (JPG), but the Black Marble
    // source is already full-colour — no grayscale tint (that marker is for the
    // mono USGS moons), so pass `undefined` and encode in one pass.
    await writeBodyTier(srcPath, undefined, widthPx, outPath);
    return '';
  }
  if (kind === 'material') {
    await writeMaterialTier(srcPath, widthPx, outPath);
    return '  (material)';
  }
  throw new Error(`buildTextures: no writer for texture kind '${kind}' (${bodyId})`);
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

/**
 * The build's per-`(body, kind)` work list — one entry per map every textured
 * body declares in its registry `kinds`, in registry order. The ring is NOT here:
 * it carries only `surface` and is not registry-driven (`emittedTiersForBody`
 * indexes `BODY_TEXTURE_REGISTRY`, which has no ring row), so it rides its own
 * loop below. Pure over the registry — the unit-testable spine the build loop
 * consumes, and the guard (paired with the fetch drift test) that a new map kind
 * on a body actually gets built rather than silently dropped.
 */
export function textureBuildEntries(): readonly { bodyId: BodyTextureId; kind: TextureKind }[] {
  return (Object.keys(BODY_TEXTURE_REGISTRY) as BodyTextureId[]).flatMap((bodyId) =>
    (Object.keys(BODY_TEXTURE_REGISTRY[bodyId].kinds) as TextureKind[]).map((kind) => ({
      bodyId,
      kind,
    })),
  );
}

/** Build every body + the ring into `outDir`, logging per-source progress. */
export async function buildTextures(outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  for (const { bodyId, kind } of textureBuildEntries()) {
    const srcPath = firstExisting(sourcePathsFor(bodyId, kind));
    if (srcPath === null) {
      process.stderr.write(`  skip ${bodyId}:${kind}: no source on disk\n`);
      continue;
    }
    const width = await sourceWidth(srcPath);
    const fitting = tiersFittingSourceWidth(width);
    const tiers = emittedTiersForBody(bodyId, kind).filter((tier) => fitting.includes(tier));
    if (tiers.length === 0) {
      process.stderr.write(
        `  warn ${bodyId}:${kind}: source ${width}px too small for any tier — skipping\n`,
      );
      continue;
    }
    for (const tier of tiers) {
      const px = tierToTexturePx(tier);
      const filename = bodyTextureFilename(bodyId, kind, tier);
      const note = await writeBodyKindTier(bodyId, kind, srcPath, px, join(outDir, filename));
      process.stderr.write(`  ok   ${filename}${note}\n`);
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
