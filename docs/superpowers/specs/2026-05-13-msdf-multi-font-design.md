# MSDF Multi-Font Atlas Design

**Status:** Draft, awaiting user review
**Date:** 2026-05-13
**Author:** Alexander Rulkens (with Claude)

## Problem

The WebGPU label renderer hard-bakes a single MSDF atlas (JetBrains Mono).
The font is wired in via a constant in `tools/buildFontAtlas.ts` and a
matching constant in `src/services/gpu/labels/loadFontAtlas.ts`. Every
label in the app — the "You are here" marker, POIs, future galaxy /
cluster / void markers — shares that one font, and there is no path to
have a second font alongside it (e.g., a heading face plus a body face,
or two stylistic candidates for live A/B during development).

Concretely:

- `tools/buildFontAtlas.ts` has `FONT_INPUT = 'data/raw/fonts/JetBrainsMono-Regular.ttf'`.
  Swapping it means editing that line, rebuilding, and shipping. No
  parallel atlas can coexist.
- `src/services/gpu/labels/loadFontAtlas.ts` exposes
  `loadFontAtlas(): Promise<LoadedFontAtlas>` returning a single
  `{ metrics, bitmap }` pair.
- `src/services/gpu/renderers/labelRenderer.ts` accepts one
  `LoadedFontAtlas`, creates one `texture_2d`, and stores one
  `FontMetrics`. The WGSL shader samples a single `texture_2d<f32>`.
- The `Label` type has no font field — every label is implicitly
  rendered with the only font in play.

This blocks two near-term needs:

1. **Switching the marker / label font to Cormorant Garamond** without a
   one-way bake. The new font ships alongside JetBrains Mono for at
   least the duration of the migration, so producers can switch label
   by label.
2. **Adding a second font later** (a subtitle face, a body face, a stylistic
   variant) without re-architecting the renderer each time.

## Goal

Replace the single-atlas pipeline with an extensible N-font registry.
The build step bakes one MSDF atlas per registered font, all sharing
dimensions. The runtime loads all N atlases, uploads them as layers of
a single `GPUTexture` with `dimension: '2d'` and
`depthOrArrayLayers: N`, and exposes a `texture_2d_array<f32>` to the
labels shader. Each `Label` carries an explicit `font: FontId`. The
label director routes glyph lookup through `metricsByFont[label.font]`,
and the renderer passes the per-instance `fontIndex` to the shader so a
single draw call renders mixed-font label sets.

Initial registry contents (this spec):

- `cormorant` — Cormorant Garamond SemiBold, weight 600, mixed case,
  the new primary face for all current and near-term producers.

The architecture supports adding more fonts trivially (drop TTF, add a
`FONTS` entry, rebuild). No follow-up spec is required for additions —
they are configuration changes, not design changes.

## Non-goals

- **No React / CSS / DOM-rendered text changes.** This spec is strictly
  about the WebGPU MSDF rendering path. `InfoCard`, `SettingsPanel`,
  `ScaleBar`, `StatusBar`, and every other `.tsx` keep their current
  fonts. `index.html` gains no `<link rel="stylesheet">` for
  Cormorant. No `font-family` declarations in `.css` files change.
- **No runtime font picker.** This is a dev-time-baked architecture.
  End users cannot switch fonts; developers swap by editing
  `src/data/fonts.ts` and rebuilding.
- **No backwards-compatible "default font" shim.** The `Label.font`
  field is required at the type level. Producers must say which font
  they want. (Migration sets all current producers to `'cormorant'`
  explicitly.)
- **No glyph-level packer.** The build step does not pack glyphs from
  multiple fonts into one image. Each font bakes into its own 512²
  PNG; multi-font compositing happens at the GPU layer via
  `texture_2d_array`.
- **No multi-weight or multi-style support within a font.** Each
  `FontId` is one TTF, one weight, one style. A bold variant of
  Cormorant would be a separate `FontId` (e.g., `cormorant-bold`).
- **No charset-per-label optimization.** Each font has one charset baked
  in. If a label tries to render a glyph not in its font's charset,
  the existing missing-glyph behaviour applies (the renderer's
  current code path).
- **No JetBrains Mono backwards compat.** The current atlas files
  (`public/fonts/jetbrains-mono.{png,json}`) and the source TTF
  (`data/raw/fonts/JetBrainsMono-Regular.ttf`) are deleted in the same
  commit that lands the migration. There is no transitional period.

## Design

### 1. Font registry (`src/data/fonts.ts`, new)

Single source of truth for which fonts exist and the shared atlas
envelope they must bake into.

```ts
export const ATLAS_PX = 512;
export const DISTANCE_RANGE_PX = 4;
export const ATLAS_FONT_SIZE = 42;

const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) =>
  String.fromCodePoint(32 + i),
).join('');
const UNIT_SYMBOLS = '°±µ';

export const FONTS = {
  cormorant: {
    ttf: 'CormorantGaramond-SemiBold.ttf',
    charset: ASCII_PRINTABLE + UNIT_SYMBOLS,
  },
} as const;

export type FontId = keyof typeof FONTS;
export const FONT_IDS: readonly FontId[] =
  Object.keys(FONTS) as readonly FontId[];
```

Order in `FONT_IDS` determines GPU layer index. The const-keyed object
plus `as const` gives a strict `FontId` union — wrong ids fail to
compile.

`ATLAS_PX`, `DISTANCE_RANGE_PX`, and `ATLAS_FONT_SIZE` are exported so
both the build step (`tools/buildFontAtlas.ts`) and the runtime
(`createLabelRenderer`) read the same numbers.

### 2. Build pipeline (`tools/buildFontAtlas.ts`)

Loops over `FONTS`, bakes each into the shared envelope, emits
`public/fonts/<id>.png` + `public/fonts/<id>.json`.

```ts
const SHARED_OPTIONS = {
  outputType: 'json',
  textureSize: [ATLAS_PX, ATLAS_PX],
  texturePadding: 2,
  distanceRange: DISTANCE_RANGE_PX,
  fieldType: 'msdf',
  fontSize: ATLAS_FONT_SIZE,
} as const;

for (const fontId of FONT_IDS) {
  const cfg = FONTS[fontId];
  await generateBMFont(`data/raw/fonts/${cfg.ttf}`, {
    ...SHARED_OPTIONS,
    filename: fontId,
    charset: cfg.charset,
  });
  // ... emit page + JSON to public/fonts/
  assertAtlasDimensions(fontId);
}
```

`assertAtlasDimensions` reads the emitted PNG header, asserts width and
height equal `ATLAS_PX`. `msdf-bmfont-xml` silently grows the atlas
when glyphs overflow the requested size; the assertion catches that
loudly so we either shrink the charset, raise `ATLAS_PX` and rebake
everyone, or pick a more compact weight.

### 3. Runtime loader (`src/services/gpu/labels/loadFontAtlases.ts`)

Renamed from `loadFontAtlas.ts`. Fetches all N JSON metrics and PNG
bitmaps in parallel; returns a `LoadedFontAtlases`:

```ts
type LoadedFontAtlases = {
  readonly metricsByFont: Readonly<Record<FontId, FontMetrics>>;
  readonly bitmaps: readonly ImageBitmap[]; // order matches FONT_IDS
};
```

All N font fetches run in one `Promise.all`. Network-bound profile
matches today's load (~50 ms cold for one font; ~50–60 ms for two,
modulo HTTP/2 connection reuse).

### 4. Renderer changes (`src/services/gpu/renderers/labelRenderer.ts`)

The renderer's GPU resource shape changes in three places:

**Texture:** one `GPUTexture` with `dimension: '2d'`,
`size: { width: ATLAS_PX, height: ATLAS_PX, depthOrArrayLayers: N }`,
populated by N calls to `device.queue.copyExternalImageToTexture` with
`destination.origin.z = i` (where `i = FONT_IDS.indexOf(fontId)`).

**Bind group:** the atlas binding switches from
`texture_2d<f32>` to `texture_2d_array<f32>`. Sampler unchanged.

**Instance buffer:** the per-instance struct gains a `fontIndex: u32`
field (4 bytes). The existing `setLabels` packing helper grows by one
write per glyph; layout is otherwise unchanged. The `setLabels` API
gains nothing — it still takes `readonly Label[]`. The renderer
internally:

1. For each label, looks up the per-glyph metrics via
   `metricsByFont[label.font].glyphs[char]`.
2. Resolves the font's layer index via `FONT_IDS.indexOf(label.font)`
   (or, faster, a pre-computed `Record<FontId, number>` built once at
   construction time).
3. Packs each glyph instance with its `fontIndex` so the GPU samples
   the right atlas layer.

A mixed-font label set produces one draw call. Labels can share an
instance buffer regardless of their `font`; the GPU picks the right
layer per fragment.

### 5. Shader changes (`src/services/gpu/shaders/labels.wesl`)

Three edits, all small:

```wgsl
// before
@group(0) @binding(0) var atlas: texture_2d<f32>;
// after
@group(0) @binding(0) var atlas: texture_2d_array<f32>;

// vertex input gains a per-instance attribute:
@location(N) fontIndex: u32,

// fragment-shader sample:
let msdf = textureSample(atlas, atlasSampler, in.uv, in.fontIndex);
```

The vertex shader threads `fontIndex` from the instance attribute to a
flat varying so the fragment shader can use it as the layer index.
None of the MSDF math (the median-of-three sample, the `screenPxRange`
calculation, the smoothstep) changes — the layer index is purely a
binding-side concern.

Per the project's "be meticulous with WGSL" guidance, the shader edit
is gated on a manual visual verification step in the implementation
plan: render a known label string in the dev server, eyeball edge
sharpness at 12 px and 18 px, before the PR opens.

### 6. Label type (`src/@types/rendering/Label.d.ts`)

`Label` gains a required `font: FontId` field. No default. Producers
must say which font they want at the call site.

```ts
type Label = {
  readonly id: string;
  readonly worldPos: Vec3;
  readonly text: string;
  readonly font: FontId;
  // ...existing fields
};
```

`MarkerLine` does not change — lines do not consume the font atlas.

### 7. Producer migration

All current `LabelProducer` implementations set `font: 'cormorant'`:

- `src/services/engine/subsystems/youAreHereSubsystem.ts`
- `src/services/engine/subsystems/poiSubsystem.ts`

The change is mechanical: one literal added to each emitted `Label`.

### 8. Asset removal

In the same commit / PR that lands the migration:

- Delete `public/fonts/jetbrains-mono.png`
- Delete `public/fonts/jetbrains-mono.json`
- Delete `data/raw/fonts/JetBrainsMono-Regular.ttf`
- Add `data/raw/fonts/CormorantGaramond-SemiBold.ttf` (downloaded from
  Google Fonts, OFL license, vendored alongside the other raw assets)

No transitional period.

## Data flow

```
data/raw/fonts/CormorantGaramond-SemiBold.ttf
                       │
                       ▼  tools/buildFontAtlas.ts (one bake per FONTS entry)
public/fonts/cormorant.png + cormorant.json
                       │
                       ▼  loadFontAtlases() — fetch + parse + createImageBitmap
LoadedFontAtlases { metricsByFont, bitmaps }
                       │
                       ▼  createLabelRenderer — texture_2d_array upload
GPUTexture (512 × 512 × N layers)
                       │
                       ▼  per-frame
setLabels(merged readonly Label[]):
  for each label:
    for each glyph in label.text:
      pack instance { ..., fontIndex: layerIndexOf(label.font) }
                       │
                       ▼  draw
one draw call, fragment shader samples atlas[fontIndex]
                       │
                       ▼
labels composited in uiOverlay pass (post-tone-map, LDR)
```

## Error handling

- **Missing TTF at build time:** `generateBMFont` rejects, the build
  script propagates the rejection, `npm run build-fonts` fails. Same
  as today's single-font behaviour.
- **Atlas overflow at build time:** `assertAtlasDimensions` throws
  with the font id and emitted dimensions. The script exits non-zero.
  Fix: shrink charset, raise `ATLAS_PX`, or pick a more compact
  weight.
- **Missing PNG/JSON at runtime:** `loadFontAtlases` rejects on the
  first 4xx/5xx. The bootstrap phase surfaces the rejection via
  `onStatusChange({ kind: 'error' })`. Same as today's behaviour for a
  failed single-font fetch.
- **Unknown `FontId` at compile time:** TypeScript catches it — `FontId`
  is the literal union of `FONTS` keys.
- **Glyph not in font's charset (runtime):** existing missing-glyph
  behaviour in `labelRenderer.ts` (currently logs and renders
  whitespace-width gap). No change.

## Testing

- **`fontMetrics.test.ts`** — extend to cover the multi-font load
  shape: feed two stub atlas JSONs, assert
  `loadFontAtlases()` returns one `FontMetrics` per `FontId`, bitmaps
  ordered by `FONT_IDS`.
- **`buildFontAtlas.test.ts` (new)** — unit-test
  `assertAtlasDimensions`: feed a stub PNG-header reader that returns
  oversized dimensions, assert the function throws with the font id
  in the message.
- **Manual visual verification** (gating the PR): render the "You are
  here" marker and a sample POI label in the dev server. Confirm:
  edge sharpness at 12 px is acceptable; serifs do not blur; kerning
  reads correctly; no missing glyphs in current label text.

## Open questions

None. The Cormorant weight (600 / SemiBold) is locked. The shared
atlas envelope numbers (512², distanceRange 4, fontSize 42) are
locked. The charset is locked to ASCII printable + `°±µ`.

## Impact on consumers

- **`youAreHereSubsystem`** — adds `font: 'cormorant'` to the emitted
  label. One-line change.
- **`poisSubsystem` and other producers** — same one-line addition.
- **`labelDirectorSubsystem`** — no change. It merges and flushes
  labels by `id` / `fadeAlpha`; the new `font` field rides along
  inside the `Label` record without director awareness.
- **`MarkerLineRenderer`** — no change. Lines are font-agnostic.
- **React UI** — no change.
