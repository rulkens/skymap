# MSDF Labels — Resumption Amendment

**Status:** Active (2026-05-08)
**Owner:** @rulkens
**Predecessor:** [`2026-05-07-msdf-labels.md`](./2026-05-07-msdf-labels.md)
**Original spec:** [`docs/superpowers/specs/2026-05-07-msdf-labels-design.md`](../specs/2026-05-07-msdf-labels-design.md)

## Why an amendment

The original plan was paused after Phases 1 + 2 + Task 7 (`labels.wgsl` shader) shipped via PR #38. The engine + WESL rewrite arc (Specs A → WESL → B → C → D, 18 PRs total) then landed in main, restructuring most of the surface that the deferred Tasks 8–11 + Phase 4 were going to touch. This doc captures what's still applicable verbatim, what's been pre-converted, and what needs a fresh approach.

## What's already in main (unchanged from PR #38)

```
public/fonts/jetbrains-mono.{png,json}    512² atlas (Phase 1)
data/raw/fonts/JetBrainsMono-Regular.ttf  font source
tools/buildFontAtlas.ts                   build script (deterministic)
src/services/gpu/labels/fontMetrics.ts    pure parser (Phase 2, moved by Phase C)
src/services/gpu/labels/labelLayout.ts    pure layout (Phase 2, moved by Phase C)
src/services/gpu/labels/youAreHereVisibility.ts  fade math (Phase 2, moved by Phase C)
tests/services/gpu/labels/*.test.ts       12 tests, all passing
```

## What was pre-converted by the rewrite

The WESL conversion (Phase WESL, PR #39) converted `labels.wgsl` (originally Task 7) into a 3-file split that mirrors the project's other shaders:

```
src/services/gpu/shaders/labels/io.wesl        struct definitions, bind-group layout
src/services/gpu/shaders/labels/vertex.wesl    @vertex fn vs
src/services/gpu/shaders/labels/fragment.wesl  @fragment fn fs
```

Notable mechanical changes:
- `Uniforms` now wraps the shared 80-byte `CameraUniforms` prefix from `lib/camera.wesl` (`u.cam.viewProj`, `u.cam.viewportPx`).
- `worldToClip(u.cam, p)` helper from `lib/camera.wesl` replaces the inline `viewProj * vec4(p, 1)`.
- Bind-group layout unchanged (group 0, bindings 0–3: uniform, storage, atlas texture, atlas sampler).
- Math semantics identical to the original WGSL — same hybrid clamped sizing, same MSDF median3 + fwidth fragment.

The renderer (Task 9) must therefore upload uniforms in `CameraUniforms` layout (80 bytes minimum) — no renderer-specific fields are needed beyond the prefix at this time.

## Deferred work — re-targeted to current layout

Original Tasks 8–11 + Phase 4 (Tasks 12–13). Re-targeted below; the substantive logic is unchanged from the original plan, only file paths, import shapes, and the engine integration shape are different.

### Task R1 — `labelRenderer.ts` (replaces Tasks 8 + 9)

**Why merged:** the original Task 8 / Task 9 split (CPU state vs. GPU pipeline) was structured around an in-flight context window; the post-rewrite renderers (`quadRenderer`, `pointRenderer`, etc.) keep both halves in one ~250-line file and the foundations + smoke test pattern is now well-established. Splitting again would just add a noisy commit.

**Files:**
- Create: `src/services/gpu/renderers/labelRenderer.ts`
- Create: `tests/services/gpu/renderers/labelRenderer.test.ts` (smoke test, null-device pattern from `textureAtlas.test.ts`)

**Shape (mirrors `quadRenderer.ts`):**
- Constructor: `(ctx: GpuContext, metrics: FontMetrics, atlasBitmap: ImageBitmap, maxLabels = 64, maxGlyphsPerLabel = 64)`. Uses `GpuContext` (not raw device + format).
- WESL imports via `?static`: `import vsCode from '../shaders/labels/vertex.wesl?static';` etc.
- Pipeline build follows the `quadRenderer` template — explicit `bindGroupLayout`, `createPipelineLayout`, `createShaderModuleWithDevLog`.
- Per-instance vertex stride matches the existing labels io.wesl `VsIn`: `corner(2) + localOffset(2) + localSize(2) + uvRect(4) + labelIndex(u32)` = 36 bytes.
- Uniform buffer is exactly 80 bytes (CameraUniforms prefix only, no renderer-specific tail).
- Storage buffer for `LabelData[]`: 48 bytes/label × `maxLabels`.
- Atlas texture: rgba8unorm sampled with linear filter, no mipmaps. Upload from `ImageBitmap` via `device.queue.copyExternalImageToTexture`.
- Public API: `setLabels(Label[])`, `render(pass, vp, viewportPx)`, `destroy()`. Plus `glyphCount() / labelCount()` for tests.
- Blend: standard premultiplied-alpha OVER (NOT pure additive — labels are UI overlay, not emissive).

**Tests:** the original Task 8 smoke tests (4 cases — start empty, count after setLabels, drop unknown glyphs, replace not append) port directly. A null device is fine because we guard the GPU calls — the smoke test only exercises CPU state.

**PR title:** `feat(labels): add LabelRenderer (MSDF text)` — does NOT contain "MSDF labels complete".

### Task R2 — `markerLines` shader (replaces Task 10)

**Files:**
- Create: `src/services/gpu/shaders/markerLines/io.wesl`
- Create: `src/services/gpu/shaders/markerLines/vertex.wesl`
- Create: `src/services/gpu/shaders/markerLines/fragment.wesl`

**Shape:** 3-file WESL split following the `labels/` pattern. Use `CameraUniforms` for the camera prefix; renderer-specific fields (none anticipated initially) sit at offset 80+. Vertex stage projects two world endpoints (`fromWorld`, `toWorld`) to clip via `worldToClip(u.cam, ...)`, computes screen-space tangent + perpendicular (look at `filaments/vertex.wesl` for the canonical thick-line technique — it does the same thing), expands to a quad of constant pixel width. Fragment stage outputs `vec4(color.rgb * fadeAlpha, fadeAlpha)`.

**Per-line VsIn (from a six-vertex unit-strip indexed quad expansion):**
- `@location(0) corner: vec2<f32>` — (0,0)/(1,0)/(0,1)/(1,1) at the rectangle corners
- `@location(1) fromWorld: vec3<f32>`
- `@location(2) toWorld: vec3<f32>`
- `@location(3) extras: vec4<f32>` — pixelWidth, fadeAlpha, _, _
- `@location(4) color: vec4<f32>`

(Per-instance, expanded to a quad in the vertex stage.)

**PR title:** rolled into Task R3's PR (markerLineRenderer needs the shader to exist).

### Task R3 — `markerLineRenderer.ts` (replaces Task 11)

**Files:**
- Create: `src/services/gpu/renderers/markerLineRenderer.ts`
- Create: `tests/services/gpu/renderers/markerLineRenderer.test.ts`

Same shape as `labelRenderer` but simpler — no atlas, no storage buffer, just a single instanced vertex buffer + camera uniforms. Public API: `setLines(MarkerLine[])`, `render(pass, vp, viewportPx)`, `destroy()`.

**PR title:** `feat(labels): add MarkerLineRenderer + markerLines shader` — does NOT contain "MSDF labels complete".

### Task R4 — Integrate as Pass abstractions + you-are-here subsystem (replaces Task 12)

**Files:**
- Create: `src/services/engine/frame/passes/labelsPass.ts` — implements `Pass` interface from `passes/types.ts`
- Create: `src/services/engine/frame/passes/markerLinesPass.ts` — implements `Pass`
- Modify: `src/services/engine/frame/passes/index.ts` — register both in `HDR_PASSES` (after `milkyWayPass`, since they're UI overlay)
- Modify: `src/services/engine/frame/passes/types.ts` — add `labelRenderer: LabelRenderer` and `markerLineRenderer: MarkerLineRenderer` to `PassDeps`
- Create: `src/services/engine/subsystems/youAreHereSubsystem.ts` — closure-keyed factory that owns the alpha state, builds Label[] + MarkerLine[], calls `labelRenderer.setLabels` / `markerLineRenderer.setLines` when alpha changes, and triggers `requestRender()` mid-fade
- Modify: `src/services/engine/phases/initGpu.ts` — construct both renderers; load font atlas; await atlas bitmap; wire renderers into bootstrap deps
- Modify: any wiring sites that pass deps through (likely `runFrame.ts` / `bootstrap.ts`)

**Pass placement decision:** labels + markerLines render WITH the HDR passes (inside the `beginRenderPass` block, before `pass.end()` + tone-map). This matches the original spec ("after 3D, before tonemap"). The blend mode is premultiplied OVER — UI overlay, not emissive — so labels stay readable above bright HDR content; tone-map operates on the composited target as before.

**Subsystem rationale:** Phase D introduced the closure-keyed-factory pattern (`tweenManager`, `selectionSubsystem`, `thumbnailSubsystem`). The you-are-here logic — mutable alpha state + transition gate + cross-renderer side-effects — fits that mould exactly. A free function in `engine.ts` would re-introduce the kind of scatter Phase D pulled out.

**PR title:** rolled into Task R5's PR (visual verification confirms the wiring).

### Task R5 — Visual verification (replaces Task 13)

Manual smoke test against the dev server: fly close to the origin, confirm the marker line + "YOU ARE HERE" text fade in around 0.6–2.0 Mpc and stay sharp at extreme close zoom (the MSDF win). User confirms before merge — the project's "I can't test the UI myself" rule applies.

**PR title:** **`feat(labels): you-are-here marker + engine wiring — MSDF labels complete`** — fires the watcher in the parallel CF-4 worktree.

## PR breakdown summary

| PR | Title | Scope | Watcher fires? |
|---|---|---|---|
| 1 | `feat(labels): add LabelRenderer (MSDF text)` | Task R1 | no |
| 2 | `feat(labels): add MarkerLineRenderer + markerLines shader` | Tasks R2 + R3 | no |
| 3 | `feat(labels): you-are-here marker + engine wiring — MSDF labels complete` | Tasks R4 + R5 | **yes** |

Three PRs match Phase D's cadence (small, focused, sequential). Each lands tests-green; the third one carries the watcher commitment.

## What survives unchanged from the original plan

- All Phase 2 pure-logic modules (foundations, already in main).
- The shader math (`labels.wesl` is a verbatim port; the planned `markerLines` shader uses the standard thick-line technique).
- The `Label` and `MarkerLine` type shapes from the original spec.
- The fade band constants in `youAreHereVisibility.ts` (already in main).
- Atlas dimensions (512², 100 glyphs).

## Risks called out

- **CameraUniforms layout drift**: if the rewrite or a future PR ever extends `CameraUniforms` past 80 bytes, the labels renderer's uniform-buffer write needs to track that. Mitigation: import the shared layout constants the way other renderers do (`UNIFORM_BYTES = 80`) and keep the JS-side write site clearly commented.
- **Pass blend interaction**: labels + markerLines write into the HDR target before tone-map. Premultiplied-OVER blend on white text against an HDR sky should look correct under the same exposure as the rest of the scene. If labels look washed out / dim, the spec's stated fallback (move passes after tone-map as LDR overlay) applies — one-line move in `passes/index.ts`.
- **Atlas upload timing**: must complete before the first frame that wants to draw a label. Mitigation: load + decode in `initGpu.ts` (an async phase), block bootstrap on it. Same pattern as catalog `.bin` loading.
