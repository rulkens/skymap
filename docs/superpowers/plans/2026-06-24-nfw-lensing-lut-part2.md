# NFW gravitational-lensing image-finding via a precomputed 2D LUT — Plan (Part 2)

**Spec:** [`specs/2026-06-24-nfw-lensing-lut-image-finding-design.md`](../specs/2026-06-24-nfw-lensing-lut-image-finding-design.md)
**Part 1:** [`2026-06-24-nfw-lensing-lut.md`](./2026-06-24-nfw-lensing-lut.md) (Phases 0–3 + Global Constraints + locked decisions)
**Branch:** `feat/gravitational-lensing`

Part 1 built the dimensionless CPU LUT generator, extracted the shared
`lensedPosition` WESL seam, and created the `NfwLensLutTexture` GPU resource. This
file wires the LUT into the `@group(3)` scene group, drives the NFW counter image
from the table in the points vertex stage, and closes with an entanglement-radar
pass. Disk/quad lensing coverage is intentionally **out of scope** (see the
deferred note before the Definition of Done) — the Phase-2 `lensedPosition` seam
pre-wires it so it stays a one-line-per-shader follow-up.

> **Read Part 1's Global Constraints and the stale-spec warning before starting.**
> They apply verbatim to every task below. In particular: the spec's
> "Implementation sketch (files)" naming (`focusUniforms.ts` /
> `createFocusUniformBuffer.ts`) is **superseded** — use `sceneUniforms.ts`
> (`createSceneUniformsBgl`) and `createSceneBindGroup.ts`.

---

## Phase 4 — Wire the LUT into the scene group + drive the NFW counter from it

The LUT texture + sampler join the `@group(3)` scene group as `@binding(2)` /
`@binding(3)` (VERTEX), the points vertex stage samples them for the dominant NFW
lens, and the NFW counter-cull (`points/vertex.wesl:173`, today SIS-only) becomes a
real LUT-driven counter image — which means NFW now needs 12 vertices too.

### Task 4.1 — Extend `createSceneUniformsBgl` + `createSceneBindGroup`

**Files:**
- `src/services/gpu/bindGroupLayouts/sceneUniforms.ts` (modify).
- `src/services/gpu/resources/createSceneBindGroup.ts` (modify).
- `tests/...` for both (extend existing BGL/bind-group tests if present;
  otherwise add focused ones against the fake device).

**BGL contract** — `createSceneUniformsBgl` gains two VERTEX-visible entries
(`sceneUniforms.ts:34-50`), keeping `@binding(0)` focus + `@binding(1)` lensing:

| binding | resource | visibility | descriptor |
| --- | --- | --- | --- |
| 0 | focus uniform buffer | VERTEX | `buffer: { type: 'uniform' }` |
| 1 | lensing uniform buffer | VERTEX | `buffer: { type: 'uniform' }` |
| 2 | LUT texture | VERTEX | `texture: { sampleType: 'float', viewDimension: '2d' }` |
| 3 | LUT sampler | VERTEX | `sampler: { type: 'filtering' }` |

`sampleType: 'float'` + `'filtering'` are the matched pair for an `rgba16float`
texture sampled linearly (a `'non-filtering'` sampler or `'unfilterable-float'`
texture would reject the linear sample). Update the BGL docblock
(`sceneUniforms.ts:1-29`) to mention the LUT now lives here — it currently says
"the lensing LUT texture + sampler join here later" (line 6); flip that to present
tense.

**Bind-group contract** — `createSceneBindGroup` gains two params and two entries:

```ts
// before (createSceneBindGroup.ts:22-28):
export function createSceneBindGroup(
  device, sceneBgl, focusBuffer, lensingBuffer, label = 'scene',
): GPUBindGroup
// after — add lensLutView + lensLutSampler (bound at binding 2 / 3):
export function createSceneBindGroup(
  device, sceneBgl, focusBuffer, lensingBuffer,
  lensLutView: GPUTextureView, lensLutSampler: GPUSampler, label = 'scene',
): GPUBindGroup
```

entries gain `{ binding: 2, resource: lensLutView }` and
`{ binding: 3, resource: lensLutSampler }`. (Pass the *view*, not the texture —
keep the `NfwLensLutTexture.view` / `.sampler` split from Part 1 Task 3.1.)

- [x] Test `scene BGL declares the LUT texture + sampler at bindings 2 and 3` —
  asserts the faked `createBindGroupLayout` entries include a VERTEX `texture`
  at binding 2 and a VERTEX `sampler` at binding 3.
- [x] Test `scene bind group binds the LUT view and sampler` — asserts the faked
  `createBindGroup` entries reference the passed `lensLutView` + `lensLutSampler`.
- [x] `npm test` for both files → pass.
- [x] `npm run typecheck` → the new params ripple to every `createSceneBindGroup`
  caller (see Task 4.2); expect a compile error there until 4.2 lands. Sequence
  4.1 + 4.2 together in one commit if the typecheck gate can't pass standalone.
- [x] Commit (with 4.2 if needed for a green typecheck).

### Task 4.2 — Build the LUT at startup + thread it through `initGpu`

**Files:**
- `src/services/engine/phases/initGpu.ts` (modify).
- `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify — add the handle).
- `tests/...` initGpu / bootstrap coverage as it exists.

**Wiring** (in `initGpu`, near the existing scene-group assembly at
`initGpu.ts:104-131`):

- [x] Build the LUT once: `const lut = buildNfwLensLut(W, H, yMax, sMax)` with the
  Part-1 defaults (`256 × 64` per spec line 132, plus the pinned `yMax`/`sMax`).
  Pull `W/H/yMax/sMax` from a single named-constant home (a small
  `src/data/nfwLensLut.ts` constants module, or exported consts on
  `buildNfwLensLut.ts`) so the generator and any debug overlay read one source of
  truth — do not inline the magic numbers at the call site.
- [x] `state.gpu.lensLutTexture = createNfwLensLutTexture(device, lut)` and add the
  field to `EngineGpuHandles` as `lensLutTexture: NfwLensLutTexture | null`, with a
  docblock matching the bag's lifecycle rule (null before bootstrap, non-null after
  `initGpu`, released + re-nulled by `destroy()` — see
  `EngineGpuHandles.d.ts:69-139` for the pattern). Add its `.destroy()` to the
  engine teardown chain (find the `destroy()` site that releases
  `lensingUniform` / `focusUniform` and add the LUT there).
- [x] Pass `state.gpu.lensLutTexture.view` + `.sampler` into the
  `createSceneBindGroup(...)` call (`initGpu.ts:126-131`). The LUT must be built
  BEFORE the scene bind group, like `lensingUniform` already is
  (`initGpu.ts:112-131`).
- [x] Test `initGpu builds the NFW LUT texture and binds it into the scene group` —
  in the bootstrap/initGpu test, assert `state.gpu.lensLutTexture` is non-null
  after init and that `createSceneBindGroup` received its view + sampler.
- [x] `npm test` → green (full suite, since this is bootstrap).
- [x] `npm run typecheck` → clean (now every `createSceneBindGroup` caller passes
  the new args).
- [x] Commit.

### Task 4.3 — Sample the LUT in `points/vertex.wesl` for the dominant NFW lens

**Files:**
- `src/services/gpu/shaders/points/vertex.wesl` (modify — declare the LUT bindings
  + call the LUT path inside the extracted `lensedPosition`, or pass the sampled
  result in; see note below).
- `src/services/gpu/shaders/lib/lensing.wesl` (modify — `lensedPosition` gains the
  NFW LUT branch for `imageKind == 1`, replacing the SIS-only counter cull).
- `tests/...` linked-WGSL compile gate.

**Binding declarations** (in `points/vertex.wesl`, after the lensing buffer at
line 93):

```wesl
// binding 2 — NFW image-finding LUT (rgba16float). Indexed by (y, s):
//   x = xPrimary/xCounter (signed, scale-radius units), mu = magnification.
// VERTEX-visible; the points + pick vertex stage samples it for the dominant
// NFW lens. See lib/lensing.wesl (lensedPosition) for the (y,s) -> UV map and
// src/utils/lensing/buildNfwLensLut.ts for the generation (and the log-s map
// this must invert).
@group(3) @binding(2) var lensLut: texture_2d<f32>;
@group(3) @binding(3) var lensLutSampler: sampler;
```

**`lensedPosition` NFW counter contract** — for `imageKind == 1 && mode == 1u`
(NFW), instead of culling (the current `points/vertex.wesl:173` is `mode == 0u`
SIS-only), the function:

1. computes `y = β·D_l/r_s` and `s = strength·distFactor·D_l/r_s` for the dominant
   lens (the same `bestBeta` / `bestDelta` accumulators, plus `D_l` = eye→lens and
   `distFactor` recovered from the dominant lens — surface whatever extra fields
   `lensTerm`/the dominant pick must carry so `lensedPosition` has `D_l`, `r_s`,
   and `strength·distFactor` for the dominant lens; pin those on the dominant-pick
   accumulator, do not recompute `lensTerm` for the dominant lens twice);
2. maps `(y, s)` → texture UVs, **log-mapping the `s` axis with the inverse of the
   generator's `LOG_K` map** (Part 1 Task 1.1 pinned the forward map; quote
   `LOG_K` here and invert it — a comment must name the generator as the source of
   truth so the two can't drift);
3. `textureSampleLevel(lensLut, lensLutSampler, uv, 0.0)` once → `(xP, muP, xC, muC)`;
4. counter: if `xCounter == 0.0` ⇒ `valid = 0u` (cull via the existing degenerate
   early-out); else `θ = xCounter · r_s / D_l` (signed — a negative `xCounter`
   rotates to the opposite side via `dirLens·cos(θ) + tangent·sin(θ)`) and
   `mu = muCounter` (already clamped in the LUT).

   The NFW **primary** (`imageKind == 0`) MAY also read `muPrimary` /
   `xPrimary` from the LUT for the dominant lens to get the physically-correct
   primary magnification + position, while keeping the multi-lens SUMMED weak-shear
   offset for the non-dominant lenses (spec lines 152–163: "the multi-lens
   summation for the primary is unchanged; the LUT resolves the dominant lens's
   image structure"). Keep the SIS path (`mode == 0u`) on its existing analytic
   branch unchanged for BOTH images.

> **`textureSampleLevel` in the vertex stage** is required (no implicit
> derivatives in `vs`) — use the explicit-LOD overload, `level = 0.0`. WebKit
> rejects `textureSample` in a vertex stage; `textureSampleLevel` is the correct,
> portable call (and there is no `texture_1d` overload — this is a `texture_2d`,
> as Part 1 Task 3.1 enforces).

> **Architectural note:** putting the LUT sample *inside* `lensedPosition` keeps
> the deflection model in one shared function (the Phase-2 seam). But `lensLut` /
> `lensLutSampler` are module-global `@group(3)` declarations that `lib/lensing.wesl`
> cannot itself declare (WESL has no global state — bindings are declared in the
> consuming module; see `points/vertex.wesl:11-20`). So either (a) `points/vertex.wesl`
> samples the LUT and passes the `vec4` result into `lensedPosition`, or (b)
> `lensedPosition` takes the texture+sampler as parameters. Pick ONE and apply it
> the SAME way in the disk shaders (Phase 5) so the model stays shared, not copied.
> Prefer (b) (pass `texture_2d<f32>` + `sampler` params) if WESL permits texture
> params — verify against the wesl-plugin before committing; fall back to (a) if
> not. Document the choice in `lensedPosition`'s docblock.

- [x] Linked-WGSL compile gate: test `points vertex links with the NFW LUT
  sample` — assert `points/vertex.wesl?static` links and the WGSL references
  `lensLut` + `textureSampleLevel`.
- [x] `npm run build` — WESL links (the real shader compile gate).
- [x] Commit (with Task 4.4 — they form one coherent NFW-counter landing).

### Task 4.4 — NFW now draws 12 vertices (vertex-count gate change)

**Files:**
- `src/services/gpu/renderers/pointRenderer.ts` (modify the gate at line 767).
- `src/@types/rendering/PointDrawSettings.d.ts` (modify the `lensMode` docblock,
  lines 71–79).
- `tests/...` point-renderer draw-count coverage.

The gate today is `settings.lensEnabled && settings.lensMode === 'sis' ? 12 : 6`
(`pointRenderer.ts:767`), because only SIS had a counter image. NFW now gets a real
LUT-driven counter image, so it ALSO needs the second quad:

```
// before (pointRenderer.ts:767):
const verticesPerPoint = settings.lensEnabled && settings.lensMode === 'sis' ? 12 : 6;
// after — both modes double when lensing is on:
const verticesPerPoint = settings.lensEnabled ? 12 : 6;
```

- [x] Update the `pointRenderer.ts` draw docblock (lines 11–16) and the inline
  comment (lines 760–766) — they currently explain NFW staying at 6 ("NFW has no
  closed-form counter image, so it … keeps the single-quad cost"). Rewrite to:
  lensing on ⇒ 12 vertices in BOTH modes (NFW's counter now comes from the LUT);
  lens-off ⇒ 6. No history notes — describe current state only.
- [x] Update the `PointDrawSettings.lensMode` docblock
  (`PointDrawSettings.d.ts:71-79`) — it says the draw doubles "only for
  `lensEnabled && lensMode === 'sis'`". Rewrite: `lensEnabled` alone gates the
  12-vs-6 doubling; `lensMode` now selects the counter MATH (SIS analytic vs NFW
  LUT), not whether a counter exists.
- [x] Test `lens-on draws 12 vertices in both SIS and NFW mode` — extend the draw
  test so an NFW-mode lens-on draw now asserts `draw(12, count)` (the Part-1
  `NFW stays 6` assertion from Task 2.1 is REPLACED here — this is the deliberate
  behaviour change; update that assertion, don't leave a contradicting test).
- [x] `npm test` → green.
- [x] `npm run typecheck` → clean.
- [x] `npm run build` → links.
- [x] Commit.

**Independently testable deliverable:** with lensing on + NFW mode, the points
pass renders a primary + a LUT-placed counter image with LUT magnification; SIS is
unchanged. Confirm the NFW imaging visually against the live renderer (the inner
counter image should now appear as a point); this is the only manual check in the
plan and can ride the Phase-6 review.

---

## Phase 5 — Final entanglement-radar pass

Per the project convention (`feedback_operationalize_simplicity`), the last task
runs the entanglement-radar lens over the branch diff to confirm the LUT landed
un-braided and the plan preserved the spec's un-braided choices.

### Task 5.1 — Entanglement-radar review of the branch diff

**Files:** none (review task; may surface follow-up edits).

- [ ] Run the `entanglement-radar` skill over the full `feat/gravitational-lensing`
  branch diff. Confirm specifically:
  - **One texture object.** The LUT is created once (`createNfwLensLutTexture`)
    and referenced from the scene group — not duplicated per pipeline. (The
    standalone `lensingUniforms` BGL's later fragment-visible LUT entry is a
    deferred volume-phase note, not a second object now.)
  - **One model, ready to share.** The deflection model lives in ONE shared
    `lensedPosition` (lib/lensing.wesl), called by the points vertex stage — not
    re-inlined. Confirm the extraction left a clean one-call seam the disk shaders
    could adopt later (deferred — see the out-of-scope note) without copying the
    model.
  - **The `(y,s)` log-map + its inverse are a documented pair** — one source of
    truth (the generator) with the shader's inverse quoting `LOG_K`. A drifting
    map written independently in two places is exactly the asymmetry-language
    trap the convention forbids; confirm it reads as a mirror, not a re-derivation.
  - **Spec's un-braided choices preserved:** SIS stays analytic (not folded into
    the LUT), the LUT is dimensionless/universal (uploaded once, never
    re-uploaded), and the two-quad/single-lens caps are explicit, not implicit.
  - **No stale comments** left behind (the Phase-0 `@group(4)` fix held; the
    `pointRenderer.ts` / `PointDrawSettings` / `sceneUniforms.ts` docblocks now
    describe current state).
- [ ] If the radar names a knot, either un-braid it (small) or capture it in
  `docs/BACKLOG.md` with a one-line rationale (larger) — do not silently leave it.
- [ ] `npm test` + `npm run typecheck` + `npm run build` → all green.
- [ ] Commit any review-driven edits.

---

## Definition of Done

The `/feature-done` audit gates on this list. All must hold before the plan +
spec relocate to `completed/`.

- [ ] **CPU generator:** `buildNfwLensLut` exists (one fn per file), returns the
  pinned `NfwLensLut` shape, and its tests prove the limits — `s→0 ⇒ x≈y, μ≈1`,
  no counter at small `s`, two opposite-side images super-critically, `μ` clamped
  to `MU_MAX`, dropped-third-image warns.
- [ ] **Shared seam:** the deflection model lives in ONE `lensedPosition` WESL
  function called by the points vertex stage. No copy of the summation /
  dominant-pick / counter math elsewhere; the seam is ready for the disk shaders
  to adopt later with a one-line call.
- [ ] **GPU resource:** `createNfwLensLutTexture` uploads an `N×M rgba16float`
  texture (f16-packed via `floatToF16`) with a clamp-to-edge linear sampler;
  never `texture_1d`.
- [ ] **Scene-group wiring:** `createSceneUniformsBgl` declares the LUT texture
  (binding 2) + sampler (binding 3), VERTEX; `createSceneBindGroup` binds them;
  `initGpu` builds the LUT once at startup and threads it in; the
  `EngineGpuHandles.lensLutTexture` field follows the bag's null→non-null→null
  lifecycle and is released in `destroy()`.
- [ ] **NFW imaging:** the points vertex stage samples the LUT for the dominant
  NFW lens, places the counter image from `xCounter` (culling when `0`), and uses
  the LUT magnification; SIS stays on its unchanged analytic branch. The
  vertex-count gate doubles to 12 for `lensEnabled` in BOTH modes.
- [ ] **NFW imaging confirmed visually:** SIS + NFW both render correctly against
  the live renderer (NFW shows the inner counter image as a point) — checked in the
  Phase-5 review, NOT auto-claimed.
- [ ] **Stale comments cleared:** the `lensingUniforms.wesl` `@group(4)` comment,
  the `pointRenderer.ts` 12-vs-6 docblock, the `PointDrawSettings.lensMode`
  docblock, and the `sceneUniforms.ts` "join here later" line all describe
  current state.
- [ ] **Conventions honoured:** one-fn-per-file + one-type-per-file for all new
  `utils/` / `@types/` files; `type` aliases; `Vec2`/`Vec3` aliases; no backticks
  in WESL comments; didactic comments throughout.
- [ ] **Green:** `npm test`, `npm run typecheck`, and `npm run build` all pass.
- [ ] **Entanglement-radar pass (Task 5.1) run** and clean (or follow-ups
  captured in `docs/BACKLOG.md`).
- [ ] **Out of scope, untouched:**
  - **Disk/quad lensing coverage** — the impostor procedural disks and textured
    thumbnails still render at the UN-lensed centre (`proceduralDisks/vertex.wesl`,
    `texturedDisks/vertex.wesl`). Deferred deliberately: a galaxy large enough to
    resolve into a disk is near the camera (small `D_s`), so it is rarely behind a
    lens (`D_s > D_l`) with meaningful deflection. The one concrete trigger to
    revisit is a visible *crossfade snap* — a galaxy that is both lensed and inside
    the points→disk handoff band (~8–24 px) would smear/jump as its billboard
    (lensed) hands off to its disk (un-lensed). The Phase-2 `lensedPosition` seam
    makes the fix a one-line `imageKind == 0u` call per disk vertex shader if that
    artifact is ever observed.
  - **Volume raymarch LUT wiring** — the standalone `lensingUniforms` BGL's
    fragment-visible LUT entry is NOT added here, only noted as a deferred hook.
  - NFW's third image and per-lens `r_s` from a mass–concentration relation remain
    deferred (spec lines 205–211).
