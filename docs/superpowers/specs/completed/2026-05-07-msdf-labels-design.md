# MSDF Text Labels — Design

**Status:** Draft (2026-05-07)
**Owner:** @rulkens
**First consumer:** "You are here" marker on the Milky Way

## Goal

Add a general-purpose text label system to the WebGPU renderer so we can pin readable text to arbitrary 3D world positions. The first concrete use is a "YOU ARE HERE" marker above the Milky Way, gated to appear only on close zoom. The infrastructure should support N labels with per-label position, color, and visibility — labelling galaxies, filament tags, debug markers etc. is in scope as future work.

Non-goals (this spec): per-galaxy auto-labels, label collision avoidance, RTL or CJK text, animated transitions beyond a simple distance fade. The architecture must not preclude these, but they aren't built now.

## Why MSDF

Pre-rendered bitmap text goes blurry at zoom and aliased at distance. Stock SDF (single-channel) is sharp but loses sharp corners on glyphs at small sizes. Multi-channel SDF (Valve / Chlumsky) preserves corners by encoding three independent distance fields in RGB, recovered in the fragment shader as `median(r, g, b) - 0.5` and antialiased with `fwidth`. It's the standard answer for resolution-independent text in real-time renderers, and the runtime cost is one texture sample plus a half-dozen ALU ops per glyph fragment. We don't need a library — the technique is small enough to implement directly against our raw WebGPU stack.

## Architecture overview

Two phases, mirroring the existing `tools/buildAllBins.ts` → `cloudLoader` → renderer pipeline:

```
data/raw/fonts/JetBrainsMono-Regular.ttf
        │
        │  npm run build-font  (tools/buildFontAtlas.ts → msdf-bmfont-xml)
        ▼
public/fonts/jetbrains-mono.png   (1024×1024 RGB MSDF atlas, ~150 KB, committed)
public/fonts/jetbrains-mono.json  (glyph metrics, ~30 KB, committed)
        │
        │  fetch + parse at engine init
        ▼
LabelRenderer (src/services/gpu/labelRenderer.ts)
   ├─ uploads atlas as GPUTexture (linear filter, no mipmaps)
   ├─ public API: setLabels(Label[]) / render(pass, viewProj, cameraPos, viewportSize)
   ├─ CPU lays out each label into glyph quads → instanced vertex buffer (rebuilt on setLabels, not per frame)
   └─ shaders/labels.wgsl
        ├─ vertex: world→clip projection + per-glyph billboard expansion + pixel-clamped sizing
        └─ fragment: median(MSDF.rgb) - 0.5, fwidth-based AA, modulated by label color & fadeAlpha

MarkerLineRenderer (src/services/gpu/markerLineRenderer.ts)
   ├─ thin world-anchored line segments with screen-space pixel width
   ├─ shared by the "you are here" marker and any future tagged-line use
   └─ shaders/markerLines.wgsl

Engine integration (src/services/engine/engine.ts)
   ├─ constructs both renderers at init
   ├─ owns a small youAreHereController that builds Label[] + line segments based on camera distance to origin
   ├─ runs label/line passes after main 3D passes, before tone mapping
   └─ requestRender() during fade transitions so render-on-demand keeps working
```

## Build pipeline

**`tools/buildFontAtlas.ts`** — invoked via `npm run build-font`. Shells out to `msdf-bmfont-xml` (new devDependency, version pinned for determinism) with these arguments:

- Input font: `data/raw/fonts/JetBrainsMono-Regular.ttf` — committed once. Lives under `data/raw/` to match the project convention that all upstream raw assets live there, even though it isn't an astronomical catalog.
- Glyph set: printable ASCII (32–126) plus `°` `±` `µ` `∞` `★`. Covers every name in `famous.json` and the kinds of characters we'd plausibly want for science labels. ~100 glyphs.
- Atlas size: 1024×1024, RGB, distance range 4 px. One page (no multi-page atlas needed at this glyph count and size).
- Output: `public/fonts/jetbrains-mono.png` and `public/fonts/jetbrains-mono.json`.

The two output files are committed to git. Unlike the `.bin` catalogs (which can be ~130 MB and live in R2), the font atlas is ~180 KB total, deterministic, and rarely regenerated — committing keeps the dev clone self-sufficient and avoids a third deploy step.

The script follows the same Node-CLI shape as `tools/buildAllBins.ts`: `npx tsx tools/buildFontAtlas.ts`, idempotent, prints what it generated. Re-running with no input changes produces byte-identical output (pinned `msdf-bmfont-xml` version, fixed glyph list, deterministic atlas packing).

## Runtime: `LabelRenderer`

### Public API

```ts
export type Label = {
  id: string;            // stable key for diffing on setLabels
  worldPos: [number, number, number];  // Mpc, same coordinate system as the point cloud
  text: string;          // ASCII + the small extended set above; non-glyphs are silently dropped
  pixelSize: number;     // target text height in CSS pixels when in the clamped middle range (e.g. 24)
  color?: [number, number, number, number];  // default white, premultiplied
  minPixelSize?: number; // default 12 — below this, label fades to alpha 0 over a small range
  maxPixelSize?: number; // default 64
  fadeNearMpc?: number;  // distance to camera at which alpha = 1.0 (default: always 1)
  fadeFarMpc?: number;   // distance at which alpha = 0.0 (default: undefined → no far fade)
};

export type LabelRenderer = {
  setLabels(labels: Label[]): void;  // replaces the active set; rebuilds vertex buffer
  render(pass: GPURenderPassEncoder, viewProj: Float32Array, cameraPos: [number, number, number], viewportSize: [number, number]): void;
  destroy(): void;
};
```

`setLabels` is called from the engine when the label set changes (toggle, you-are-here gate flip, future label additions). It is NOT a per-frame call — the design assumes O(1–100) labels with O(N glyphs total) and rebuilds the vertex buffer on each call. This is fine because label changes are rare.

### CPU-side glyph layout

For each label, walk its `text` and look up each codepoint in the glyph metrics. Emit one quad per glyph with:

- `glyph_uv_rect` (vec4): atlas UV bounds.
- `local_offset` (vec2): pen position in em-space, accumulated by `advance`.
- `local_size` (vec2): glyph plane size in em-space (so the vertex shader can scale by an em-to-pixel factor).
- `label_index` (u32): index into a per-label uniform-style struct array (worldPos, color, sizing params, fadeAlpha) so all glyphs of one label share its data.

Concatenate all quads from all labels into one instanced vertex buffer (4 verts × N glyphs). One draw call covers all labels.

For first cut, `label_index` references a CPU-built array uploaded as a storage buffer (or a tightly-packed uniform buffer if the count is small). Storage buffer is the cleaner pattern — no fixed cap, scales to "label every visible galaxy" later without rework.

### Sizing math (vertex shader)

The "hybrid clamped" scaling lives entirely in the vertex shader so the CPU never has to know the projection state:

```wgsl
let clip = viewProj * vec4(label.worldPos, 1.0);
let depth_ndc = clip.w;  // ≈ camera-space depth for perspective
// pixels-per-em at this depth, derived from projection + viewport height
let pixels_per_em_world = label.pixelSize * (label.world_em_size / depth_ndc) * (viewportSize.y * 0.5);
// but we want a clamp expressed in *screen pixels*:
let actual_pixel_height = clamp(pixels_per_em_world, label.minPixelSize, label.maxPixelSize);
let scale = actual_pixel_height / label.pixelSize;
// glyph quad expanded in NDC by glyph.local_size * scale converted to NDC-per-pixel
```

Concretely: each label has a notional "world em size" (in Mpc) chosen so that at the natural viewing distance the text is at `pixelSize`. As the camera moves closer/further, the projected pixel size changes linearly with `1/depth`; the `clamp` keeps it inside `[minPixelSize, maxPixelSize]`. This is the standard recipe and matches the third option from the brainstorm ("hybrid: world-space with min/max pixel clamp").

Fade: `fadeAlpha = smoothstep(fadeFarMpc - fadeBand, fadeFarMpc, dist) ↔ inverse for near fade`, then multiplied into the final fragment alpha.

### Fragment shader

Standard MSDF:

```wgsl
let s = textureSample(atlas, atlasSampler, uv).rgb;
let d = median(s.r, s.g, s.b) - 0.5;
let aa = fwidth(d);
let alpha = smoothstep(-aa, aa, d) * label.color.a * fadeAlpha;
return vec4(label.color.rgb, alpha);
```

`median` is a three-line helper. We render with premultiplied alpha and standard alpha-blend, same blend state as `quadRenderer.ts`.

### Pass placement

Labels render **after** all opaque 3D passes (points, disks, quads, filaments) and **before** tone mapping. Reasons:

- Pre-tonemap means labels' colors are HDR-space and behave consistently with the rest of the scene under exposure changes — a white label stays "scene white" not "screen white".
- After 3D passes means labels overlay the galaxies (intended — they're annotations).
- Depth: labels write neither to depth nor sample it. They always draw on top within their pass, but since they're emitted after geometry, they correctly sit in front. (No occlusion testing — this is intentional; we want labels readable even when their anchor point is behind something.)

If this turns out to look wrong (e.g., labels too dim against bright backgrounds), the alternative is to render post-tonemap as a pure UI overlay. Cheap to swap.

## Runtime: `MarkerLineRenderer`

Separate, smaller renderer for the vertical line component of the "you are here" marker. Kept independent of `LabelRenderer` because lines and text are conceptually orthogonal — future use cases include filament tag leaders, scale-bar markers, etc.

### Public API

```ts
export type MarkerLine = {
  id: string;
  fromWorld: [number, number, number];
  toWorld: [number, number, number];
  pixelWidth: number;     // constant screen-space width, e.g. 1.5
  color: [number, number, number, number];
  fadeAlpha?: number;     // 0..1, applied as multiplier; default 1
};

export type MarkerLineRenderer = {
  setLines(lines: MarkerLine[]): void;
  render(pass, viewProj, viewportSize): void;
  destroy(): void;
};
```

### Implementation sketch

Each line is a screen-space-extruded quad: project `fromWorld` and `toWorld` to clip, expand to a quad of constant pixel width perpendicular to the screen-space line direction, in the vertex shader. Standard "thick line" technique. One instanced draw covers all lines.

Renders in the same scheduling slot as `LabelRenderer` (after 3D, before tonemap), with the same blend state.

## "You are here" controller

A small piece of engine state — not a separate class, just a function called from the engine's frame setup:

- Camera distance from origin `d = |cameraPos|`.
- Visibility window: fully visible at `d ≤ 0.6 Mpc`, fully invisible at `d ≥ 2.0 Mpc`. (Tuned by eye; numbers are placeholder.)
- When the alpha changes (or crosses a threshold from 0 to >0), call `labelRenderer.setLabels([...others, youAreHereLabel])` and `markerLineRenderer.setLines([...others, youAreHereLine])`. While alpha is mid-transition, call `requestRender()` each frame so render-on-demand stays awake.
- The label sits at `(0, lineHeight, 0)` in world space; the line goes from `(0, 0, 0)` to `(0, lineHeight, 0)`. `lineHeight` ≈ 0.05 Mpc (tunable).
- Text: `"YOU ARE HERE"` (uppercase, monospace — feels right for an observatory readout).

This controller does not need its own file; it's a few lines in `engine.ts` next to where other per-frame derived state is computed.

## File layout

New:

```
tools/buildFontAtlas.ts
data/raw/fonts/JetBrainsMono-Regular.ttf
public/fonts/jetbrains-mono.png        (build artifact, committed)
public/fonts/jetbrains-mono.json       (build artifact, committed)
src/services/gpu/labelRenderer.ts
src/services/gpu/shaders/labels.wgsl
src/services/gpu/markerLineRenderer.ts
src/services/gpu/shaders/markerLines.wgsl
src/services/gpu/fontMetrics.ts        (parse + lookup helpers for jetbrains-mono.json)
tests/services/gpu/labelRenderer.test.ts
tests/services/gpu/markerLineRenderer.test.ts
tests/services/gpu/fontMetrics.test.ts
```

Modified:

```
src/@types/                             (add Label, MarkerLine, FontMetrics types)
src/services/engine/engine.ts           (construct renderers, you-are-here controller, pass scheduling)
package.json                            (add msdf-bmfont-xml devDep, build-font script)
```

## Testing strategy

The renderer-touching code is hard to unit test (WebGPU isn't headless-mockable in vitest), so we follow the same pattern as the rest of `services/gpu/`:

- **Pure logic, fully unit-tested**:
  - `fontMetrics.ts` — parsing, glyph lookup, missing-glyph fallback, kerning lookup.
  - Glyph layout function inside `labelRenderer.ts` — extract as a pure helper `layoutLabelToQuads(label, metrics) → QuadVertex[]`. Test against fixtures.
  - You-are-here visibility math (alpha-from-distance) — extract as a pure function.
- **Renderer construction tests**: instantiate against the existing test WebGPU device wrapper (whatever the rest of `services/gpu/` uses); assert that `setLabels` / `setLines` mutate internal state without throwing, that vertex buffers are sized correctly.
- **Visual verification (manual)**: bring up dev server, fly toward the Milky Way, confirm marker fades in at the expected distance, text is sharp at all zoom levels (especially extreme zoom-in — that's where MSDF earns its keep).

## Open questions / future work

- **Label collision avoidance**: not built. When we add per-galaxy labels, two close galaxies will overlap. Standard fix is screen-space culling with priority, deferred until labels are dense enough to need it.
- **Outline / shadow for legibility on busy backgrounds**: easy to add to `labels.wgsl` later (sample MSDF at offset distances). Skip for now.
- **Locale / CJK**: would need either a larger atlas with CJK glyphs (huge — would push to runtime atlas generation) or a separate atlas. Out of scope.
- **Click target for labels**: not built. If labels become interactive, integrate with `pickRenderer.ts`.
