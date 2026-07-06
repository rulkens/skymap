/**
 * buildFontAtlas — generates one MSDF atlas per registered font.
 *
 * ## Why a build step?
 *
 * MSDF generation is non-trivial CPU work (msdfgen does an SDF
 * computation for every glyph at the requested distance range).
 * Doing it once at build time and shipping the resulting PNG means
 * the browser never needs the msdfgen WASM (~300 KB) and labels
 * appear on the first frame instead of after a generate-then-upload
 * pause.  Same shape as `tools/buildAllBins.ts`: read raw input
 * under `data/raw/`, emit artefacts to `public/`, idempotent across
 * runs.
 *
 * ## Why a loop over FONTS rather than one script per font?
 *
 * The pre-multi-font version of this file hard-coded a single
 * `FONT_INPUT` constant.  Adding a second font would have meant
 * duplicating the script or parameterising the constant through env
 * vars — both worse than reading the registry in `src/data/fonts.ts`,
 * which already knows the full set of fonts the runtime expects.
 *
 * ## Why a per-font dimension assertion?
 *
 * `msdf-bmfont-xml` silently grows the atlas page when the charset
 * overflows the requested `textureSize`.  At runtime this surfaces
 * as a mysterious mis-aligned UV or a `texture_2d_array` layer-size
 * validation error — both with no breadcrumb back to "you added too
 * many glyphs to cormorant's charset".  `assertAtlasDimensions`
 * catches the overflow at bake time with the offending font id in
 * the message, so the fix is obvious: shrink the charset, raise
 * `ATLAS_PX` and rebake everyone, or pick a more compact weight.
 *
 * ## Output
 *
 *   public/fonts/<id>.png   ATLAS_PX × ATLAS_PX RGB MSDF atlas
 *   public/fonts/<id>.json  glyph metrics in BMFont JSON form
 *
 * Both are committed to git (small enough, deterministic, and rarely
 * regenerated — unlike the catalog .bin files which live in R2).
 */
import generateBMFont from 'msdf-bmfont-xml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import {
  ATLAS_PX,
  ATLAS_FONT_SIZE,
  DISTANCE_RANGE_PX,
  FONTS,
  FONT_IDS,
} from '../../src/data/fonts';
import type { FontId } from '../../src/@types/data/FontId';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const RAW_FONTS_DIR = rawDataPath('fonts.dir');
const OUTPUT_DIR = 'public/fonts';

/**
 * Options shared across every bake.  Captured once so the per-font
 * loop never accidentally lets cormorant and (some-future-font)
 * disagree on dimensions, distance range, or field type — all three
 * of which the runtime relies on for sub-pixel correctness.
 *
 * `outputType: 'json'` keeps the metrics in the same shape
 * `parseFontMetrics` already consumes — no XML escape hatch.
 */
const SHARED_OPTIONS = {
  outputType: 'json',
  textureSize: [ATLAS_PX, ATLAS_PX],
  // Inter-glyph spacing in the atlas, in pixels.  Must be large enough
  // that a fragment sampling a UV offset outward from a glyph for the
  // outline fringe never lands in a NEIGHBOURING glyph's pixels.
  // Worst case at runtime is `outlineEmFrac * ATLAS_FONT_SIZE` atlas
  // pixels past the glyph rect (0.16 em × 84 px ≈ 13.4 px, see
  // vertex.wesl's fringe expansion).  24 covers that with margin
  // without inflating glyph cells excessively.
  texturePadding: 24,
  distanceRange: DISTANCE_RANGE_PX,
  fieldType: 'msdf',
  fontSize: ATLAS_FONT_SIZE,
} as const;

/**
 * Throw if the emitted PNG isn't exactly ATLAS_PX × ATLAS_PX.
 *
 * `msdf-bmfont-xml` silently grows the page when the charset
 * overflows the requested `textureSize`; at runtime this surfaces
 * either as a mis-aligned UV (the JSON still uses the requested
 * scaleW/scaleH for glyph rect math) or as a `texture_2d_array`
 * validation error (each layer must have identical dimensions).
 * Catching it here means the fix is obvious — shrink the charset
 * for this font, raise `ATLAS_PX` and rebake everyone, or pick a
 * more compact weight.
 *
 * Exported for unit-testing (see tests/tools/buildFontAtlas.test.ts).
 */
export function assertAtlasDimensions(
  fontId: FontId,
  actualWidth: number,
  actualHeight: number,
): void {
  if (actualWidth !== ATLAS_PX || actualHeight !== ATLAS_PX) {
    throw new Error(
      `[buildFontAtlas] ${fontId}: emitted atlas is ` +
        `${actualWidth}×${actualHeight}, expected ${ATLAS_PX}×${ATLAS_PX}. ` +
        `msdf-bmfont-xml grew the page — shrink the charset for ${fontId}, ` +
        `raise ATLAS_PX in src/data/fonts.ts and rebake every font, or ` +
        `pick a more compact weight.`,
    );
  }
}

/**
 * Bake one font.  Returns a promise that resolves when the PNG and
 * JSON have been written and the dimension assertion has passed.
 */
function bakeFont(fontId: FontId): Promise<void> {
  const cfg = FONTS[fontId];
  const ttfPath = path.join(RAW_FONTS_DIR, cfg.ttf);
  if (!fs.existsSync(ttfPath)) {
    return Promise.reject(new Error(`[buildFontAtlas] ${fontId}: TTF not found at ${ttfPath}`));
  }

  return new Promise<void>((resolve, reject) => {
    generateBMFont(
      ttfPath,
      {
        ...SHARED_OPTIONS,
        filename: fontId,
        charset: cfg.charset,
      },
      (
        err: Error | null,
        textures: Array<{ filename: string; texture: Buffer }>,
        font: { filename: string; data: string },
      ) => {
        if (err) {
          reject(new Error(`[buildFontAtlas] ${fontId}: msdf-bmfont-xml failed: ${err.message}`));
          return;
        }
        if (textures.length !== 1) {
          reject(
            new Error(
              `[buildFontAtlas] ${fontId}: expected exactly 1 atlas page, got ${textures.length}. ` +
                `Increase ATLAS_PX in src/data/fonts.ts or shrink the charset.`,
            ),
          );
          return;
        }

        const pngPath = path.join(OUTPUT_DIR, `${fontId}.png`);
        const jsonPath = path.join(OUTPUT_DIR, `${fontId}.json`);
        fs.writeFileSync(pngPath, textures[0]!.texture);
        fs.writeFileSync(jsonPath, font.data);

        // Read the PNG header to validate emitted dimensions.  We use
        // pngjs (already a transitive dep of msdf-bmfont-xml) for a
        // header-only parse rather than rolling our own ihdr reader.
        const parsed = PNG.sync.read(textures[0]!.texture);
        try {
          assertAtlasDimensions(fontId, parsed.width, parsed.height);
        } catch (assertionErr) {
          reject(assertionErr);
          return;
        }

        const pngKb = (fs.statSync(pngPath).size / 1024).toFixed(1);
        const jsonKb = (fs.statSync(jsonPath).size / 1024).toFixed(1);
        console.log(`Wrote ${pngPath} (${pngKb} KB)`);
        console.log(`Wrote ${jsonPath} (${jsonKb} KB)`);
        resolve();
      },
    );
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // Sequential bakes (not Promise.all) so log lines stay grouped
  // per-font and an early failure halts cleanly.  Each bake is
  // already CPU-bound on msdfgen, so parallelism wouldn't help.
  for (const fontId of FONT_IDS) {
    console.log(`[buildFontAtlas] baking ${fontId}…`);
    await bakeFont(fontId);
  }
  console.log(`[buildFontAtlas] done.  ${FONT_IDS.length} font(s) baked.`);
}

// Only run `main` when invoked as a script — importing the module
// for tests (which only need `assertAtlasDimensions`) must not
// trigger the bake.  `import.meta.url` ends with this file's path
// when tsx/node invokes it directly; under vitest the entrypoint is
// the test file, so the comparison is false.
const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (invokedAsScript) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
