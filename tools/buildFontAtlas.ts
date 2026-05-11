/**
 * buildFontAtlas — generates the MSDF atlas the LabelRenderer consumes.
 *
 * Why a build step?  MSDF generation is non-trivial CPU work (msdfgen
 * does an SDF computation for every glyph at the requested distance
 * range).  Doing it once at build time and shipping the resulting PNG
 * means the browser never needs the msdfgen WASM (~300 KB) and labels
 * appear on the first frame instead of after a generate-then-upload
 * pause.  Same shape as `tools/buildAllBins.ts`: read raw input under
 * `data/raw/`, emit artefacts to `public/`, idempotent across runs.
 *
 * Output:
 *   public/fonts/jetbrains-mono.png   1024x1024 RGB MSDF atlas
 *   public/fonts/jetbrains-mono.json  glyph metrics in BMFont JSON form
 *
 * Both are committed to git (small enough, deterministic, and rarely
 * regenerated — unlike the catalog .bin files which live in R2).
 */
import generateBMFont from 'msdf-bmfont-xml';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FONT_INPUT = 'data/raw/fonts/JetBrainsMono-Regular.ttf';
const OUTPUT_DIR = 'public/fonts';
const OUTPUT_BASENAME = 'jetbrains-mono';

// Printable ASCII (32..126) plus a small extended set for unit symbols
// and a couple of decorative glyphs we might want.
const CHARSET = (() => {
  const ascii = Array.from({ length: 95 }, (_, i) => String.fromCodePoint(32 + i)).join('');
  const extras = '°±µ∞★';
  return ascii + extras;
})();

const OPTIONS = {
  outputType: 'json',     // emit .fnt as JSON instead of XML
  filename: OUTPUT_BASENAME,
  charset: CHARSET,
  fontSize: 42,           // glyph em-size in atlas pixels (resolution of the SDF source)
  // 100 glyphs (~95 ASCII + 5 unit symbols) at fontSize 42 pack into
  // ~213×512 px.  512² leaves a comfortable margin and quarters the
  // GPU upload (rgba16float-sampled atlas: 4 MB → 1 MB) versus 1024².
  // 256² doesn't fit — the packer needs ≥12 rows × ~48 px high.
  textureSize: [512, 512],
  texturePadding: 2,      // px of transparent padding between glyphs (avoids bleed)
  distanceRange: 4,       // SDF range in pixels — must match the shader's smoothing
  fieldType: 'msdf',
} as const;

function main() {
  if (!fs.existsSync(FONT_INPUT)) {
    console.error(`Font not found: ${FONT_INPUT}`);
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  generateBMFont(FONT_INPUT, OPTIONS, (err: Error | null, textures: Array<{ filename: string; texture: Buffer }>, font: { filename: string; data: string }) => {
    if (err) {
      console.error('msdf-bmfont-xml failed:', err);
      process.exit(1);
    }
    if (textures.length !== 1) {
      console.error(`Expected exactly 1 atlas page, got ${textures.length}. Increase textureSize or shrink charset.`);
      process.exit(1);
    }
    const pngPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.png`);
    const jsonPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.json`);
    fs.writeFileSync(pngPath, textures[0]!.texture);
    fs.writeFileSync(jsonPath, font.data);
    const pngKb = (fs.statSync(pngPath).size / 1024).toFixed(1);
    const jsonKb = (fs.statSync(jsonPath).size / 1024).toFixed(1);
    console.log(`Wrote ${pngPath} (${pngKb} KB)`);
    console.log(`Wrote ${jsonPath} (${jsonKb} KB)`);
  });
}

main();
