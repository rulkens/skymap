# Shared WESL segment-quad expansion helper (Constellations Prep 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> execute this plan — dispatch a fresh subagent per task, each running the spec + quality reviews
> before landing. This is a behavior-preserving refactor; the acceptance bar is "no visible or
> measured change", so every task ends with the verification gate, not just a green compile.

## Goal

Extract the instanced-quad thick-line expansion (project two endpoints → NDC tangent/perp →
half-width pixel offset → re-multiply by w) into one shared WESL helper and refactor both existing
call sites (`filaments/vertex.wesl`, `markerLines/vertex.wesl`) onto it, **behavior-preserving**.
The constellation shader (feature PR) becomes the third consumer and inherits the helper for free.
This is Prep 2 of the Constellations spec
(`docs/superpowers/specs/2026-07-22-constellations-design.md`, section "Prep 2 — shared WESL
segment-quad expansion helper"); it lands as its own PR before the feature.

## Architecture

**New file `src/services/gpu/shaders/lib/segmentQuad.wesl`, not an extension of `camera.wesl`.**
`camera.wesl`'s module header (`:18-74`) is an explicit argument for keeping that file MINIMAL —
`viewProj` prefix + `worldToClip` + `worldEyeDepth`, nothing renderer-specific. Thick-line
screen-space expansion is a specialized line technique, not universal camera math; folding it into
`camera.wesl` would contradict that stated minimalism. A dedicated `lib/segmentQuad.wesl` is the
right seam. WESL's "one function per file" is an anti-idiom in this repo
(`project_wesl_conversion`), so the new file is the home for the **whole segment-expansion
vocabulary** — today one function, and the place any future segment/quad helper lands rather than a
fourth ad-hoc copy.

**One function, half-width convention.** The helper normalizes on **half-width in pixels**
(matching filaments' existing `u.halfWidthPx`). `markerLines`, which carries a full `pixelWidth`,
passes `pixelWidth * 0.5` at the call site — the `* 0.5` moves from inside the shader to the call
argument, no behavior change.

**`CLIP_Z_EPS` far-plane clamp stays caller-side in `markerLines`.** The clamp
(`min(endpoint.z, endpoint.w * (1 - eps))`, `markerLines/vertex.wesl:81`) is a pure function of the
returned vertex's `z` and `w`, both of which the helper preserves untouched in its output `vec4`.
So `markerLines` applies the clamp to the helper's **result** (`p.z = min(p.z, p.w * (1 - CLIP_Z_EPS))`)
— no helper variant, no clamp parameter, filaments stays clamp-free. This keeps the NEAR0
far-plane-survival concern owned by the only shader that needs it.

**`worldToNdc` is deleted.** `lib/camera.wesl:104-126` documents it was written "for exactly this"
tangent/perp use case and is **called by nobody** (confirmed: only its own definition + two stale
comment mentions in the vertex shaders reference the name). Its `clip.xy / clip.w` logic is inlined
inside `expandSegmentQuad` (the sole intended consumer, now realized). Deleting it removes dead
code and the temptation of a fourth divergent NDC helper. `worldToClip` stays — it is widely used
and the new helper imports it.

## Tech Stack

WESL (`.wesl`) linked at build by the wesl-plugin Vite linker; WGSL semantics. TS renderer drivers
(`filamentRenderer.ts`, `markerLineRenderer.ts`) are **untouched** — the width convention change is
absorbed entirely inside `markerLines/vertex.wesl` (the CPU still uploads full `pixelWidth`; the
shader halves it). Verification: `npm run build`, `npm test` (Vitest), `npm run perf` (headless GPU
timing), and a dev-server HMR visual pass.

## Global Constraints

- **Behavior-preserving.** No pixel-level change to filaments or marker/leader lines. Any visible
  or measured (beyond noise) difference is a bug in the extraction, not an accepted trade.
- **WESL: no backticks inside comments.** Backticks are parse errors in the WESL linker — use
  single quotes for inline code in comments (`project_wesl_no_backticks`). Every comment this plan
  adds/edits obeys this.
- **WESL: duplicate `@builtin(position)` across imported structs fails only at `createShaderModule`
  runtime, not at build/link** (`project_wesl_duplicate_builtin_position_runtime_only`). This helper
  introduces no structs, but the general consequence matters: **`npm run build` links the WESL but
  does NOT validate every shader module** — a valid-linking-but-invalid-module error surfaces only
  when the pipeline is created in the browser. The dev-server visual check is therefore a required
  gate, not a nicety.
- **iOS/WebKit is stricter than Chrome's Tint.** A bad shader can silently drop the whole frame on
  iOS while Chrome accepts it. This refactor is behavior-preserving WGSL (no new sampling/type
  constructs), so risk is low; flag any iOS pass as the user's call, do not assume Chrome-green ⇒
  iOS-green.
- **Import syntax:** literal `package::lib::segmentQuad::expandSegmentQuad` /
  `package::lib::camera::worldToClip` (the `?static` import in the TS driver is unchanged).
- **Cite, don't paste.** Lift the expansion body from the current sites
  (`filaments/vertex.wesl:45-77`, `markerLines/vertex.wesl:33-93`); do not transcribe from this
  plan.

---

## Task 1: Add `lib/segmentQuad.wesl`; delete dead `worldToNdc`

**Files:**
- `src/services/gpu/shaders/lib/segmentQuad.wesl` (new)
- `src/services/gpu/shaders/lib/camera.wesl` (modify — delete `worldToNdc`, `:104-126`)

**Pinned signature (contract — match exactly):**

```wgsl
// expandSegmentQuad — expand one instanced-quad corner into a clip-space
// vertex for a screen-space thick line between two world endpoints.
//
// cam         : shared CameraUniforms (supplies viewProj + viewportPx).
// aWorld/bWorld : the segment's two endpoints in world space.
// corner      : unit-quad uv. corner.x selects endpoint (>0.5 -> b);
//               corner.y in [0,1] selects side (-> +/- half-width along the
//               screen-space perpendicular).
// halfWidthPx : half the line width in CSS pixels. Callers holding a FULL
//               pixel width pass 'width * 0.5'.
//
// Returns the offset clip-space vertex. z and w are the SELECTED endpoint's,
// untouched, so perspective-correct interpolation and depth are preserved and
// a caller may re-clamp z on the result (e.g. a far-plane epsilon).
fn expandSegmentQuad(
  cam: CameraUniforms,
  aWorld: vec3<f32>,
  bWorld: vec3<f32>,
  corner: vec2<f32>,
  halfWidthPx: f32,
) -> vec4<f32>
```

**Behavioral contract (the six steps, lifted from `filaments/vertex.wesl:45-77`):**
1. Project both endpoints with `worldToClip(cam, …)`.
2. NDC each (`clip.xy / clip.w`) — the perspective divide before the subtraction (this is the
   inlined `worldToNdc` logic).
3. `tangent = normalize(bNdc - aNdc)`; `perp = vec2(-tangent.y, tangent.x)`.
4. `endpoint = select(aClip, bClip, corner.x > 0.5)`.
5. `offsetNdc = perp * (halfWidthPx / (cam.viewportPx * 0.5)) * (corner.y * 2 - 1)`.
6. Return `vec4(endpoint.xy + offsetNdc * endpoint.w, endpoint.z, endpoint.w)`.

- [ ] Capture the perf baseline **before any edits**, clean tree:
      `npm run -s perf -- --url http://localhost:5174` — record the MERGED medians for the filament
      and marker/leader scenarios (this is the "before" for Task 4).
- [ ] Create `lib/segmentQuad.wesl` with `import package::lib::camera::CameraUniforms;` +
      `import package::lib::camera::worldToClip;` and `expandSegmentQuad` matching the signature +
      six-step contract above. Module header explains the technique + why it's its own lib file
      (whole segment-expansion vocabulary; camera.wesl stays minimal). Single quotes only in
      comments.
- [ ] Delete `worldToNdc` (`camera.wesl:104-126`) — the `── worldToNdc ──` banner, docblock, and
      `fn`. Leave `worldToClip` and `worldEyeDepth` intact.
- [ ] `npm run build` links (no WESL linker error; nothing else imported `worldToNdc`).

**Interfaces**
- Consumes: `package::lib::camera::CameraUniforms`, `package::lib::camera::worldToClip`.
- Produces: `package::lib::segmentQuad::expandSegmentQuad`.

---

## Task 2: Refactor `filaments/vertex.wesl` onto the helper

**Files:** `src/services/gpu/shaders/filaments/vertex.wesl` (modify)

**Contract:** the `@vertex fn vs` output is byte-identical to today. `u.halfWidthPx` is already a
half-width, so it passes straight through.

- [ ] Add `import package::lib::segmentQuad::expandSegmentQuad;`.
- [ ] Replace the inline expansion (`:45-73`, the two `worldToClip` calls through the `out.clip`
      assignment) with `out.clip = expandSegmentQuad(u.cam, in.startPos, in.endPos, in.uv, u.halfWidthPx);`.
- [ ] Keep the `out.uv` / `out.density` (`mix`) tail unchanged.
- [ ] Drop the now-stale `worldToNdc`-mention comment (`:41-44`); the header's instanced-quad
      rationale (`:1-19`) stays.
- [ ] `npm run build` links.

**Interfaces**
- Consumes: `package::lib::segmentQuad::expandSegmentQuad` (plus existing `io` structs + `worldToClip`
  usage is removed if no longer referenced — verify the import is still needed; drop it if not).
- Produces: unchanged `VSOut`.

---

## Task 3: Refactor `markerLines/vertex.wesl` onto the helper (CLIP_Z_EPS on the result)

**Files:** `src/services/gpu/shaders/markerLines/vertex.wesl` (modify)

**Contract:** `out.pos` byte-identical to today, including the far-plane z-clamp. Full `pixelWidth`
becomes `pixelWidth * 0.5` at the call site; `CLIP_Z_EPS` clamp is applied to the helper's returned
`z`/`w`.

- [ ] Add `import package::lib::segmentQuad::expandSegmentQuad;`. Keep `const CLIP_Z_EPS` (`:30`).
- [ ] Replace the inline expansion (`:40-87`) with:
      `let p = expandSegmentQuad(u.cam, fromWorld, toWorld, input.uv, pixelWidth * 0.5);`
      then `out.pos = vec4<f32>(p.xy, min(p.z, p.w * (1.0 - CLIP_Z_EPS)), p.w);`.
- [ ] Keep the unpack (`:35-38`) and the `out.uv` / `out.color = input.color * fadeAlpha` tail.
- [ ] Rewrite the docblock: `:9-12` currently says it *copies* filaments' expansion — replace with
      "expansion via the shared `lib::segmentQuad` helper; this shader owns only the far-plane
      z-clamp (see `CLIP_Z_EPS`)". Preserve the substantive `CLIP_Z_EPS` rationale (`:73-80`, the
      NEAR0 far-plane / depthless-composite explanation) next to the clamp. Single quotes only.
- [ ] `npm run build` links.

**Interfaces**
- Consumes: `package::lib::segmentQuad::expandSegmentQuad`.
- Produces: unchanged `VsOut`.

---

## Task 4: Verify behavior-preserving — build, tests, visual, perf

**Files:** none (verification only).

- [ ] `npm run build` — tsc `--noEmit` + vite build; the vite build links **all** WESL, so any
      linker error across the shader tree surfaces here.
- [ ] `npm test` stays green — in particular the shader-linking/render-frame suites
      (`tests/services/gpu/renderers/filaments/filamentRenderer.test.ts`,
      `tests/services/gpu/renderers/labels/markerLineRenderer.test.ts`,
      `tests/services/engine/frame/renderFrame.test.ts`,
      `tests/visual/renderFrameSplitBaseline.test.ts`). No test edits expected — a red test means the
      refactor changed behavior.
- [ ] **Visual HMR check** (dev server already running on `http://localhost:5174`) — catches
      shader-module errors that link clean but fail at `createShaderModule` (see Global
      Constraints). Confirm with the user: (a) at cosmic-web scale, **filament** lines render at the
      same thickness/brightness as before; (b) on **label hover**, marker/leader lines render
      identically (thickness, the "you are here" indicator, structure leader lines). Any missing or
      mis-thick line = a regression.
- [ ] **Perf sanity**: `npm run -s perf -- --url http://localhost:5174` (worktree → pass `--url`
      with this server's port, per `tools/perf/README.md`). Compare **MERGED** medians against the
      Task 1 baseline; behavior-preserving ⇒ within run-to-run noise. Quote MERGED numbers only, not
      per-layer (per-layer carries ~1–3 ms pass overhead and must not be read as real cost).
- [ ] Commit.

**Interfaces**
- Consumes: the three edited shaders + new helper.
- Produces: green build + suite, user-confirmed visual parity, perf within noise.
