#!/usr/bin/env node
/**
 * buildTextures — tier the raw texture sources (fetchTextures.ts) into the
 * runtime files under public/data/images/textures/.
 *
 * Output names come from `bodyTextureFilename`, the SAME helper the runtime
 * fetcher builds its request URL with — a name that drifts 404s every body.
 * Tiers are the body's registry ceiling INTERSECTED with what the source on
 * disk can make: we NEVER upscale, so a `--dev` (2k) source emits only `small`.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { BodyTextureId } from '../../src/@types/data/BodyTextureId';
import type { RingTextureId } from '../../src/@types/data/RingTextureId';
import type { TextureKind } from '../../src/@types/data/TextureKind';
import type { Vec3 } from '../../src/@types/math/Vec3';
import type { ChromaCalibration } from '../../src/@types/scene/ChromaCalibration';
import type { ColourTreatment } from '../../src/@types/scene/ColourTreatment';
import { BODY_TEXTURE_REGISTRY } from '../../src/data/bodies/bodyTextureRegistry';
import { tierToTexturePx } from '../../src/utils/math/tierToTexturePx';
import { bodyTextureFilename } from '../../src/utils/scene/bodyTextureFilename';
import { panSharpenRgb } from '../utils/image/panSharpenRgb';
import { RAW_DATA, rawDataPath } from '../utils/io/rawDataRegistry';
import { TEXTURE_SOURCES, type TextureSourceRow } from '../utils/io/textureSources';
import { bakeNormalMap, exaggerationFor } from './bakeNormalMap';
import { emittedTiersForBody } from './emittedTiersForBody';
import { tiersFittingSourceWidth } from './tiersFittingSourceWidth';
import { writeBodyAtlas } from './writeBodyAtlas';
import { writeCloudTier } from './writeCloudTier';
import { writeLinearTier } from './writeLinearTier';

/** Output JPEG quality for the spherical body textures (spec §10, ~80). */
const JPEG_QUALITY = 80;

/**
 * Endpoints of the material map's R channel: perceptual roughness in [0,1]
 * (0 = mirror, 1 = fully diffuse), ramped linearly in the mask's land fraction
 * so an antialiased coastline gets an in-between value, not a specular seam.
 *
 * `lib/pbr.wesl`'s `OCEAN_ROUGHNESS` overrides the ocean end on pure-ocean
 * pixels, so this value only shapes the fractional coastline blend — tune glint
 * tightness in the shader const, not here.
 */
const OCEAN_RAMP_ROUGHNESS = 0.3;
const LAND_ROUGHNESS = 0.95;

/** `TEXTURE_SOURCES` widened to the whole `(bodyId, kind)` key space so the
 *  variable-kind lookup type-checks; every pair the build derives comes from the
 *  registry the table mirrors, so the `!` holds. */
const SOURCE_TABLE = TEXTURE_SOURCES as Record<
  BodyTextureId | RingTextureId,
  Partial<Record<TextureKind, TextureSourceRow>>
>;

/**
 * Ordered candidate paths for a source, best (native full-res) FIRST, then the
 * `--dev` variant if any — so a full pull is preferred wherever both are on
 * disk. Uranus/Neptune's `devFilename` resolves to the same path as native, a
 * harmless duplicate candidate.
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

function sourcePathsFor(id: BodyTextureId, kind: TextureKind): readonly string[] {
  return candidatePaths(SOURCE_TABLE[id][kind]!);
}

/**
 * The pan-sharpen chroma source, or `null` where the row names none. Full-res
 * only: a `--dev` fetch pulls no USGS mono mosaic either, so a `panSharpen` body
 * is skipped by `firstExisting` before this is consulted.
 */
function chromaPathFor(id: BodyTextureId, kind: TextureKind): string | null {
  const entry = SOURCE_TABLE[id][kind]!;
  return 'chroma' in entry ? rawDataPath(entry.chroma) : null;
}

function ringSourcePaths(): readonly string[] {
  return candidatePaths(TEXTURE_SOURCES['saturn-ring'].surface);
}

function firstExisting(paths: readonly string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Source width in pixels; 0 if sharp can't report it. */
async function sourceWidth(srcPath: string): Promise<number> {
  const meta = await sharp(srcPath, { limitInputPixels: false }).metadata();
  return meta.width ?? 0;
}

/**
 * Multiply a tint into a mono source and write the JPEG — the path for a body
 * whose only map is panchromatic AND has no colour source to recover hue from
 * (Europa, Callisto, Charon). The tint is a stand-in, not a measurement. A mono
 * body that DOES have a colour source takes `panSharpen` (Pluto) and never
 * reaches here.
 *
 * TWO sharp passes, not one, because libvips fixes its operation order: within a
 * single pipeline `linear` runs BEFORE the band expansion that
 * `toColourspace('srgb')` implies for a 1-band image, so three coefficients on a
 * still-mono pipeline throw 'Band expansion using linear is unsupported'. Pass 1
 * resizes to tier first: the full Europa source is 19631×9816, ~578 MB raw.
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
 * Take luminance from a panchromatic mosaic and hue from a lower-resolution
 * colour map, undoing that map's published enhancement with `calibration`.
 *
 * The chroma source is resized to the LUMINANCE tier's exact grid (`fit: 'fill'`,
 * so a source whose aspect rounds differently cannot shift the two apart by a
 * row). A plain resize is all the registration needed: the mosaics share an
 * equirectangular graticule and cross-correlate at dx = dy = 0. A future pair
 * that does NOT co-register wants its own resampling step, not a fudge offset
 * smuggled in here.
 */
export async function writePanSharpenedTier(
  lumPath: string,
  chromaPath: string,
  calibration: ChromaCalibration,
  widthPx: number,
  outPath: string,
): Promise<void> {
  const lum = await sharp(lumPath, { limitInputPixels: false })
    .resize({ width: widthPx })
    .toColourspace('b-w')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = lum.info;
  const chroma = await sharp(chromaPath, { limitInputPixels: false })
    .resize({ width, height, fit: 'fill' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgb = panSharpenRgb(lum.data, chroma.data, calibration);
  await sharp(rgb, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outPath);
}

/**
 * Downsample one body source to a tier and write the JPEG, dispatching on the
 * body's registry colour treatment. Width-only resize: the sources are exactly
 * 2:1, so height follows.
 */
async function writeBodyTier(
  srcPath: string,
  treatment: ColourTreatment,
  chromaPath: string | null,
  widthPx: number,
  outPath: string,
): Promise<void> {
  switch (treatment.kind) {
    case 'colour': {
      await sharp(srcPath, { limitInputPixels: false })
        .resize({ width: widthPx })
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(outPath);
      return;
    }
    case 'monoTint': {
      await writeTintedMonoTier(srcPath, treatment.tint, widthPx, outPath);
      return;
    }
    case 'panSharpen': {
      // Loud, not a silent fallback to the mono source: shipping a grey Pluto
      // because a row lost its `chroma` key is the regression to stop here.
      if (chromaPath === null) {
        throw new Error(`buildTextures: panSharpen treatment with no chroma source (${srcPath})`);
      }
      await writePanSharpenedTier(srcPath, chromaPath, treatment.calibration, widthPx, outPath);
      return;
    }
    default: {
      const _exhaustive: never = treatment;
      throw new Error(`unhandled colour treatment: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Compose Earth's material map from the NASA water mask (single channel, land =
 * 255, water = 0) and write one tier. Channel contract, shared with the shader:
 *
 *  - **R** = roughness, ramped `OCEAN_RAMP_ROUGHNESS → LAND_ROUGHNESS` by land
 *    fraction;
 *  - **G** = ocean mask, `255 - land`, so 1 = ocean;
 *  - **B**, **A** = spare (0 / opaque).
 *
 * `writeLinearTier` encodes lossless WebP with NO sRGB gamma — these are numeric
 * fields, not colour, and a gamma curve would corrupt them. Resizing before
 * packing keeps the working buffer small (the native mask is 21600×10800).
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

/** Per-source cache of the baked normal buffer: the bake is a pure JS Sobel loop,
 *  and a normal map downsamples cleanly, so every tier is a resize of one bake.
 *  Caching the Promise keeps the memoisation correct under concurrency. */
const bakedNormalCache = new Map<
  string,
  Promise<{ data: Buffer; info: { width: number; height: number; channels: 4 } }>
>();

/**
 * Bake `bodyId`'s elevation source into a tangent-space normal map ONCE, capped
 * to the widest tier the body emits for `normal`. The cap is load-bearing: the
 * GEBCO relief is 21600×10800 (233 Mpx, ~930 MB raw) and the widest tier shipped
 * is 4k, so sharp must resize BEFORE `.raw()`. `.greyscale()` keeps three
 * identical bands, so channel 0 is read by the reported stride (as
 * `writeMaterialTier` does). `withoutEnlargement` keeps a narrow source from
 * being blown up past its native detail.
 */
function bakeNormalOnce(
  bodyId: BodyTextureId,
  srcPath: string,
): Promise<{ data: Buffer; info: { width: number; height: number; channels: 4 } }> {
  let baked = bakedNormalCache.get(srcPath);
  if (baked === undefined) {
    const capPx = tierToTexturePx(emittedTiersForBody(bodyId, 'normal').at(-1)!);
    baked = (async () => {
      // `.greyscale()` collapses the 16-bit elevation `.tif` to the 8-bit
      // heightfield `bakeNormalMap` expects; the quantization is accepted for v1.
      const grey = await sharp(srcPath, { limitInputPixels: false })
        .resize({ width: capPx, withoutEnlargement: true })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { width, height, channels } = grey.info;
      const single = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) single[i] = grey.data[i * channels]!;
      return bakeNormalMap({ data: single, width, height }, exaggerationFor(bodyId));
    })();
    bakedNormalCache.set(srcPath, baked);
  }
  return baked;
}

async function writeNormalTier(
  bodyId: BodyTextureId,
  srcPath: string,
  widthPx: number,
  outPath: string,
): Promise<void> {
  const baked = await bakeNormalOnce(bodyId, srcPath);
  await writeLinearTier(baked, widthPx, outPath);
}

type KindWriter = {
  readonly write: (
    bodyId: BodyTextureId,
    kind: TextureKind,
    srcPath: string,
    widthPx: number,
    outPath: string,
  ) => Promise<void>;
  readonly note: (bodyId: BodyTextureId) => string;
};

const TREATMENT_NOTE: Record<ColourTreatment['kind'], string> = {
  colour: '',
  monoTint: '  (tinted)',
  panSharpen: '  (pan-sharpened)',
};

/**
 * The sRGB (JPEG albedo) writer, shared by `surface` and `night`: colour
 * treatment is a per-BODY property, not a per-kind one, so one registry lookup
 * serves both kinds.
 */
const SRGB_WRITER: KindWriter = {
  write: (bodyId, kind, srcPath, widthPx, outPath) =>
    writeBodyTier(
      srcPath,
      BODY_TEXTURE_REGISTRY[bodyId].treatment,
      chromaPathFor(bodyId, kind),
      widthPx,
      outPath,
    ),
  note: (bodyId) => TREATMENT_NOTE[BODY_TEXTURE_REGISTRY[bodyId].treatment.kind],
};

/**
 * The kind→writer dispatch as DATA, so a new kind is one row, not another
 * if-branch. A kind with no row throws below rather than silently leaving a
 * body's map unbuilt — a registry `kinds` entry and its row here MUST land
 * together.
 */
const KIND_WRITERS: Partial<Record<TextureKind, KindWriter>> = {
  surface: SRGB_WRITER,
  night: SRGB_WRITER,
  material: {
    write: (_bodyId, _kind, srcPath, widthPx, outPath) =>
      writeMaterialTier(srcPath, widthPx, outPath),
    note: () => '  (material)',
  },
  normal: {
    write: (bodyId, _kind, srcPath, widthPx, outPath) =>
      writeNormalTier(bodyId, srcPath, widthPx, outPath),
    note: () => '  (normal)',
  },
  clouds: {
    write: (_bodyId, _kind, srcPath, widthPx, outPath) => writeCloudTier(srcPath, widthPx, outPath),
    note: () => '  (clouds)',
  },
};

async function writeBodyKindTier(
  bodyId: BodyTextureId,
  kind: TextureKind,
  srcPath: string,
  widthPx: number,
  outPath: string,
): Promise<string> {
  const writer = KIND_WRITERS[kind];
  if (writer === undefined) {
    throw new Error(`buildTextures: no writer for texture kind '${kind}' (${bodyId})`);
  }
  await writer.write(bodyId, kind, srcPath, widthPx, outPath);
  return writer.note(bodyId);
}

/**
 * Downsample the ring strip to a tier. Lossless WebP, not JPEG: the strip's
 * transparent gaps between ring bands need an alpha channel JPEG cannot carry.
 */
async function writeRingTier(srcPath: string, widthPx: number, outPath: string): Promise<void> {
  await sharp(srcPath, { limitInputPixels: false })
    .resize({ width: widthPx })
    .webp({ lossless: true })
    .toFile(outPath);
}

/**
 * The build's per-`(body, kind)` work list, in registry order. The ring is NOT
 * here: `emittedTiersForBody` indexes `BODY_TEXTURE_REGISTRY`, which has no ring
 * row, so it rides its own loop below. Pure over the registry, so a test can
 * catch a new map kind being silently dropped.
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

  // The boot atlas downsamples the `small` surface tiers the loop above just
  // wrote, so it must run after it. Membership is that same work list filtered
  // to `surface`, in the same order.
  await writeBodyAtlas(
    outDir,
    textureBuildEntries()
      .filter((entry) => entry.kind === 'surface')
      .map((entry) => entry.bodyId),
  );

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
