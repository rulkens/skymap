/**
 * writeBodyAtlas — emit the boot-time body-texture atlas plus the generated
 * layout the runtime reads it back with.
 *
 * ## What the atlas is for
 *
 * Body textures are proximity-gated on the live camera, so a body reached before
 * its own multi-megabyte tier lands draws as a flat albedo sphere. Rather than
 * predicting where the camera is going, one small image carries a LOW-RESOLUTION
 * `surface` tile for every textured body and is fetched first at boot, so every
 * body always has something to show.
 *
 * ## A transport format, not a sampling format
 *
 * Nothing ever samples this image. The runtime decodes it once and crops each
 * tile straight into the body's existing per-body GPU texture
 * (`copyExternalImageToTexture` with a source `origin`), so there is no shader
 * change, no UV remap, and no seam gutters — a tile's neighbours can bleed at the
 * edges without consequence because they are never sampled together.
 *
 * ## Why it is emitted here and not by a standalone script
 *
 * The failure mode of a separate `build-atlas` command is silent drift: re-curate
 * Mars, forget the atlas rebuild, and every cold boot shows the OLD Mars for a
 * few seconds with no error anywhere. Emitting the atlas from the same run that
 * writes the tiers makes staleness structurally impossible.
 *
 * ## Why the tiles are read back off disk
 *
 * Each tile is a downsample of the `small` tier file this same run just wrote,
 * not a second derivation from the raw source. The tier files already carry the
 * build's grayscale tints and colourspace handling; re-deriving from the raw
 * would mean a second tint path to keep in sync, and a tile that could disagree
 * with the texture it stands in for.
 *
 * ## No ring tile
 *
 * Saturn's ring is a ~16:1 alpha strip, not a 2:1 equirectangular map, so it
 * would break the uniform grid and force the whole atlas into an alpha-carrying
 * container. Its full-resolution texture is under 9 KB, small enough to arrive on
 * its own, so it gains nothing from a fallback tier and stays out.
 */

import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import sharp, { type OverlayOptions } from 'sharp';

import type { BodyTextureId } from '../../src/@types/data/BodyTextureId';
import { atlasTileRect } from '../../src/utils/gpu/atlasTileRect';
import { bodyTextureFilename } from '../../src/utils/scene/bodyTextureFilename';

/**
 * The atlas file, written beside the per-body tiers. Authored HERE and nowhere
 * else: the emitter copies it into the generated layout module below, and
 * `bodyAtlasFetcher` builds its URL from that constant. A literal repeated on
 * the runtime side would degrade as a silent 404 — the atlas never arrives, every
 * body falls back to grey, and no test or type check can see it — which is the
 * failure mode `bodyTextureFilename` already removes for the per-body tiers.
 */
const BODY_ATLAS_FILENAME = 'body-atlas.webp';

/**
 * The atlas grid. Every member tile is a 2:1 equirectangular surface map, so one
 * cell size serves all of them and a tile's rect derives from its index alone
 * (`src/utils/gpu/atlasTileRect.ts`). 512x256 is the smallest size at which a
 * planet still reads as itself at the moment it becomes drawable; four columns
 * keeps the atlas a square-ish 2048x1024, well inside every WebGPU dimension
 * limit even on the weakest mobile adapter.
 */
const GRID = { columns: 4, tileW: 512, tileH: 256 } as const;

/**
 * Lossy WebP at the same quality the JPEG tiers use. WebP is chosen purely for
 * compression here — with no ring tile the atlas is plain opaque sRGB and needs
 * no alpha channel.
 */
const ATLAS_QUALITY = 80;

/**
 * Hard budget. The atlas is fetched before everything else on a cold boot, so it
 * is spending the user's first second of bandwidth; anything above this is
 * competing with the assets it exists to unblock. Exceeded is a loud warning
 * rather than a throw — a too-large atlas still works, and failing the build
 * would strand the tiers this run already wrote.
 */
const BUDGET_BYTES = 1024 * 1024;

/** Mid-grey, the fill for a cell whose body had no source on disk to build from. */
const MISSING_TILE_FILL = { r: 128, g: 128, b: 128 };

const GENERATED_BANNER =
  '// src/data/bodies/bodyAtlas.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-textures\n' +
  '// Source of truth:  src/data/bodies/bodyTextureRegistry.ts\n';

/**
 * Emit the generated layout module: the atlas filename, each body's tile index,
 * and the grid those indices are read against.
 *
 * All three ride the generated file rather than being hand-written on the runtime
 * side because they are facts BOTH ends must agree on — the build names the file
 * and assigns indices while iterating the registry, the runtime fetches that name
 * and looks an index up by body id — and stating them once beats trusting two
 * independent sides to stay in step forever. Emitting rather than sharing a `src/`
 * constant also makes the agreement per-RUN: the bytes on disk and the constants
 * describing them are written by the same call.
 *
 * It is generated code and not a fetched JSON sidecar because a sidecar means an
 * extra round trip before the atlas is usable, which is exactly the latency this
 * whole feature removes. It is a few dozen bytes; it rides the JS bundle.
 */
function serializeBodyAtlasLayout(bodyIds: readonly BodyTextureId[]): string {
  const rows = bodyIds.map((bodyId, index) => `  ${bodyId}: ${index},`).join('\n');
  return (
    GENERATED_BANNER +
    "import type { BodyTextureId } from '../../@types/data/BodyTextureId';\n" +
    '\n' +
    '/** The atlas file this build wrote, under the textures directory. */\n' +
    `export const BODY_ATLAS_FILENAME = '${BODY_ATLAS_FILENAME}';\n` +
    '\n' +
    "/** Each body's tile index in the atlas, row-major from the top-left cell. */\n" +
    `export const BODY_ATLAS_LAYOUT: Readonly<Record<BodyTextureId, number>> = {\n${rows}\n};\n` +
    '\n' +
    '/** The grid those indices address. Feed it to `atlasTileRect` for a crop rect. */\n' +
    'export const BODY_ATLAS_GRID: Readonly<{ columns: number; tileW: number; tileH: number }> = {\n' +
    `  columns: ${GRID.columns},\n` +
    `  tileW: ${GRID.tileW},\n` +
    `  tileH: ${GRID.tileH},\n` +
    '};\n'
  );
}

/**
 * Composite one low-resolution tile per body into `<outDir>/body-atlas.webp` and
 * write the matching generated layout.
 *
 * `bodyIds` is the atlas membership IN INDEX ORDER — the caller derives it from
 * the build's own work list so there is no second enumeration of the textured-body
 * set to keep in sync with `BODY_TEXTURE_REGISTRY`.
 *
 * A body whose source was missing on disk (a `--dev` fetch, a fresh clone) has no
 * tier file to downsample. Its cell stays mid-grey and its INDEX IS STILL
 * ASSIGNED: shifting the remaining tiles up would silently hand every later body
 * its neighbour's face, and the layout has to stay total over `BodyTextureId`
 * regardless.
 */
export async function writeBodyAtlas(
  outDir: string,
  bodyIds: readonly BodyTextureId[],
): Promise<void> {
  const rows = Math.ceil(bodyIds.length / GRID.columns);
  const tiles: OverlayOptions[] = [];

  for (const [index, bodyId] of bodyIds.entries()) {
    const srcPath = join(outDir, bodyTextureFilename(bodyId, 'surface', 'small'));
    if (!existsSync(srcPath)) {
      process.stderr.write(`  warn atlas ${bodyId}: no built tier — cell ${index} left grey\n`);
      continue;
    }
    // The SAME index→pixel derivation the runtime crops with, not a second
    // spelling of it: a tool that packed column-major while `atlasTileRect` read
    // row-major would hand every body a neighbour's face, silently, with the
    // atlas otherwise valid. `left`/`top` are sharp's names for `x`/`y`.
    const rect = atlasTileRect(index, GRID.columns, { w: GRID.tileW, h: GRID.tileH });
    tiles.push({
      input: await sharp(srcPath).resize({ width: rect.w, height: rect.h }).toBuffer(),
      left: rect.x,
      top: rect.y,
    });
  }

  const atlasPath = join(outDir, BODY_ATLAS_FILENAME);
  await sharp({
    create: {
      width: GRID.columns * GRID.tileW,
      height: rows * GRID.tileH,
      channels: 3,
      background: MISSING_TILE_FILL,
    },
  })
    .composite(tiles)
    .webp({ quality: ATLAS_QUALITY })
    .toFile(atlasPath);

  const bytes = statSync(atlasPath).size;
  process.stderr.write(
    `  ok   ${BODY_ATLAS_FILENAME}  ${GRID.columns * GRID.tileW}x${rows * GRID.tileH}` +
      `  ${bytes} bytes  (${tiles.length}/${bodyIds.length} tiles)\n`,
  );
  if (bytes > BUDGET_BYTES) {
    process.stderr.write(
      `  WARN ${BODY_ATLAS_FILENAME} is ${bytes} bytes — over the ${BUDGET_BYTES}-byte boot budget\n`,
    );
  }

  // Repo-root-relative, like every other committed-codegen writer under tools/;
  // the npm script runs from the root.
  writeFileSync(
    resolve('src/data/bodies/bodyAtlas.generated.ts'),
    serializeBodyAtlasLayout(bodyIds),
  );
  process.stderr.write(`  ok   bodyAtlas.generated.ts  (${bodyIds.length} bodies)\n`);
}
