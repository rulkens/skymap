# Depth Fade vs. Deep Catalogs (Milliquas) — Investigation Memo

**Date:** 2026-05-21
**Scope:** diagnose why the default-on "Depth fade" toggle erases almost all Milliquas
quasars past z ≈ 0.2, then map the fix options onto the points pipeline. Triggered by
Milliquas v8 landing (#180) — the catalog reaches z ≈ 7, but depth fade was calibrated
for the GLADE galaxy volume (~1500 Mpc).
**Status:** diagnosis + four ranked options, no committed direction. Each option carries
enough file/line detail + code sketch to spawn its own implementation plan when picked.

---

## 1. Symptom

With "Depth fade" on (its default — `DEFAULT_DEPTH_FADE_ENABLED = true`,
`src/data/defaults.ts:104`), enabling the Milliquas survey shows only the nearest sliver
of the catalog. Everything past z ≈ 0.2–0.3 is perceptually gone; the deep population that
is the entire reason to add a quasar catalog never appears. Beyond z ≈ 1.5–2 the points are
not merely dim — they are culled outright and become **non-clickable** (see §3).

This is not a Milliquas-specific bug so much as Milliquas being the first catalog deep
enough to expose a latent flaw in how depth fade is calculated.

---

## 2. Mechanism (what depth fade does today)

The points vertex stage multiplies each billboard's intensity by a camera-distance
attenuation (`src/services/gpu/shaders/points/vertex.wesl:184-188`):

```wgsl
let FALLOFF_HALF_MPC = 1000.0;
let camDistRel = distanceMpc / FALLOFF_HALF_MPC;   // distanceMpc = |p.position - camPosWorld|
let depthFadeRaw = 1.0 / (1.0 + camDistRel * camDistRel);
let depthFadeMult = select(1.0, depthFadeRaw, u.depthFadeEnabled == 1u);
```

`distanceMpc` is the **camera-to-object** distance, computed at `vertex.wesl:138-139`. The
half-falloff is **hardcoded at 1000 Mpc**. The fade is then folded into the per-instance
intensity alongside the magnitude clamp, brightness slider, Malmquist weights, and the
procedural-disk crossfade (`vertex.wesl:197-203`).

### Why it exists (the legitimate purpose)

Documented at `src/data/defaults.ts:93-104`: the points pass is **pure additive blending**
into an HDR target. With ~2.5M galaxies packed inside ~1500 Mpc, the depth column through
the catalog origin stacks hundreds of overlapping billboards and the centre of the volume
saturates to white regardless of tone-mapping. Depth fade attenuates the back of that pile
so visible structure survives. It is explicitly cosmetic ("additive emission shouldn't
physically care about depth") — but the alternative is the centre obliterating ~half the
catalog volume.

The key point: depth fade is a **galaxy-density anti-saturation hack**, tuned to the GLADE
volume. 1000 Mpc is a galaxy-density number, not a universal one.

---

## 3. Diagnosis

### 3.1 The fade is effectively "attenuate by redshift" in the common view

With the camera near the origin (the normal exploration state — first paint lands inside
the Local Group, #167/#168), `camDist ≈ the object's cosmological distance`. Using the
linear Hubble approximation the renderer already uses
(`src/utils/math/redshiftToDistanceMpc.ts`, `d = 4282.75 · z` Mpc):

| z   | distance | depthFade | quasar mag 18 (base 0.50) | quasar mag 20 (base 0.25) |
|-----|----------|-----------|---------------------------|---------------------------|
| 0.1 | 428 Mpc  | 0.85      | 0.42                      | 0.21                      |
| 0.2 | 857 Mpc  | 0.58      | 0.29                      | 0.14                      |
| 0.3 | 1285 Mpc | 0.38      | 0.19                      | 0.094                     |
| 0.5 | 2141 Mpc | 0.18      | 0.090                     | 0.045                     |
| 1.0 | 4283 Mpc | 0.052     | 0.026                     | 0.013                     |
| 2.0 | 8566 Mpc | 0.013     | 0.0067                    | **culled (< 0.005)**      |

Base intensity is `clamp((22 - magnitude) / 8, 0.05, 1.0)` (`vertex.wesl:197`).

### 3.2 The hard cull makes deep quasars unclickable

There is an invisibility cull at `vertex.wesl:224-227`:

```wgsl
let INVISIBILITY_THRESHOLD = 0.005;
if (intensity < INVISIBILITY_THRESHOLD) {
  out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);   // degenerate verts → primitive dropped
}
```

The pick path shares this exact vertex stage, so a culled quasar is also **non-pickable**
(noted in the cull comment). So past z ≈ 1.5–2 (depending on apparent magnitude) the deep
catalog is not just invisible, it cannot be hovered or clicked — the InfoCard/name sidecar
can never fire for those rows.

### 3.3 Second, compounding flaw: camera-relative + fixed scale dims everything on zoom-out

Because the scale is a fixed 1000 Mpc and the metric is absolute camera distance, **pulling
the camera back to frame the deep catalog dims the entire field, galaxies included.**
Milliquas' framing depth is ~9000 Mpc (`MAX_DIST_MPC`, `src/data/sources.ts`); once the
camera sits thousands of Mpc out, every object — near galaxies and far quasars alike —
exceeds the 1000 Mpc half-falloff and collapses toward zero. Depth fade was meant as a
near/far **contrast** tool but behaves as a global **dimmer** the moment the camera leaves
the local volume.

So there are two distinct defects:
- **D1 — wrong scale for the catalog.** Quasars are sparse (≈880k points spread to z ≈ 7);
  they do not have the additive pile-up that justifies the fade, yet they get the harshest
  attenuation because they are farthest.
- **D2 — global dimming on zoom-out.** The fixed-scale, camera-absolute formula turns a
  contrast tool into a whole-scene dimmer once you pull back far enough to see deep objects.

---

## 4. Plumbing facts that constrain the fix

- **Uniform layout is byte-matched across three files.** The `Uniforms` struct is declared
  in `src/services/gpu/shaders/points/io.wesl:92-180` with explicit offsets; the CPU writes
  are in `src/services/gpu/renderers/pointRenderer.ts:1176-1229` (a `Float32Array` /
  `Uint32Array` over one shared `ArrayBuffer`); the pick path reuses the **same**
  `sharedUniformBuffer` and only patches `selectedPacked` (offset 80) and point-size
  (offset 88) — `src/services/gpu/renderers/pickRenderer.ts:466-495`. Any layout change
  must keep all three in agreement.
- **There is one free 4-byte slot already.** `u32[31]` / **offset 124** (`_pad4`, right after
  `depthFadeEnabled` at offset 120) is written as zero today (`pointRenderer.ts:1201`,
  `io.wesl:143`). A single `f32` (e.g. a focal distance) drops in here with no struct resize
  and no alignment shuffle.
- **A `vec3` does NOT fit cheaply.** `vec3<f32>` needs 16-byte alignment; the leftover
  `_padFade0/_padFade1` f32s (offsets 168/172) are not a contiguous aligned vec3 slot. Adding
  a camera-forward vector means growing the struct by a 16-byte block and bumping
  `UNIFORM_BYTES` + re-verifying pick offsets.
- **Pick parity is automatic for shared-buffer fields.** Because the picker reuses the buffer
  the visual pass wrote, any new uniform the points pass sets (e.g. focal distance) is already
  present at pick time — so the shared vertex stage computes the same fade and the same cull
  for both. (Requires the points pass to run before the pick pass in the frame, which it does.)
- **The camera already carries the focal distance.** `OrbitCamera.distance` is the orbit
  radius = eye-to-look-at-target distance (`src/services/camera/orbitCamera.ts:147`,
  `position = target + distance·dir`). Tweens lerp it smoothly (`cameraTween.ts:89`).
- **Render-on-demand is unaffected.** Camera moves already call `requestRender()`; a fade that
  reads `cam.distance` recomputes only on frames that were already going to render. No new
  wakeups (see `renderScheduler` + the engine frame tail).
- **Per-source uniforms exist.** The `@group(2)` `SourceUniforms` struct is written once per
  source at upload (`sourceCode` + 12 bytes pad, `pointRenderer.ts:564-566`) — a natural home
  for a per-source falloff scale or a "dense" flag if a per-source approach is chosen.
- **Settings threading path.** `depthFadeEnabled` flows
  defaults → `useEngineSettings` → `settingsTable` → `seedSettingsCallbacks` →
  `runFrame` → `pointSpritesPass.ts:96` → `renderer.draw`. Any new scalar follows the same
  route; `drawCamPos`/`drawPxPerRad` are already passed through `ctx` at
  `pointSpritesPass.ts:65,88`.

---

## 5. Options (no recommendation — each ready to spawn a plan)

### Option A — Per-source falloff scale

Replace the hardcoded `1000.0` with a per-source value driven by the source's characteristic
depth (e.g. `MAX_DIST_MPC`, or a tuned constant per source). Galaxies keep ~1000–1500;
Milliquas gets ~6000–9000.

- **Where:** add a falloff `f32` to the `@group(2)` `SourceUniforms` (uses existing pad,
  `pointRenderer.ts:564-566`), write it per source at upload, read it in `vertex.wesl`
  instead of `FALLOFF_HALF_MPC`.
- **Fixes:** D1. **Does not fix:** D2 (still camera-absolute; zoom-out still dims).
- **Cost:** small; per-source uniform already exists. Galaxy view unchanged.
- **Risk:** another magic-number table to keep calibrated per catalog.

### Option B — Don't fade sparse sources at all

Quasars are point-source AGN with no additive pile-up, so the fade arguably should not touch
them. Add a per-source "dense" flag (or reuse a falloff = ∞ sentinel); depth fade applies
only to the dense galaxy catalogs.

- **Where:** per-source flag in `SourceUniforms`; gate the `select(...)` at `vertex.wesl:188`.
- **Fixes:** D1 (for quasars, completely). **Does not fix:** D2 for galaxies.
- **Cost:** smallest conceptual change; most defensible (the fade is a galaxy-density hack).
- **Risk:** if a future deep-but-dense catalog appears, "dense vs sparse" becomes a spectrum,
  not a boolean.

### Option C-lite — Focal-relative adaptive scale (one float)

Keep the `1/(1+(camDist/half)²)` curve but make `half` track the camera focal distance, with
a floor at the current galaxy-tuned value:

```wgsl
let BASE_FALLOFF_MPC = 1000.0;
let falloffHalf = max(BASE_FALLOFF_MPC, u.focalDistMpc);   // focalDistMpc = cam.distance
let camDistRel = distanceMpc / falloffHalf;
let depthFadeRaw = 1.0 / (1.0 + camDistRel * camDistRel);
```

The `max(1000, …)` floor is load-bearing: zoomed into the Local Group, `focalDist` is tiny,
so the floor keeps the **galaxy view byte-for-byte unchanged**; C-lite only engages once the
camera pulls back past 1000 Mpc, at which point an object on the focal shell
(camDist ≈ focalDist) lands at `1/(1+1) = 0.5` instead of near-zero.

- **Where:** rename `_pad4` → `focalDistMpc` in `io.wesl:143`; write `f32[31] = cam.distance`
  at `pointRenderer.ts:1201`; thread `cam.distance` through `pointSpritesPass` like
  `drawCamPos`; swap the constant in `vertex.wesl:185`.
- **Fixes:** D2 (for **all** sources), and softens D1 on zoom-out. **Partial on D1:** in a
  zoomed-in galaxy view the floor keeps quasars faded — compose with B if that matters.
- **Cost:** ~15 lines, one free uniform float, no struct resize. Pick parity automatic
  (shared buffer).
- **Risk / open question:** brightness "pumping" — the same object brightens as you zoom out.
  Smooth during tweens (`cameraTween.ts:89`), stable during fixed-radius orbit. Needs a visual
  check to confirm it reads as a feature (deliberately looking deep) rather than a distraction.

### Option C-full — True focal-plane (depth-of-field)

Fade by signed depth **along the view axis** relative to the focal plane, so only objects
genuinely behind the focus attenuate (objects to the side at the same range stay bright):

```wgsl
let toObj = p.position - u.camPosWorld;
let viewDepth = dot(toObj, u.camForwardWorld);
let depthPastFocus = max(0.0, viewDepth - u.focalDistMpc);
let depthFadeRaw = 1.0 / (1.0 + (depthPastFocus / BASE_FALLOFF_MPC) * (depthPastFocus / BASE_FALLOFF_MPC));
```

- **Where:** needs `camForwardWorld: vec3` → a 16-byte aligned block appended to `Uniforms`
  (struct growth + `UNIFORM_BYTES` bump + pick offset re-verify). Plus `focalDistMpc`.
- **Fixes:** D2 most faithfully (matches depth fade's original "suppress the pile behind what
  you're examining" intent; reads as photographic DoF). **Partial on D1** like C-lite.
- **Cost:** highest — the only option requiring a struct resize and re-checking the byte-matched
  layout across io.wesl / pointRenderer / pickRenderer.
- **Risk:** layout surgery against a deliberately rigid format. Justified only if the
  side-vs-behind difference is visible enough on screen to matter.

### Cross-cutting notes

- **A/B/C compose, they don't exclude.** A natural combined form is
  `falloffHalf = max(perSourceBase, focalDist)` with a per-source "dense" gate — i.e. B for
  correctness on sparse catalogs + C-lite for the zoom-out experience + A as the per-source
  knob. Whoever picks the direction should decide how many of these to land at once.
- **Consider the cull too.** Whatever fade change lands, revisit `INVISIBILITY_THRESHOLD`
  (`vertex.wesl:224`) for deep sources so high-z quasars stay **pickable** even when faint —
  otherwise the name sidecar / InfoCard can never fire for them.
- **No format-version impact.** All options touch only runtime uniforms + the shader, not the
  on-disk `.bin` format. No rebuild/re-sync required.

---

## 6. Test/verification hooks for whoever implements

- **Unit-testable:** the fade math is a pure function of `(distanceMpc, falloffHalf,
  depthFadeEnabled)` — extract it (or assert via a small WGSL-mirroring TS helper) and table-test
  the §3.1 values so a regression in the curve is caught without a GPU.
- **Visual checks (dev server stays running — ask the user to look):**
  1. Galaxy-only view, camera near Local Group: confirm depth fade behaviour is **unchanged**
     (the `max(1000, …)` floor / per-source gate must preserve this).
  2. Enable Milliquas, zoom out to the quasar shell: confirm the deep population is now visible.
  3. Click a high-z (z > 1) quasar: confirm it is **pickable** and the InfoCard name resolves.
  4. For C-lite/C-full: watch a fly-out tween and a fixed-radius orbit — judge whether brightness
     pumping reads as intentional or distracting.
