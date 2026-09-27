# Albedo bench — design

**Status:** draft, 2026-09-17. **Consumer:** F4 Mars terrain (#743), which wires the recipe into
`marsSurfaceBake` and re-bakes after this merges.

## 1. Goal

Remove the sun shading baked into the Viking MDIM 2.1 colour mosaic, compress blown crater rims while
keeping the polar ice bright, and grade the colour, so the Mars tiles carry albedo that the renderer's
own Oren–Nayar lighting shades once. The tuning happens in a local bench and is saved as a committed
recipe, and the bench and the bake run **one implementation**: what is tuned is what is baked.

## 2. Rulings

| #   | Ruling                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| R1  | Separate PR off main; F4 consumes the recipe after merge.                                                                     |
| R2  | A tool under `tools/`, not an artifact.                                                                                       |
| R3  | The polar ice keeps its highlights (not de-lit, not kneed).                                                                   |
| R4  | The shading field is **recomputed** at bake time (no stored field artifact).                                                  |
| R5  | The recipe is **one flat object** with a fixed step order (not a stage list).                                                 |
| R6  | v1 scope: Viking only; no flatten step; manual sun is a bench-only comparison, not saved; fit and divide in **linear** light. |
| R7  | Bench port 5700.                                                                                                              |
| R8  | Base globe (Viking-derived vs Solar System Scope graded) is decided from bench results, in F4.                                |

## 3. Ground preparation

Done in #749 (`38854045c`): the generic `geoTiffImagerySource` / `geoTiffHeightSource`, the Mars
raw-data rows, and `tools/textures/surfaceBodies/marsGlobalRasters.ts` (`VIKING_MDIM21_GRID`,
`MOLA_DEM463`). The rest lands as growth at existing seams: `SurfaceImagerySource` gains one more
decorator (in the shape of `colourMatchedImagerySource`), `DEV_PORTS` gains a row, and the new
functions and the recipe JSON are new files. Greenfield cross-check divergences and their rulings are
R4–R6. Adjacent findings (Viking resolves z8, not F4's z7; base globe from our own baked albedo) go to F4.

## 4. The shading model

Per pixel, linear luminance `Y = 0.2126 R + 0.7152 G + 0.0722 B` after sRGB decoding. Lambert plus
ambient: `Y = A·(a + k·N·L)`. At Mars's 463 m slopes `N ≈ (−sx, −sy, 1)` (normalised, with `sx`, `sy`
the east and north slopes in m/m), so

```
Y ≈ A·(a + k·L_z) · (1 + g·s)      g = −k·L_h / (a + k·L_z)   (2-vector, per unit slope)
```

- **Only `g` is observable.** The sun's elevation and the ambient `a` are not separable in a
  photograph, but the de-shade does not need them: `Y_albedo ∝ Y / (1 + g·s)`, which is shading
  relative to flat ground under the same sun.
- **The field stores `g`**, not a sun direction. `g` is a plain 2-vector, so neighbours average and
  fill smoothly. The arrow overlay draws `g`: its direction points down-sun and its length is the
  shading strength.
- **Fit per window** by least squares of the high-passed `Y` on the high-passed `(sx, sy)`, both
  divided by the window's mean `Y`. The high pass (a Gaussian at `highPassKm`) removes large-scale
  albedo that correlates with regional tilt.
- **Confidence** is `R² · min(1, var(s) / SLOPE_VARIANCE_REF)` in `[0, 1]`. Flat windows cannot
  report a sun.

## 5. Scale invariance

- **Slopes** always come from MOLA posts at one fixed lattice level, `SLOPE_LEVEL = 8`
  (`heightLatticeStepDeg(8)` ≈ 0.011°, ≈ 650 m). They use central differences in metres
  (east spacing `R·cos(lat)·dλ`) and are sampled bilinearly at any output pixel. The same `g` then
  means the same thing at every pyramid level and in the fit canvas.
- **Fit canvas**: the Viking source read at `FIT_CANVAS_LEVEL = 5` (16384×8192, ≈ 1.3 km/px).
- **Recipe distances** are kilometres.

## 6. The field: `fitSunField`

```ts
type SunField = {
  readonly bounds: LonLatBounds;  readonly width: number;  readonly height: number;   // grid cells
  readonly gx: Float32Array;  readonly gy: Float32Array;  readonly confidence: Float32Array;
};
fitSunField(opts: { imagery: SurfaceImagerySource; height: HeightSource;
                    region: LonLatBounds; sunFit: AlbedoRecipe['sunFit'] }): Promise<SunField>
constantSunField(bounds: LonLatBounds, g: readonly [number, number]): SunField   // the bench's manual sun
sampleSunField(field: SunField, lon: number, lat: number): readonly [gx: number, gy: number]
```

- **Windows**: `windowKm` squares every `strideKm`, on the sphere. Longitude spans scale by
  `1/cos(lat)`, and no windows are placed poleward of `|lat| > 88°`.
- **Fill**: `g(p) = Σ wᵢ cᵢ gᵢ / (Σ wᵢ cᵢ + PRIOR_WEIGHT)` over windows with `cᵢ ≥ minConfidence`,
  where `wᵢ` is a Gaussian of great-circle distance with σ = `fillSigmaKm`. Where evidence is sparse,
  `g` shrinks to 0 (no correction) instead of extrapolating.
- **Regional = global**: `fitSunField` grows `region` internally by `3·fillSigmaKm + windowKm`
  (clamped to the globe) before reading, so the field it returns over `region` equals the global
  field there. The bench passes its view and the bake passes the globe; neither computes a margin.
  This equality is tested, and it is what makes the bench honest.
- **Memory**: the canvas is read and fitted in latitude bands of `windowKm` plus a stride, so memory
  is bounded by one band plus the field, never the full 16384×8192 canvas.

## 7. The recipe

`tools/textures/surfaceBodies/marsAlbedoRecipe.json`, typed `AlbedoRecipe`, read through
`parseAlbedoRecipe`, which throws on a missing, extra or non-finite field.

```ts
type AlbedoRecipe = {
  readonly version: 1;
  readonly sunFit: {
    windowKm: number;
    strideKm: number;
    highPassKm: number;
    minConfidence: number;
    fillSigmaKm: number;
  };
  readonly deshade: { strength: number; minShading: number }; // divide by max(minShading, 1 + strength·g·s)
  readonly knee: { threshold: number; softness: number }; // linear luminance
  readonly ice: {
    minAbsLatDeg: number;
    fadeDeg: number;
    minWhiteness: number;
    minLuminance: number;
  };
  readonly grade: {
    exposureEv: number;
    gain: readonly [number, number, number];
    offset: readonly [number, number, number];
    contrast: number;
    saturation: number;
    gamma: number;
  };
};
```

## 8. The pipeline: `applyAlbedoRecipe`

Pure. RGBA bytes plus the per-pixel slopes, `g`, and latitude go in; RGBA bytes come out. Alpha passes
through, and alpha-0 pixels are untouched. Luminance steps scale RGB by one ratio, so hue is kept.

1. **Linearise** (sRGB decode) and take `Y`.
2. **De-shade**: `Y₁ = Y / max(minShading, 1 + strength·g·s)`.
3. **Knee**: above `threshold`, `Y₂ = t + (Y₁ − t) / (1 + softness·(Y₁ − t)/(1 − t))`.
4. **Ice keep**: `w = smoothstep(minAbsLatDeg, minAbsLatDeg + fadeDeg, |lat|)
· smoothstep(minWhiteness, minWhiteness + ICE_SOFT, min/max RGB)
· smoothstep(minLuminance, minLuminance + ICE_SOFT, Y)`. The ratio becomes
   `q = Y₂/Y + (1 − Y₂/Y)·w`, so ice keeps its original luminance.
5. **Scale** linear RGB by `q`, then encode to sRGB.
6. **Grade**, in sRGB-encoded space (perceptual controls, as in the prototype):
   `·2^exposureEv → ·gain + offset → (v − 0.5)·contrast + 0.5 → saturation around Rec. 709 luma → v^(1/gamma)`,
   then clamped.

`applyAlbedoRecipe` takes `AlbedoApply = Omit<AlbedoRecipe, 'version' | 'sunFit'>`: the fit
parameters reach the pixels only through the field, so the type cannot carry a second copy of them.

The neutral recipe (`strength 0`, knee `threshold 1`, neutral grade) returns the input bytes exactly.

## 9. The decorator: `albedoRecipeImagerySource`

```ts
albedoRecipeImagerySource(primary: SurfaceImagerySource, height: HeightSource,
                          field: SunField, apply: AlbedoApply): SurfaceImagerySource
```

- **Identity fields** are copied verbatim from `primary`.
- **`readBox`** reads `primary`, reads the `SLOPE_LEVEL` posts covering the box with a one-post
  margin, and runs `applyAlbedoRecipe` per pixel.
- **No seams**: slopes and `g` are sampled by lon/lat from global lattices, so two adjacent boxes
  agree along their shared edge.
- **The caller owns the field** (the bake fits the globe once; the bench fits its view). A box
  not inside `field.bounds` throws, so a mis-sized field cannot clamp silently.
- **Wiring** into `marsSurfaceBake` is F4's.

## 10. The bench: `tools/albedo-bench/`

- **Layout**: modelled on `tools/famous-curator/` (vite config, `plugin/` routes, React `ui/`).
  `npm run albedo-bench`, port `DEV_PORTS.albedoBench = 5700`. The Viking and MOLA sources are built
  from `marsGlobalRasters`.
- **Routes**:
  - `POST /api/render {box, px, recipe, variant: 'original'|'adjusted', light?: {azDeg, elDeg}, manualG?}`
    returns a PNG. `adjusted` goes through `albedoRecipeImagerySource`. `light` multiplies by an
    Oren–Nayar preview (roughness 0.9, ambient 0.08, normalised so flat ground under an overhead sun
    is 1). `manualG` swaps in `constantSunField`, so the decorator has no manual branch.
  - `POST /api/field {box, sunFit}` returns the view field as arrows `{lon, lat, gx, gy, confidence}[]`.
  - `GET /api/recipe` returns the committed recipe.
  - `POST /api/recipe` validates through `parseAlbedoRecipe` and writes the JSON (2-space, trailing
    newline).
- **Field cache**: keyed by `(region, sunFit)`, so moving a grade slider never refits.
- **Preview lighting constants**: `marsSurfaceParams` / `bodyAmbientLight` live only on #743,
  so the preview's roughness 0.9 and ambient 0.08 start as UI slider defaults (preview only, never
  baked). F4 points them at `MARS_SURFACE_SHADING` after it merges.
- **UI**:
  - a lon/lat/zoom navigator with preset views (Gale, a polar cap edge, a known seam);
  - original vs adjusted as wipe, side by side, or flip;
  - the arrow overlay (length ∝ |g|, opacity ∝ confidence);
  - a fitted/manual toggle;
  - lighting preview controls;
  - sliders for every recipe field;
  - **Save**.

## 11. Success criteria

- **Seams**: at Gale and at one Viking strip seam, the adjusted view shows visibly less crater-rim
  shading than the original, with no tile seams (user eye check).
- **Ice**: the polar cap stays bright and white under the adjusted recipe.
- **Round trip**: Save writes `marsAlbedoRecipe.json`; reloading the bench restores every slider.
- **Same pixels**: the bench's `adjusted` render of a box and a bake-style `readBox` of the same box
  with the global field are byte-identical inside the margin (test).

## 12. Out of scope

- a flatten step;
- HiRISE orthos;
- a stored field;
- per-strip piecewise fits;
- base-globe rebuild and `marsSurfaceBake` wiring (F4);
- extending Viking to z8 (F4).

**Known limit:** 463 m MOLA cannot de-shade craters below about 1 km.
