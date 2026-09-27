# Albedo bench — plan

**Spec:** `docs/superpowers/specs/2026-09-17-albedo-bench-design.md`. **Branch:** `worktree-albedo-bench`
(off `38854045c`, prep #749 merged). **Process:** lean SDD (`sdd-execution.md`), tools only, so no perf
gate.

**Every brief carries:**

- **Comments:** ≤ 5-line module header, comment lines ≤ half the code lines, why not what.
- **Style:** `type` aliases only; one symbol per file in `utils/` and `@types`-style `.d.ts`.
- **Ready-made helpers**: the Mars radius comes from existing body data (find it with
  `grep -rn "mars" src/data/bodies/bodyFacts.generated.ts`), never a new literal. The blur is
  `tools/utils/image/gaussianBlurFloat32.ts`, and the grids are
  `tools/textures/surfaceBodies/marsGlobalRasters.ts`.

Dispatch grouping (controller): **D1** = T1–T4 (the fit), **D2** = T5–T6 (pixels + decorator),
**D3** = T7–T9 (bench + docs).

---

### Task 1: The recipe contract

**Files:**

- `tools/textures/AlbedoRecipe.d.ts`, `tools/textures/AlbedoApply.d.ts` (new)
- `tools/textures/parseAlbedoRecipe.ts` (new)
- `tools/textures/surfaceBodies/marsAlbedoRecipe.json` (new)
- `tests/tools/textures/parseAlbedoRecipe.test.ts` (new)

**Types:** exactly spec §7 `AlbedoRecipe`; `AlbedoApply = Omit<AlbedoRecipe, 'version' | 'sunFit'>`.
**Signature:** `parseAlbedoRecipe(json: string): AlbedoRecipe`. It throws, naming the key path, on a
missing key, an extra key, a non-finite number, a wrong tuple length, or `version !== 1`.

**Committed recipe** (starting values, retuned in the bench):

- `sunFit {windowKm 40, strideKm 20, highPassKm 15, minConfidence 0.2, fillSigmaKm 60}`
- `deshade {strength 1, minShading 0.3}`
- `knee {threshold 0.6, softness 1}`
- `ice {minAbsLatDeg 55, fadeDeg 8, minWhiteness 0.6, minLuminance 0.35}`
- `grade {exposureEv 0, gain [1,1,1], offset [0,0,0], contrast 1, saturation 1, gamma 1}`

- [ ] Test `parses the committed Mars recipe` (reads the JSON file from disk).
- [ ] Test `rejects a missing key, an extra key, NaN, and a 2-tuple gain`: four cases, and each
      error message names the key path.
- [ ] Implement, then commit.

### Task 2: Slopes from height posts

**Files:**

- `tools/textures/SlopeLattice.d.ts` (new)
- `tools/utils/textures/slopeLatticeFromPosts.ts`, `tools/utils/textures/sampleSlope.ts` (new)
- `tools/textures/readSlopeLattice.ts` (new)
- tests mirroring each of those three files

**Contract:**

```ts
type SlopeLattice = { readonly west: number; readonly north: number; readonly stepDeg: number;
  readonly nx: number; readonly ny: number; readonly sx: Float32Array; readonly sy: Float32Array };
slopeLatticeFromPosts(posts: Float32Array, nx: number, ny: number, west: number, north: number,
                      stepDeg: number, radiusM: number): SlopeLattice   // central differences, m/m; edge rows one-sided
sampleSlope(lattice: SlopeLattice, lon: number, lat: number): readonly [sx: number, sy: number]  // bilinear
readSlopeLattice(height: HeightSource, box: LonLatBounds): Promise<SlopeLattice>
```

**Behaviour:**

- **Units and signs**: `sx` is +east-up, `sy` is +north-up. The east spacing is
  `radiusM·cos(lat)·stepDeg·π/180`.
- **Posts read**: `readSlopeLattice` reads `SLOPE_LEVEL = 8` posts covering `box` plus one post on
  every side through `height.readGrid`. It throws on a NaN post inside the box.

- [ ] Test `a plane rising 1 m per 100 m east gives sx 0.01, sy 0 at 30°N` (checks the `cos(lat)`
      factor).
- [ ] Test `sampleSlope interpolates between posts and matches a post exactly at the post`.
- [ ] Test `readSlopeLattice slopes agree across two adjacent boxes at the shared edge`, using an
      in-memory `HeightSource` fake of an analytic surface.
- [ ] Implement, then commit.

### Task 3: One window's shading gradient

**Files:** `tools/utils/textures/fitShadingGradient.ts` (new) + test.

**Signature:**
`fitShadingGradient(y: Float32Array, sx: Float32Array, sy: Float32Array, weight: Float32Array): { gx: number; gy: number; confidence: number }`

The inputs are already high-passed, and `y` is already divided by the window's mean luminance, both
done by the caller. The function runs a weighted least squares of `y` on `(sx, sy)`, and computes
confidence as `R² · min(1, var(s)/SLOPE_VARIANCE_REF)`, clamped to `[0, 1]`. A singular system gives
confidence 0.

- [ ] Test `recovers a planted g = (0.8, −0.3) from random slopes within 2%`.
- [ ] Test `planted g with independent albedo noise (σ 0.1) still recovers within 10%, confidence > 0.3`.
- [ ] Test `flat terrain (all slopes 0) returns confidence 0, not NaN`.
- [ ] Implement, then commit.

### Task 4: The field

**Files:**

- `tools/textures/SunField.d.ts` (new)
- `tools/textures/fitSunField.ts` (new)
- `tools/utils/textures/constantSunField.ts`, `tools/utils/textures/sampleSunField.ts` (new)
- tests for all three

**Signatures:** exactly spec §6.

**Behaviour** (carry these, don't re-read the spec):

- **Canvas**: `FIT_CANVAS_LEVEL = 5`. `imagery.readBox` fills the canvas at that level's pixel size,
  in latitude bands of `windowKm + strideKm`. Luminance is linear (sRGB decode, Rec. 709 weights).
- **Region margin**: the region grows by `3·fillSigmaKm + windowKm`, clamped to ±180/±90.
- **Per window**: high-pass `y` and both slopes with a Gaussian of σ = `highPassKm`, divide by the
  window's mean `y`, weight by alpha, then call `fitShadingGradient`.
- **Window placement**: centres every `strideKm` of great-circle distance in latitude. Longitude steps
  scale by `1/cos(lat)`. No centres poleward of `|lat| > 88°`.
- **Output grid**: `strideKm/2` cells over `region`. Each cell is
  `g = Σ w c g / (Σ w c + PRIOR_WEIGHT)` over windows with `c ≥ minConfidence`, where `w` is a
  Gaussian of great-circle distance with σ = `fillSigmaKm`. `confidence` = `Σ w c / (Σ w + ε)`.
- **Sampling**: `sampleSunField` is bilinear by lon/lat. `constantSunField` builds a 2×2 grid.
- **Test fakes**: an in-memory `SurfaceImagerySource` and `HeightSource` rendering an analytic
  terrain lit by a known `g`.

- [ ] Test `recovers the planted uniform g at the region centre within 10%`.
- [ ] Test `regional field equals the field of a 3× larger region inside the smaller region (max |Δg| < 1e-4)`.
- [ ] Test `a region of flat terrain yields g = 0 everywhere, not NaN`.
- [ ] Implement, then commit.

### Task 5: The pixel pipeline

**Files:**

- `tools/utils/textures/applyAlbedoRecipe.ts`, `kneeLuminance.ts`, `iceKeepWeight.ts`, `gradeSrgb.ts`
  (new, under `tools/utils/textures/`)
- plus `srgbToLinear.ts` / `linearToSrgb.ts` under `tools/utils/color/`, unless an equivalent already
  exists (`grep -rn "2.4" src/utils/color tools/utils` first)
- tests

**Signature:**
`applyAlbedoRecipe(rgba: Uint8Array, width: number, height: number, sample: (px: number, py: number) => { sx: number; sy: number; gx: number; gy: number; latDeg: number }, apply: AlbedoApply): Uint8Array`

**Steps:** exactly spec §8 steps 1–6. Copied here:

1. Linearise; `Y = 0.2126R + 0.7152G + 0.0722B`.
2. `Y₁ = Y / max(minShading, 1 + strength·(gx·sx + gy·sy))`.
3. Above `t = threshold`: `Y₂ = t + (Y₁−t)/(1 + softness·(Y₁−t)/(1−t))`.
4. `w = smoothstep(minAbsLatDeg, minAbsLatDeg+fadeDeg, |lat|) · smoothstep(minWhiteness, minWhiteness+ICE_SOFT, min/max RGB) · smoothstep(minLuminance, minLuminance+ICE_SOFT, Y)`,
   with `ICE_SOFT = 0.2`. Then `q = Y₂/Y + (1 − Y₂/Y)·w`.
5. Scale linear RGB by `q`, then encode to sRGB.
6. Grade in sRGB space: `·2^ev → ·gain+offset → (v−0.5)·contrast+0.5 → saturation around 709 luma → v^(1/gamma)`,
   clamp, round.

Alpha is copied, and alpha-0 pixels are copied untouched. `Y = 0` guards to ratio 1.

- [ ] Test `neutral apply returns the input bytes exactly` (all 256 grey levels plus random RGB).
- [ ] Test `a synthetic flat-albedo image shaded by (1 + g·s) de-shades to constant luminance within 1 DN`.
- [ ] Test `a white bright pixel at 80°S is unchanged by the knee; the same pixel at 10°N is compressed`.
- [ ] Test `knee leaves luminance below threshold untouched and is monotonic above it`.
- [ ] Test `saturation 0 yields R = G = B`.
- [ ] Implement, then commit.

### Task 6: The decorator

**Files:** `tools/textures/albedoRecipeImagerySource.ts` (new) + test.

**Signature:** spec §9: `albedoRecipeImagerySource(primary, height, field, apply): SurfaceImagerySource`.

**Behaviour:**

- **Identity fields** are copied verbatim from `primary`.
- **`readBox`**:
  - A `null` from `primary` passes through.
  - A box not inside `field.bounds` throws.
  - Otherwise it calls `readSlopeLattice(height, box)`, then `applyAlbedoRecipe` with a sampler at
    each pixel centre.
- **Pattern to follow**: `colourMatchedImagerySource.ts`'s `readBox` pixel-centre lon/lat maths.

- [ ] Test `reading a box equals reading its west and east halves side by side (≤ 1 DN)`, with the T4
      fakes.
- [ ] Test `a box outside the field bounds throws`.
- [ ] Implement, then commit.

### Task 7: Bench server

**Files:**

- `tools/albedo-bench/vite.config.ts`
- `tools/albedo-bench/plugin/apiPlugin.ts`
- `tools/albedo-bench/plugin/routes/{render,field,recipe}.ts`
- `tools/albedo-bench/plugin/orenNayarPreview.ts`
- `tools/utils/io/devPorts.ts` (`albedoBench: 5700`)
- `package.json` (`"albedo-bench": "vite --config tools/albedo-bench/vite.config.ts"`)
- `tests/tools/albedo-bench/routes/{render,recipe}.test.ts`

**Pattern:** `tools/famous-curator/` (vite config, `restartOnPluginChange`, `tools/utils/http/*` helpers).

**Routes** (spec §10, carried here):

- `POST /api/render {box, px, apply, variant, light?, manualG?}` returns `image/png`.
  - Sources: `geoTiffImagerySource` over `VIKING_MDIM21_GRID` and `geoTiffHeightSource` over
    `MOLA_DEM463`.
  - `adjusted` goes through `albedoRecipeImagerySource`, with the field from `fitSunField({region: box})`
    or `constantSunField(box, manualG)`.
  - `light {azDeg, elDeg, roughness, ambient}` multiplies by `orenNayarPreview`, normalised so flat
    ground under an overhead sun is 1. Its formula is in the prototype, `shadeFactor` in
    `mars-terrain-feature/.superpowers/sdd/2026-09-17-terrain-f4-mars/albedo-bench-prototype/lightjs.txt:139`.
- `POST /api/field {box, sunFit}` returns `{arrows: {lon, lat, gx, gy, confidence}[]}` at field cell
  centres.
- `GET /api/recipe` returns the committed recipe.
- `POST /api/recipe` runs `parseAlbedoRecipe` and writes 2-space JSON with a trailing newline.
- **Field cache** in the plugin process, keyed by `JSON.stringify({box, sunFit})`, holding the last 8
  entries.

- [ ] Test `POST /api/recipe rejects an invalid body with 400 and leaves the file unchanged` (temp
      recipe path injected).
- [ ] Test `render 'adjusted' bytes equal the decorator's readBox with a field fitted over a 3× larger region, inside the box` (T4 fakes injected).
- [ ] Implement, then commit.

### Task 8: Bench UI

**Files:** `tools/albedo-bench/ui/{index.html,main.tsx,App.tsx,styles.css,api.ts}` and
`tools/albedo-bench/ui/components/*.tsx`. No tests (UI; the smoke pass covers it).

**Surfaces:**

- lon/lat/span navigator with presets Gale (137.4, −4.6), south polar cap edge (0, −78), and a Viking
  strip seam picked at the eye check;
- a view mode of wipe, side by side, or flip;
- an arrow overlay (length ∝ |g|, opacity ∝ confidence) with a fitted/manual toggle and manual
  azimuth/strength inputs;
- a lighting preview toggle with az/el/roughness 0.9/ambient 0.08;
- sliders for every `AlbedoRecipe` field;
- **Save**, which POSTs the recipe; a load restores the sliders from `GET /api/recipe`.

- **Request handling**: render requests are debounced at 150 ms, and a field refit happens only when
  `sunFit` or the view box changes.

- [ ] Implement, then commit.

### Task 9: Docs

**Files:**

- `tools/albedo-bench/README.md` (new: what it's for, `npm run albedo-bench`, the recipe path, the
  known limit that sub-km craters keep their shading)
- `docs/DATA.md` (one line under the Mars sources pointing at the recipe)

- [ ] Write, then commit. No test.

---

## Definition of Done

- **Deliverables**: `AlbedoRecipe`, `AlbedoApply`, `parseAlbedoRecipe`, `marsAlbedoRecipe.json`,
  `SlopeLattice` + `slopeLatticeFromPosts` / `sampleSlope` / `readSlopeLattice`,
  `fitShadingGradient`, `SunField` + `fitSunField` / `constantSunField` / `sampleSunField`,
  `applyAlbedoRecipe` + helpers, `albedoRecipeImagerySource`, `tools/albedo-bench/`,
  `DEV_PORTS.albedoBench`, `npm run albedo-bench`.
- **Smoke** (user):
  1. `npm run albedo-bench` opens on :5700.
  2. At Gale, adjusted shows less crater-rim shading than original, with arrows drawn.
  3. Wipe, side by side and flip all work.
  4. At the south polar cap edge, the ice stays bright and white.
  5. Manual sun changes the adjusted view.
  6. Lighting preview relights adjusted.
  7. Save and reload restores every slider, and `git diff` shows the recipe JSON changed.
- **Deferred**: flatten step, HiRISE orthos, a stored field, per-strip fits, base-globe rebuild and
  `marsSurfaceBake` wiring (F4), Viking to z8 (F4), and pointing the preview defaults at
  `MARS_SURFACE_SHADING` (F4).
