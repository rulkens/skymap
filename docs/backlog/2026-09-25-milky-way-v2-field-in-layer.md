# Draw the v2 analytic Milky Way field in the `milkyWay` Layer, beside v1

`needs-design`, but the design is mostly ruled. It was brainstormed on 2026-09-25 in the
`milky-way-layer-v2` worktree, then deferred when that effort was cut down to the v1
port (`docs/superpowers/specs/completed/2026-09-25-milky-way-layer-design.md`). This is Track C
of `docs/research/engine/decisions.md`, with one change: v1 is kept for a
side-by-side comparison rather than being deleted in the same effort.

## Rulings already made (user, 2026-09-25)

- **Comparison:** a DebugPanel-only toggle `settings.milkyWay.renderer: 'v1' | 'v2' | 'both'`,
  defaulting to `v1`. There is no split-screen.
- **v1 dust is off whenever v2 is on.** So `'both'` means v1 stars plus the whole v2 field,
  and v2 brings its own dust map.
- **Scope:** everything the tool draws, which is the emission field, the dust map, the HII
  tiers, the ISM fluid map, and the arm and spur clouds.
- **The host is shared.** The code that drives `GalaxyFieldRenderer` is promoted from
  `tools/galaxy-renderer` into `src/services/gpu/renderers/galaxyField/host/`, and the tool
  imports it back. This means there is one host rather than a Layer-private copy.
- **App knobs:** exposure, dust on/off, and per-target divisors. The tool stays the deep
  tuning surface.
- **Build on today's Layer contract.** The declarative frame program migrates it later.

Still open: whether `'both'` sums to about twice the light, or halves each renderer (grill Q1,
unanswered); and whether the settings shape is flat v1 knobs plus a `field` group, or
nested `sprites` and `field`.

## Missing joints (refactor-ground, 2026-09-25)

1. **The field camera is private and symmetric, and has no model frame.**
   `packFieldUniforms.ts:131-159` packs `eye`, a basis, `tanHalfFov`, `aspect` and
   `lensShiftX`. `splatSilhouette.wesl:47` and `camera.wesl:163` rebuild the projection
   from those. The field shaders assume the galaxy frame: centre at the origin, disc in xz,
   +Y as the pole. Examples are `ismCartesianUv`, the dust-map noise stretch, and `|eye|`
   used as the distance to the centre. Nothing carries a model matrix.
   The fix is a `FieldView`: an eye and a basis in the galaxy frame
   (`milkyWayCamPosModel`, and the inverse rotation of `milkyWayModelMatrix`), plus
   `ViewFrustum` tangents so dome faces and VR eyes work. The tool would pass the identity.
   This extends [field uniforms per view](2026-09-22-field-uniforms-per-view.md).
2. **The renderer takes a `GPUTexture`.** It reads only `.width`/`.height`, calls
   `createView()`, and uses `dustMapTex` identity as a cache key
   (`createGalaxyFieldRenderer.ts:349-465`). `RenderTargets` exposes no textures.
   The fix is `{ view, sizePx }` pairs, with the cache key moved onto the view, which is
   identity-stable until reallocation.
3. **The host lives in the tool.** These pieces need promoting:
   - `mixtureInput`, `setFieldTuning`, `stepIsmMap` and `invMeanNormFor`, from
     `createGalaxyModel.ts`;
   - the frame-lane half of `deriveFrameView.ts`, including `FIELD_EXPOSURE_GAUGE`;
   - the ISM-map readback stream, from `createIsmMapReadbacks.ts`, with
     `createReadbackQueue` and `decodeIsmMapTexels`;
   - `encodeSceneComposites`;
   - the field defaults from `defaultRenderSettings.ts`, as one `src/data` calibration row.

   **The ISM readback is required for a correct image.** It sets
   `youngStars.invMeanNorm`, so the comment at `createGalaxyModel.ts:450-454` calling it
   "diagnostics-only" is stale.

## Seams that already exist

- **A per-view `ContentCompute`** (`scope: 'perView'`) can open its own passes.
  `aerialPerspectiveCompute` is the precedent. Each perView view is its own submit, so the
  field's header writes are safe without a uniform ring.
- **A planner** runs `stepIsmMap` before the frame encoder exists, since once-plan rows run
  first.
- **Target rows** can take `scale: (state) => divisor`.
- **Compositing:** one upsample `ContentPass` can loop over up to five source targets,
  because `Upsample.draw(pass, srcView)` rebinds per draw. It has to gate on the same
  `findHiiSegment` facts that the encode used.
- **Timing:** the app gives the compute one `mw-field` slot, rather than the renderer's
  per-sub-pass slots.

## Watch

- **Compute-written targets are invisible** to `touched`/`frameRendered` and to
  `checkFrameOrder` (`executeFrame.ts:231,338`). A `{kind:'composite'}` line reading them
  would be skipped silently.
- **Nobody has measured cost at app resolutions.** The only recorded number is the tool's
  field pass: 2.5-3 ms at the sprite divisor, under 1 ms at divisor 5. Run `npm run perf`
  with v2 off and on.
- **One discriminant read:** the greenfield cross-check proposed a `MILKY_WAY_PARTS`
  record (`renderer → { v1Stars, v1Dust, v2 }`) as the only reader of `renderer`, plus a
  `FIELD_TARGETS` table that the target rows and the composite list are both derived from.
