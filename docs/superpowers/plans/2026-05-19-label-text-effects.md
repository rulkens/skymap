# Label Text Effects (Outline + Glow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-label outline (hard outside-stroke border) and glow (soft outside halo) effects to the MSDF label renderer, with colours and em-fraction widths individually controllable per label.  Migrate `Label.color` from premultiplied to straight RGBA in the same change so the public colour API is uniformly straight-RGBA.  Expose category-targeted live-tuning controls in the DebugPanel; producer-side defaults are baked in afterwards as a follow-up commit.

**Architecture:** Per-label storage record grows from 48 → 96 bytes (two additional `vec4<f32>` colour slots for outline + glow, plus the two em-fraction scalars packed into the existing `sizing` vec4 and a new spare slot).  The fragment shader gains a three-band composite: glow (soft smoothstep ramp from `d = 0` outward by `glowRadiusInSdfUnits`) → outline (smoothstep band from `d = 0` outward by `outlineWidthInSdfUnits`) → fill (existing `smoothstep(-aa, aa, d)`), all OVER-blended in premultiplied order, with `fadeAlpha` multiplying every band uniformly at the end.  The vertex shader expands each glyph quad outward by `max(outlineEmFrac, glowEmFrac) * pxScale` to cover the new effect extent.  The font atlas is rebaked at `distanceRange = 16` (up from `4`) so the SDF carries enough headroom past the glyph contour to encode a ~12-px glow falloff without clamping.

The override mechanism is a module-scoped mutable record (`labelStyleOverride`) consumed by each label-producing subsystem.  Each producer knows its own category (`'youAreHere' | PoiCategory`); when `override.targetCategory` matches, it substitutes the override's outline/glow values for its own producer defaults at label-emission time.  The override lives in a new file (`src/services/engine/labelStyleOverride.ts`) so both producers (and the DebugPanel UI) can import it without circular dependencies.

**Tech Stack:** Vitest + TS strict + WESL/WGSL shaders.  Existing labelRenderer factory layout preserved; only the per-label storage stride and the pack loop's content change.  Existing fragment-shader composition flow preserved; only new SDF-distance terms added.

---

## Design decisions committed in this plan

These are locked.  Re-litigating them is out of scope for the implementer.

1. **Per-label, not global.**  Outline + glow colours and widths are per-label fields (Q1 = B).
2. **Medium halo via SDF rebake, not bloom.**  Atlas `distanceRange` bumps from `4` to `16`; no offscreen blur pass (Q2 = B).
3. **Em-fraction widths.**  `outlineEmFrac` and `glowEmFrac` are unitless multipliers of the projected em height in screen px (Q3 = B).
4. **Outside stroke.**  Outline grows in the `d ∈ [−w, 0]` half-plane; glyph body keeps its natural size (Q4 = A).
5. **Opt-in optional fields, default off.**  Omitted outline/glow fields contribute zero (Q5 = A).
6. **OVER glow.**  Glow alpha-blends onto the background (not additive); the colour you set is the colour you see (Q6 = A).
7. **Straight RGBA everywhere, migrate `Label.color`.**  Renderer premultiplies at the pack-loop boundary (Q7 = C).
8. **Overlapping bands.**  Glow extends from `d = 0` outward by `glowRadius` regardless of outline; outline overlays the inner portion.  Composite is `over(glow, over(outline, fill))` (Q8 = B).
9. **No SettingsPanel exposure.**  Outline/glow tuning lives in the DebugPanel only (Q9 → Q10).
10. **DebugPanel override with category selector.**  One mutable override slot + a dropdown selecting which category it targets.  Override values replace producer defaults only for the selected category; all other categories continue at their bake-in defaults (Q10 = A + selector).
11. **`fadeAlpha` applies uniformly** to fill, outline, and glow — multiplied into the composite alpha at the end of the fragment shader.

---

## Open questions resolved during planning

1. **Buffer pack layout.**  `LabelData` grows from three `vec4<f32>` to six.  Final layout:

   ```
   worldPos:     vec4<f32>  // xyz = Mpc, w = worldEmMpc                 (bytes 0..15)
   color:        vec4<f32>  // premultiplied rgba (renderer premultiplies) (bytes 16..31)
   sizing:       vec4<f32>  // x = outlineEmFrac (REPURPOSED from legacy
                            //     pixelSize slot — see Task 5 docblock),
                            // y = minPixelSize, z = maxPixelSize,
                            // w = fadeAlpha                              (bytes 32..47)
   outlineColor: vec4<f32>  // premultiplied rgba                         (bytes 48..63)
   glowColor:    vec4<f32>  // premultiplied rgba                         (bytes 64..79)
   effects:      vec4<f32>  // x = glowEmFrac, y/z/w = reserved (zero)    (bytes 80..95)
   ```

   Total 96 bytes/label.  64-label budget × 96 = 6 KB.  The legacy `pixelSize` slot (`sizing.x`) is repurposed for `outlineEmFrac` rather than left zeroed — the shader has ignored that slot since the `worldEmMpc` migration, and burning a fresh 16-byte vec4 for a single scalar wastes alignment.  Reserved scalars in `effects.yzw` stay zero (CPU writer responsibility) so a future fifth/sixth effect slot can land without bumping the stride again.

2. **SDF-units conversion math (shader side).**  The atlas encodes signed distance in the range `[−DISTANCE_RANGE_PX/2, +DISTANCE_RANGE_PX/2]` mapped to `[0, 1]` in the texture's R/G/B channels.  After `median3(...) − 0.5`, the resulting `d` is in `[−0.5, +0.5]` corresponding to atlas pixels via `distance_in_atlas_px = d * DISTANCE_RANGE_PX`.  An em-fraction width `f` at projected size `displayEmPx` covers `f * displayEmPx` screen pixels, which equals `(f * displayEmPx) / pxScale = f * ATLAS_EM_PX` atlas pixels (because `pxScale = displayEmPx / ATLAS_EM_PX`).  Converting to SDF units: `widthInSdfUnits = (f * ATLAS_EM_PX) / DISTANCE_RANGE_PX`.  Both constants are baked into the shader as `const` declarations matching `src/data/fonts.ts`.  After the rebake `ATLAS_EM_PX = 42` and `DISTANCE_RANGE_PX = 16`, so `outlineEmFrac = 0.05` yields `widthInSdfUnits = 0.05 * 42 / 16 ≈ 0.131`.

3. **Quad expansion: shader-side.**  The layout data in `labelLayout.ts` stays representative of the glyph atlas rect (no CPU-side change).  The vertex shader expands the per-corner offset outward by `effectFringeAtlasPx = max(outlineEmFrac, glowEmFrac) * ATLAS_EM_PX` and the quad size by `2 * effectFringeAtlasPx`.  Per-corner expansion direction: corners (0,0) and (1,1) shift outward in (−,−) and (+,+) respectively; the existing `input.corner` ∈ {(0,0), (1,0), (0,1), (1,1)} can be remapped to `(−1, −1), (+1, −1), (−1, +1), (+1, +1)` via `(corner * 2 − 1)` for the fringe term while keeping the original `corner` for the UV mix.  See Task 6 for the exact GLSL/WGSL.

4. **Override surface = category, not POI id.**  The DebugPanel targets a category (`'youAreHere' | 'cluster' | 'supercluster' | 'famousGalaxy' | 'void'`), not individual labels.  Each producer that emits labels for category `C` consults `labelStyleOverride.targetCategory === C` and substitutes outline/glow fields when true.  The `Label` type stays category-free at the renderer boundary — categories are a producer-side concept.

5. **No `Label` category field.**  Adding `Label.category` would leak producer-side identity into the rendering type.  Producers are the only callers that know their category; they perform the override merge before pushing into the label array.  Renderer stays pure.

---

## File Structure

**New files**

- `src/services/engine/labelStyleOverride.ts` — module-scoped mutable override record + getter/setter API
- `src/components/DebugPanel/LabelEffectsSection.tsx` — DebugPanel section with the category dropdown + four controls
- `tests/services/engine/labelStyleOverride.test.ts` — override get/set semantics
- `tests/services/gpu/renderers/labelRenderer.effects.test.ts` — pack-loop tests for the new fields + buffer layout
- `tests/services/gpu/renderers/labelRenderer.colorMigration.test.ts` — straight-RGBA → premultiplied conversion test
- `tests/services/engine/subsystems/poiSubsystem.labelEffects.test.ts` — override application from POI producer
- `tests/services/engine/subsystems/youAreHereSubsystem.labelEffects.test.ts` — override application from you-are-here producer
- `tests/tools/buildFontAtlas.distanceRange.test.ts` — assertion that `DISTANCE_RANGE_PX` is wired through the bake options

**Modified files**

- `src/@types/rendering/Label.d.ts` — `color` docstring (premultiplied → straight RGBA); add `outlineColor?`, `outlineEmFrac?`, `glowColor?`, `glowEmFrac?` optional fields
- `src/services/gpu/renderers/labelRenderer.ts` — `LABEL_DATA_BYTES` 48 → 96, pack loop premultiplies color and writes new fields
- `src/services/gpu/shaders/labels/io.wesl` — `LabelData` grows to six `vec4<f32>`; docblock updated
- `src/services/gpu/shaders/labels/vertex.wesl` — quad expansion by effect fringe; pass new colours + widths to fragment via `VsOut`
- `src/services/gpu/shaders/labels/fragment.wesl` — three-band composite (glow + outline + fill)
- `src/data/fonts.ts` — `DISTANCE_RANGE_PX` 4 → 16; docstring updated
- `tools/fonts/buildFontAtlas.ts` — no code change (already reads `DISTANCE_RANGE_PX` from registry); regenerate `public/fonts/cormorant.{png,json}` artefacts
- `src/services/engine/subsystems/youAreHereSubsystem.ts` — `LABEL_COLOR` already `[1,1,1,1]` (no value change); consult `labelStyleOverride` when assembling the label
- `src/services/engine/subsystems/poiSubsystem.ts` — `POI_STYLES.*.labelColor` values rechecked (current values have alpha=1, so straight = premultiplied — verify in Task 3); consult `labelStyleOverride` per category
- `src/components/DebugPanel/DebugPanel.tsx` — mount `LabelEffectsSection` after `DataQualitySection`

---

# Phase 1: Atlas rebake

## Task 1: Bump `DISTANCE_RANGE_PX` to 16

**Files:**
- Modify: `src/data/fonts.ts` (lines ~54–63 — the `DISTANCE_RANGE_PX` const + its docstring)
- Test: `tests/tools/buildFontAtlas.distanceRange.test.ts` (new)

- [ ] **Step 1: Write a failing test asserting `DISTANCE_RANGE_PX === 16`**

Create `tests/tools/buildFontAtlas.distanceRange.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DISTANCE_RANGE_PX } from '../../src/data/fonts';

describe('font atlas distance range', () => {
  it('bakes at distanceRange 16 so the SDF carries headroom for outline + glow', () => {
    // Headroom rationale: the up-to-12-px glow extent at maxPixelSize plus
    // ~2 px of outline must stay inside the SDF's encoded range.  4 (the
    // msdf-bmfont-xml default) clamped the falloff tail; 16 leaves ~25%
    // margin past the worst-case effect extent.
    expect(DISTANCE_RANGE_PX).toBe(16);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/tools/buildFontAtlas.distanceRange.test.ts
```

Expected: FAIL with `Expected 16, received 4`.

- [ ] **Step 3: Update `src/data/fonts.ts`**

Change `export const DISTANCE_RANGE_PX = 4;` to `export const DISTANCE_RANGE_PX = 16;`.  Update the docstring above the constant to explain the new value: rebake target picked so the SDF encodes ~8 px of glyph-edge headroom on either side (matching the up-to-12-px glow extent at `maxPixelSize = 60`, with margin).  Note that the old value `4` clamped the glow falloff tail at large em sizes; the new value preserves a smooth tail.

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/tools/buildFontAtlas.distanceRange.test.ts
```

Expected: PASS.

- [ ] **Step 5: Regenerate the atlas artefacts**

```bash
npm run build-fonts
```

Expected stdout: `[buildFontAtlas] baking cormorant…\nWrote public/fonts/cormorant.png …\nWrote public/fonts/cormorant.json …\n[buildFontAtlas] done.  1 font(s) baked.`.

Verify with `git diff --stat public/fonts/` that exactly `cormorant.png` and `cormorant.json` changed.

- [ ] **Step 6: Commit**

```bash
git add src/data/fonts.ts tests/tools/buildFontAtlas.distanceRange.test.ts public/fonts/cormorant.png public/fonts/cormorant.json
git commit -m "$(cat <<'EOF'
feat(fonts): rebake atlas at distanceRange 16 for outline+glow headroom

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2: Label.color migration to straight RGBA

## Task 2: Update `Label.color` docstring and renderer pack loop

**Files:**
- Modify: `src/@types/rendering/Label.d.ts` (line 41 — the `color` field docstring)
- Modify: `src/services/gpu/renderers/labelRenderer.ts` (lines 433–437 — the pack loop's color writes)
- Test: `tests/services/gpu/renderers/labelRenderer.colorMigration.test.ts` (new)

- [ ] **Step 1: Write a failing test asserting straight-RGBA input is premultiplied on write**

Create `tests/services/gpu/renderers/labelRenderer.colorMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createLabelRenderer } from '../../../../src/services/gpu/renderers/labelRenderer';
import { parseFontMetrics } from '../../../../src/services/gpu/labels/fontMetrics';
import type { LoadedFontAtlases } from '../../../../src/@types/rendering/LoadedFontAtlases';

const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 16 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
  ],
});
const FIXTURE_ATLASES: LoadedFontAtlases = { metricsByFont: { cormorant: FIXTURE_METRICS }, bitmaps: [] };

describe('LabelRenderer color migration to straight RGBA', () => {
  it('premultiplies straight RGBA on write to the storage buffer', () => {
    const r = createLabelRenderer(
      { device: null as unknown as GPUDevice, context: null as unknown as GPUCanvasContext,
        format: 'rgba16float' as GPUTextureFormat, canvas: null as unknown as HTMLCanvasElement },
      FIXTURE_ATLASES,
    );
    // Reach into the renderer's storage buffer view.  The test factory
    // returns the LabelRenderer handle; the underlying `labelBuf` is
    // closed over.  Expose a `__debugLabelBuf` accessor on the handle
    // for this test ONLY — see Step 3.
    r.setLabels([{
      id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant',
      color: [1, 0.5, 0.25, 0.5],
    }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    // color slot is bytes 16..31, f32 indices 4..7
    expect(buf[4]).toBeCloseTo(0.5, 5);   // 1 * 0.5
    expect(buf[5]).toBeCloseTo(0.25, 5);  // 0.5 * 0.5
    expect(buf[6]).toBeCloseTo(0.125, 5); // 0.25 * 0.5
    expect(buf[7]).toBeCloseTo(0.5, 5);   // alpha unchanged
  });

  it('defaults to opaque white when color is omitted', () => {
    const r = createLabelRenderer(
      { device: null as unknown as GPUDevice, context: null as unknown as GPUCanvasContext,
        format: 'rgba16float' as GPUTextureFormat, canvas: null as unknown as HTMLCanvasElement },
      FIXTURE_ATLASES,
    );
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[4]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[6]).toBe(1);
    expect(buf[7]).toBe(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/services/gpu/renderers/labelRenderer.colorMigration.test.ts
```

Expected: FAIL — `__debugLabelBuf` does not exist on the handle yet, AND the current pack loop writes the raw color without premultiplying.

- [ ] **Step 3: Add `__debugLabelBuf` accessor to the renderer handle**

In `src/services/gpu/renderers/labelRenderer.ts`, near the end of `createLabelRenderer` where `renderer` is constructed (line ~548), add a debug accessor:

```ts
// Expose the CPU-side label storage scratch buffer for unit tests
// that need to assert pack-loop output.  The accessor is prefixed
// with `__debug` to flag it as test-only — production code should
// never read this; the GPU has the authoritative copy.
(renderer as unknown as { __debugLabelBuf: () => Float32Array }).__debugLabelBuf = () => labelBuf;
```

This mirrors the public/test boundary already established by `getCpuTextureForTest` in other renderers; the field is intentionally not on the `LabelRenderer` type so production code can't reach it.

- [ ] **Step 4: Update the pack loop to premultiply on write**

In `src/services/gpu/renderers/labelRenderer.ts` at lines 433–437, replace:

```ts
const color = label.color ?? [1, 1, 1, 1];
labelBuf[labelBase + 4] = color[0]!;
labelBuf[labelBase + 5] = color[1]!;
labelBuf[labelBase + 6] = color[2]!;
labelBuf[labelBase + 7] = color[3]!;
```

with:

```ts
// Public API surface is STRAIGHT RGBA — producers spell colours the
// natural way (e.g. `[1, 0, 0, 0.5]` for "half-transparent red").
// The fragment shader composites in premultiplied space (see
// fragment.wesl's blend-state docstring), so we multiply r/g/b by a
// HERE and write the result through to the GPU.  The previous public
// API was premultiplied — see the Label.color docstring for the
// migration note.
const color = label.color ?? [1, 1, 1, 1];
const a = color[3]!;
labelBuf[labelBase + 4] = color[0]! * a;
labelBuf[labelBase + 5] = color[1]! * a;
labelBuf[labelBase + 6] = color[2]! * a;
labelBuf[labelBase + 7] = a;
```

- [ ] **Step 5: Update the `Label.color` docstring**

In `src/@types/rendering/Label.d.ts` at line 41, replace:

```ts
/** RGBA premultiplied, defaults to [1,1,1,1]. */
readonly color?: Vec4;
```

with:

```ts
/**
 * Straight (non-premultiplied) RGBA fill colour, default `[1, 1, 1, 1]`.
 *
 * ## Convention
 *
 * Spell the colour the natural way — `[1, 0, 0, 0.5]` is
 * "half-transparent red".  The renderer's pack loop multiplies
 * `rgb * a` on write before uploading to the GPU storage buffer; the
 * fragment shader composites in premultiplied space.  Producers
 * therefore never have to think about premultiplication.
 *
 * The outline/glow colour fields below follow the same straight-RGBA
 * convention — uniformity across the colour API surface is the whole
 * point of carrying out this migration alongside the effects work.
 */
readonly color?: Vec4;
```

- [ ] **Step 6: Run to confirm pass**

```bash
npx vitest run tests/services/gpu/renderers/labelRenderer.colorMigration.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 7: Run the full suite to catch regressions**

```bash
npx vitest run
```

Expected: all previously-passing tests still pass.  Existing `labelRenderer.test.ts` uses no `color` field, so it's unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/@types/rendering/Label.d.ts src/services/gpu/renderers/labelRenderer.ts tests/services/gpu/renderers/labelRenderer.colorMigration.test.ts
git commit -m "$(cat <<'EOF'
feat(labels): migrate Label.color to straight RGBA, premultiply on pack

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verify producer-side color values are alpha=1 (no migration regression)

**Files:**
- Read-only verification: `src/services/engine/subsystems/poiSubsystem.ts` (the `POI_STYLES` block, lines 189–253)
- Read-only verification: `src/services/engine/subsystems/youAreHereSubsystem.ts` (line 45 — `LABEL_COLOR`)

- [ ] **Step 1: Inspect every producer-side `Label.color` value**

Read the two files.  Confirm by hand:

  - `youAreHereSubsystem.ts` `LABEL_COLOR = [1, 1, 1, 1]` — alpha is 1, so straight == premultiplied. No change needed.
  - `POI_STYLES.cluster.labelColor` resolves via `hexToGl('#FFD966')` — `hexToGl` returns a 4-tuple; confirm via reading `src/utils/color/hexToGl.ts` that the alpha defaults to 1 for any input without an explicit alpha channel.  If the 8-char form (`#RRGGBBAA`) is in use anywhere in `POI_STYLES`, the resulting alpha must be inspected.

  Spotted in the current file: `haloColor: hexToGl('#996B3666')` and `ringColor: hexToGl('#996B3666')` (supercluster) carry an 8-char hex — those are NOT `labelColor` fields, so they're outside the migration scope.  Confirm by reading the relevant lines.

  Action: write down which `labelColor` entries are not `alpha=1` (expected count: zero).  If any are non-1, file a separate sub-task to convert that entry's straight-RGBA equivalent.

- [ ] **Step 2: Write a regression test asserting `labelColor` alpha is 1 across `POI_STYLES`**

Create or extend `tests/services/engine/subsystems/poiSubsystem.test.ts` (locate the existing file via `ls tests/services/engine/subsystems/`):

```ts
import { describe, it, expect } from 'vitest';
import { POI_STYLES } from '../../../../src/services/engine/subsystems/poiSubsystem';

describe('POI_STYLES labelColor alpha', () => {
  it('every labelColor has alpha=1 so the straight→premultiplied migration is a no-op', () => {
    // Migration safety: if a future POI_STYLES edit lowers a labelColor's
    // alpha below 1, the new pack-loop premultiplication will dim its
    // RGB channels.  This test fails loudly so the implementer can
    // either re-balance the RGB or confirm the dimming was intentional.
    for (const [category, style] of Object.entries(POI_STYLES)) {
      expect(style.labelColor[3], `${category}.labelColor alpha`).toBe(1);
    }
  });
});
```

- [ ] **Step 3: Run to confirm pass**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```

Expected: PASS (every current entry is alpha=1; the test is a tripwire for future edits).

- [ ] **Step 4: Commit**

```bash
git add tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "$(cat <<'EOF'
test(poi): tripwire that POI_STYLES.labelColor alpha stays 1

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3: Label type + buffer layout extension

## Task 4: Add `outlineColor`, `outlineEmFrac`, `glowColor`, `glowEmFrac` to `Label`

**Files:**
- Modify: `src/@types/rendering/Label.d.ts` (after the `color` field, before `minPixelSize`)

- [ ] **Step 1: Write a failing test referencing the new fields**

Create `tests/rendering/labelTypeFields.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { Label } from '../../src/@types/rendering/Label';
import type { Vec4 } from '../../src/@types/math/Vec4';

describe('Label type effect fields', () => {
  it('declares optional outlineColor / outlineEmFrac / glowColor / glowEmFrac', () => {
    expectTypeOf<Label['outlineColor']>().toEqualTypeOf<Vec4 | undefined>();
    expectTypeOf<Label['outlineEmFrac']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Label['glowColor']>().toEqualTypeOf<Vec4 | undefined>();
    expectTypeOf<Label['glowEmFrac']>().toEqualTypeOf<number | undefined>();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/rendering/labelTypeFields.test.ts
```

Expected: FAIL with TypeScript errors — properties do not exist on `Label`.

- [ ] **Step 3: Add the four optional fields to `Label`**

In `src/@types/rendering/Label.d.ts`, after the `color` field (around line 42, immediately before `minPixelSize`), append:

```ts
/**
 * Straight (non-premultiplied) RGBA colour of the outside outline
 * stroke.  Default `[0, 0, 0, 0]` — fully transparent, which combined
 * with `outlineEmFrac = 0` collapses the outline band to zero
 * contribution in the fragment shader.  The renderer premultiplies on
 * write (same convention as `color`).
 *
 * The outline is composited OVER the fill in premultiplied space, so a
 * 50%-alpha outline correctly half-blends with whatever sits behind
 * the label.
 */
readonly outlineColor?: Vec4;
/**
 * Outline width as a fraction of the projected em height.  Default
 * `0`.  Example: `0.05` on a 40-px-tall label gives a 2-px-wide
 * outline; on a 60-px label the same fraction grows to 3 px.
 *
 * ## Why em-fraction instead of pixels
 *
 * The label sizing pipeline clamps the projected em height to
 * `[minPixelSize, maxPixelSize]`; an em-fraction outline naturally
 * inherits that clamp.  A pixel-absolute outline would visually
 * dominate at the `minPixelSize` floor (where the glyph itself is
 * tiny) and vanish at the `maxPixelSize` ceiling.
 *
 * Outside stroke — the outline grows outward from the glyph contour;
 * the glyph body stays its natural size.
 */
readonly outlineEmFrac?: number;
/**
 * Straight RGBA colour of the soft outside glow halo.  Default
 * `[0, 0, 0, 0]`.  Same renderer-premultiplies-on-write convention as
 * `color`.
 *
 * The glow is composited OVER (not additive) — alpha-blended onto the
 * background like a translucent plate.  Additive would have vanished
 * against bright backgrounds (the Milky Way, dense cluster fields),
 * which is exactly where labels need to stand out most.
 */
readonly glowColor?: Vec4;
/**
 * Glow radius as a fraction of the projected em height.  Default `0`.
 * The glow extends from the glyph contour (`d = 0`) outward by this
 * amount with a smoothstep falloff; the visible halo's outer edge sits
 * at `glowEmFrac * displayEmPx` screen pixels past the glyph edge.
 *
 * ## Why em-fraction
 *
 * Same rationale as `outlineEmFrac` — the halo naturally inherits the
 * projected-em-height clamp.
 *
 * ## Band overlap with outline
 *
 * The glow extends from `d = 0` regardless of `outlineEmFrac`; the
 * outline overlays the inner portion when both are active.  Visible
 * total halo extent is `max(outlineEmFrac, glowEmFrac)`.  Toggling the
 * outline off does not change the overall label silhouette.
 */
readonly glowEmFrac?: number;
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/rendering/labelTypeFields.test.ts
npm run typecheck
```

Expected: PASS + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/@types/rendering/Label.d.ts tests/rendering/labelTypeFields.test.ts
git commit -m "$(cat <<'EOF'
feat(labels): declare optional outline + glow fields on Label type

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Grow the per-label storage buffer 48 → 96 bytes (CPU pack)

**Files:**
- Modify: `src/services/gpu/renderers/labelRenderer.ts` (lines 88–96 — `LABEL_DATA_BYTES` const + docstring; lines 184 — `labelBuf` size; lines 417–442 — pack loop)
- Test: `tests/services/gpu/renderers/labelRenderer.effects.test.ts` (new)

- [ ] **Step 1: Write failing tests for the new pack-loop output**

Create `tests/services/gpu/renderers/labelRenderer.effects.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createLabelRenderer } from '../../../../src/services/gpu/renderers/labelRenderer';
import { parseFontMetrics } from '../../../../src/services/gpu/labels/fontMetrics';
import type { LoadedFontAtlases } from '../../../../src/@types/rendering/LoadedFontAtlases';

const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 16 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
  ],
});
const FIXTURE_ATLASES: LoadedFontAtlases = { metricsByFont: { cormorant: FIXTURE_METRICS }, bitmaps: [] };
const newRenderer = () => createLabelRenderer(
  { device: null as unknown as GPUDevice, context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat, canvas: null as unknown as HTMLCanvasElement },
  FIXTURE_ATLASES,
);

describe('LabelRenderer effect-field pack layout', () => {
  it('per-label storage record is 24 f32 slots (96 bytes)', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    // First label occupies slots 0..23.  The second label (if present)
    // would start at slot 24.  Assert by writing two labels and
    // inspecting the second label's worldPos slot.
    r.setLabels([
      { id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' },
      { id: 'b', worldPos: [7, 8, 9], text: 'A', pixelSize: 0, font: 'cormorant' },
    ]);
    const buf2 = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf2[24]).toBe(7);  // second label's worldPos.x
    expect(buf2[25]).toBe(8);
    expect(buf2[26]).toBe(9);
  });

  it('writes outlineColor (premultiplied) at slots 12..15', () => {
    const r = newRenderer();
    r.setLabels([{
      id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant',
      outlineColor: [1, 0, 0, 0.5],
    }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[12]).toBeCloseTo(0.5, 5); // 1 * 0.5
    expect(buf[13]).toBe(0);
    expect(buf[14]).toBe(0);
    expect(buf[15]).toBeCloseTo(0.5, 5);
  });

  it('writes glowColor (premultiplied) at slots 16..19', () => {
    const r = newRenderer();
    r.setLabels([{
      id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant',
      glowColor: [0, 0.5, 1, 0.8],
    }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[16]).toBe(0);
    expect(buf[17]).toBeCloseTo(0.4, 5); // 0.5 * 0.8
    expect(buf[18]).toBeCloseTo(0.8, 5); // 1 * 0.8
    expect(buf[19]).toBeCloseTo(0.8, 5);
  });

  it('writes outlineEmFrac at sizing.x (slot 8) and glowEmFrac at effects.x (slot 20)', () => {
    const r = newRenderer();
    r.setLabels([{
      id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant',
      outlineEmFrac: 0.07, glowEmFrac: 0.18,
    }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[8]).toBeCloseTo(0.07, 5);
    expect(buf[20]).toBeCloseTo(0.18, 5);
    // Reserved effects.y/z/w stay zero
    expect(buf[21]).toBe(0);
    expect(buf[22]).toBe(0);
    expect(buf[23]).toBe(0);
  });

  it('defaults all four new fields to zero when omitted', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[8]).toBe(0);   // outlineEmFrac
    expect(buf[12]).toBe(0); expect(buf[13]).toBe(0); expect(buf[14]).toBe(0); expect(buf[15]).toBe(0); // outlineColor
    expect(buf[16]).toBe(0); expect(buf[17]).toBe(0); expect(buf[18]).toBe(0); expect(buf[19]).toBe(0); // glowColor
    expect(buf[20]).toBe(0);  // glowEmFrac
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
npx vitest run tests/services/gpu/renderers/labelRenderer.effects.test.ts
```

Expected: FAIL — every test, with assertion errors or undefined buffer slots beyond index 11.

- [ ] **Step 3: Update `LABEL_DATA_BYTES` and its docstring**

In `src/services/gpu/renderers/labelRenderer.ts` at lines 88–96, replace the existing `LABEL_DATA_BYTES` block with:

```ts
/**
 * Per-label storage buffer stride, matching `struct LabelData` in io.wesl:
 *
 *   bytes  0..15  worldPos      vec4<f32>  — xyz = world Mpc, w = worldEmMpc
 *   bytes 16..31  color         vec4<f32>  — premultiplied rgba (fill)
 *   bytes 32..47  sizing        vec4<f32>  — outlineEmFrac, minPx, maxPx, fadeAlpha
 *   bytes 48..63  outlineColor  vec4<f32>  — premultiplied rgba (outline stroke)
 *   bytes 64..79  glowColor     vec4<f32>  — premultiplied rgba (glow halo)
 *   bytes 80..95  effects       vec4<f32>  — glowEmFrac, _r, _r, _r (yzw reserved)
 *
 * 6 × 16 bytes = 96 bytes/label.  Grew from 48 in 2026-05-19 to host the
 * outline + glow effect fields; the legacy `pixelSize` slot (formerly
 * sizing.x — never read by the shader after the worldEmMpc migration)
 * is repurposed for `outlineEmFrac` rather than left zero, on the
 * principle that wasting a `vec4` for a single new scalar squanders
 * alignment.  Reserved scalars in `effects.yzw` are kept at zero by
 * the CPU writer so a future fifth/sixth effect can land without
 * another stride bump.
 */
const LABEL_DATA_BYTES = 96;
```

- [ ] **Step 4: Update the pack loop**

In `src/services/gpu/renderers/labelRenderer.ts` at lines 417–442 (the per-label record write block), replace with:

```ts
// Write per-label storage record (96 bytes, 24 floats) unconditionally
// — even when `quads` is empty.  Keeping the per-label index stable
// across the outer loop matters because each glyph carries its
// labelIndex by position; if we skipped a label whose text produced
// no known glyphs, every subsequent glyph would point to the wrong
// label entry.  An unused storage slot is harmless (no glyph
// references it, the GPU never reads it).
//
//   [0..3]   worldPos     (x, y, z, worldEmMpc)
//   [4..7]   color        (r*a, g*a, b*a, a — premultiplied)
//   [8..11]  sizing       (outlineEmFrac, minPx, maxPx, fadeAlpha)
//   [12..15] outlineColor (r*a, g*a, b*a, a)
//   [16..19] glowColor    (r*a, g*a, b*a, a)
//   [20..23] effects      (glowEmFrac, 0, 0, 0)
const labelBase = li * (LABEL_DATA_BYTES / 4);
labelBuf[labelBase + 0] = label.worldPos[0];
labelBuf[labelBase + 1] = label.worldPos[1];
labelBuf[labelBase + 2] = label.worldPos[2];
labelBuf[labelBase + 3] = label.worldEmMpc ?? 0.01;

// fill colour — straight RGBA → premultiplied on write
const color = label.color ?? [1, 1, 1, 1];
const ca = color[3]!;
labelBuf[labelBase + 4] = color[0]! * ca;
labelBuf[labelBase + 5] = color[1]! * ca;
labelBuf[labelBase + 6] = color[2]! * ca;
labelBuf[labelBase + 7] = ca;

// sizing.x repurposes the legacy pixelSize slot to carry
// outlineEmFrac.  See LABEL_DATA_BYTES docstring above for the
// rationale.  Default 0 means "no outline contribution".
labelBuf[labelBase + 8] = label.outlineEmFrac ?? 0;
labelBuf[labelBase + 9] = label.minPixelSize ?? 8;
labelBuf[labelBase + 10] = label.maxPixelSize ?? 64;
labelBuf[labelBase + 11] = label.fadeAlpha ?? 1;

// outline colour — same straight → premultiplied conversion as fill.
// Default [0,0,0,0] makes outlineEmFrac irrelevant (the band's alpha
// pre-multiplies to zero).
const outlineColor = label.outlineColor ?? [0, 0, 0, 0];
const oa = outlineColor[3]!;
labelBuf[labelBase + 12] = outlineColor[0]! * oa;
labelBuf[labelBase + 13] = outlineColor[1]! * oa;
labelBuf[labelBase + 14] = outlineColor[2]! * oa;
labelBuf[labelBase + 15] = oa;

// glow colour — same conversion.
const glowColor = label.glowColor ?? [0, 0, 0, 0];
const ga = glowColor[3]!;
labelBuf[labelBase + 16] = glowColor[0]! * ga;
labelBuf[labelBase + 17] = glowColor[1]! * ga;
labelBuf[labelBase + 18] = glowColor[2]! * ga;
labelBuf[labelBase + 19] = ga;

// effects.x = glowEmFrac; .yzw stay zero (initialised by the
// labelBuf TypedArray constructor — reasserted here for clarity).
labelBuf[labelBase + 20] = label.glowEmFrac ?? 0;
labelBuf[labelBase + 21] = 0;
labelBuf[labelBase + 22] = 0;
labelBuf[labelBase + 23] = 0;
```

Remove the old `label.pixelSize` write line (`labelBuf[labelBase + 8] = label.pixelSize;`) — slot 8 is now `outlineEmFrac`.

- [ ] **Step 5: Run to confirm pass**

```bash
npx vitest run tests/services/gpu/renderers/labelRenderer.effects.test.ts tests/services/gpu/renderers/labelRenderer.test.ts tests/services/gpu/renderers/labelRenderer.colorMigration.test.ts
```

Expected: PASS, all tests across all three files.  The original `labelRenderer.test.ts` is unaffected because it never reads buffer slots — only `glyphCount()` and `labelCount()`.

- [ ] **Step 6: Run full suite + typecheck**

```bash
npm run typecheck && npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/renderers/labelRenderer.ts tests/services/gpu/renderers/labelRenderer.effects.test.ts
git commit -m "$(cat <<'EOF'
feat(labels): grow per-label storage 48→96 bytes for outline+glow

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 4: Shader updates

## Task 6: Update `LabelData` struct and vertex shader (quad expansion + new varyings)

**Files:**
- Modify: `src/services/gpu/shaders/labels/io.wesl` (lines 52–94 — `LabelData` struct and `VsOut`)
- Modify: `src/services/gpu/shaders/labels/vertex.wesl` (full file — quad expansion + new varying writes)

> **WESL gotchas:** before editing, review the `wesl-shaders` skill.  In short: `?static` imports, `package::` literal prefixes, struct field order must match the WGSL layout byte-for-byte, and you cannot import a struct from a module that doesn't re-export it.

- [ ] **Step 1: Update `LabelData` in `io.wesl`**

Replace the existing `LabelData` struct (lines 52–63) with:

```wgsl
struct LabelData {
  // worldPos.xyz = anchor in Mpc; worldPos.w = worldEmMpc (PRIMARY size
  // driver — em height in world-space Mpc, projected to pixels by the
  // vertex stage).
  worldPos: vec4<f32>,
  // Fill colour — premultiplied rgba.  The renderer pack loop multiplies
  // r/g/b by a before upload, so the shader can treat (rgb, a) as the
  // OVER-composite input directly.
  color: vec4<f32>,
  // x = outlineEmFrac (REPURPOSED — formerly the legacy pixelSize slot,
  //                    which the shader stopped reading at the worldEmMpc
  //                    migration; see labelRenderer.ts LABEL_DATA_BYTES
  //                    docstring for the rationale)
  // y = minPixelSize  (floor clamp on projected em height, in screen px)
  // z = maxPixelSize  (ceiling clamp on projected em height, in screen px)
  // w = fadeAlpha     (multiplied into every effect band uniformly)
  sizing: vec4<f32>,
  // Outside-stroke outline colour — premultiplied rgba.  When alpha is
  // zero (the default for labels that don't opt in), the outline band
  // contributes nothing regardless of outlineEmFrac.
  outlineColor: vec4<f32>,
  // Soft outside glow colour — premultiplied rgba.  Same opt-in semantics
  // as outlineColor: zero alpha → band collapses.
  glowColor: vec4<f32>,
  // x = glowEmFrac (band radius as a fraction of projected em height)
  // y/z/w = reserved (CPU writer keeps these zero so a future fifth/sixth
  //                   effect parameter can land without bumping the stride)
  effects: vec4<f32>,
};
```

- [ ] **Step 2: Extend `VsOut` to carry the new effect data to the fragment stage**

Replace the existing `VsOut` (lines 86–94) with:

```wgsl
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  // Fill colour pre-multiplied by fadeAlpha so the fragment stage can
  // alpha-blend without re-reading fadeAlpha.
  @location(1) color: vec4<f32>,
  // Flat-interpolated so the fragment shader sees the same integer
  // layer index for every fragment of one glyph quad.  Non-flat
  // interpolation of an integer is a WGSL validation error.
  @location(2) @interpolate(flat) fontIndex: u32,
  // Outline colour pre-multiplied by fadeAlpha (same pre-fade bake as
  // the fill colour — keeps the fragment stage simple).
  @location(3) outlineColor: vec4<f32>,
  // Glow colour pre-multiplied by fadeAlpha.
  @location(4) glowColor: vec4<f32>,
  // x = outline width in SDF units (atlas px ÷ DISTANCE_RANGE_PX);
  // y = glow radius in SDF units;
  // converted CPU-side from the em-fraction inputs at the vertex
  // stage, so the fragment shader has the values it needs without
  // re-deriving from per-label data.
  @location(5) widths: vec2<f32>,
};
```

- [ ] **Step 3: Update `vertex.wesl` — quad expansion + new varying writes**

Replace the entire `vertex.wesl` file with:

```wgsl
// labels/vertex.wesl — MSDF labels vertex stage.
//
// Expands the unit-corner attribute into a glyph quad in clip space,
// applying perspective-driven sizing.  'worldEmMpc' (label.worldPos.w)
// is the em height expressed in Mpc of world space; the vertex stage
// projects it through the camera's clip.w to obtain a screen-pixel
// height, clamps to [minPx, maxPx] for legibility, and scales the
// atlas-baked glyph quad to match.
//
// ## Quad expansion for outline + glow
//
// When a label sets outlineEmFrac and/or glowEmFrac, the on-screen
// footprint of the glyph extends past its atlas rect by
// `max(outlineEmFrac, glowEmFrac) * displayEmPx` screen pixels.  If
// the quad stays sized to the atlas rect, the effect bands get
// clipped at the glyph's bounding box and look like a chopped halo.
// We pre-compute the fringe extent in atlas px and grow each corner
// outward by that amount.  The fragment shader's UV mix still uses
// the unit corner [0,1] range, so UVs at the fringe extrapolate
// outside the atlas rect — that's deliberate: those samples land in
// the SDF's distance-only region (well past the glyph contour), which
// is exactly what the glow falloff math wants.

import package::labels::io::Uniforms;
import package::labels::io::LabelData;
import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::worldLenToPx;
import package::lib::billboard::pxToClipOffset;

// Atlas em pixel size — must match 'ATLAS_FONT_SIZE' in src/data/fonts.ts.
const ATLAS_EM_PX: f32 = 42.0;
// MSDF distance range in pixels — must match 'DISTANCE_RANGE_PX' in
// src/data/fonts.ts.  Bumped from 4 to 16 in 2026-05-19 alongside the
// outline+glow feature so the SDF carries headroom past the glyph
// contour for the glow falloff tail.
const DISTANCE_RANGE_PX: f32 = 16.0;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> labels: array<LabelData>;

@vertex
fn vs(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let worldPos       = label.worldPos.xyz;
  let worldEmMpc     = label.worldPos.w;
  let outlineEmFrac  = label.sizing.x;
  let minPx          = label.sizing.y;
  let maxPx          = label.sizing.z;
  let fadeAlpha      = label.sizing.w;
  let glowEmFrac     = label.effects.x;

  // Project anchor to clip space.
  let clip = worldToClip(u.cam, worldPos);

  // Perspective-driven size (existing math, unchanged).
  let pxPerEm = worldLenToPx(u.cam, worldEmMpc, clip.w);
  let displayEmPx = clamp(pxPerEm, minPx, maxPx);
  let pxScale = displayEmPx / ATLAS_EM_PX;

  // Effect fringe in atlas px.  The on-screen fringe is
  // `max(outline, glow) * displayEmPx` screen pixels, which divides
  // by pxScale to recover atlas-px (because the same pxScale gets
  // applied to the corner offset below).
  let fringeAtlasPx = max(outlineEmFrac, glowEmFrac) * ATLAS_EM_PX;

  // Expand each corner outward by the fringe.  The unit-corner attribute
  // sits in {(0,0),(1,0),(0,1),(1,1)}; remap to {-1,+1} via (corner*2-1)
  // to get an outward direction, then add `corner*localSize` for the
  // glyph rect, and `direction*fringeAtlasPx` for the fringe extension.
  let outward = input.corner * 2.0 - vec2<f32>(1.0, 1.0);
  let cornerAtlasPx = vec2<f32>(
    input.localOffset.x + input.corner.x * input.localSize.x + outward.x * fringeAtlasPx,
    -(input.localOffset.y + input.corner.y * input.localSize.y + outward.y * fringeAtlasPx),
  );

  let ndcOffset = pxToClipOffset(u.cam, cornerAtlasPx * pxScale, clip.w);
  let outPos = vec4<f32>(clip.x + ndcOffset.x, clip.y + ndcOffset.y, clip.z, clip.w);

  // UV expansion to match the corner expansion.  Atlas-px-per-UV is
  // `localSize` along each axis; convert the per-corner outward
  // fringeAtlasPx to a UV delta and add it to the original UV mix.
  // The result samples outside the glyph's atlas rect at the fringe,
  // which is what the SDF falloff math wants (the distance-only
  // region past the glyph contour).
  let uvDelta = vec2<f32>(
    outward.x * fringeAtlasPx / max(input.localSize.x, 0.0001),
    outward.y * fringeAtlasPx / max(input.localSize.y, 0.0001),
  );
  let uvBase = vec2<f32>(
    mix(input.uvRect.x, input.uvRect.z, input.corner.x),
    mix(input.uvRect.y, input.uvRect.w, input.corner.y),
  );
  // UV per-atlas-px = 1 / scaleW (== 1 / atlas page size); the UV
  // rect coordinates are already normalised, so the delta needs to
  // be applied as a normalised-UV delta.  uvRect.z - uvRect.x is
  // the glyph's UV width which equals localSize.x / scaleW; we
  // therefore reuse `uvRect.z - uvRect.x` to scale the fringe into
  // UV space, falling back to a no-op when the rect has zero width.
  let uvSpanX = input.uvRect.z - input.uvRect.x;
  let uvSpanY = input.uvRect.w - input.uvRect.y;
  let uvFringe = vec2<f32>(
    outward.x * fringeAtlasPx * uvSpanX / max(input.localSize.x, 0.0001),
    outward.y * fringeAtlasPx * uvSpanY / max(input.localSize.y, 0.0001),
  );
  let uv = uvBase + uvFringe;
  // (uvDelta is computed above for documentation symmetry; the
  // actual UV delta we apply is `uvFringe` because the UV rect is
  // already in normalised-atlas-UV space.)
  _ = uvDelta;

  // Pre-bake fadeAlpha into every colour channel that flows to the
  // fragment stage.  The fragment stage then just multiplies by the
  // per-band SDF coverage, so fadeAlpha applies uniformly to fill,
  // outline, and glow without an extra fragment-side multiply.
  let outColor        = vec4<f32>(label.color.rgb        * fadeAlpha, label.color.a        * fadeAlpha);
  let outOutlineColor = vec4<f32>(label.outlineColor.rgb * fadeAlpha, label.outlineColor.a * fadeAlpha);
  let outGlowColor    = vec4<f32>(label.glowColor.rgb    * fadeAlpha, label.glowColor.a    * fadeAlpha);

  // Convert em-fraction widths to SDF units.  See io.wesl docstring
  // for the derivation:
  //   widthInSdfUnits = (frac * ATLAS_EM_PX) / DISTANCE_RANGE_PX
  let outlineSdf = outlineEmFrac * ATLAS_EM_PX / DISTANCE_RANGE_PX;
  let glowSdf    = glowEmFrac    * ATLAS_EM_PX / DISTANCE_RANGE_PX;
  let widths = vec2<f32>(outlineSdf, glowSdf);

  return VsOut(outPos, uv, outColor, input.fontIndex, outOutlineColor, outGlowColor, widths);
}
```

- [ ] **Step 4: Visual sanity check via the running dev server**

The dev server is left running per CLAUDE.md.  Ask the user: open the running browser tab, look at the "You are here" label and the cluster labels.  Expected: labels render unchanged from before this task (no outline or glow yet — those need Task 7's fragment update), and the glyph quads aren't visibly clipped (the fringe expansion ought to be invisible when no effects are active, because outline/glow alpha is zero by default).

If any label disappears or develops visible quad-edge artefacts, the corner-expansion math has a sign error — re-check the `outward = corner*2 - 1` term and ensure the Y-flip in `cornerAtlasPx` matches the glyph's atlas Y-down → world Y-up convention.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/shaders/labels/io.wesl src/services/gpu/shaders/labels/vertex.wesl
git commit -m "$(cat <<'EOF'
feat(labels/shader): grow LabelData, expand quad for effect fringe

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Three-band fragment composite (glow + outline + fill)

**Files:**
- Modify: `src/services/gpu/shaders/labels/fragment.wesl` (full file)

- [ ] **Step 1: Replace `fragment.wesl` with the three-band composite**

Replace the entire `fragment.wesl` with:

```wgsl
// labels/fragment.wesl — MSDF labels fragment stage with three-band
// composite: glow (soft outside halo) → outline (hard outside stroke)
// → fill (glyph body).  All composited OVER in premultiplied space.
//
// ## Bands
//
// The MSDF distance `d` is positive inside the glyph and negative
// outside; the glyph contour sits at `d = 0`.  The three bands are:
//
//   fill   : smoothstep(-aa, +aa, d)
//             — existing one-pixel AA band straddling the contour.
//   outline: smoothstep(-aa - outlineSdf, -aa, d) * (1 - fill)
//             — covers d ∈ [-outlineSdf, 0]; the (1 - fill) factor
//               masks the inside half so the outline doesn't bleed
//               into the glyph body.
//   glow   : smoothstep(-glowSdf, 0, d)
//             — soft falloff from the contour outward by glowSdf,
//               with default smoothstep cubic ease.  Overlaps the
//               outline band; the OVER composite below resolves
//               which colour wins.
//
// `outlineSdf` and `glowSdf` are in SDF units (the same units `d`
// lives in); the vertex stage converts from em-fraction inputs via
// `widthInSdfUnits = (emFrac * ATLAS_EM_PX) / DISTANCE_RANGE_PX`.
//
// ## Composite
//
//   out = over(glow, over(outline, fill))
//
// All three band colours arrive pre-multiplied (and pre-faded by
// fadeAlpha — the vertex stage bakes fadeAlpha into the rgba),
// so the OVER step is the canonical:
//
//   over(A, B) = A + B * (1 - A.a)
//
// ## Why overlap, not stack
//
// Q8 (see 2026-05-19 grill session): "glow radius" should match the
// mental model "visible halo extent", not "extra halo past the
// outline".  Overlap also keeps the silhouette stable when the user
// toggles the outline on/off.

import package::labels::io::VsOut;

@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let s = textureSample(atlas, atlasSampler, input.uv, i32(input.fontIndex)).rgb;
  let d = median3(s.r, s.g, s.b) - 0.5;
  let aa = fwidth(d);

  let outlineSdf = input.widths.x;
  let glowSdf    = input.widths.y;

  // Fill mask (1 inside the glyph, 0 outside, smoothed at the edge).
  let fillMask = smoothstep(-aa, aa, d);

  // Outline mask covers d ∈ [-outlineSdf, 0] but is masked OUT inside
  // the glyph.  When outlineSdf == 0 the smoothstep collapses to a
  // single-point step at d=0 — the mask is then identically zero
  // outside the glyph (no contribution) and identically `fillMask`
  // inside (cancelled by `1 - fillMask`).  So a zero outline width
  // correctly contributes nothing.
  let outlineBand = smoothstep(-aa - outlineSdf, -aa, d);
  let outlineMask = outlineBand * (1.0 - fillMask);

  // Glow band: smooth ramp from d = -glowSdf (alpha 0) to d = 0
  // (alpha 1).  When glowSdf == 0 the ramp degenerates to a step at
  // d=0 — multiplied by glowColor.a (which is 0 when the producer
  // doesn't set glowColor), the band's contribution stays zero.
  let glowMask = smoothstep(-glowSdf, 0.0, d);

  // Per-band premultiplied colours.  The masks scale the already-
  // premultiplied colour by the band's coverage.
  let fillPM    = input.color        * fillMask;
  let outlinePM = input.outlineColor * outlineMask;
  let glowPM    = input.glowColor    * glowMask;

  // Composite over(glow, over(outline, fill)).  Each `over` step
  // does:  result = top + bottom * (1 - top.a)
  let layer1 = outlinePM + fillPM    * (1.0 - outlinePM.a);
  let layer2 = glowPM    + layer1    * (1.0 - glowPM.a);

  return layer2;
}
```

- [ ] **Step 2: Visual smoke check (no automated test)**

The shader stage doesn't have a unit test in the existing suite — we rely on visual verification in the running dev server.

Ask the user: open the dev tab.  Expected: every existing label renders identically to before this task (no outline or glow, because every producer still passes the defaults — alpha-zero outline + glow + zero em-fractions).  If labels suddenly look fainter, lose their fill, or develop unwanted halos, the composite math has a sign or order error.

(A more thorough test happens after Task 9, where producer-side overrides actually exercise the new bands.)

- [ ] **Step 3: Run the full suite to catch any regressions**

```bash
npm run typecheck && npx vitest run
```

Expected: PASS.  No vitest-level change is expected here; the test value is in the unchanged-output assertion (existing tests still pass).

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/shaders/labels/fragment.wesl
git commit -m "$(cat <<'EOF'
feat(labels/shader): three-band composite glow+outline+fill

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5: Override mechanism

## Task 8: Module-scoped `labelStyleOverride`

**Files:**
- Create: `src/services/engine/labelStyleOverride.ts`
- Test: `tests/services/engine/labelStyleOverride.test.ts` (new)

- [ ] **Step 1: Failing tests for the override get/set API**

Create `tests/services/engine/labelStyleOverride.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLabelStyleOverride,
  setLabelStyleOverride,
  clearLabelStyleOverride,
  type LabelStyleOverrideTarget,
} from '../../../src/services/engine/labelStyleOverride';

describe('labelStyleOverride', () => {
  beforeEach(() => clearLabelStyleOverride());

  it('returns null target when no override is set', () => {
    expect(getLabelStyleOverride().targetCategory).toBeNull();
  });

  it('stores the most recent override', () => {
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.05,
      glowColor: [0, 0, 1, 0.5],
      glowEmFrac: 0.2,
    });
    const v = getLabelStyleOverride();
    expect(v.targetCategory).toBe<LabelStyleOverrideTarget>('cluster');
    expect(v.outlineColor).toEqual([1, 0, 0, 1]);
    expect(v.outlineEmFrac).toBe(0.05);
    expect(v.glowColor).toEqual([0, 0, 1, 0.5]);
    expect(v.glowEmFrac).toBe(0.2);
  });

  it('clearLabelStyleOverride resets targetCategory to null', () => {
    setLabelStyleOverride({
      targetCategory: 'void',
      outlineColor: [0, 0, 0, 0],
      outlineEmFrac: 0,
      glowColor: [0, 0, 0, 0],
      glowEmFrac: 0,
    });
    clearLabelStyleOverride();
    expect(getLabelStyleOverride().targetCategory).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/services/engine/labelStyleOverride.test.ts
```

Expected: FAIL — `labelStyleOverride` module does not exist.

- [ ] **Step 3: Implement `labelStyleOverride.ts`**

Create `src/services/engine/labelStyleOverride.ts`:

```ts
/**
 * labelStyleOverride — process-wide, single-slot live-tuning hook for
 * the DebugPanel's LabelEffectsSection.
 *
 * ### Why module-scoped mutable state?
 *
 * The override is a developer-only debug hook: while the DebugPanel
 * has it on, every label-emitting subsystem consults the current
 * value at frame-build time and substitutes the override's outline +
 * glow fields for its own producer defaults.  React state in the
 * panel component is the wrong shape because the engine's per-frame
 * code runs outside React's render loop and would need a ref or
 * useEffect to read the current values; a plain module-scoped object
 * is read directly by every producer with zero ceremony.
 *
 * ### Why a single slot, not a per-category record?
 *
 * Q10 of the 2026-05-19 grill session settled on a single override +
 * a category dropdown — the workflow is "select category, tune, bake
 * into POI_STYLES, move to next category".  A per-category record
 * would invite the user to leave overrides stale across category
 * switches; the single slot makes the active target unambiguous.
 *
 * ### Why default targetCategory = null?
 *
 * Production startup should never accidentally apply an override.
 * The DebugPanel only exists in DEV builds or when ?debug is in the
 * URL, so a non-DEV runtime never even calls `setLabelStyleOverride`.
 * Defaulting to null means "no producer matches" and the override is
 * completely inert until a developer opens the panel and picks a
 * category.
 */

import type { Vec4 } from '../../@types/math/Vec4';
import type { PoiCategory } from './subsystems/poiSubsystem';

/**
 * The set of label-emitting categories the override can target.
 * Mirrors the dropdown in `LabelEffectsSection.tsx` — keep in sync.
 */
export type LabelStyleOverrideTarget = 'youAreHere' | PoiCategory;

/**
 * Read-only snapshot of the current override.  `targetCategory` is
 * null when the override is inactive.
 */
export type LabelStyleOverride = {
  readonly targetCategory: LabelStyleOverrideTarget | null;
  readonly outlineColor: Vec4;
  readonly outlineEmFrac: number;
  readonly glowColor: Vec4;
  readonly glowEmFrac: number;
};

// The single mutable slot.  Reassigned (not mutated in place) by
// `setLabelStyleOverride` so any consumer that captured the prior
// reference sees a stable snapshot for the duration of one frame.
let current: LabelStyleOverride = {
  targetCategory: null,
  outlineColor: [0, 0, 0, 0],
  outlineEmFrac: 0,
  glowColor: [0, 0, 0, 0],
  glowEmFrac: 0,
};

export function getLabelStyleOverride(): LabelStyleOverride {
  return current;
}

export function setLabelStyleOverride(next: LabelStyleOverride): void {
  current = next;
}

export function clearLabelStyleOverride(): void {
  current = {
    targetCategory: null,
    outlineColor: [0, 0, 0, 0],
    outlineEmFrac: 0,
    glowColor: [0, 0, 0, 0],
    glowEmFrac: 0,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/services/engine/labelStyleOverride.test.ts && npm run typecheck
```

Expected: PASS + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/labelStyleOverride.ts tests/services/engine/labelStyleOverride.test.ts
git commit -m "$(cat <<'EOF'
feat(labels): add labelStyleOverride module for debug-panel tuning

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Apply override in label producers

**Files:**
- Modify: `src/services/engine/subsystems/youAreHereSubsystem.ts` (lines 71–84 — the `labels` array construction)
- Modify: `src/services/engine/subsystems/poiSubsystem.ts` (lines 538–551 — the `labels.push(...)` block)
- Test: `tests/services/engine/subsystems/youAreHereSubsystem.labelEffects.test.ts` (new)
- Test: `tests/services/engine/subsystems/poiSubsystem.labelEffects.test.ts` (new)

- [ ] **Step 1: Failing test for youAreHere override**

Create `tests/services/engine/subsystems/youAreHereSubsystem.labelEffects.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createYouAreHereSubsystem } from '../../../../src/services/engine/subsystems/youAreHereSubsystem';
import {
  setLabelStyleOverride,
  clearLabelStyleOverride,
} from '../../../../src/services/engine/labelStyleOverride';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

// Minimal stub state + ctx — only the bits youAreHereSubsystem reads.
const STATE_STUB = {
  subsystems: { fades: { fadeTo: () => Promise.resolve() } },
} as unknown as EngineState;
// Cam position inside the fade band so alpha > 0 and labels emit.
const CTX_STUB = { drawCamPos: [0, 0, 1.0] } as unknown as ReadyFrameContext;

describe('youAreHereSubsystem label-effect override', () => {
  beforeEach(() => clearLabelStyleOverride());

  it('applies the override when targetCategory is youAreHere', () => {
    setLabelStyleOverride({
      targetCategory: 'youAreHere',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.08,
      glowColor: [0, 1, 0, 0.5],
      glowEmFrac: 0.25,
    });
    const sub = createYouAreHereSubsystem();
    const { labels } = sub.produceLabels(STATE_STUB, CTX_STUB);
    expect(labels[0]?.outlineColor).toEqual([1, 0, 0, 1]);
    expect(labels[0]?.outlineEmFrac).toBe(0.08);
    expect(labels[0]?.glowColor).toEqual([0, 1, 0, 0.5]);
    expect(labels[0]?.glowEmFrac).toBe(0.25);
  });

  it('ignores the override when targetCategory is a different category', () => {
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.08,
      glowColor: [0, 1, 0, 0.5],
      glowEmFrac: 0.25,
    });
    const sub = createYouAreHereSubsystem();
    const { labels } = sub.produceLabels(STATE_STUB, CTX_STUB);
    expect(labels[0]?.outlineColor).toBeUndefined();
    expect(labels[0]?.outlineEmFrac).toBeUndefined();
    expect(labels[0]?.glowColor).toBeUndefined();
    expect(labels[0]?.glowEmFrac).toBeUndefined();
  });
});
```

- [ ] **Step 2: Failing test for poiSubsystem override**

Create `tests/services/engine/subsystems/poiSubsystem.labelEffects.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';
import {
  setLabelStyleOverride,
  clearLabelStyleOverride,
} from '../../../../src/services/engine/labelStyleOverride';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const STATE_STUB = {
  subsystems: { fades: { fadeTo: () => Promise.resolve() } },
} as unknown as EngineState;
// drawPxPerRad chosen so the apparent-size gate (when present) doesn't
// suppress the POI; canvasSize and drawCamPos are just enough to keep
// `produceLabels` running through to the labels.push.
const CTX_STUB = {
  drawCamPos: [0, 0, 100],
  canvasSize: { width: 1024, height: 768 },
  drawPxPerRad: 500,
} as unknown as ReadyFrameContext;

const CLUSTER_POI: PointOfInterest = {
  id: 'p-coma',
  name: 'Coma',
  category: 'cluster',
  worldPos: [10, 0, 0],
};

describe('poiSubsystem label-effect override', () => {
  beforeEach(() => clearLabelStyleOverride());

  it('applies the override only to labels whose category matches', () => {
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 1, 0, 1],
      outlineEmFrac: 0.06,
      glowColor: [1, 0.5, 0, 0.4],
      glowEmFrac: 0.18,
    });
    const sub = createPoiSubsystem();
    sub.setPois([CLUSTER_POI]);
    const { labels } = sub.produceLabels(STATE_STUB, CTX_STUB);
    expect(labels.length).toBe(1);
    expect(labels[0]?.outlineColor).toEqual([1, 1, 0, 1]);
    expect(labels[0]?.outlineEmFrac).toBe(0.06);
    expect(labels[0]?.glowColor).toEqual([1, 0.5, 0, 0.4]);
    expect(labels[0]?.glowEmFrac).toBe(0.18);
  });

  it('leaves labels untouched when override targets a different category', () => {
    setLabelStyleOverride({
      targetCategory: 'void',
      outlineColor: [1, 1, 0, 1],
      outlineEmFrac: 0.06,
      glowColor: [1, 0.5, 0, 0.4],
      glowEmFrac: 0.18,
    });
    const sub = createPoiSubsystem();
    sub.setPois([CLUSTER_POI]);
    const { labels } = sub.produceLabels(STATE_STUB, CTX_STUB);
    expect(labels[0]?.outlineColor).toBeUndefined();
    expect(labels[0]?.outlineEmFrac).toBeUndefined();
    expect(labels[0]?.glowColor).toBeUndefined();
    expect(labels[0]?.glowEmFrac).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to confirm failures**

```bash
npx vitest run tests/services/engine/subsystems/youAreHereSubsystem.labelEffects.test.ts tests/services/engine/subsystems/poiSubsystem.labelEffects.test.ts
```

Expected: FAIL — `outlineColor` etc. are undefined on every label because producers don't yet read the override.

- [ ] **Step 4: Apply override in `youAreHereSubsystem.ts`**

In `src/services/engine/subsystems/youAreHereSubsystem.ts`, add the import at the top:

```ts
import { getLabelStyleOverride } from '../labelStyleOverride';
```

In `produceLabels` (around line 71, just before the `labels: readonly Label[] = [...]` declaration), add:

```ts
// Live-tuning override: when the DebugPanel selects 'youAreHere' as
// the target category, substitute the override's outline + glow fields
// for the producer defaults (which today are simply "off").  The
// override is module-scoped + read fresh each frame so changes from
// the panel apply on the next render without a producer reseed.
const override = getLabelStyleOverride();
const effectFields = override.targetCategory === 'youAreHere'
  ? {
      outlineColor: override.outlineColor,
      outlineEmFrac: override.outlineEmFrac,
      glowColor: override.glowColor,
      glowEmFrac: override.glowEmFrac,
    }
  : {};
```

Then spread `...effectFields` into the existing single `Label` literal:

```ts
const labels: readonly Label[] = [
  {
    id: 'you-are-here',
    worldPos: [0, LABEL_ANCHOR_MPC, 0],
    text: LABEL_TEXT,
    font: 'cormorant',
    pixelSize: 0,
    color: [...LABEL_COLOR],
    worldEmMpc: 0.0125,
    minPixelSize: 45,
    maxPixelSize: 150,
    fadeAlpha: alpha,
    alignX: 'center',
    ...effectFields,
  },
];
```

- [ ] **Step 5: Apply override in `poiSubsystem.ts`**

In `src/services/engine/subsystems/poiSubsystem.ts`, add the import:

```ts
import { getLabelStyleOverride } from '../labelStyleOverride';
```

In `produceLabels`, just before the for-loop over `pois` (around line 410), capture the override once:

```ts
// Capture once per frame — reads are cheap but the consistent
// snapshot matters when the loop crosses many POIs.  The director
// will not call produceLabels again within the same frame.
const override = getLabelStyleOverride();
```

In the `labels.push({...})` block at lines 538–551, add a conditional spread that applies the override only when `p.category === override.targetCategory`:

```ts
const overrideFields = override.targetCategory === p.category
  ? {
      outlineColor: override.outlineColor,
      outlineEmFrac: override.outlineEmFrac,
      glowColor: override.glowColor,
      glowEmFrac: override.glowEmFrac,
    }
  : {};

labels.push({
  id: p.id,
  worldPos: labelWorldPos,
  text: p.name,
  font: 'cormorant',
  pixelSize: 0,
  color: [...style.labelColor],
  worldEmMpc: p.labelWorldEmMpc ?? style.worldEmMpc,
  minPixelSize: style.minPixelSize,
  maxPixelSize: style.maxPixelSize,
  fadeAlpha,
  alignX,
  alignY,
  ...overrideFields,
});
```

- [ ] **Step 6: Run to confirm pass**

```bash
npx vitest run tests/services/engine/subsystems/youAreHereSubsystem.labelEffects.test.ts tests/services/engine/subsystems/poiSubsystem.labelEffects.test.ts
```

Expected: PASS, all four tests.

- [ ] **Step 7: Run full suite + typecheck**

```bash
npm run typecheck && npx vitest run
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/engine/subsystems/youAreHereSubsystem.ts src/services/engine/subsystems/poiSubsystem.ts tests/services/engine/subsystems/youAreHereSubsystem.labelEffects.test.ts tests/services/engine/subsystems/poiSubsystem.labelEffects.test.ts
git commit -m "$(cat <<'EOF'
feat(labels): apply labelStyleOverride from youAreHere + POI producers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wake the loop when the override changes

**Files:**
- Modify: `src/services/engine/labelStyleOverride.ts` — add an optional listener slot
- Modify: `src/services/engine/subsystems/labelDirectorSubsystem.ts` — re-flush on override change

The label director's signature-hash change-detection short-circuits the GPU upload when no `id` or `fadeAlpha` changes; an override edit changes neither.  Without a wake mechanism, the panel's controls would feel broken (no visual change until the user nudges the camera).

- [ ] **Step 1: Failing test — directorSubsystem flushes when override version changes**

Create `tests/services/engine/subsystems/labelDirectorSubsystem.override.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createLabelDirectorSubsystem } from '../../../../src/services/engine/subsystems/labelDirectorSubsystem';
import {
  setLabelStyleOverride,
  clearLabelStyleOverride,
} from '../../../../src/services/engine/labelStyleOverride';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

describe('labelDirector override-driven re-flush', () => {
  beforeEach(() => clearLabelStyleOverride());

  it('uploads on the frame an override is set, even if labels otherwise hash-equal', () => {
    let setLabelsCalls = 0;
    const labelStub = { setLabels: () => { setLabelsCalls++; }, render: () => {}, glyphCount: () => 0, labelCount: () => 0, destroy: () => {}, label: 'stub' as const };
    const lineStub  = { setLines:  () => {},                    render: () => {}, destroy: () => {}, label: 'stub' as const };
    const director = createLabelDirectorSubsystem();
    // Cast through unknown — the stubs deliberately implement only the
    // surface the director calls.
    director.attachRenderers(labelStub as never, lineStub as never);
    // Producer that always emits the same single label (constant id +
    // constant fadeAlpha): without override-awareness the director
    // would only flush on the first frame.
    director.registerProducer({
      produceLabels: () => ({
        labels: [{ id: 'x', worldPos: [0, 0, 0], text: '.', pixelSize: 0, font: 'cormorant', fadeAlpha: 1 }],
        lines: [],
        awake: false,
      }),
    });
    const stateStub = { subsystems: { scheduler: { requestRender: () => {} } } } as unknown as EngineState;
    const ctxStub = {} as unknown as ReadyFrameContext;

    director.runFrame(stateStub, ctxStub);
    expect(setLabelsCalls).toBe(1);
    director.runFrame(stateStub, ctxStub);
    expect(setLabelsCalls).toBe(1); // hash equal — no re-flush
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.05,
      glowColor: [0, 0, 0, 0],
      glowEmFrac: 0,
    });
    director.runFrame(stateStub, ctxStub);
    expect(setLabelsCalls).toBe(2); // override change → re-flush
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/services/engine/subsystems/labelDirectorSubsystem.override.test.ts
```

Expected: FAIL — `setLabelsCalls` stays at 1 after the override.

- [ ] **Step 3: Add a version counter to `labelStyleOverride.ts`**

In `src/services/engine/labelStyleOverride.ts`, add:

```ts
// Monotonic version counter — incremented on every set/clear.  The
// label director includes this in its signature hash so an override
// edit triggers a re-flush even when the merged label set is
// id+fadeAlpha-stable.  Cheaper than a listener channel and impossible
// to leak (no subscribers to forget to dispose).
let version = 0;
export function getLabelStyleOverrideVersion(): number { return version; }
```

Increment `version++` inside both `setLabelStyleOverride` and `clearLabelStyleOverride`.

- [ ] **Step 4: Update `labelDirectorSubsystem.ts` to read the version**

In `src/services/engine/subsystems/labelDirectorSubsystem.ts`, import the version getter:

```ts
import { getLabelStyleOverrideVersion } from '../labelStyleOverride';
```

In `signatureOf` (line 66), suffix the override version to the returned signature:

```ts
return `L:${labels.length}:${lIds};M:${lines.length}:${mIds};O:${getLabelStyleOverrideVersion()}`;
```

Update the docstring above `signatureOf` to mention the override-version term.

- [ ] **Step 5: Run to confirm pass + full suite**

```bash
npx vitest run tests/services/engine/subsystems/labelDirectorSubsystem.override.test.ts && npm run typecheck && npx vitest run
```

Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/labelStyleOverride.ts src/services/engine/subsystems/labelDirectorSubsystem.ts tests/services/engine/subsystems/labelDirectorSubsystem.override.test.ts
git commit -m "$(cat <<'EOF'
feat(labels): version-bump override so director re-flushes on edit

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 6: DebugPanel UI

## Task 11: `LabelEffectsSection` component

**Files:**
- Create: `src/components/DebugPanel/LabelEffectsSection.tsx`
- Modify: `src/components/DebugPanel/DebugPanel.tsx` — mount the new section

- [ ] **Step 1: Create `LabelEffectsSection.tsx`**

Create `src/components/DebugPanel/LabelEffectsSection.tsx`:

```tsx
/**
 * LabelEffectsSection — live-tuning controls for the label outline +
 * glow effects.
 *
 * ## Workflow
 *
 * 1. Pick a target category from the dropdown.
 * 2. Tune outline colour + em-fraction and glow colour + em-fraction
 *    via the four controls.  Changes apply on the next frame; the
 *    label director re-flushes when the override version increments.
 * 3. Once the values look right, commit them into `POI_STYLES.<cat>`
 *    or `youAreHereSubsystem.ts`'s producer defaults as a follow-up
 *    edit.  The override is a temporary hook, not a long-term storage
 *    location.
 *
 * ## Why a single override slot + a dropdown
 *
 * See `labelStyleOverride.ts`'s docstring — the per-category record
 * alternative was rejected because it invites stale values to leak
 * across category switches.
 *
 * ## Why these specific control ranges
 *
 * - `outlineEmFrac` slider: 0 to 0.2.  Beyond 0.2 the outline starts
 *   eating into adjacent labels at typical em sizes; 0.05–0.1 is the
 *   readable sweet spot.
 * - `glowEmFrac` slider: 0 to 0.5.  Glow can extend further than the
 *   outline before becoming visually noisy; 0.15–0.3 is the typical
 *   "soft halo behind the text" range.
 */

import { useState, type ReactElement } from 'react';
import {
  setLabelStyleOverride,
  clearLabelStyleOverride,
  type LabelStyleOverrideTarget,
} from '../../services/engine/labelStyleOverride';
import type { Vec4 } from '../../@types/math/Vec4';

const CATEGORIES: readonly LabelStyleOverrideTarget[] = [
  'youAreHere',
  'cluster',
  'supercluster',
  'famousGalaxy',
  'void',
];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function LabelEffectsSection(): ReactElement {
  const [target, setTarget] = useState<LabelStyleOverrideTarget | ''>('');
  const [outlineHex, setOutlineHex] = useState('#000000');
  const [outlineAlpha, setOutlineAlpha] = useState(1);
  const [outlineEmFrac, setOutlineEmFrac] = useState(0.05);
  const [glowHex, setGlowHex] = useState('#ffffff');
  const [glowAlpha, setGlowAlpha] = useState(0.4);
  const [glowEmFrac, setGlowEmFrac] = useState(0.2);

  // Push the current state into the override on every render.  The
  // useEffect-less approach is intentional — render happens after each
  // user action so the live values reach the engine within one frame.
  // (React render is synchronous wrt event handlers in this section;
  // strict-mode double-render is harmless because setLabelStyleOverride
  // is idempotent.)
  if (target !== '') {
    const [or, og, ob] = hexToRgb(outlineHex);
    const [gr, gg, gb] = hexToRgb(glowHex);
    const outlineColor: Vec4 = [or, og, ob, outlineAlpha];
    const glowColor: Vec4 = [gr, gg, gb, glowAlpha];
    setLabelStyleOverride({ targetCategory: target, outlineColor, outlineEmFrac, glowColor, glowEmFrac });
  } else {
    clearLabelStyleOverride();
  }

  const labelStyle = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } as const;
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Label Effects</summary>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Target</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as LabelStyleOverrideTarget | '')}>
            <option value="">(off)</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Outline</span>
          <input type="color" value={outlineHex} onChange={(e) => setOutlineHex(e.target.value)} />
          <input type="range" min={0} max={1} step={0.01} value={outlineAlpha} onChange={(e) => setOutlineAlpha(parseFloat(e.target.value))} />
          <span style={{ width: 30 }}>{outlineAlpha.toFixed(2)}</span>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Out width</span>
          <input type="range" min={0} max={0.2} step={0.005} value={outlineEmFrac} onChange={(e) => setOutlineEmFrac(parseFloat(e.target.value))} />
          <span style={{ width: 40 }}>{outlineEmFrac.toFixed(3)}</span>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Glow</span>
          <input type="color" value={glowHex} onChange={(e) => setGlowHex(e.target.value)} />
          <input type="range" min={0} max={1} step={0.01} value={glowAlpha} onChange={(e) => setGlowAlpha(parseFloat(e.target.value))} />
          <span style={{ width: 30 }}>{glowAlpha.toFixed(2)}</span>
        </label>
        <label style={labelStyle}>
          <span style={{ width: 70 }}>Glow rad</span>
          <input type="range" min={0} max={0.5} step={0.005} value={glowEmFrac} onChange={(e) => setGlowEmFrac(parseFloat(e.target.value))} />
          <span style={{ width: 40 }}>{glowEmFrac.toFixed(3)}</span>
        </label>
        <div style={{ opacity: 0.6, fontSize: 10 }}>
          Current hex: out={rgbToHex(...hexToRgb(outlineHex))}, glow={rgbToHex(...hexToRgb(glowHex))}
        </div>
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Mount the section in `DebugPanel.tsx`**

In `src/components/DebugPanel/DebugPanel.tsx`, add the import:

```tsx
import { LabelEffectsSection } from './LabelEffectsSection';
```

After the `DataQualitySection` block (after line 84), insert:

```tsx
<div style={{ marginTop: 6 }} />
<LabelEffectsSection />
```

- [ ] **Step 3: Run typecheck + tests**

```bash
npm run typecheck && npx vitest run
```

Expected: PASS.

- [ ] **Step 4: Visual verification in the running dev server**

Ask the user: open the dev tab in DEV mode (or with `?debug` in the URL).  Expected:

  - The DebugPanel now shows a "Label Effects" section.
  - Picking a target from the dropdown and adjusting the outline-width slider produces a visible outline on labels of that category (e.g. cluster names) within one frame.
  - Switching the dropdown to another category removes the outline from the previous category's labels and applies it to the new one.
  - Setting target back to "(off)" removes all effects.

If labels don't visibly change when sliders move, check the browser console for `Invalid ShaderModule` errors from Task 6/7 — a silent WGSL syntax error there would leave the previous shader cached.

- [ ] **Step 5: Commit**

```bash
git add src/components/DebugPanel/LabelEffectsSection.tsx src/components/DebugPanel/DebugPanel.tsx
git commit -m "$(cat <<'EOF'
feat(debug): add LabelEffectsSection live-tuning controls

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 7: Self-review

## Task 12: Self-review sweep

**Files:** none modified.

- [ ] **Step 1: Typecheck both projects**

```bash
npm run typecheck
```

Expected: zero errors.  Both `tsconfig.json` (src) and `tsconfig.tools.json` (tools) clean.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

Expected: all green.  Count the test files — the new tests added across Tasks 1, 2, 4, 5, 8, 9, 10, 11 should each appear and pass.

- [ ] **Step 3: Production build smoke**

```bash
npm run build
```

Expected: completes without error.  This is the gate for the WESL changes — if `vertex.wesl` or `fragment.wesl` has an unresolved import or struct mismatch, vite's wesl-plugin throws here before runtime.

- [ ] **Step 4: Scan for plan-execution artefacts**

Run `git grep -nE '(TODO|FIXME|XXX|TBD|implementer-fills)' src/services/gpu/shaders/labels src/services/gpu/renderers/labelRenderer.ts src/services/engine/labelStyleOverride.ts src/services/engine/subsystems/labelDirectorSubsystem.ts src/components/DebugPanel/LabelEffectsSection.tsx` — expected output: no matches in the new/modified files.  Existing TODOs in the repo are out of scope.

- [ ] **Step 5: Manual visual review checklist (ask the user)**

Ask the user to inspect each category with the override on:

  - `youAreHere` — does the centred "You are here" label render correctly with a small red outline + soft white glow?
  - `cluster` — pick a visible cluster (Coma, Virgo); does its label render with the override on?  Does it return to its bake-in style when the dropdown moves off cluster?
  - `supercluster` — same check.
  - `famousGalaxy` — labels appear only on close approach.  Zoom toward a Local Group galaxy (M31, M33).
  - `void` — voids labels are sparser; verify by toggling target = void and looking for any visible void label (the Boötes Void or local low-density region).
  - With target = "(off)", every label must look identical to its pre-feature appearance.

  Visual issues to watch for: clipped halos at the glyph quad edge (Task 6 quad-expansion fault), missing fill colour (Task 7 composite bug), labels that lose anti-aliasing past `displayEmPx > 60` (Task 1 atlas-rebake fault — `distanceRange` not actually picked up).

- [ ] **Step 6: Open a PR**

Per the user's branch+PR convention (memory `feedback_branch_and_pr.md`): the plan lands as a feature branch with one PR.  Title suggestion: `feat(labels): per-label outline + glow effects with DebugPanel tuning`.  Summary points: per-label opt-in fields, straight-RGBA migration, atlas rebake at distanceRange 16, three-band fragment composite, override mechanism + LabelEffectsSection.

- [ ] **Step 7: Out-of-scope follow-up (do NOT do in this plan)**

After visual tuning, the chosen outline/glow values for each category get baked into:

  - `youAreHereSubsystem.ts` — add outline/glow constants alongside `LABEL_COLOR`.
  - `POI_STYLES.cluster.outlineColor`, `.outlineEmFrac`, `.glowColor`, `.glowEmFrac` (and the corresponding fields on the three other categories).

That commit is a one-line-per-category edit and belongs in a follow-up PR after the user has approved each category's visual.  The plan's scope ends at "the live-tuning hook works"; producer-default bake-in is a deliberate follow-up.

---

# Out of scope (deferred or follow-up)

- **Baking tuned values into producer defaults** — separate follow-up PR (see Task 12 Step 7).
- **Additive glow mode** — Q6 settled on OVER for v1; an additive option could be added later via a per-label boolean if a use case appears.
- **Bloom-style soft glow (radius > 12 px)** — would require an offscreen render target + Gaussian blur pass (Q2 Option C).  Defer until the OVER glow proves insufficient visually.
- **Per-glyph (not per-label) effects** — current architecture indexes effects per label.  Per-glyph would require moving the four new fields into the glyph instance buffer, ~5× the bandwidth.  Defer until a real use case appears.
- **Removing the legacy `pixelSize` field from `Label`** — repurposing the buffer slot in Task 5 leaves the type-level field intact (still required at the call site, still ignored everywhere).  Removing it is a separate cleanup PR touching every label producer.
