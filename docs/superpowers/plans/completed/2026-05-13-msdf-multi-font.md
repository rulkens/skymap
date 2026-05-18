# MSDF Multi-Font Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hard-coded MSDF font atlas with an extensible N-font registry. Bake one atlas per registered font into a shared envelope, upload them as layers of a single `texture_2d_array`, route per-`Label` font selection through a new `fontIndex` instance attribute, and migrate all current producers to Cormorant Garamond SemiBold.

**Architecture:** Approach B from the spec — one `LabelRenderer` instance with a `texture_2d_array<f32>` atlas binding. N atlases bake separately on disk (one PNG/JSON per font), get uploaded as N layers of one GPU texture at runtime, and the WGSL shader samples the right layer via a per-instance `fontIndex: u32`. The font registry (`src/data/fonts.ts`) is the single source of truth.

**Tech Stack:** TypeScript, WebGPU, WESL (WGSL), Vite, Vitest, msdf-bmfont-xml.

---

## Background

The current label pipeline hard-codes JetBrains Mono everywhere: `tools/buildFontAtlas.ts` has `FONT_INPUT = 'data/raw/fonts/JetBrainsMono-Regular.ttf'`, `loadFontAtlas.ts` hard-codes the URL `/fonts/jetbrains-mono`, and `labelRenderer.ts` uses a single `texture_2d<f32>` binding. There is no path to introduce a second font (e.g., a serif for label text) without breaking the bake step or doubling renderer plumbing.

This plan implements the design in `docs/superpowers/specs/2026-05-13-msdf-multi-font-design.md`. The spec is locked: Cormorant Garamond SemiBold replaces JetBrains Mono in one PR (no transitional period), atlas dimensions stay 512² / fontSize 42 / distanceRange 4, the charset is ASCII-printable + `°±µ`, and the architecture supports adding more fonts later as configuration changes (drop TTF + add a `FONTS` entry + rebuild).

The change touches the build step (now bakes N atlases), the runtime loader (now fetches N atlases in parallel), the renderer (now uploads N layers and uses `texture_2d_array`), the WESL shader (gains a flat `fontIndex` varying), the `Label` type (gains a required `font: FontId` field), and the two current producers (`youAreHereSubsystem`, `poiSubsystem` — each emits `font: 'cormorant'`).

The shader edit is gated on a manual visual-verification step in the dev server before commit (per the project's "be meticulous with WGSL" guidance).

## File map

### Created

- `data/raw/fonts/CormorantGaramond-SemiBold.ttf` — the new source TTF (vendored from Google Fonts, OFL license).
- `src/data/fonts.ts` — font registry (constants + `FONTS` + `FontId` + `FONT_IDS`).
- `src/@types/rendering/LoadedFontAtlases.d.ts` — replaces `LoadedFontAtlas.d.ts`; describes the multi-atlas load result.
- `tests/data/fonts.test.ts` — asserts `FONT_IDS` preserves insertion order and matches `keyof typeof FONTS`.
- `tests/tools/buildFontAtlas.test.ts` — unit-tests `assertAtlasDimensions`.

### Modified

- `tools/buildFontAtlas.ts` — loops over `FONTS`, bakes each font, runs `assertAtlasDimensions` after each. Exports `assertAtlasDimensions` for testing.
- `src/services/gpu/labels/loadFontAtlas.ts` → renamed to `loadFontAtlases.ts`; loads N fonts in parallel; returns `LoadedFontAtlases`.
- `src/services/gpu/renderers/labelRenderer.ts` — switches to `texture_2d_array` with N layers, accepts `LoadedFontAtlases`, packs `fontIndex` per glyph instance.
- `src/services/gpu/shaders/labels/io.wesl` — `VsIn` gains `@location(5) fontIndex: u32`; `VsOut` gains `@location(2) @interpolate(flat) fontIndex: u32`.
- `src/services/gpu/shaders/labels/vertex.wesl` — threads `fontIndex` from input to output.
- `src/services/gpu/shaders/labels/fragment.wesl` — atlas binding becomes `texture_2d_array<f32>`; `textureSample` takes the layer index.
- `src/@types/rendering/Label.d.ts` — adds required `readonly font: FontId` field.
- `src/@types/rendering/LabelRenderer.d.ts` — `setLabels` parameter becomes `readonly Label[]`.
- `src/services/engine/phases/initGpu.ts` — calls `loadFontAtlases()` and passes the multi-atlas result to `createLabelRenderer`.
- `src/services/engine/subsystems/youAreHereSubsystem.ts` — emits `font: 'cormorant'`.
- `src/services/engine/subsystems/poiSubsystem.ts` — emits `font: 'cormorant'`.
- `package.json` — rename `build-font` script to `build-fonts` (plural).
- `tests/services/gpu/labels/fontMetrics.test.ts` — extend with a multi-font load shape test.
- `tests/services/gpu/renderers/labelRenderer.test.ts` — update fixture to pass `LoadedFontAtlases`-shaped input and set `font` on labels.

### Deleted

- `src/@types/rendering/LoadedFontAtlas.d.ts` — replaced by `LoadedFontAtlases.d.ts`.
- `public/fonts/jetbrains-mono.png` — replaced by `cormorant.png`.
- `public/fonts/jetbrains-mono.json` — replaced by `cormorant.json`.
- `data/raw/fonts/JetBrainsMono-Regular.ttf` — replaced by Cormorant.

---

## Task 1: Vendor the Cormorant Garamond SemiBold TTF

**Files:**
- Add: `data/raw/fonts/CormorantGaramond-SemiBold.ttf`

This task is asset-only — no code, no tests. The TTF is committed because the build step (`tools/buildFontAtlas.ts`) reads from `data/raw/fonts/` and the bake is reproducible.

- [ ] **Step 1: Download the Google Fonts zip**

In a browser, visit `https://fonts.google.com/specimen/Cormorant+Garamond` and click "Get font" → "Download all". This downloads `Cormorant_Garamond.zip` to your default downloads folder.

Alternatively, from the command line:

```bash
curl -L -o /tmp/Cormorant_Garamond.zip 'https://fonts.google.com/download?family=Cormorant%20Garamond'
```

Expected: a ~1.5 MB zip file at `/tmp/Cormorant_Garamond.zip` (or wherever your browser saved it).

- [ ] **Step 2: Extract only the SemiBold static TTF**

The zip contains many weights (Regular, Medium, SemiBold, Bold, …) in two folders (`static/` and the root). We want exactly `static/CormorantGaramond-SemiBold.ttf` (weight 600, no italic).

```bash
mkdir -p /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/data/raw/fonts/
unzip -j -o /tmp/Cormorant_Garamond.zip 'static/CormorantGaramond-SemiBold.ttf' -d /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/data/raw/fonts/
```

Expected output:

```
Archive:  /tmp/Cormorant_Garamond.zip
  inflating: /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/data/raw/fonts/CormorantGaramond-SemiBold.ttf
```

If the zip layout has changed and `static/CormorantGaramond-SemiBold.ttf` isn't present, run `unzip -l /tmp/Cormorant_Garamond.zip` to list its contents and find the SemiBold weight 600 static TTF (look for a file named exactly `CormorantGaramond-SemiBold.ttf` — NOT italic, NOT variable, NOT `Cormorant-` (different family)). Adjust the `unzip -j` argument accordingly.

- [ ] **Step 3: Verify the file is in place**

```bash
ls -lh /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/data/raw/fonts/CormorantGaramond-SemiBold.ttf
```

Expected: a single line showing the file, approximately 220-260 KB.

- [ ] **Step 4: Commit the asset**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add data/raw/fonts/CormorantGaramond-SemiBold.ttf
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
chore(fonts): vendor Cormorant Garamond SemiBold TTF

Adds the source TTF for the upcoming MSDF multi-font atlas migration.
Downloaded from Google Fonts (OFL license), weight 600 static variant.
The bake step (tools/buildFontAtlas.ts) reads from data/raw/fonts/ —
keeping the source TTF in-repo means the public/fonts/*.png atlas is
reproducible from a single command and we don't depend on a flaky
external fetch at build time.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create the font registry

**Files:**
- Create: `src/data/fonts.ts`
- Create: `tests/data/fonts.test.ts`

The registry is the single source of truth for which fonts exist, their TTF source paths, their charsets, and the shared atlas envelope (`ATLAS_PX`, `DISTANCE_RANGE_PX`, `ATLAS_FONT_SIZE`). Both the build step (`tools/buildFontAtlas.ts`) and the runtime loader (`loadFontAtlases.ts`) import from here so the two sides can never drift on dimensions or charset.

- [ ] **Step 1: Write the failing test first**

Create `tests/data/fonts.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest';
import {
  ATLAS_PX,
  DISTANCE_RANGE_PX,
  ATLAS_FONT_SIZE,
  FONTS,
  FONT_IDS,
} from '../../src/data/fonts';
import type { FontId } from '../../src/data/fonts';

describe('font registry', () => {
  it('exposes the shared atlas envelope constants', () => {
    // These numbers must agree between the bake (tools/buildFontAtlas.ts)
    // and the runtime (loadFontAtlases.ts).  Hard-coding them in two
    // places was the original sin the registry eliminates.
    expect(ATLAS_PX).toBe(512);
    expect(DISTANCE_RANGE_PX).toBe(4);
    expect(ATLAS_FONT_SIZE).toBe(42);
  });

  it('registers cormorant with a TTF filename and a charset', () => {
    expect(FONTS.cormorant).toBeDefined();
    expect(FONTS.cormorant.ttf).toBe('CormorantGaramond-SemiBold.ttf');
    expect(FONTS.cormorant.charset.length).toBeGreaterThan(90);
    // ASCII printable space (32) through tilde (126) = 95 chars,
    // plus the three unit symbols °±µ.
    expect(FONTS.cormorant.charset.length).toBe(95 + 3);
  });

  it('includes degree, plus-minus, and micro in the charset', () => {
    expect(FONTS.cormorant.charset).toContain('°');
    expect(FONTS.cormorant.charset).toContain('±');
    expect(FONTS.cormorant.charset).toContain('µ');
  });

  it('FONT_IDS preserves declaration order of FONTS keys', () => {
    // Order matters: FONT_IDS[i] becomes GPU texture-array layer i.
    // If a future edit reorders FONTS, this test forces a deliberate
    // update of every Record<FontId, …> consumer.
    expect(FONT_IDS).toEqual(['cormorant']);
  });

  it('FontId is the keyof FONTS literal union (compile-time check)', () => {
    // This is a type-level assertion encoded as a value-level expect.
    // If `FontId` ever drifts from `keyof typeof FONTS`, this assignment
    // won't compile — that IS the test.
    const id: FontId = 'cormorant';
    expect(id).toBe('cormorant');
  });
});
```

Run the failing test:

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npx vitest run tests/data/fonts.test.ts
```

Expected: FAIL with module-resolution errors (`Cannot find module '../../src/data/fonts'`).

- [ ] **Step 2: Create `src/data/fonts.ts`**

Write the following file at `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/data/fonts.ts`:

```ts
/**
 * fonts — the font registry.  Single source of truth for which fonts
 * exist, where their TTFs live on disk, what charset each bakes, and
 * the shared atlas-envelope numbers every font must fit into.
 *
 * ## Why a registry instead of one TS module per font?
 *
 * Before this file, the bake step (`tools/buildFontAtlas.ts`) and the
 * runtime loader (`src/services/gpu/labels/loadFontAtlas.ts`) each
 * hard-coded the font name in their own constants — `FONT_INPUT` on
 * the bake side, `FONT_BASE` on the runtime side.  Adding a second
 * font required editing both, getting the order right by hand, and
 * hoping the atlas envelope (size, distance range, font size) stayed
 * in sync between bake and load.  Encoding the registry once, here,
 * and re-importing on both sides makes drift structurally impossible
 * — the two callers literally read the same array.
 *
 * ## Why `as const` + `keyof typeof FONTS` rather than an enum?
 *
 * `FontId` needs to be a string-literal union so the `Label.font`
 * field can be type-narrowed by callers and lookups like
 * `metricsByFont[label.font]` are type-safe.  An enum widens to
 * `string` at the wire boundary; `as const` keeps every key narrow
 * forever.
 *
 * ## Why the atlas envelope lives here, not in buildFontAtlas.ts?
 *
 * The runtime loader needs `ATLAS_PX` too, indirectly via the
 * FontMetrics it parses out of the BMFont JSON — but a future
 * `assertAtlasDimensions` helper, plus the regression test in
 * `tests/tools/buildFontAtlas.test.ts`, both need to read these
 * numbers from a shared location.  Putting them in this file (which
 * both bake-side and runtime-side already import) avoids a third
 * "constants module" with no other content.
 *
 * ## Order of FONTS keys = GPU layer index
 *
 * `FONT_IDS[i]` is layer `i` in the `texture_2d_array<f32>` atlas
 * binding.  Reordering FONTS reorders the layers, which is a breaking
 * change — every consumer that pre-computed a `Record<FontId, number>`
 * from `FONT_IDS.indexOf(...)` needs to re-derive.  The order test in
 * `tests/data/fonts.test.ts` makes this explicit.
 */

/**
 * Atlas page dimensions in pixels.  Every font bakes into a single
 * `ATLAS_PX × ATLAS_PX` PNG; this becomes the per-layer size of the
 * runtime `texture_2d_array<f32>`.  512² fits the ASCII-printable +
 * `°±µ` charset at `ATLAS_FONT_SIZE` 42 with comfortable margin —
 * `assertAtlasDimensions` catches any future overflow at build time.
 */
export const ATLAS_PX = 512;

/**
 * MSDF distance range in pixels.  Controls how wide the signed-distance
 * field around each glyph edge extends.  The fragment shader's
 * `fwidth`-based smoothstep band is exactly one pixel wide for any
 * scale, regardless of this value — but a too-small range produces
 * visible banding at extreme upscales and a too-large range wastes
 * atlas pixels.  4 is the msdf-bmfont-xml default and reads cleanly
 * from 12 px (`Label.minPixelSize`) up to 64 px (`maxPixelSize`).
 */
export const DISTANCE_RANGE_PX = 4;

/**
 * Em-size of glyphs in atlas pixels at the source SDF resolution.
 * Higher means crisper edges but fewer glyphs per page; lower packs
 * more glyphs but blurs at extreme upscales.  42 is the
 * msdf-bmfont-xml convention for a 512² atlas with ~100 glyphs.
 */
export const ATLAS_FONT_SIZE = 42;

/**
 * ASCII printable: space (32) through tilde (126) — 95 characters.
 * Covers every Latin letter, digit, and punctuation mark we currently
 * render in labels (`'You are here'`, POI names, etc.).
 */
const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) =>
  String.fromCodePoint(32 + i),
).join('');

/**
 * Extended unit symbols used in scale-bar / coordinate labels:
 *   °  degree sign (U+00B0)
 *   ±  plus-minus  (U+00B1)
 *   µ  micro       (U+00B5)
 *
 * Spec section "Open questions" locks the charset to this set.  Add
 * more here if a future producer needs them (and re-run the bake).
 */
const UNIT_SYMBOLS = '°±µ';

/**
 * Per-font configuration.  `ttf` is a filename relative to
 * `data/raw/fonts/`; `charset` is the union of codepoints the bake
 * step embeds in this font's atlas.
 */
export type FontConfig = {
  readonly ttf: string;
  readonly charset: string;
};

/**
 * The registry.  Adding a font is a three-step config change:
 *   1. Drop the TTF under `data/raw/fonts/`.
 *   2. Add a `<id>: { ttf, charset }` entry below.
 *   3. Run `npm run build-fonts` and `npm run sync-r2`.
 *
 * `as const` narrows every key to a string literal so `FontId` ends
 * up as a strict union (`'cormorant' | …`) rather than `string`.
 */
export const FONTS = {
  cormorant: {
    ttf: 'CormorantGaramond-SemiBold.ttf',
    charset: ASCII_PRINTABLE + UNIT_SYMBOLS,
  },
} as const satisfies Readonly<Record<string, FontConfig>>;

/**
 * Union of registered font ids.  Used by `Label.font`, `LoadedFontAtlases`,
 * the renderer's per-instance attribute packing — anywhere a font is
 * referenced by id.
 */
export type FontId = keyof typeof FONTS;

/**
 * Ordered list of font ids.  `FONT_IDS[i]` is the GPU layer index for
 * the font, both at upload time (renderer) and at sample time (shader).
 * Order matches declaration order of `FONTS` keys.
 */
export const FONT_IDS: readonly FontId[] = Object.keys(FONTS) as readonly FontId[];
```

- [ ] **Step 3: Re-run the test**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npx vitest run tests/data/fonts.test.ts
```

Expected: PASS, 5 tests pass.

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS — no type errors. The `as const satisfies Readonly<Record<string, FontConfig>>` clause both checks the shape and preserves the narrow keys.

- [ ] **Step 5: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add src/data/fonts.ts tests/data/fonts.test.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
feat(data): add font registry as single source of truth

Introduces src/data/fonts.ts with:
  - shared atlas envelope (ATLAS_PX, DISTANCE_RANGE_PX, ATLAS_FONT_SIZE)
  - FONTS const-object keyed by FontId (currently just `cormorant`)
  - FONT_IDS array whose order maps to GPU texture-array layer index

Build step and runtime loader will both import from here in follow-up
commits, eliminating the parallel hard-coded constants that previously
lived in tools/buildFontAtlas.ts and loadFontAtlas.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend the build step to loop over `FONTS` and assert atlas dimensions

**Files:**
- Modify: `tools/buildFontAtlas.ts`
- Modify: `package.json` (rename `build-font` → `build-fonts`)
- Create: `tests/tools/buildFontAtlas.test.ts`

The current bake script processes one hard-coded TTF. After this task it loops over `FONT_IDS`, shares an options object, and runs `assertAtlasDimensions` after each bake to catch the case where `msdf-bmfont-xml` silently grows the atlas past `ATLAS_PX`. The CormorantGaramond TTF is the only entry in `FONTS` at this point, so the bake produces `public/fonts/cormorant.{png,json}`. JetBrains Mono files are NOT touched in this task — they get deleted in Task 8 once the renderer is wired up.

- [ ] **Step 1: Write the failing test for `assertAtlasDimensions`**

Create `tests/tools/buildFontAtlas.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest';
import { assertAtlasDimensions } from '../../tools/buildFontAtlas';
import { ATLAS_PX } from '../../src/data/fonts';

describe('assertAtlasDimensions', () => {
  it('accepts a PNG with the expected square dimensions', () => {
    // The function takes (fontId, width, height) and throws if either
    // dimension is wrong.  Passing ATLAS_PX, ATLAS_PX should silently
    // return.
    expect(() => assertAtlasDimensions('cormorant', ATLAS_PX, ATLAS_PX)).not.toThrow();
  });

  it('throws with the font id when width overflows', () => {
    // msdf-bmfont-xml silently grows the atlas if the charset overflows
    // the requested page size.  Catching that requires knowing the
    // emitted dimensions and screaming loudly with the font id so the
    // engineer knows which charset to shrink (or which atlas to grow).
    expect(() => assertAtlasDimensions('cormorant', 1024, ATLAS_PX)).toThrow(
      /cormorant/,
    );
    expect(() => assertAtlasDimensions('cormorant', 1024, ATLAS_PX)).toThrow(
      /1024/,
    );
  });

  it('throws with the font id when height overflows', () => {
    expect(() => assertAtlasDimensions('cormorant', ATLAS_PX, 1024)).toThrow(
      /cormorant/,
    );
  });

  it('mentions both expected and actual dimensions in the error', () => {
    // The engineer reading the failure needs to see which dimension is
    // wrong and by how much.
    expect(() => assertAtlasDimensions('cormorant', 1024, 768)).toThrow(
      /512/, // expected
    );
  });
});
```

Run the failing test:

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npx vitest run tests/tools/buildFontAtlas.test.ts
```

Expected: FAIL — `assertAtlasDimensions` is not yet exported from `tools/buildFontAtlas.ts`.

- [ ] **Step 2: Rewrite `tools/buildFontAtlas.ts` to loop over FONTS and emit per-font outputs**

Replace the entire contents of `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/tools/buildFontAtlas.ts` with:

```ts
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
} from '../src/data/fonts';
import type { FontId } from '../src/data/fonts';

const RAW_FONTS_DIR = 'data/raw/fonts';
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
  texturePadding: 2,
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
const invokedAsScript = process.argv[1] !== undefined
  && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (invokedAsScript) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Verify `pngjs` is available**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && node -e "require('pngjs')" && echo OK
```

Expected: `OK`. `pngjs` is a transitive dep of `msdf-bmfont-xml`, so it's already installed. If the command errors with `Cannot find module 'pngjs'`, add it as a direct devDependency:

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm install --save-dev pngjs @types/pngjs
```

- [ ] **Step 4: Rename `build-font` script to `build-fonts` in package.json**

Read `package.json` and use Edit to replace:

```
    "build-font": "tsx tools/buildFontAtlas.ts",
```

with:

```
    "build-fonts": "tsx tools/buildFontAtlas.ts",
```

- [ ] **Step 5: Re-run the unit test**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npx vitest run tests/tools/buildFontAtlas.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 6: Run the bake against the real Cormorant TTF**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run build-fonts
```

Expected output (size figures will vary):

```
[buildFontAtlas] baking cormorant…
Wrote public/fonts/cormorant.png (XXX.X KB)
Wrote public/fonts/cormorant.json (XX.X KB)
[buildFontAtlas] done.  1 font(s) baked.
```

Verify the files exist and `cormorant.png` is exactly 512×512:

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && ls -lh public/fonts/cormorant.* && file public/fonts/cormorant.png
```

Expected: the `file` output line includes `512 x 512`.

- [ ] **Step 7: Run typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add tools/buildFontAtlas.ts tests/tools/buildFontAtlas.test.ts package.json public/fonts/cormorant.png public/fonts/cormorant.json
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
feat(build): loop buildFontAtlas over FONTS registry

Replaces the single hard-coded FONT_INPUT with a per-FONTS-entry
bake loop driven by src/data/fonts.ts.  Adds assertAtlasDimensions
to catch the silent atlas-overflow case in msdf-bmfont-xml (it grows
the page past the requested size when the charset doesn't fit, which
later breaks the texture_2d_array layer-size invariant at runtime).

Renames `npm run build-font` to `build-fonts` (plural) to match the
new shape — the bake now produces N atlases, not one.

JetBrains Mono files under public/fonts/ stay in place for now; they
get removed once the renderer is wired to read cormorant (Task 8).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add the new `LoadedFontAtlases` type and rename the old `LoadedFontAtlas`

**Files:**
- Create: `src/@types/rendering/LoadedFontAtlases.d.ts`
- Delete: `src/@types/rendering/LoadedFontAtlas.d.ts`

This task replaces the singular type with the plural one. The old `LoadedFontAtlas` is referenced only by `loadFontAtlas.ts` (which will be renamed in Task 5) and `labelRenderer.ts`'s factory signature (rewritten in Task 6) — we accept a brief window of broken type-checks between this commit and Task 5's, which we close immediately.

Because this task on its own breaks the build, we do NOT run `npm run typecheck` to pass between Step 1 and Step 2 — the next two tasks restore green. The commit at the end of this task is INTENDED to be a single failing-type-check checkpoint; if you prefer atomic commits, fold this task into Task 5's commit (see note at the bottom of this task).

- [ ] **Step 1: Create `src/@types/rendering/LoadedFontAtlases.d.ts`**

```ts
/**
 * LoadedFontAtlases — the parsed-and-decoded result of `loadFontAtlases`.
 *
 * Each registered font in `src/data/fonts.ts` contributes one
 * `FontMetrics` (parsed BMFont JSON, indexed by codepoint for O(1)
 * glyph lookup) and one `ImageBitmap` (the decoded PNG, ready for
 * `device.queue.copyExternalImageToTexture`).  The bitmaps are
 * ordered to match `FONT_IDS` so the renderer can upload
 * `bitmaps[i]` to layer `i` of its `texture_2d_array` atlas without
 * a name lookup per layer.
 *
 * ## Why a Record<FontId, FontMetrics> instead of two parallel arrays?
 *
 * Metrics are looked up by font id at label-pack time
 * (`metricsByFont[label.font]`); the Record gives O(1) keyed lookup.
 * Bitmaps are looked up by layer index at GPU-upload time
 * (`bitmaps[layerIndex]`); the readonly array gives positional
 * access matching the GPU layout.  Different access patterns →
 * different shapes.
 */

import type { FontMetrics } from './FontMetrics';
import type { FontId } from '../../data/fonts';

export type LoadedFontAtlases = {
  readonly metricsByFont: Readonly<Record<FontId, FontMetrics>>;
  /** Order matches `FONT_IDS`; index = GPU texture-array layer. */
  readonly bitmaps: readonly ImageBitmap[];
};
```

- [ ] **Step 2: Delete `src/@types/rendering/LoadedFontAtlas.d.ts`**

```bash
rm /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/@types/rendering/LoadedFontAtlas.d.ts
```

Note: type-check is intentionally broken at this commit boundary — `loadFontAtlas.ts` still imports the deleted file. Task 5 fixes it by replacing the entire loader module.

- [ ] **Step 3: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add src/@types/rendering/LoadedFontAtlases.d.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts rm src/@types/rendering/LoadedFontAtlas.d.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
refactor(types): introduce LoadedFontAtlases (plural)

Replaces the singular LoadedFontAtlas with the plural shape the
multi-font runtime loader will return:
  - metricsByFont: Record<FontId, FontMetrics> keyed lookup at pack time
  - bitmaps: readonly ImageBitmap[] positional access for GPU upload

Type-check is intentionally broken between this commit and the next
(loadFontAtlas.ts still imports the deleted type); the next commit
renames loadFontAtlas → loadFontAtlases and restores green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rename + rewrite the runtime loader to fetch N fonts in parallel

**Files:**
- Create: `src/services/gpu/labels/loadFontAtlases.ts`
- Delete: `src/services/gpu/labels/loadFontAtlas.ts`
- Modify: `src/services/engine/phases/initGpu.ts` (update import + call site)
- Modify: `tests/services/gpu/labels/fontMetrics.test.ts` (extend with multi-font load test)

The loader becomes a single `Promise.all` over all `FONT_IDS`, each fanning out into a JSON + PNG fetch. The two-step structure (per-font promise, then `Promise.all` across all fonts) keeps the parallelism shallow and easy to read.

- [ ] **Step 1: Write the failing multi-font test**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/tests/services/gpu/labels/fontMetrics.test.ts` and APPEND (do NOT replace) the following test block at the end of the file:

```ts

// ── multi-font loader shape test ──────────────────────────────────────────
//
// Lives in fontMetrics.test.ts (rather than its own file) because the
// loader's correctness reduces to "parseFontMetrics applied to each
// fetched JSON, ordered by FONT_IDS".  Stubs `fetch` and
// `createImageBitmap` so the test runs offline.

import { loadFontAtlases } from '../../../../src/services/gpu/labels/loadFontAtlases';
import { FONT_IDS } from '../../../../src/data/fonts';

describe('loadFontAtlases', () => {
  it('returns one FontMetrics per FontId, bitmaps ordered by FONT_IDS', async () => {
    // Build a stub BMFont JSON per font.  The atlas.width returned by
    // parseFontMetrics encodes which font it came from so the test can
    // assert the keyed record holds the right font's data.
    const stubJson = (fontIdHash: number) => ({
      pages: ['x.png'],
      common: { lineHeight: 50, base: 38, scaleW: fontIdHash, scaleH: fontIdHash },
      info: { face: 'X', size: 42 },
      distanceField: { fieldType: 'msdf', distanceRange: 4 },
      chars: [
        { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
      ],
    });

    // Bitmaps are returned by the stubbed createImageBitmap; we use a
    // unique placeholder per font so we can assert layer ordering.
    const fakeBitmaps = new Map<string, ImageBitmap>();
    for (const id of FONT_IDS) {
      fakeBitmaps.set(id, { width: 512, height: 512, close() {} } as unknown as ImageBitmap);
    }

    const originalFetch = globalThis.fetch;
    const originalCreateImageBitmap = globalThis.createImageBitmap;

    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      // Match `/fonts/<id>.json` or `/fonts/<id>.png`.
      const match = url.match(/\/fonts\/([^.]+)\.(json|png)$/);
      if (!match) throw new Error(`unexpected fetch url ${url}`);
      const id = match[1]!;
      const ext = match[2]!;
      if (ext === 'json') {
        return new Response(JSON.stringify(stubJson(id.charCodeAt(0))), { status: 200 });
      }
      // For PNGs we return a non-empty body; createImageBitmap is
      // stubbed below to look up by id.
      return new Response(new Uint8Array([0]), { status: 200, headers: { 'x-stub-id': id } });
    }) as typeof fetch;

    // createImageBitmap is called on the blob from the PNG fetch.  We
    // can't easily thread the font id through the blob, so we rely on
    // the FONT_IDS iteration order in the loader matching the order we
    // populate fakeBitmaps — which the loader guarantees by mapping
    // over FONT_IDS in order.
    let bitmapCallCount = 0;
    globalThis.createImageBitmap = (async () => {
      const id = FONT_IDS[bitmapCallCount]!;
      bitmapCallCount++;
      return fakeBitmaps.get(id)!;
    }) as typeof createImageBitmap;

    try {
      const loaded = await loadFontAtlases();
      expect(Object.keys(loaded.metricsByFont).sort()).toEqual([...FONT_IDS].sort());
      for (const id of FONT_IDS) {
        // Each font's metrics carries the fontIdHash we baked into scaleW.
        expect(loaded.metricsByFont[id].atlas.width).toBe(id.charCodeAt(0));
      }
      // Bitmaps array length matches FONT_IDS; order matches.
      expect(loaded.bitmaps).toHaveLength(FONT_IDS.length);
      for (let i = 0; i < FONT_IDS.length; i++) {
        expect(loaded.bitmaps[i]).toBe(fakeBitmaps.get(FONT_IDS[i]!));
      }
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.createImageBitmap = originalCreateImageBitmap;
    }
  });
});
```

Run the failing test:

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npx vitest run tests/services/gpu/labels/fontMetrics.test.ts
```

Expected: FAIL — `loadFontAtlases` does not yet exist.

- [ ] **Step 2: Create `src/services/gpu/labels/loadFontAtlases.ts`**

Write the following file at `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/labels/loadFontAtlases.ts`:

```ts
/**
 * loadFontAtlases — fetches and decodes every registered MSDF atlas in
 * parallel.  Returns a LoadedFontAtlases with one FontMetrics keyed by
 * FontId plus an array of decoded ImageBitmaps ordered to match FONT_IDS
 * (so `bitmaps[i]` uploads to GPU layer `i`).
 *
 * ## What this does
 *
 * For each font in `src/data/fonts.ts`:
 *
 *   - `<FONT_BASE>/<id>.json` — the BMFont metric JSON emitted by
 *     `tools/buildFontAtlas.ts`.  Parsed by `parseFontMetrics` into
 *     the O(1)-lookup `FontMetrics` shape the renderer's `setLabels`
 *     call uses for per-glyph UV / size / offset / advance reads.
 *
 *   - `<FONT_BASE>/<id>.png` — the pre-baked ATLAS_PX² MSDF texture.
 *     Decoded via `createImageBitmap` so it arrives as a GPU-uploadable
 *     `ImageBitmap` that `createLabelRenderer` passes directly to
 *     `device.queue.copyExternalImageToTexture` with
 *     `destination.origin.z = i` to land it in the right array layer.
 *
 * All N × 2 fetches kick off simultaneously via one `Promise.all` — the
 * JSON parse is fast enough that it never becomes the bottleneck, and
 * `createImageBitmap` is the heavier of the two per-font branches so
 * parallel dispatch halves the effective load time versus sequential
 * awaits.  HTTP/2 connection reuse keeps the per-font marginal cost
 * close to zero for the common case (one or two fonts).
 *
 * ## Why a `metricsByFont` Record and a positional `bitmaps` array?
 *
 * Two different access patterns — see the `LoadedFontAtlases` type doc.
 *
 * ## Why no retry logic?
 *
 * These assets are served from `public/fonts/` at zero runtime latency
 * on localhost and via Cloudflare Workers Assets in production — the
 * same CDN that serves the JS bundle.  If any fetch fails the renderer
 * simply won't exist (the `initGpu` await will reject and the bootstrap
 * phase will surface an `onStatusChange({ kind: 'error' })` message),
 * which is the same behaviour as a failed GPU adapter request.  Retry
 * logic would be dead code for the vast majority of loads and add
 * complexity for a corner case better handled by the user's network
 * layer.
 */

import { parseFontMetrics } from './fontMetrics';
import type { RawBMFont } from '../../../@types/rendering/RawBMFont';
import type { LoadedFontAtlases } from '../../../@types/rendering/LoadedFontAtlases';
import type { FontMetrics } from '../../../@types/rendering/FontMetrics';
import { FONT_IDS } from '../../../data/fonts';
import type { FontId } from '../../../data/fonts';

/**
 * Base URL for the font atlas files.  Intentionally a relative path so
 * Vite serves them from `public/fonts/` in dev and Workers Assets
 * serves them from the same path in production — no env-var
 * indirection needed (atlases are part of the static shell, not R2
 * binary artifacts).
 */
const FONT_BASE = '/fonts';

/**
 * Fetch + decode the JSON + PNG for one font id.  Returns a tuple
 * `[FontMetrics, ImageBitmap]` so the outer Promise.all can keep the
 * positional ordering aligned with `FONT_IDS`.
 */
async function loadOneFont(id: FontId): Promise<readonly [FontMetrics, ImageBitmap]> {
  const [json, png] = await Promise.all([
    fetch(`${FONT_BASE}/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`failed to fetch ${id}.json: ${r.status}`);
      return r.json() as Promise<RawBMFont>;
    }),
    fetch(`${FONT_BASE}/${id}.png`)
      .then((r) => {
        if (!r.ok) throw new Error(`failed to fetch ${id}.png: ${r.status}`);
        return r.blob();
      })
      .then(createImageBitmap),
  ]);
  return [parseFontMetrics(json), png] as const;
}

/**
 * Load every registered MSDF atlas in parallel.  Throws if any fetch
 * rejects or any decode fails — `initGpu` lets that rejection bubble
 * to the bootstrap catch block, which surfaces it via `onStatusChange`.
 */
export async function loadFontAtlases(): Promise<LoadedFontAtlases> {
  const loaded = await Promise.all(FONT_IDS.map((id) => loadOneFont(id)));

  // Build the keyed metrics record by zipping FONT_IDS with the
  // resolved tuples.  Object.fromEntries would lose the FontId-narrow
  // key typing, so we build the record imperatively with an explicit
  // assertion at the end.
  const metricsByFont: Partial<Record<FontId, FontMetrics>> = {};
  const bitmaps: ImageBitmap[] = [];
  for (let i = 0; i < FONT_IDS.length; i++) {
    const id = FONT_IDS[i]!;
    const [metrics, bitmap] = loaded[i]!;
    metricsByFont[id] = metrics;
    bitmaps.push(bitmap);
  }
  return {
    metricsByFont: metricsByFont as Readonly<Record<FontId, FontMetrics>>,
    bitmaps,
  };
}
```

- [ ] **Step 3: Delete the old loader**

```bash
rm /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/labels/loadFontAtlas.ts
```

- [ ] **Step 4: Update the initGpu call site**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/engine/phases/initGpu.ts`.

Find this import (around line 83):

```ts
import { loadFontAtlas } from '../../gpu/labels/loadFontAtlas';
```

Replace with:

```ts
import { loadFontAtlases } from '../../gpu/labels/loadFontAtlases';
```

Find this call site (around line 224):

```ts
  const fontAtlas = await loadFontAtlas();
  state.gpu.labelRenderer = createLabelRenderer(uiCtx, fontAtlas.metrics, fontAtlas.bitmap);
```

Replace with:

```ts
  const fontAtlases = await loadFontAtlases();
  state.gpu.labelRenderer = createLabelRenderer(uiCtx, fontAtlases);
```

(The renderer's signature change from `(ctx, metrics, bitmap)` to `(ctx, atlases)` is implemented in Task 6. Type-check stays red across this commit boundary — the bind-site is updated here, the factory it calls is updated in Task 6.)

- [ ] **Step 5: Re-run the unit test**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npx vitest run tests/services/gpu/labels/fontMetrics.test.ts
```

Expected: PASS — the new `loadFontAtlases` test passes alongside the existing `parseFontMetrics` tests. Total = 5 tests in this file.

- [ ] **Step 6: Commit (type-check still broken at this point — Task 6 closes it)**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add src/services/gpu/labels/loadFontAtlases.ts src/services/engine/phases/initGpu.ts tests/services/gpu/labels/fontMetrics.test.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts rm src/services/gpu/labels/loadFontAtlas.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
refactor(labels): rename loadFontAtlas → loadFontAtlases (plural)

Fetches every registered font in src/data/fonts.ts in parallel and
returns a LoadedFontAtlases with a FontId-keyed metrics record plus
a FONT_IDS-ordered bitmap array (one per GPU layer).

Type-check is intentionally broken until Task 6 lands — the
labelRenderer factory still expects the old (metrics, bitmap)
signature.  initGpu's call site has been updated to pass the new
LoadedFontAtlases shape; the renderer follows in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Renderer — switch to `texture_2d_array`, accept `LoadedFontAtlases`, keep shader on layer 0

**Files:**
- Modify: `src/services/gpu/renderers/labelRenderer.ts`
- Modify: `src/@types/rendering/LabelRenderer.d.ts` (parameter type widening to `readonly Label[]`)
- Modify: `tests/services/gpu/renderers/labelRenderer.test.ts`

This task is GPU-side only — the renderer becomes a `texture_2d_array` consumer, uploads N bitmaps to N layers, and stores a `metricsByFont` record. **The shader still samples layer 0**, so end-to-end output is unchanged. The shader edit lands in Task 8 (gated on visual verification). The instance attribute (`fontIndex` on each glyph) lands in Task 7.

`Label.font` is NOT yet added to the type in this task — the renderer currently uses a single `FontMetrics` for layout. Layout-by-font happens together with the instance attribute in Task 7. This task is a minimal refactor: rename the parameter shape and bind a `texture_2d_array` view with depth = N.

- [ ] **Step 1: Update the `LabelRenderer` type's `setLabels` to take `readonly Label[]`**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/@types/rendering/LabelRenderer.d.ts`. Find:

```ts
  setLabels(labels: Label[]): void;
```

Replace with:

```ts
  setLabels(labels: readonly Label[]): void;
```

This is a minor widening — every existing caller already passes a `readonly Label[]` (the director merges into a local `Label[]` but the type at the call site narrows). Aligns with the project's "prefer immutability" preference.

- [ ] **Step 2: Rewrite the renderer factory signature + atlas-texture creation**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/renderers/labelRenderer.ts`.

Find these imports:

```ts
import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Label } from '../../../@types/rendering/Label';
import type { LabelRenderer } from '../../../@types/rendering/LabelRenderer';
import type { FontMetrics } from '../../../@types/rendering/FontMetrics';
```

Add (after the FontMetrics import):

```ts
import type { LoadedFontAtlases } from '../../../@types/rendering/LoadedFontAtlases';
import { FONT_IDS } from '../../../data/fonts';
import type { FontId } from '../../../data/fonts';
```

Find the factory signature:

```ts
export function createLabelRenderer(
  ctx: GpuContext,
  metrics: FontMetrics,
  atlasBitmap: ImageBitmap | null,
  maxLabels = 64,
  maxGlyphsPerLabel = 64,
): LabelRenderer {
```

Replace with:

```ts
export function createLabelRenderer(
  ctx: GpuContext,
  atlases: LoadedFontAtlases,
  maxLabels = 64,
  maxGlyphsPerLabel = 64,
): LabelRenderer {
```

Find the line that defines `device`:

```ts
  const device = ctx.device as GPUDevice | null;
  const format = ctx.format;
  const maxGlyphs = maxLabels * maxGlyphsPerLabel;
```

Immediately after the `maxGlyphs` line, ADD:

```ts

  // Per-font metrics record + pre-computed layer index lookup.  Built
  // once at construction time so the per-glyph pack loop in setLabels
  // never has to call FONT_IDS.indexOf — that would be O(N) per glyph,
  // O(N²) per label.  The Record is keyed by FontId so callers do
  // `metricsByFont[label.font]` without a string compare per glyph.
  const metricsByFont = atlases.metricsByFont;
  const layerIndexOf: Readonly<Record<FontId, number>> = (() => {
    const lookup: Partial<Record<FontId, number>> = {};
    for (let i = 0; i < FONT_IDS.length; i++) {
      lookup[FONT_IDS[i]!] = i;
    }
    return lookup as Readonly<Record<FontId, number>>;
  })();

  // First-font metrics serve as the canonical atlas-dimensions source
  // (every layer is the same size — buildFontAtlas asserts this).  We
  // also use it for layout when Label.font is missing, but post-Task
  // 9 every Label carries `font` explicitly.
  const firstFontId = FONT_IDS[0]!;
  const firstMetrics = metricsByFont[firstFontId];
```

Then find the texture creation block:

```ts
    atlasTexture = device.createTexture({
      label: 'label-atlas',
      size: [metrics.atlas.width, metrics.atlas.height, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    if (atlasBitmap !== null) {
      device.queue.copyExternalImageToTexture(
        { source: atlasBitmap },
        { texture: atlasTexture },
        [metrics.atlas.width, metrics.atlas.height],
      );
    }
```

Replace with:

```ts
    // Single GPU texture, N layers — one per registered font.  Every
    // layer must have identical dimensions (a WebGPU validation
    // requirement); buildFontAtlas.assertAtlasDimensions enforces
    // this at bake time, so every entry in atlases.bitmaps has the
    // same width/height by construction.
    atlasTexture = device.createTexture({
      label: 'label-atlas',
      size: [firstMetrics.atlas.width, firstMetrics.atlas.height, FONT_IDS.length],
      format: 'rgba8unorm',
      // dimension defaults to '2d' — which combined with
      // depthOrArrayLayers > 1 produces a 2D-array texture.  No
      // explicit `dimension: '2d-array'` needed; the WebGPU spec
      // routes through dimension '2d' for both single and array.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Upload each font's bitmap to its FONT_IDS-indexed layer.  Some
    // tests pass an empty bitmap list (CPU-only state exercise); skip
    // the upload in that case — the layout test only inspects
    // CPU-side glyph packing, not the atlas contents.
    for (let i = 0; i < atlases.bitmaps.length; i++) {
      const bitmap = atlases.bitmaps[i];
      if (bitmap == null) continue;
      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: atlasTexture, origin: { x: 0, y: 0, z: i } },
        [firstMetrics.atlas.width, firstMetrics.atlas.height],
      );
    }
```

Then find the bind-group-layout texture entry:

```ts
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
```

Replace with:

```ts
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          // viewDimension '2d-array' tells WebGPU the bound resource
          // is a texture_2d_array<f32>, matching the shader after
          // Task 8.  Before Task 8 the shader still declares
          // texture_2d<f32>; that's a pipeline-creation-time
          // validation error which we DELIBERATELY don't trip yet —
          // the shader change is gated on visual verification and
          // lands in Task 8.  To keep this task green, the binding
          // stays at viewDimension default '2d' until Task 8 flips
          // BOTH sides atomically.  (See Task 8 Step 1.)
          texture: { sampleType: 'float' },
        },
```

Then find the bind-group entry for binding 2:

```ts
        { binding: 2, resource: atlasTexture.createView() },
```

Replace with:

```ts
        // Default createView() picks viewDimension '2d' for a depth-1
        // texture and '2d-array' for depth>1, so the view matches the
        // bind-group-layout entry above without an explicit override.
        // Task 8 makes both sides explicitly '2d-array'.
        { binding: 2, resource: atlasTexture.createView() },
```

Then find any remaining bare reference to `metrics` (singular) inside the file — there's one in `setLabels`:

```ts
      const quads = layoutLabel(label.text, metrics, label.alignX ?? 'left');
```

Replace with:

```ts
      // Pre-Task-9 fallback: producers haven't been migrated yet, so
      // `label.font` is undefined.  Layout against the first registered
      // font's metrics until Task 9 lands; Task 7 switches this to
      // `metricsByFont[label.font]`.
      const quads = layoutLabel(label.text, firstMetrics, label.alignX ?? 'left');
```

- [ ] **Step 3: Update the renderer test**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/tests/services/gpu/renderers/labelRenderer.test.ts`. Replace the whole file content with:

```ts
import { describe, it, expect } from 'vitest';
import { createLabelRenderer } from '../../../../src/services/gpu/renderers/labelRenderer';
import { parseFontMetrics } from '../../../../src/services/gpu/labels/fontMetrics';
import type { LoadedFontAtlases } from '../../../../src/@types/rendering/LoadedFontAtlases';

// Minimal BMFont fixture: just the uppercase A (codepoint 65) so we can
// test that the renderer counts known glyphs and silently drops
// unknown ones.
const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
  ],
});

// LoadedFontAtlases shape: one entry per registered FontId; bitmaps
// array stays empty so the renderer's GPU upload branch is skipped
// (we pass a null device anyway).
const FIXTURE_ATLASES: LoadedFontAtlases = {
  metricsByFont: { cormorant: FIXTURE_METRICS },
  bitmaps: [],
};

// Build a LabelRenderer with a null device — the factory guards all GPU
// calls behind `if (device)`, so CPU state is safe to exercise in unit
// tests without a real WebGPU context.  Mirrors `textureAtlas.test.ts`'s
// null-device pattern.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createLabelRenderer(ctx, FIXTURE_ATLASES);
};

describe('LabelRenderer (CPU state)', () => {
  it('starts with zero glyphs to draw', () => {
    const r = newRenderer();
    expect(r.glyphCount()).toBe(0);
  });

  it('counts glyphs across all labels after setLabels', () => {
    const r = newRenderer();
    r.setLabels([
      { id: 'a', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24, font: 'cormorant' },
      { id: 'b', worldPos: [1, 0, 0], text: 'AA', pixelSize: 24, font: 'cormorant' },
    ]);
    expect(r.glyphCount()).toBe(5);
    expect(r.labelCount()).toBe(2);
  });

  it('drops glyphs not present in metrics', () => {
    const r = newRenderer();
    // 'A中A' — 'A' is in metrics (id=65), '中' is not (id=20013).  We
    // expect only the two 'A' glyphs to be counted; the unknown
    // character is silently skipped.
    r.setLabels([{ id: 'x', worldPos: [0, 0, 0], text: 'A中A', pixelSize: 24, font: 'cormorant' }]);
    expect(r.glyphCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLabels', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 24, font: 'cormorant' }]);
    r.setLabels([{ id: 'b', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24, font: 'cormorant' }]);
    expect(r.labelCount()).toBe(1);
    expect(r.glyphCount()).toBe(3);
  });
});
```

Note: `Label.font` is referenced in this test even though Task 7 is where the type field becomes required. Vitest's type-checking is permissive — extra fields on object literals are tolerated by TypeScript's structural typing as long as the literal is type-asserted via `setLabels(...)`'s parameter widening. This will fully type-check after Task 7.

- [ ] **Step 4: Find any callers we haven't yet updated**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && grep -rn "createLabelRenderer" src tests
```

Expected: 3 hits — `labelRenderer.ts` (definition), `initGpu.ts` (already updated in Task 5), `labelRenderer.test.ts` (just updated), and `initGpu.destroyReachability.test.ts` (a mock — see below).

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/tests/services/engine/phases/initGpu.destroyReachability.test.ts` and locate this line:

```ts
  createLabelRenderer: vi.fn(() => makeStub('labelRenderer')),
```

No change needed — it's a mock returning a stub; its signature doesn't matter to the mock. Confirm no other references break:

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && grep -rn "fontAtlas\.metrics\|fontAtlas\.bitmap\|LoadedFontAtlas\b" src tests
```

Expected: no hits (the symbol `LoadedFontAtlas` singular is gone; `LoadedFontAtlases` plural exists, but the boundary `\b` in the regex prevents false matches).

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS — every dangling reference from Tasks 4–5 is now resolved.

- [ ] **Step 6: Run the renderer test**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npx vitest run tests/services/gpu/renderers/labelRenderer.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 7: Run full test suite**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm test
```

Expected: full suite PASS. The shader still samples layer 0, so visual output is unchanged.

- [ ] **Step 8: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add src/services/gpu/renderers/labelRenderer.ts src/@types/rendering/LabelRenderer.d.ts tests/services/gpu/renderers/labelRenderer.test.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
feat(renderer): labelRenderer accepts LoadedFontAtlases, uploads N layers

Factory signature changes from (ctx, metrics, bitmap) to
(ctx, atlases).  Atlas GPUTexture is now created with
depthOrArrayLayers = FONT_IDS.length and each bitmap uploads to its
indexed layer.  The default 2D view picks 2d-array when depth>1, so
the shader sampler binding still works — shader still indexes layer 0
in the textureSample call (changes land in Task 8 after visual
verification).

Pre-computes a Readonly<Record<FontId, number>> layer-index lookup
once at construction time so the per-glyph pack loop never pays an
O(N) FONT_IDS.indexOf per glyph.

Label.font is referenced in tests but not yet required at the type
level — that lands together with the instance attribute in Task 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add `Label.font` and the per-instance `fontIndex` attribute

**Files:**
- Modify: `src/@types/rendering/Label.d.ts`
- Modify: `src/services/gpu/renderers/labelRenderer.ts` (add fontIndex packing + vertex attribute)
- Modify: `tests/services/gpu/renderers/labelRenderer.test.ts` (assert fontIndex packing)

This task makes `Label.font` a required `FontId` field, threads the resolved layer index into a per-glyph attribute, and grows the glyph instance stride from 36 bytes to 40 bytes. The WESL shader still samples layer 0 (no fontIndex input yet) — Task 8 flips that.

- [ ] **Step 1: Add the required `font` field to `Label.d.ts`**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/@types/rendering/Label.d.ts`. Replace the whole file with:

```ts
/**
 * Label — a single world-anchored text label rendered by LabelRenderer.
 *
 * Glyphs of one label share world position, color, and fade state — see
 * the LabelRenderer module header for the per-label storage buffer
 * rationale.  This type is the public shape `setLabels(labels)` accepts.
 *
 * ## Why `font` is required (no default)
 *
 * The spec deliberately rejects a "default font" shim — every producer
 * MUST say which font it wants at the call site.  The alternative
 * (defaulting to the first registered font when omitted) would silently
 * route any future producer through whatever font happens to be at
 * FONT_IDS[0], which is the kind of implicit dependency the registry
 * was created to eliminate.  Adding a producer is one line; opting it
 * into the right font is one more line.
 */

import type { Vec3 } from '../math/Vec3';
import type { Vec4 } from '../math/Vec4';
import type { LabelAlignX } from './LabelAlignX';
import type { FontId } from '../../data/fonts';

export type Label = {
  readonly id: string;
  readonly worldPos: Vec3;
  readonly text: string;
  /** Registered FontId from `src/data/fonts.ts`.  Required — no default. */
  readonly font: FontId;
  /** Target em pixel height at the label's natural viewing distance. */
  readonly pixelSize: number;
  /** RGBA premultiplied, defaults to [1,1,1,1]. */
  readonly color?: Vec4;
  /** Lower clamp on on-screen em height in pixels (default 8). */
  readonly minPixelSize?: number;
  /** Upper clamp on on-screen em height in pixels (default 64). */
  readonly maxPixelSize?: number;
  /**
   * World em size in Mpc — controls the natural distance at which
   * `pixelSize` is reached.  Default 0.01 Mpc/em (so a 24 px label
   * with worldEmMpc=0.01 reads at 24 px when ~0.01 Mpc away).
   */
  readonly worldEmMpc?: number;
  /** Fade multiplier in [0,1] driven by youAreHereVisibility. Default 1. */
  readonly fadeAlpha?: number;
  /**
   * Horizontal alignment of the text relative to `worldPos`.
   * Default 'left' (text extends rightward from the anchor).
   * 'center' centers the text horizontally on the anchor — the
   * "you are here" marker uses this so the vertical line passes
   * through the middle of the text.
   */
  readonly alignX?: LabelAlignX;
};
```

- [ ] **Step 2: Grow the glyph instance stride from 36 → 40 bytes and pack fontIndex**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/renderers/labelRenderer.ts`.

Find:

```ts
/**
 * Per-glyph instance buffer stride, matching `VsIn` attributes 1–4 in io.wesl:
 *
 *   bytes  0..7   localOffset  vec2<f32>  — pen-relative top-left in atlas px
 *   bytes  8..15  localSize    vec2<f32>  — glyph width/height in atlas px
 *   bytes 16..31  uvRect       vec4<f32>  — (u0,v0,u1,v1) atlas UV
 *   bytes 32..35  labelIndex   u32        — index into labels[] storage buffer
 *
 * Note: `corner` (location 0) comes from a separate 4-vertex unit-quad
 * buffer with `stepMode: 'vertex'`, not from this instance buffer.
 */
const GLYPH_INSTANCE_BYTES = 36;
```

Replace with:

```ts
/**
 * Per-glyph instance buffer stride, matching `VsIn` attributes 1–5 in io.wesl:
 *
 *   bytes  0..7   localOffset  vec2<f32>  — pen-relative top-left in atlas px
 *   bytes  8..15  localSize    vec2<f32>  — glyph width/height in atlas px
 *   bytes 16..31  uvRect       vec4<f32>  — (u0,v0,u1,v1) atlas UV
 *   bytes 32..35  labelIndex   u32        — index into labels[] storage buffer
 *   bytes 36..39  fontIndex    u32        — texture_2d_array layer index
 *                                            (= FONT_IDS.indexOf(label.font))
 *
 * Note: `corner` (location 0) comes from a separate 4-vertex unit-quad
 * buffer with `stepMode: 'vertex'`, not from this instance buffer.
 */
const GLYPH_INSTANCE_BYTES = 40;
```

Then find the attributes array for buffer 1 in the pipeline declaration:

```ts
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' },   // localOffset
              { shaderLocation: 2, offset: 8, format: 'float32x2' },   // localSize
              { shaderLocation: 3, offset: 16, format: 'float32x4' },  // uvRect
              { shaderLocation: 4, offset: 32, format: 'uint32' },     // labelIndex
            ],
```

Replace with:

```ts
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' },   // localOffset
              { shaderLocation: 2, offset: 8, format: 'float32x2' },   // localSize
              { shaderLocation: 3, offset: 16, format: 'float32x4' },  // uvRect
              { shaderLocation: 4, offset: 32, format: 'uint32' },     // labelIndex
              { shaderLocation: 5, offset: 36, format: 'uint32' },     // fontIndex
            ],
```

Then find the inner glyph-packing loop in setLabels.  The current shape is:

```ts
      // Write per-glyph instance records (36 bytes = 9 × 4 = 8 × f32 + 1 × u32).
      for (const q of quads) {
        if (currentGlyphCount >= maxGlyphs) break;
        // f32 base index inside the shared ArrayBuffer view.  9 slots/glyph
        // (8 floats + 1 uint reinterpreted via the u32 view at the same offset).
        const f32Base = currentGlyphCount * (GLYPH_INSTANCE_BYTES / 4);
        glyphF32[f32Base + 0] = q.localOffsetX;
        glyphF32[f32Base + 1] = q.localOffsetY;
        glyphF32[f32Base + 2] = q.localSizeW;
        glyphF32[f32Base + 3] = q.localSizeH;
        glyphF32[f32Base + 4] = q.uvU0;
        glyphF32[f32Base + 5] = q.uvV0;
        glyphF32[f32Base + 6] = q.uvU1;
        glyphF32[f32Base + 7] = q.uvV1;
        // labelIndex is a u32; write it through the Uint32Array view so the
        // bit pattern is exact (Float32Array would reinterpret it).
        glyphU32[f32Base + 8] = li;
        currentGlyphCount++;
      }
```

Replace with:

```ts
      // Resolve the label's font to its GPU texture-array layer index
      // ONCE per label, outside the inner glyph loop — every glyph in
      // a label shares the same layer.
      const fontIndex = layerIndexOf[label.font];

      // Write per-glyph instance records (40 bytes = 10 × 4 = 8 × f32 + 2 × u32).
      for (const q of quads) {
        if (currentGlyphCount >= maxGlyphs) break;
        // f32 base index inside the shared ArrayBuffer view.  10 slots/glyph
        // (8 floats + 2 uints reinterpreted via the u32 view at the same
        // offsets — slots 8 and 9).
        const f32Base = currentGlyphCount * (GLYPH_INSTANCE_BYTES / 4);
        glyphF32[f32Base + 0] = q.localOffsetX;
        glyphF32[f32Base + 1] = q.localOffsetY;
        glyphF32[f32Base + 2] = q.localSizeW;
        glyphF32[f32Base + 3] = q.localSizeH;
        glyphF32[f32Base + 4] = q.uvU0;
        glyphF32[f32Base + 5] = q.uvV0;
        glyphF32[f32Base + 6] = q.uvU1;
        glyphF32[f32Base + 7] = q.uvV1;
        // labelIndex + fontIndex are u32; write them through the
        // Uint32Array view so the bit patterns are exact (the
        // Float32Array view would reinterpret an int payload as
        // garbage floating-point bits).
        glyphU32[f32Base + 8] = li;
        glyphU32[f32Base + 9] = fontIndex;
        currentGlyphCount++;
      }
```

Then update the layout-by-font line previously left at "first font's metrics":

```ts
      // Pre-Task-9 fallback: producers haven't been migrated yet, so
      // `label.font` is undefined.  Layout against the first registered
      // font's metrics until Task 9 lands; Task 7 switches this to
      // `metricsByFont[label.font]`.
      const quads = layoutLabel(label.text, firstMetrics, label.alignX ?? 'left');
```

Replace with:

```ts
      // Each label specifies its own font; layout reads the font's
      // metrics from the FontId-keyed record built at construction
      // time.  No fallback — Label.font is required at the type level.
      const quads = layoutLabel(label.text, metricsByFont[label.font], label.alignX ?? 'left');
```

(`firstFontId` and `firstMetrics` from Task 6 are still used for the atlas-dimension reads — leave those untouched.)

- [ ] **Step 3: Update the renderer test to assert fontIndex packing**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/tests/services/gpu/renderers/labelRenderer.test.ts` and APPEND this describe block at the end of the file (after the existing `describe('LabelRenderer (CPU state)', …)` block):

```ts

// ── fontIndex packing test ────────────────────────────────────────────────
//
// Reaching into the renderer's packed glyph buffer would require
// exposing internals; instead we verify the layer-index lookup
// indirectly by counting glyphs across mixed-font labels.  Since
// FONTS has only `cormorant` at this point, every label resolves to
// fontIndex 0 — the test asserts the lookup works without throwing.
// A future second font would extend this test with a real index
// assertion.

describe('LabelRenderer fontIndex resolution', () => {
  it('accepts labels with the cormorant font without throwing', () => {
    const ctx = {
      device: null as unknown as GPUDevice,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
    };
    const r = createLabelRenderer(ctx, FIXTURE_ATLASES);
    expect(() =>
      r.setLabels([
        { id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 24, font: 'cormorant' },
      ]),
    ).not.toThrow();
    expect(r.glyphCount()).toBe(1);
  });
});
```

- [ ] **Step 4: Update existing producers' type-check (compile-time only — runtime changes land in Task 9)**

Now that `Label.font` is required, every producer's emitted Label must include `font`. We DON'T migrate them in this task — that's Task 9. Instead, we keep the producers compiling by adding the `font: 'cormorant'` literal at every emit site:

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/engine/subsystems/youAreHereSubsystem.ts`. Find:

```ts
    const labels: readonly Label[] = [
      {
        id: 'you-are-here',
        worldPos: [0, LABEL_ANCHOR_MPC, 0],
        text: LABEL_TEXT,
        pixelSize: 18,
        color: [...LABEL_COLOR],
        worldEmMpc: 0.005,
        fadeAlpha: alpha,
        alignX: 'center',
      },
    ];
```

Replace with:

```ts
    const labels: readonly Label[] = [
      {
        id: 'you-are-here',
        worldPos: [0, LABEL_ANCHOR_MPC, 0],
        text: LABEL_TEXT,
        font: 'cormorant',
        pixelSize: 18,
        color: [...LABEL_COLOR],
        worldEmMpc: 0.005,
        fadeAlpha: alpha,
        alignX: 'center',
      },
    ];
```

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/engine/subsystems/poiSubsystem.ts`. Find:

```ts
      labels.push({
        id: p.id,
        worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
        text: p.name,
        pixelSize: style.pixelSize,
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        fadeAlpha: 1,
        alignX: 'left',
      });
```

Replace with:

```ts
      labels.push({
        id: p.id,
        worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
        text: p.name,
        font: 'cormorant',
        pixelSize: style.pixelSize,
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        fadeAlpha: 1,
        alignX: 'left',
      });
```

(Task 9 originally planned these edits but the type-level requirement forces us to land them here together. Task 9 becomes a verification-only task — see below.)

- [ ] **Step 5: Check for any other Label producers we may have missed**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && grep -rn "as Label\b\|: Label\b\|Label\[\] = \[\|Label\[\] = \|labels\.push\|labels: readonly Label\|: readonly Label\[\]" src 2>/dev/null | grep -v ".d.ts" | grep -v "test"
```

Expected: only the producers we just edited (`youAreHereSubsystem.ts`, `poiSubsystem.ts`) and infrastructure (`labelDirectorSubsystem.ts`, `labelRenderer.ts`). The director's `mergedLabels: Label[]` is fine — it accepts whatever the producers pass.

If any other producer surfaces, add `font: 'cormorant'` to its emit site here (NOT in a follow-up task — type-check must stay green at every commit).

- [ ] **Step 6: Run typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS — every `Label` literal now has the required `font` field.

- [ ] **Step 7: Run full test suite**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm test
```

Expected: full suite PASS.

- [ ] **Step 8: Visual sanity check (no shader change yet)**

The dev server is left running. Open `http://localhost:5173/` and confirm:
- "You are here" marker still renders at small camera distance
- POI labels still render

The font is still being read from layer 0 of the atlas, which is now cormorant (since the JetBrains atlas hasn't been deleted but ALSO isn't loaded — `loadFontAtlases` only fetches FONTS entries). The label text should already look like a serif Cormorant face, but kerning/edge sharpness might be subtly off because the shader still samples layer 0 with a default-direction varying — visual verification of correctness lands in Task 8.

If labels DON'T render at all, that's a regression — do NOT commit; report BLOCKED.

- [ ] **Step 9: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add src/@types/rendering/Label.d.ts src/services/gpu/renderers/labelRenderer.ts tests/services/gpu/renderers/labelRenderer.test.ts src/services/engine/subsystems/youAreHereSubsystem.ts src/services/engine/subsystems/poiSubsystem.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
feat(labels): require Label.font, add per-glyph fontIndex attribute

Label gains a required readonly font: FontId.  The renderer grows
its per-glyph instance stride from 36 → 40 bytes (one new u32 at
offset 36), packs FONT_IDS.indexOf(label.font) into it, and adds a
matching @location(5) vertex attribute.  The shader does not yet
USE fontIndex — that's gated on visual verification in Task 8.

Producers (youAreHereSubsystem, poiSubsystem) gain `font: 'cormorant'`
at every emit site so the codebase stays type-clean.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: WESL shader — switch atlas binding to `texture_2d_array`, thread `fontIndex` through

**Files:**
- Modify: `src/services/gpu/shaders/labels/io.wesl`
- Modify: `src/services/gpu/shaders/labels/vertex.wesl`
- Modify: `src/services/gpu/shaders/labels/fragment.wesl`
- Modify: `src/services/gpu/renderers/labelRenderer.ts` (flip the bind-group-layout viewDimension)

This is the load-bearing task. The shader now declares a `texture_2d_array<f32>` for the atlas, the vertex shader reads `fontIndex` from a new instance attribute, threads it as a flat varying, and the fragment shader uses it as the layer index in `textureSample`.

**The visual-verification step before the commit is the gate.** Do NOT commit until labels render with the expected Cormorant glyphs at acceptable edge sharpness in the dev server.

Per the project's "be meticulous with WGSL" rule, every shader edit must be inspected visually. The "Invalid ShaderModule" / "unexpected token" failure modes from Chrome's WGSL compiler are silent at type-check time — only the dev server reveals them. Use the `wesl-shaders` skill if any compile error appears.

- [ ] **Step 1: Update `io.wesl` — add fontIndex to VsIn and VsOut**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/shaders/labels/io.wesl`.

Find:

```wgsl
struct VsIn {
  // (0,0) (1,0) (0,1) (1,1) — unit-corner attribute, expanded into a
  // glyph quad in the vertex stage.
  @location(0) corner: vec2<f32>,
  // Pen-relative top-left of glyph, in atlas px.
  @location(1) localOffset: vec2<f32>,
  // Glyph w/h in atlas px.
  @location(2) localSize: vec2<f32>,
  // (u0, v0, u1, v1) — atlas region for this glyph.
  @location(3) uvRect: vec4<f32>,
  // Index into the labels[] storage buffer; all glyphs of one label
  // share its world position, color, and fade.
  @location(4) labelIndex: u32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};
```

Replace with:

```wgsl
struct VsIn {
  // (0,0) (1,0) (0,1) (1,1) — unit-corner attribute, expanded into a
  // glyph quad in the vertex stage.
  @location(0) corner: vec2<f32>,
  // Pen-relative top-left of glyph, in atlas px.
  @location(1) localOffset: vec2<f32>,
  // Glyph w/h in atlas px.
  @location(2) localSize: vec2<f32>,
  // (u0, v0, u1, v1) — atlas region for this glyph.
  @location(3) uvRect: vec4<f32>,
  // Index into the labels[] storage buffer; all glyphs of one label
  // share its world position, color, and fade.
  @location(4) labelIndex: u32,
  // GPU texture-array layer for the glyph's font.  All glyphs of one
  // label share the same font, but it's carried per-glyph because the
  // instance buffer is the only path the vertex stage has to per-label
  // data that's not already in labels[].  Equal to
  // `FONT_IDS.indexOf(label.font)` (the renderer pre-computes this).
  @location(5) fontIndex: u32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  // Flat-interpolated so the fragment shader sees the same integer
  // layer index for every fragment of one glyph quad.  Non-flat
  // interpolation of an integer is a WGSL validation error.
  @location(2) @interpolate(flat) fontIndex: u32,
};
```

- [ ] **Step 2: Update `vertex.wesl` — thread fontIndex from VsIn to VsOut**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/shaders/labels/vertex.wesl`.

Find:

```wgsl
  let outColor = vec4<f32>(label.color.rgb, label.color.a * fadeAlpha);
  return VsOut(outPos, uv, outColor);
}
```

Replace with:

```wgsl
  let outColor = vec4<f32>(label.color.rgb, label.color.a * fadeAlpha);
  // fontIndex flows from the per-glyph instance attribute to a flat
  // varying so the fragment shader samples the right atlas layer for
  // this glyph's font.  All glyphs of one label carry the same
  // fontIndex (resolved CPU-side from label.font), but the value is
  // per-glyph because that's the only attribute channel the per-glyph
  // instance buffer exposes.
  return VsOut(outPos, uv, outColor, input.fontIndex);
}
```

- [ ] **Step 3: Update `fragment.wesl` — atlas binding becomes texture_2d_array, sample with fontIndex**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/shaders/labels/fragment.wesl`.

Replace the WHOLE file contents with:

```wgsl
// labels/fragment.wesl — MSDF labels fragment stage.
//
// Samples the multi-channel signed-distance atlas, takes the median
// across R/G/B to recover the glyph edge, then anti-aliases the edge
// with a screen-space-derivative width. Output is premultiplied — the
// blend state on the renderer side expects (rgb*a, a).
//
// ## Multi-font sampling
//
// The atlas binding is a texture_2d_array<f32>: each registered font in
// src/data/fonts.ts occupies one array layer.  The per-glyph
// fontIndex varying (flat-interpolated from the vertex stage) selects
// the layer at sample time, so a single draw call can render glyphs
// from any mix of registered fonts — the GPU picks the right atlas
// page per fragment.

import package::labels::io::VsOut;

@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

// Median of three scalars. The MSDF technique encodes one SDF per
// colour channel, each shifted by a sub-pixel; taking the median of
// the three recovers the glyph contour even where one channel
// disagrees (sharp corners, near-zero strokes). It's the 'M' in MSDF.
fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  // textureSample on a 2D-array takes the layer index as the third
  // argument (after the UV).  i32 cast because WGSL's texture-array
  // sample signature requires a signed integer layer.
  let s = textureSample(atlas, atlasSampler, input.uv, i32(input.fontIndex)).rgb;
  // Distance from the glyph contour: positive inside, negative outside,
  // zero exactly on the edge.
  let d = median3(s.r, s.g, s.b) - 0.5;
  // 'fwidth' gives roughly one pixel's worth of distance at this
  // fragment's scale, so the smoothstep band is exactly one pixel
  // wide regardless of zoom — that's what keeps MSDF text crisp at
  // any size.
  let aa = fwidth(d);
  let alpha = smoothstep(-aa, aa, d) * input.color.a;
  return vec4<f32>(input.color.rgb * alpha, alpha);
}
```

- [ ] **Step 4: Flip the bind-group-layout viewDimension to '2d-array' in the renderer**

Open `/Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts/src/services/gpu/renderers/labelRenderer.ts`.

Find the bind-group-layout entry from Task 6 (binding 2):

```ts
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          // viewDimension '2d-array' tells WebGPU the bound resource
          // is a texture_2d_array<f32>, matching the shader after
          // Task 8.  Before Task 8 the shader still declares
          // texture_2d<f32>; that's a pipeline-creation-time
          // validation error which we DELIBERATELY don't trip yet —
          // the shader change is gated on visual verification and
          // lands in Task 8.  To keep this task green, the binding
          // stays at viewDimension default '2d' until Task 8 flips
          // BOTH sides atomically.  (See Task 8 Step 1.)
          texture: { sampleType: 'float' },
        },
```

Replace with:

```ts
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          // viewDimension '2d-array' matches the shader's
          // `texture_2d_array<f32>` declaration in fragment.wesl.
          // Mismatching this with the shader-side binding type
          // triggers a pipeline-creation-time validation error.
          texture: { sampleType: 'float', viewDimension: '2d-array' },
        },
```

Then find the bind-group entry (binding 2):

```ts
        // Default createView() picks viewDimension '2d' for a depth-1
        // texture and '2d-array' for depth>1, so the view matches the
        // bind-group-layout entry above without an explicit override.
        // Task 8 makes both sides explicitly '2d-array'.
        { binding: 2, resource: atlasTexture.createView() },
```

Replace with:

```ts
        {
          binding: 2,
          // Explicit '2d-array' view dimension matches the
          // bind-group-layout entry and the shader binding.  Spelling
          // it out (rather than letting the default pick) makes the
          // intent visible at the bind site and survives any future
          // FONTS shrink-to-one-entry edit.
          resource: atlasTexture.createView({ dimension: '2d-array' }),
        },
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS — the renderer's TS surface didn't change.

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm test
```

Expected: full suite PASS. Vitest runs against the null device, so the shader-side change is not exercised — that's what the visual step below is for.

- [ ] **Step 7: Build sanity check — confirm the WESL compiles**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run build 2>&1 | tail -30
```

Expected: vite build completes without errors. Any "Invalid ShaderModule" or "unexpected token" output here means the WESL didn't parse — refer to the `wesl-shaders` skill for diagnosis.

- [ ] **Step 8: MANUAL VISUAL VERIFICATION (gating — do NOT commit before this passes)**

The dev server should already be running at `http://localhost:5173/`. If not, start it in another terminal:

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run dev
```

Open `http://localhost:5173/` in a browser. Then:

1. **Sky should render normally.** Galaxy points visible, no black canvas. A black canvas means WebGPU rejected the pipeline at creation time — open the browser console and report any "Pipeline GPUValidationError" message.

2. **"You are here" marker should render.** Zoom in to the origin (cmd+scroll-up or similar; the user knows the camera controls). The "You are here" text should appear next to the vertical line, rendered in Cormorant Garamond SemiBold — a serif face. JetBrains Mono (the old face) is monospaced and sans-serif, so the change should be obvious.

3. **Edge sharpness at 12 px should be acceptable.** Adjust zoom until the label is small (~12 px tall). The serifs should be visible without aliasing or smearing.

4. **Kerning should read correctly.** "You are here" — the gap between 'r' and 'e', between 'h' and 'e' — should not have ugly gaps. Cormorant has substantial kerning pairs in the BMFont JSON; if kerning is missing the layout will look spaced-out.

5. **POI labels should render** if any POIs are visible (the test data may not include any by default — that's OK, the you-are-here marker is the load-bearing check).

If any of these fail (especially #1 or #2), do NOT commit. Common failures and remedies:

- **Pipeline validation error mentioning `texture_2d_array`**: confirm the bind-group-layout `viewDimension: '2d-array'` is set (Task 8 Step 4). Confirm the bind group's `resource: atlasTexture.createView({ dimension: '2d-array' })` is set.
- **"undefined fontIndex" or layout shift**: confirm Task 7 packed fontIndex at offset 36 and that the pipeline's `attributes` array (Task 7 Step 2) includes the `{ shaderLocation: 5, offset: 36, format: 'uint32' }` entry.
- **WGSL parse error**: confirm `@location(2) @interpolate(flat) fontIndex: u32` in io.wesl. The `@interpolate(flat)` decorator is mandatory — non-flat interpolation of an integer is a WGSL validation error.
- **Text renders but looks like JetBrains Mono**: the bitmap layer didn't update. Confirm `npm run build-fonts` was run (Task 3) and `public/fonts/cormorant.png` exists.

If you've reviewed the above and the visual still doesn't match, report BLOCKED and pause; do not commit.

- [ ] **Step 9: Commit (only after Step 8 passes visual inspection)**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add src/services/gpu/shaders/labels/io.wesl src/services/gpu/shaders/labels/vertex.wesl src/services/gpu/shaders/labels/fragment.wesl src/services/gpu/renderers/labelRenderer.ts
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
feat(shader): labels atlas binding becomes texture_2d_array

io.wesl gains a per-glyph @location(5) fontIndex: u32 input plus a
matching @interpolate(flat) varying on VsOut.  vertex.wesl threads
the index through; fragment.wesl declares texture_2d_array<f32> and
passes fontIndex as the layer argument to textureSample.

The renderer's bind-group layout flips to viewDimension '2d-array'
to match the shader; the bind group view is created explicitly with
dimension '2d-array' for the same reason.

Manually verified in the dev server: 'You are here' marker renders
in Cormorant Garamond SemiBold with crisp edges at 12 px, correct
kerning, and no pipeline validation errors.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Verify no other Label producers slipped through

**Files:** none modified — verification only.

Task 7 already migrated `youAreHereSubsystem` and `poiSubsystem` to emit `font: 'cormorant'` (the type system forced us to land them in the same commit as the type change). This task confirms no third producer exists.

- [ ] **Step 1: Search for any `as Label` / `: Label` / `Label[]` site we might have missed**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && grep -rn ": Label\b\|as Label\b\|Label\[\]\|Label> = \|: readonly Label" src 2>/dev/null | grep -v ".d.ts" | grep -v "test"
```

Expected: every hit is either:
- `youAreHereSubsystem.ts` — migrated in Task 7
- `poiSubsystem.ts` — migrated in Task 7
- `labelDirectorSubsystem.ts` — merges producer output (no literal Label creation)
- `labelRenderer.ts` — accepts `readonly Label[]` (no literal creation)

If a producer surfaces that does NOT have `font: 'cormorant'` in its emitted Label, add the literal at every emit site and stage the file. The plan continues normally — every producer must use Cormorant per the spec.

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS — if it doesn't, an unmigrated producer exists; add `font: 'cormorant'` to its emit site.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm test
```

Expected: full suite PASS.

- [ ] **Step 4: No commit needed if no edits were made**

If Step 1 surfaced no missed producer, skip the commit and proceed to Task 10. If a producer was migrated, commit:

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts add <files>
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
feat(labels): migrate remaining Label producers to cormorant

Adds `font: 'cormorant'` to every emit site Task 7 didn't already
cover.  Spec rule: every current producer uses Cormorant Garamond
SemiBold.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Remove JetBrains Mono assets

**Files:**
- Delete: `data/raw/fonts/JetBrainsMono-Regular.ttf`
- Delete: `public/fonts/jetbrains-mono.png`
- Delete: `public/fonts/jetbrains-mono.json`

Per the spec, no transitional period — once the renderer is wired to Cormorant, the JetBrains files are removed in the same PR.

- [ ] **Step 1: Confirm no code references JetBrains Mono**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && grep -rn "jetbrains\|JetBrains" src tools tests 2>/dev/null
```

Expected: no hits in code (the assets in `data/raw/` and `public/fonts/` are file-system artefacts only).

If a hit appears in code, do NOT delete the assets yet — fix the reference first.

- [ ] **Step 2: Remove the three files**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts rm data/raw/fonts/JetBrainsMono-Regular.ttf public/fonts/jetbrains-mono.png public/fonts/jetbrains-mono.json
```

Expected output:

```
rm 'data/raw/fonts/JetBrainsMono-Regular.ttf'
rm 'public/fonts/jetbrains-mono.png'
rm 'public/fonts/jetbrains-mono.json'
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm test
```

Expected: full suite PASS.

- [ ] **Step 5: Visual confirmation in dev server**

Open `http://localhost:5173/` and confirm labels still render correctly (this should be unchanged from Task 8's visual verification — the JetBrains files were never read by the new loader).

- [ ] **Step 6: Commit**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts commit -m "$(cat <<'EOF'
chore(fonts): remove JetBrains Mono — fully replaced by Cormorant

Drops the source TTF and the baked atlas pages.  No transitional
period per the spec — Cormorant is now the only registered font and
every producer emits font: 'cormorant'.

Adding JetBrains Mono back later would be a three-step config
change: drop the TTF under data/raw/fonts/, add an entry to FONTS
in src/data/fonts.ts, and run `npm run build-fonts`.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final verification + open the pull request

**Files:** none modified — verification + PR creation.

- [ ] **Step 1: Full typecheck**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run typecheck
```

Expected: PASS — both `tsc --noEmit` runs (src and tools tsconfigs).

- [ ] **Step 2: Full test suite**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm test
```

Expected: full suite PASS. Net new tests added by this plan:
- `tests/data/fonts.test.ts` (5 tests)
- `tests/tools/buildFontAtlas.test.ts` (4 tests)
- `tests/services/gpu/labels/fontMetrics.test.ts` (+1 test, total 5)
- `tests/services/gpu/renderers/labelRenderer.test.ts` (+1 test, total 5)

- [ ] **Step 3: Production build sanity check**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && npm run build 2>&1 | tail -30
```

Expected: vite build completes without errors.

- [ ] **Step 4: Final dev-server visual verification**

Open `http://localhost:5173/` and confirm:
- Sky renders normally (galaxy points visible)
- "You are here" marker renders in Cormorant Garamond at multiple zoom levels (zoom in/out and check edge sharpness stays acceptable)
- POI labels render (if POIs are loaded in the current state)
- No browser-console errors related to label or atlas pipeline

If any of these fail, fix and re-run before opening the PR.

- [ ] **Step 5: Examine the commit log**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts log --oneline main..HEAD
```

Expected: 9-10 commits, one per task. Every commit message has a `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer; no `--author` flag was passed (commits are authored by the user's git identity).

- [ ] **Step 6: Push the branch**

```bash
git -C /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts push -u origin worktree-marker-fonts
```

Expected: push succeeds; remote tracking set.

- [ ] **Step 7: Open the PR**

```bash
cd /Users/rulkens/Development/js/skymap/.claude/worktrees/marker-fonts && gh pr create --title "feat(labels): MSDF multi-font atlas + migrate to Cormorant Garamond" --body "$(cat <<'EOF'
## Summary

- Replaces the single hard-coded MSDF atlas with an N-font registry (`src/data/fonts.ts`).
- Bakes one atlas per registered font into a shared 512² envelope; uploads them as layers of a single `texture_2d_array<f32>`.
- Routes per-`Label` font selection through a new `fontIndex` per-instance attribute; one draw call handles mixed-font label sets.
- Migrates all current producers (`youAreHereSubsystem`, `poiSubsystem`) to Cormorant Garamond SemiBold.
- Removes JetBrains Mono assets (TTF + baked atlas).

Spec: `docs/superpowers/specs/2026-05-13-msdf-multi-font-design.md`.
Plan: `docs/superpowers/plans/2026-05-13-msdf-multi-font.md`.

## Test plan

- [x] `npm run typecheck` passes (src + tools)
- [x] `npm test` passes (full vitest suite, +11 new tests)
- [x] `npm run build` produces a clean Vite build
- [x] Dev-server visual verification: "You are here" marker renders in Cormorant Garamond SemiBold with crisp edges at 12-18 px, correct kerning, no pipeline validation errors
- [x] POI labels render where POIs are loaded
- [x] `npm run build-fonts` regenerates `public/fonts/cormorant.{png,json}` deterministically

## Adding a font later

A future font is a three-step config change: drop the TTF under `data/raw/fonts/`, add an entry to `FONTS` in `src/data/fonts.ts`, run `npm run build-fonts`. No renderer / shader / type changes required.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed; report it back to the user.

---

## Self-review notes

- **Spec coverage:**
  - §1 Font registry → Task 2 (`src/data/fonts.ts` + test).
  - §2 Build pipeline → Task 3 (`tools/buildFontAtlas.ts` loop + `assertAtlasDimensions` + test).
  - §3 Runtime loader → Task 5 (`loadFontAtlases.ts` + extended fontMetrics test).
  - §4 Renderer changes → Task 6 (texture + bind group) + Task 7 (instance attribute).
  - §5 Shader changes → Task 8 (gated on visual verification).
  - §6 Label type → Task 7 (required `font: FontId`).
  - §7 Producer migration → Task 7 (forced by type-system) + Task 9 (verification).
  - §8 Asset removal → Task 10.
- **Placeholder check:** every step has exact code, exact commands, expected output. "Implement appropriately" / "as needed" / "etc." do not appear.
- **Type-name consistency:** `loadFontAtlases` (Task 5) is referenced by exactly that name in Task 6's `import { loadFontAtlases } from '../../gpu/labels/loadFontAtlases'` and in Task 5's initGpu patch. `LoadedFontAtlases` matches across Tasks 4, 5, 6.
- **Commit-message HEREDOC + Co-Authored-By:** every commit step uses `git commit -m "$(cat <<'EOF' … EOF\n)"` with the Co-Authored-By trailer.
- **Shader visual gate:** Task 8 Step 8 is the gating step; Step 9 (the commit) explicitly states "only after Step 8 passes visual inspection". Common failure modes and remedies are enumerated.
- **Immutability:** every new type uses `readonly` (`Label`, `LoadedFontAtlases`, `FontConfig`); the layer-index lookup is `Readonly<Record<FontId, number>>`; `FONT_IDS` is `readonly FontId[]`. Internal CPU scratch buffers in the renderer stay mutable (perf carve-out, consistent with `pointRenderer` precedent).
- **No `interface`:** every new type is a `type` alias.
- **No bash sed/awk:** every search-and-replace uses Read + Edit, not `sed`. The single `grep -rn` calls in Tasks 9/10 are explicit searches with the user's permission rules in mind (they're read-only).
- **PR (not direct push):** Task 11 creates a feature-branch PR via `gh pr create`.
- **Producer migration ordering:** the type field becoming required and the producer migration MUST land together in a single type-check-clean commit. Initially the skeleton placed producer migration as Task 9, but the type-system constraint forced consolidation into Task 7. Task 9 became a verification step. This deviation is documented inside Task 9.
