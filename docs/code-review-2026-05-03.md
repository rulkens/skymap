# Skymap Code Review — 2026-05-03

## High-level take

This is a tight, well-organised codebase for its size (~17 commits / 4–6 hours). The didactic comment style is consistently applied and genuinely useful — the WGSL uniform-layout discussion in `points.wgsl` and `pointRenderer.ts`, and the rejection-sampling justification in `synthetic.ts`, are the kind of thing that pays for itself the next time someone touches the code. Math (forward + inverse coords, std140 alignment, perspectiveZO) is correct. The engine ↔ React seam is clean: callbacks-based, deduplicated, no leak of WebGPU types into the React tree. **No blockers.** A handful of minor correctness issues and a few duplications are worth a follow-up pass.

## Strengths

- Clear seam between imperative engine (`engine.ts`) and React UI; callbacks fire only on actual change, so direct `setState` passing is safe.
- Pick pipeline correctly differentiates from visual: `r32uint` target, depth attachment with `depthCompare:'less' + depthWriteEnabled:true`, no blend (correctly — integer formats can't blend), 1-based encoding so `0 = empty sky`.
- WGSL uniform struct uses scalar-u32 padding rather than `vec3<u32>` — the comment correctly identifies why this matters and avoids an 8-byte gap. Same care is taken on the JS side (96 bytes total, both Float32 and Uint32 views over the same buffer).
- `cartesianToRaDecZ` is a proper inverse with a round-trip test (`tests/coords.test.ts:45`), with the `[-1,1]` clamp on `asin` and `[0, 360)` wrap on `atan2`.
- Binary format v2: header sanity-check + version-mismatch error pointing at the `csv-to-bin` regen step. 64-bit objIDs survive as `bigint` (test asserts a value > MAX_SAFE_INTEGER).
- React lifecycle is honest: empty-deps `useEffect` for one-shot engine startup, `destroy()` cancels RAF, removes window/canvas listeners, releases pick textures + staging buffer. Conscious decision to skip StrictMode is documented.
- `attachOrbitControls` registers + returns a teardown closure; pointer capture is correctly used to keep drags alive when the cursor leaves the canvas.
- `noUncheckedIndexedAccess` is taken seriously throughout — every `arr[i]` is followed by `!` with a comment when the bound is provable, or by a guard when it isn't.
- Project preferences honoured: no `interface` declarations remain in source (only in two doc comments — one of which annotates the convention itself).

## Issues, by severity

### [blocker]

None.

### [major]

**1. Pick area for the selected point is 8× too generous**
File: `src/gpu/shaders/points.wgsl:304`, in tandem with `src/gpu/pickRenderer.ts:411` (uniform reuse).

The vertex shader scales billboards by 8× when `ii == u.selectedIndex` (line 304: `let sizeScale = select(1.0, 8.0, isSelected);`). The pick pipeline reuses the _same_ uniform buffer (intentional, see PickRenderer doc), so during a pick pass the selected billboard is also enlarged 8×. Combined with the `r2 > 2.25` forgiveness radius in `fsPick`, the selected point's effective pick area is roughly **12× larger** than every other point's.

User-visible consequence: after selecting a point, you cannot easily click on (or even hover over) anything within the now-huge selection halo — including empty sky right next to the selection, where you'd want to click to deselect.

Recommended fix: gate the size scaling on the visual entry point only. Either pass a separate uniform (e.g. `passKind: u32` 0 = visual, 1 = pick) and skip the scale in pick, or — cheaper — write `0xFFFFFFFF` to `selectedIndex` in the uniform buffer for the duration of a pick pass and restore it after. The PickRenderer can take an extra optional argument and overwrite + restore the four bytes at offset 80.

**2. `setHovered`'s nested change-check is dead code**
File: `src/engine.ts:497-506`.

```ts
function setHovered(idx: number | null): void {
  if (idx === hoveredIndex) return;          // (1) early-return on no change
  const prev = hoveredIndex;
  hoveredIndex = idx;
  if (prev !== idx) {                        // (2) always true here
    cb.onHoverChange(...);
  }
}
```

`prev !== idx` is necessarily `true` after the early-return at (1), so (2) is dead. Drop the inner `if` and the `prev` capture, or — if there was an intent to compare structurally — explain it. As-is it just confuses the next reader.

**3. `loadCloud` already returns synthetic on failure; the engine's outer `catch` is unreachable**
File: `src/engine.ts:578-591`.

```ts
try {
  const result = await loadCloud();
  cloud = result.cloud;
  source = result.source;
} catch (err) {
  console.warn('Unexpected error in loadCloud; using synthetic cloud.', err);
  cloud = generateSyntheticCloud(100_000);
  source = 'synthetic';
  loadErr = err;
}
```

`loadCloud` (line 311) catches its own errors and always resolves to `{ cloud, source }`. The outer `catch` will never run. Either remove it (and the `loadErr` plumbing), or move the try/catch _inside_ `loadCloud` — pick one layer of fallback, not two. Right now the doc comment promises a behaviour the code can't reach.

**4. `engine.ts` and `InfoCard.tsx` carry near-duplicate `formatDistance` / `formatMpc`**
Files: `src/engine.ts:294-298`, `src/components/InfoCard.tsx:368-372`.

Both switch units at the same Mpc thresholds, but disagree on rounding (`engine.ts` uses `toLocaleString()` on a raw Mpc value; `InfoCard.tsx` rounds first). Move one canonical implementation into `src/data/physics.ts` (which the engine already imports from heavily and which tests already cover). Two implementations will drift; this is the kind of thing that ends up with the scale bar saying "542 Mpc" while the card says "543 Mpc" for the same value.

### [minor]

**5. `addWindowListener` cast loses precision for `pointerup` / `pointercancel`**
File: `src/engine.ts:651-657`.

```ts
addWindowListener('pointerup', () => {
  pointerDown = false;
});
```

The generic helper at line 454 is correctly typed (`<K extends keyof WindowEventMap>`) but `pointerup`/`pointercancel` should preserve the `PointerEvent` type — currently fine because the body is `() => …`, but the moment someone reads `e.pointerId` in there (which they probably will, to scope by pointerId), they'll have to cast. Pre-emptively narrow.

**6. Click handler `.then(...)` swallows pick errors**
File: `src/engine.ts:682-685`.

```ts
pickRendererHandle
  .pick(...)
  .then((idx) => { setSelected(idx === -1 ? null : idx); });
```

No `.catch`. If `mapAsync` rejects (device loss, validation error from a stale buffer), the error will surface as an unhandled promise rejection in the console and the `inFlight` flag in PickRenderer is correctly cleared by its own `finally`, but the engine will be silent. Add `.catch((e) => console.warn('pick failed', e))` — same treatment as the hover path's `.finally`.

**7. Pick concurrency guard reuses a single staging buffer**
File: `src/gpu/pickRenderer.ts:233, 297-422`.

The `inFlight` flag prevents validation errors when a pick is fired while the previous one is still mapped. Fine. But: on a _click_, if a hover pick was in flight at the moment of pointerup, the click is silently dropped (`pick()` returns `-1`). The engine's `setSelected(idx === -1 ? null : idx)` will then _clear_ the user's existing selection. Reproducer: select a point; quickly hover-then-click another point while the hover readback is still pending → selection vanishes instead of switching.

Fix options: (a) queue the click pick and run it after the hover one, or (b) have the engine treat `-1` as "ignore" rather than "deselect" when it came from a click that raced an in-flight hover. Option (b) is one line in the engine.

**8. `pickRenderer.pick` allocates a fresh BindGroup every call**
File: `src/gpu/pickRenderer.ts:368-371`.

The bind group is rebuilt from `pipeline.getBindGroupLayout(0)` on every pick, even though the underlying buffer never changes for the lifetime of the renderer. The doc-comment justifies this by noting the buffer _could_ change, but in practice it never does. At ~60 picks/s the allocation isn't observable, but at high mouse-move rates with throttling off it adds up. Cache the bind group; rebuild only if `sharedUniformBuffer` reference changes.

**9. `niceRound` rounds down only — Mpc → kpc transition is inconsistent**
File: `src/engine.ts:273-283` and `formatDistance` at 294.

`niceRound` floors to {1,2,5}×10^k, then `formatDistance` switches to `kpc` at `mpc < 1`. `niceRound(1.4)` → 1, `formatDistance(1)` → "1 Mpc"; `niceRound(0.9)` → 0.5, `formatDistance(0.5)` → "500 kpc". This is fine for a scale bar legend but the boundary at 1 Mpc means the bar's pixel width can change discontinuously across the unit transition. Probably fine — documenting it here as something to verify visually rather than as a bug.

**10. PointRenderer's vertex buffer reuse mismatch on `count` shrinkage**
File: `src/gpu/pointRenderer.ts:357-409`.

`upload()` always destroys + recreates the buffer (correctly, per the doc-comment). But the _pick_ renderer's `pick()` is called with a `count` argument that could go stale if upload happens between calls. The current engine only calls `upload()` once at startup, so this is theoretical, but with the multi-survey plan introducing a `setSourceMask` (which the plan says will _not_ re-upload — good), we should make sure no future code paths call `upload()` again without invalidating any in-flight pick. A guard or a generation counter would be cheap insurance.

**11. `PointRenderer.uniformBuffer_internal` underscore-suffix naming is unusual**
File: `src/gpu/pointRenderer.ts:116-164`.

The class has `_vertexBuffer` (leading underscore — common convention) but `uniformBuffer_internal` (trailing `_internal`) for the same purpose. Harmonise: pick one and apply consistently. Both have public getters above them, which suggests these could just be `private uniformBuffer` with an explicit `getUniformBuffer()` method instead — but the getter approach is fine, just keep the naming uniform.

**12. `App.tsx` uses both `handleRef` and the engine's own Esc handler**
Files: `src/App.tsx:155-173`, `src/engine.ts:694-696`.

Esc clears selection in two places: the engine's window keydown listener (engine.ts:694), and an App-level keydown that calls `handleRef.current?.clearSelection()`. Both are correct and idempotent (the second `setSelected(null)` is a no-op). But the duplication is itself an architectural smell — `clearSelection()` on the handle is the supported public API; the engine's internal listener should probably be removed since the React layer is now the canonical owner of UI shortcuts. Or keep the engine-level one and drop the App-level effect. The comment at engine.ts:691-693 acknowledges this; just pick one.

### [nit]

**13. Doc comment on `OrbitCamera` says "yaw=0 → +Z" which contradicts the test name "places the camera at +z"**
File: `src/camera/orbitCamera.ts:25`. The test (`tests/orbitCamera.test.ts:6`) says "+z" lowercase too. Both are correct — note for self.

**14. `sdssExplorerUrl` builds an `http://` URL, not `https://`**
File: `src/data/physics.ts:476-478`. SkyServer DR18 supports HTTPS. Mixed-content warnings will fire if the app is itself served over HTTPS. Cheap fix.

**15. Same applies to `sdssThumbnailUrl`**
File: `src/data/physics.ts:507-510`. The `<img>` tag will trigger mixed-content blocking on HTTPS deployments; the thumbnail will silently fail to load and trip the `onError` placeholder.

**16. `niceRound`'s comment says "rounds 0.07 → 0.05" — verify**
File: `src/engine.ts:267`. `Math.log10(0.07) ≈ -1.155`, `Math.floor(-1.155) = -2`, `power = 0.01`, `mantissa = 7`. So `niceMantissa = 5`, output `0.05`. Comment is correct — leaving as a nit because the comment could be a sentence shorter to make the example more obviously a worked check.

**17. `engine.ts:565-567`: `resizeCanvasToDisplay(canvas)` is called before `initGpu`, but `initGpu` doesn't use canvas size; it calls `context.configure()` which derives size from the canvas at next `getCurrentTexture()`**
This is fine, but the comment ("`getCurrentTexture()` may return a 300×150 default") is slightly misleading — `getCurrentTexture()` returns whatever the canvas backing-store size was at the time. The pre-resize is still good practice; just clarify.

**18. `decomposeSexagesimal` and `decomposeSexagesimalTrunc` are nearly identical**
File: `src/data/physics.ts:91-110, 192-210`. They differ only in `Math.round` vs `Math.trunc`. Parameterise: `decomposeSexagesimal(value, subunitFactor, mode: 'round' | 'trunc')`. Saves 20 lines without losing clarity.

## Suggestions (non-blocking)

- **Consider extracting the engine's "buildPointInfo" into `src/data/physics.ts`** alongside the formatters. It's the only meaningful logic outside the per-frame path that lives in `engine.ts`, and moving it would let it be unit-tested without mocking the engine.
- **The `loadCloud` URL `/data/sdss.bin` is hardcoded.** A `?bin=...` query parameter override would let you A/B different builds without rebuilding the bundle. Not urgent.
- **`engine.ts` has `latestMouseCss !== lastPickedMouseCss` reference comparison** for hover dedup. Works, but is fragile: any future refactor that reuses a single `MousePos` object (mutating it instead of allocating) silently breaks the throttle. Add a short comment, or compare the actual `x/y` numbers.
- **`PointRenderer.draw` allocates a 96-byte `ArrayBuffer` every frame** (line 477). Reuse a single per-instance scratch buffer to drop the allocation.
- **`pickRenderer.pick` clamps coordinates with `Math.floor(pickXPx)`** — but the caller already passes `cssToTexPx(xCss)` which is already a CSS-pixels × DPR float. If `pickXPx` is e.g. 100.7 and the texture is 100×100, the clamp to 99 is correct, but rounding (not flooring) might be more intuitive at the high-DPR boundary. Minor visual nit at fractional DPR.
- **The pick renderer has its own `module = device.createShaderModule({ code: shaderSrc })`** rather than reusing PointRenderer's module. Two compilations of the same WGSL on startup is harmless but wasteful — pass the module in.

## Test gaps

The 60 passing tests cover coords, format, camera, and physics well. What's missing and _easily_ testable without a browser:

- **`niceRound` and `formatDistance` (engine.ts)** — these are pure and they drive a user-visible widget. The unit transitions at 1 Mpc and 1000 Mpc are exactly the kind of thing that breaks silently. Move both to a module that can be imported from a test file.
- **`maxAbsCoord` (engine.ts:247)** — a one-liner but exercising the auto-frame is worth it given the test would also document the heuristic.
- **`buildPointInfo` (engine.ts:335)** — given a synthetic cloud + index, assert each derived field. Currently the only check is "does the InfoCard render".
- **`encodePointCloud` rejects mismatched array lengths** — the encoder throws six different `length mismatch` errors (objIDs, positions, magU…magZ). Only the round-trip happy path is tested; one negative test per branch costs ~10 lines and prevents a regression where a future field is added but its check is forgotten.
- **`csvToBin` parser** — currently entirely untested. The header parser, the row-skipping logic (z ≤ 0, NaN bands, missing/zero objID, BigInt parse failures), and the `#`/`--` comment-line filter all live in the script and can be extracted into a `parseCsv` function and tested directly. The multi-survey plan moves toward this anyway (`tools/parsers/sdssCsv.ts`).
- **Selected-state pick-area interaction** — would require a stub WebGPU device, so it's expensive. But you can unit-test the _intent_ by confirming the engine writes `0xFFFFFFFF` to the uniform during pick passes (after fix #1), via a spy on the uniform buffer write.
- **`attachOrbitControls` click-vs-drag threshold** — fire synthetic `pointerdown`/`pointerup` pairs at varying distances and assert `onClick` fires at ≤ 4px and not at > 4px. The DOM API is available in jsdom-equivalent environments; a single test would prevent regressions on the threshold.
- **Round-trip stability of `sdssName` for many random RA/Dec** — the truncation rules are subtle (the existing test catches the 188.7365 float-precision case) and a property-style sweep would lock them in.
