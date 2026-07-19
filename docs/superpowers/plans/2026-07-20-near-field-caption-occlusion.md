# Near-field caption occlusion behind planet bodies — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Load the `wesl-shaders` skill before touching any `.wesl` file** (Tasks 2, 3, 5) — the `?static` import + feature-flag linker constraints are not documented upstream and silently produce broken WGSL.

**Goal:** Near-field scene-body captions + leader lines are occluded per-pixel where a nearer planet body covers them. A caption for a body geometrically behind a nearer body must no longer float in front of that nearer body's disk; it is hidden where the disk covers it and pokes out where it clears the silhouette.

**Architecture:** Depth-aware overlay — sample the `foreground:0` depth buffer in the foreground caption + leader-line fragment shaders and `discard` occluded fragments. The overlay stays a post-tone-map draw in the `(swap, NEAR0)` pass; the frame order, blend, sizing, fade, and declutter are all unchanged. Only the two *foreground* renderer instances opt into occlusion (via a construction flag); the COSMO label/line instances compile and bind none of it.

**Tech stack:** TypeScript + raw WebGPU + WESL (wesl-plugin, `?static` imports) + Vitest. No fetch/build/R2/data-format changes.

**Spec:** `docs/superpowers/specs/2026-07-20-near-field-caption-occlusion-design.md` — this plan implements its "Approach" (§ sample + discard), "Architecture — the ideal diff" (5 touchpoints), "Testing", and the [V1]–[V6] visual pass. Read the current source files before editing; do not trust any line offset below where it has since shifted.

## Ground preparation

**None needed — the feature is growth on existing seams** (copied from the spec's Ground-preparation section, refactor-ground checkpoint signed off 2026-07-20). Every touchpoint is an addition at a seam that already exists: the "later pass samples an earlier offscreen target" seam (`volumeUpsampleLayer` / `starAggregateUpsampleLayer`), the "per-frame bind group from a draw-arg view" seam (`volumeUpsample.ts:92-104`), the `ctx.renderTargets.depthViewOf(...)` accessor (`renderTargets.ts:227`), and the factory construction-flag seam. The one deliberate change (foreground depth → sampleable) is a one-line usage relaxation, not structural prep. The shared `sceneDepth.wesl` + `occlusionDepthGroup.ts` are the consolidation that keeps the two consumers (glyphs + leader lines) one joint rather than two parallel bolt-ons. No separable prep PR; no adjacent knot warranting a backlog file.

## Global Constraints

Binding for every task.

- **One symbol per file in `src/utils/` and `src/@types/` only** — the filename is the export name. This rule does NOT apply to `src/services/gpu/renderers/`, so `occlusionDepthGroup.ts` (Task 2) may export three cohesive symbols; that is deliberate and correct (a reviewer should not flag it).
- **`type` aliases, never `interface`**; deep relative imports, no barrels; didactic multi-paragraph module headers (explain *why* + the rejected alternative).
- **Premultiplied-OVER label blend is unchanged.** The occlusion variant only adds a leading `discard` gate before the identical shading body — no blend, colour, sizing, or fade change.
- **Meticulous WESL (`feedback_wgsl_meticulous`, `feedback_wesl_no_backticks`):** `.wesl` edits are delicate. Single quotes in comments, never backticks. `import package::…` literal paths. WGSL is verified VISUALLY (there is no CPU unit test for shader math). Use `createShaderModuleWithDevLog` output if a shader fails to link.
- **iOS/WebKit shader strictness (CLAUDE.md "things that have bitten us"):** all HDR/overlay passes share one command encoder, so a single invalid pipeline makes `queue.submit()` silently drop the WHOLE frame — the loop ticks, the camera moves, nothing presents, no thrown error. A malformed depth-sample fragment variant is exactly this class of bug. [V6] is the iOS guard; diagnose with `createShaderModuleWithDevLog`.
- **`depthCompare: 'less'`, cleared to `1.0` (far):** a caption fragment at window depth `d_cap` is occluded when `sceneDepth < d_cap`. Empty sky above a body reads `1.0` → kept; a nearer body reads `< d_cap` → discarded. This is the whole occlusion test.
- **Commits:** stage specific paths (never `git add -A` / `.`); format only touched files; the main thread runs `npm test` + `npm run typecheck` + `npm run build` and commits. Background implementers may self-run `npx tsc --noEmit` as a pre-flight only. `npm run build` = `tsc --noEmit` + `vite build` (this is what links the WESL). `npm test` is the suite gate.
- **No TS file moves are expected in this plan** — no `npm run move-files` needed.
- **Dev server:** left running on `:5175` for HMR; never start/kill it. Visual checks ask the user to look (closing section).

---

## Task 1: Make the `foreground:0` depth texture sampleable

**Files:**

- Modify `src/services/gpu/renderTargets.ts` — the depth-texture `usage` in `allocate` (~`:200-208`) + two docblock passages.

**Change:** the depth texture's `usage` gains `GPUTextureUsage.TEXTURE_BINDING` alongside `GPUTextureUsage.RENDER_ATTACHMENT`:

```ts
// renderTargets.ts allocate(), the spec.depth branch (~:207)
usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
```

Reword the two places that currently assert the opposite so the module no longer contradicts itself:

- The "### Why the foreground row carries a depth texture" paragraph (~`:69-80`) currently says the depth texture is `RENDER_ATTACHMENT` ONLY, "never `TEXTURE_BINDING`", "never sampled by a downstream shader". Reword: the foreground depth is now ALSO sampled — by the near-field caption occlusion pass (`foregroundLabelsLayer`, via `lib/sceneDepth.wesl`) — so it carries `TEXTURE_BINDING` too. Keep the `scale: 1` full-resolution rationale (hard opaque edges) and note that full-res is also what lets a swap-pass fragment index the depth texel 1:1 (spec invariant: `foreground:0` and `swap` both render at `scale: 1`).
- The inline comment at the depth `createTexture` (~`:204-206`) currently reads "RENDER_ATTACHMENT ONLY — … never sampled … no TEXTURE_BINDING". Reword to state both flags and why (depth-test during the pass + sampled by the caption occlusion fragment shaders).

**Test strategy — NONE (honest note):** there is no meaningful unit test here. Asserting the usage-flag bitmask back at itself is a runtime-type/constant restatement (`conventions/testing.md`), and the real behaviour (a sampleable depth texture) needs a GPU device. This task is an **enabler** consumed by Task 6; its guard is Task 6's wiring test + the [V1] visual pass. Verification is `npm run typecheck` + `npm run build` staying green.

**Steps:**

- [ ] Add `| GPUTextureUsage.TEXTURE_BINDING` to the depth-texture usage in `allocate`.
- [ ] Reword the "### Why the foreground row carries a depth texture" docblock paragraph and the inline depth-usage comment so neither still claims "never TEXTURE_BINDING".
- [ ] `npm run typecheck` clean (both tsconfigs); `npm run build` clean.
- [ ] Commit (stage `src/services/gpu/renderTargets.ts`).

---

## Task 2: Shared occlusion joint — `sceneDepth.wesl` snippet + `occlusionDepthGroup.ts` helper (the unit-tested task)

**Files:**

- Create `src/services/gpu/shaders/lib/sceneDepth.wesl`
- Create `src/services/gpu/renderers/labels/occlusionDepthGroup.ts`
- Create `tests/services/gpu/renderers/labels/occlusionDepthGroup.test.ts`

**Interface — `lib/sceneDepth.wesl` (contract):**

```
@group(1) @binding(0) var sceneDepthTex: texture_depth_2d;

fn occludedByScene(fragXY: vec2f, fragDepth: f32) -> bool {
  return textureLoad(sceneDepthTex, vec2i(fragXY), 0) < fragDepth;
}
```

Add a short didactic header (single-quote comments, no backticks): the body depth uses 'less' compare cleared to 1.0 (far), so 'sceneDepthTex sample < fragDepth' means a NEARER body already covers this pixel — discard. 'textureLoad' takes no sampler (depth textures are unfilterable). 'fragXY' is the fragment's window-space '@builtin(position).xy', which indexes the depth texel 1:1 because 'foreground:0' and 'swap' both render at scale 1.

**Interface — `occlusionDepthGroup.ts` (three cohesive exports; contract only):**

```ts
export const OCCLUSION_DEPTH_GROUP_INDEX = 1;

export const OCCLUSION_DEPTH_LAYOUT_DESC: GPUBindGroupLayoutDescriptor = {
  label: 'occlusion-depth-bgl',
  entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
  ],
};

export function createOcclusionDepthBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  depthView: GPUTextureView,
): GPUBindGroup;
```

`createOcclusionDepthBindGroup` builds a bind group with the single depth-view entry at binding 0 — the per-frame builder mirrors `volumeUpsample.ts:92-104` (rebuilt each draw because the depth view is recreated on every `renderTargets.resize()`; caching would bind a destroyed view). Didactic header: this is the group(1) joint both foreground renderers bind; the layout descriptor and the WESL `@group(1) @binding(0)` in `sceneDepth.wesl` are the two halves of one contract, and the test below pins their agreement.

**Test — `occlusionDepthGroup.test.ts` (pure, no device):** `GPUShaderStage` is provided by `tests/setup/webgpuGlobals.ts`, so the descriptor is inspectable on the CPU. This guards the TS-descriptor ↔ WESL `@group(1) @binding(0)` agreement, whose drift is otherwise a device-only pipeline-validation error (`conventions/testing.md` keep-rule: a cheap CPU test catches layout drift that only surfaces on a real device).

```ts
test('the occlusion depth layout is a single fragment-visible depth texture at group(1)/binding0', () => {
  expect(OCCLUSION_DEPTH_GROUP_INDEX).toBe(1);
  expect(OCCLUSION_DEPTH_LAYOUT_DESC.entries).toHaveLength(1);
  const [entry] = OCCLUSION_DEPTH_LAYOUT_DESC.entries as GPUBindGroupLayoutEntry[];
  expect(entry.binding).toBe(0);
  expect(entry.visibility).toBe(GPUShaderStage.FRAGMENT);
  expect(entry.texture?.sampleType).toBe('depth');
});
```

Do NOT unit-test `createOcclusionDepthBindGroup` (needs a device — its correctness is covered by Task 4/5 pipeline construction + the [V1] visual pass) and do NOT snapshot the whole descriptor.

**Steps:**

- [ ] Load the `wesl-shaders` skill. Create `lib/sceneDepth.wesl` with the header + binding + `occludedByScene` above.
- [ ] Write `occlusionDepthGroup.test.ts` with the assertion above (red — the module does not exist yet).
- [ ] Create `occlusionDepthGroup.ts` with the three exports; implement `createOcclusionDepthBindGroup` against the `volumeUpsample.ts:92-104` per-frame-bind-group shape. Green.
- [ ] `npm test -- occlusionDepthGroup` green; `npm run typecheck` clean; `npm run build` clean (the new `.wesl` links only once imported in Task 3, but the build must stay green).
- [ ] Commit (stage the three new paths).

---

## Task 3: Label fragment occlusion variant

**Files:**

- Modify `src/services/gpu/shaders/labels/fragment.wesl` — extract the shading body into a reusable function.
- Create `src/services/gpu/shaders/labels/fragmentOcclude.wesl` — the discard-gated entry point.

**Refactor (behaviour-preserving) in `fragment.wesl`:** extract the MSDF shading body currently inside `@fragment fn fs(input: VsOut)` (`:47-72`) into

```
fn shadeMsdf(input: VsOut) -> vec4<f32> { /* the existing median3 / fill / outline / over body */ }
```

and make the existing entry a one-liner:

```
@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeMsdf(input);
}
```

The COSMO label pipeline keeps using this file unchanged in observable behaviour.

**New `fragmentOcclude.wesl` (contract):**

```
import package::labels::io::VsOut;
import package::labels::fragment::shadeMsdf;
import package::lib::sceneDepth::occludedByScene;

@fragment
fn fs(@builtin(position) pos: vec4<f32>, input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(pos.xy, pos.z)) { discard; }
  return shadeMsdf(input);
}
```

Comment (single quotes, no backticks): all four glyph-quad corners share the anchor's clip-z (the vertex stage writes one 'clampedClipZ' for the anchor — see labels/vertex.wesl), so 'pos.z' is the anchor's window depth for the whole glyph — the caption is occluded or not as a unit, which is what we want (a caption is hidden where a nearer body covers it, not sliced mid-glyph by the body's curved depth).

**Verification: build + visual only — no CPU unit test (honest note).** This is shader math verified by the [V1]/[V2]/[V5] visual pass; there is no meaningful red-green unit test for a `discard` (GPU behaviour, `conventions/testing.md`). `npm run build` links + type-checks the WESL; a mislink surfaces there or (worst case) on iOS as a dropped frame ([V6]).

**Steps:**

- [ ] Load the `wesl-shaders` skill.
- [ ] Extract `shadeMsdf(input: VsOut) -> vec4<f32>` in `fragment.wesl`; reduce `fs` to `return shadeMsdf(input);`.
- [ ] Create `fragmentOcclude.wesl` importing `shadeMsdf` + `occludedByScene`, with the `@builtin(position)` discard wrapper above.
- [ ] `npm run build` clean (WESL links; watch iOS-strict traps — valid module, no `texture_1d`). `npm run typecheck` clean.
- [ ] Commit (stage both `.wesl` paths). Behaviour-neutral on its own — no renderer uses `fragmentOcclude.wesl` until Task 4.

---

## Task 4: `labelRenderer` occlusion option

**Files:**

- Modify `src/services/gpu/renderers/labels/labelRenderer.ts`
- Modify `src/@types/rendering/LabelRenderer.d.ts`

**Signature — `createLabelRenderer` gains a trailing options bag:**

```ts
export function createLabelRenderer(
  ctx: GpuContext,
  targetFormat: GPUTextureFormat,
  atlases: LoadedFontAtlases,
  maxLabels?: number,
  maxGlyphsPerLabel?: number,
  opts?: { occludeAgainstDepth?: boolean },
): LabelRenderer;
```

When `opts?.occludeAgainstDepth` is true, the factory (all inside the existing `if (device)` block):

1. builds `occlusionDepthBGL = device.createBindGroupLayout(OCCLUSION_DEPTH_LAYOUT_DESC)` and uses `bindGroupLayouts: [bindGroupLayout, occlusionDepthBGL]` in the pipeline layout (group 0 = the existing label BGL, group 1 = depth);
2. compiles the fragment module from `fragmentOcclude.wesl` (import it with `?static` alongside the existing `fragment.wesl` import) instead of `fragment.wesl`;
3. keeps a closure reference to `occlusionDepthBGL` for the per-frame group(1) build in `draw`.

The non-occlusion path is byte-for-byte unchanged: single BGL `[bindGroupLayout]`, `fragment.wesl`, no group(1).

**`draw` gains an optional 4th arg** (the signature widens for BOTH paths; only the occlusion path consumes it):

```ts
draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportSize: Vec2, sceneDepthView?: GPUTextureView): void;
```

When occlusion is enabled AND `sceneDepthView` is present, build the group(1) bind group per-frame via `createOcclusionDepthBindGroup(device, occlusionDepthBGL, sceneDepthView)` and `pass.setBindGroup(OCCLUSION_DEPTH_GROUP_INDEX, bg)` before `pass.draw(...)`. When occlusion is disabled, ignore a passed view (a non-null view arriving at a non-occlusion instance is a wiring bug — the spec says "may be ignored or asserted"; ignore it, keeping the COSMO path a pure no-change).

**`LabelRenderer.d.ts`:** widen the `draw` member to `draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportSize: Vec2, sceneDepthView?: GPUTextureView): void;` with a docstring line noting the optional depth view is consumed only by an `occludeAgainstDepth` instance for per-pixel body occlusion.

**Verification — honest note.** GPU pipeline creation is not meaningfully unit-testable, and the existing CPU-only `labelRenderer` test (construction with `device: null`, glyph-pack assertions) is unaffected — the null-device branch skips all GPU resource creation, so `opts` never reaches a device call there. Verify `npm run typecheck` + `npm run build` + the existing label tests stay green; behaviour is exercised by Task 6's wiring test + the visual pass. **Optional cheap test:** if the existing renderer test suite already has a `mockDevice` shape (mirror `texturedBodyRenderer.test.ts`'s `mockDevice`), a test that the occlusion variant requests **two** bind-group layouts (`createBindGroupLayout` called for the depth BGL + a two-element `bindGroupLayouts`) is worth adding; if no such mock exists here, do NOT invent one — build + visual is the honest verification.

**Steps:**

- [ ] Add the `opts` param + the `occludeAgainstDepth` branch (two-BGL layout, `fragmentOcclude.wesl` module, retained `occlusionDepthBGL`) to `createLabelRenderer`; import `fragmentOcclude.wesl?static` + the three `occlusionDepthGroup.ts` symbols.
- [ ] Widen `draw` to accept `sceneDepthView?`; on the occlusion path build + set the group(1) bind group per frame; leave the non-occlusion path unchanged.
- [ ] Update `LabelRenderer.d.ts` `draw` signature + docstring.
- [ ] (Optional, only if a `mockDevice` is trivially mirrorable) add the two-BGL construction assertion.
- [ ] `npm run typecheck` clean; `npm test -- labelRenderer` green (existing CPU tests unaffected); `npm run build` clean.
- [ ] Commit (stage the two paths).

---

## Task 5: `markerLine` fragment variant + `markerLineRenderer` occlusion option

Mirror Tasks 3 + 4 for the leader lines.

**Files:**

- Modify `src/services/gpu/shaders/markerLines/fragment.wesl` — extract `fn shadeLine(input: VsOut) -> vec4<f32>` from the existing `fs` body (`:20-35`); reduce `fs` to `return shadeLine(input);`.
- Create `src/services/gpu/shaders/markerLines/fragmentOcclude.wesl` — same `@builtin(position)` discard wrapper as the label variant:

```
import package::markerLines::io::VsOut;
import package::markerLines::fragment::shadeLine;
import package::lib::sceneDepth::occludedByScene;

@fragment
fn fs(@builtin(position) pos: vec4<f32>, input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(pos.xy, pos.z)) { discard; }
  return shadeLine(input);
}
```

- Modify `src/services/gpu/renderers/labels/markerLineRenderer.ts` — add the same `opts?: { occludeAgainstDepth?: boolean }` param to `createMarkerLineRenderer(ctx, targetFormat, maxLines?, opts?)`; on the occlusion path use `bindGroupLayouts: [bindGroupLayout, occlusionDepthBGL]` (group 0 = the existing uniform BGL, group 1 = depth) and the `fragmentOcclude.wesl` module; widen `draw` with the optional `sceneDepthView?: GPUTextureView` 4th arg and build/set the group(1) bind group per-frame when present. Non-occlusion path unchanged.
- Modify `src/@types/rendering/MarkerLineRenderer.d.ts` — widen the `draw` signature to `draw(pass, viewProj, viewportSize, sceneDepthView?: GPUTextureView): void;` with the same docstring note.

Note the leader-line vertex stage clamps clip-z the same way the label one does (`markerLines/vertex.wesl`, referenced in the `foregroundLabelsLayer` header § "Why the overlay shaders clamp clip-z"), so `pos.z` is a well-defined window depth for the connector quad.

**Verification: build + visual (honest note)** — same rationale as Tasks 3 + 4: no CPU unit test for the shader discard or the GPU pipeline; the existing CPU-only `markerLineRenderer` test (null device) is unaffected. Verify typecheck + build + existing tests green; behaviour via Task 6 + [V1] visual.

**Steps:**

- [ ] Load the `wesl-shaders` skill. Extract `shadeLine(input: VsOut) -> vec4<f32>` in `markerLines/fragment.wesl`; reduce `fs` to `return shadeLine(input);`.
- [ ] Create `markerLines/fragmentOcclude.wesl` with the discard wrapper above.
- [ ] Add the `opts` param + occlusion branch (two-BGL layout, `fragmentOcclude.wesl` module, retained `occlusionDepthBGL`) to `createMarkerLineRenderer`; widen `draw` with `sceneDepthView?` + the per-frame group(1) build.
- [ ] Update `MarkerLineRenderer.d.ts` `draw` signature + docstring.
- [ ] `npm run typecheck` clean; `npm test -- markerLineRenderer` green; `npm run build` clean.
- [ ] Commit (stage the four paths).

---

## Task 6: Wire the foreground layer + construct the occlusion instances (the wiring-tested task)

**Files:**

- Modify `src/services/engine/frame/passes/foregroundLabelsLayer.ts` (`draw`, `:576-588`)
- Modify `src/services/engine/phases/initGpu.ts` (`:502-507` + `:521`)
- Create `tests/services/engine/frame/passes/foregroundLabelsOcclusion.test.ts`

**`foregroundLabelsLayer.draw`:** read the foreground depth view and thread it into both renderer draws:

```ts
const depthView = ctx.renderTargets.depthViewOf('foreground:0');
// … existing setLines/setLabels …
if (lineRenderer !== null) {
  lineRenderer.setLines(lines);
  lineRenderer.draw(pass, rebasedVpF32, viewportPx, depthView);
}
renderer.draw(pass, rebasedVpF32, viewportPx, depthView);
```

`ctx.renderTargets` is on `ReadyFrameContext` (`ReadyFrameContext.d.ts:108`), and `depthViewOf('foreground:0')` returns the row's depth view (`renderTargets.ts:227`). Keep the connectors-before-glyphs order. Add a short comment: the depth view makes captions/connectors occlude per-pixel behind nearer bodies (the two foreground renderers are the `occludeAgainstDepth` instances; a non-occlusion instance would ignore this arg).

**`initGpu.ts`:** construct the two *foreground* instances with the occlusion flag:

```ts
// :502 — foregroundLabelRenderer gains the options bag (5th + 6th args stay defaulted via the capacity arg)
state.gpu.foregroundLabelRenderer = createLabelRenderer(
  uiCtx, format, fontAtlases, FOREGROUND_LABEL_CAPACITY, undefined, { occludeAgainstDepth: true },
);
// :521 — the leader-line sibling
state.gpu.foregroundMarkerLineRenderer = createMarkerLineRenderer(
  uiCtx, format, undefined, { occludeAgainstDepth: true },
);
```

(Confirm the exact positional args against the current `createLabelRenderer` / `createMarkerLineRenderer` signatures after Tasks 4/5 land — `maxGlyphsPerLabel` / `maxLines` default via `undefined`.) The COSMO instances at `initGpu.ts:213-214` (`labelRenderer`, `markerLineRenderer`) stay UNCHANGED — no flag, no occlusion.

**Test — `foregroundLabelsOcclusion.test.ts`:** mirror the existing `foregroundLabelsLayer.test.ts` mock scaffolding (the `rebaseViewProj` mock, `makeRenderer` / `makeLineRenderer` spies, `makeState`, `makeNear0View`, `makeCtx`). The one addition: give `ctx.renderTargets.depthViewOf` a sentinel-returning spy and assert both draws receive the sentinel as their 4th arg. This guards the thread-through that a refactor could silently drop — turning occlusion off with NO type error (the arg is optional).

```ts
it('passes the foreground:0 depth view to both the caption and leader-line draws', () => {
  const renderer = makeRenderer(6);
  const lineRenderer = makeLineRenderer();
  const state = makeState(renderer, lineRenderer);
  const view = makeNear0View();
  const sentinelDepthView = {} as GPUTextureView;
  const depthViewOf = vi.fn<(id: string) => GPUTextureView>(() => sentinelDepthView);
  // makeCtx returns a ReadyFrameContext; attach the renderTargets seam the layer reads.
  const ctx = { ...makeCtx(5e-4), renderTargets: { depthViewOf } } as unknown as ReadyFrameContext;

  foregroundLabelsLayer.draw(PASS_STUB, view, ctx, state);

  expect(depthViewOf).toHaveBeenCalledWith('foreground:0');
  const labelDraw = renderer.draw as unknown as ReturnType<typeof vi.fn>;
  const lineDraw = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
  expect(labelDraw.mock.calls[0]![3]).toBe(sentinelDepthView);
  expect(lineDraw.mock.calls[0]![3]).toBe(sentinelDepthView);
});
```

(The existing `foregroundLabelsLayer.test.ts` builds `ctx` via `makeCtx` without `renderTargets`; those tests will need `depthViewOf` too once the layer reads it — extend `makeCtx` there to attach a no-op `renderTargets.depthViewOf` so the suite stays green. Do that minimal edit in this task, in the existing file, rather than leaving it red.)

**Steps:**

- [ ] Write `foregroundLabelsOcclusion.test.ts` with the sentinel-depth-view assertion above (red — the layer does not read `depthViewOf` yet, and the draws receive only 3 args).
- [ ] Thread `depthView = ctx.renderTargets.depthViewOf('foreground:0')` into both `draw` calls in `foregroundLabelsLayer.ts`. Green.
- [ ] Extend the existing `foregroundLabelsLayer.test.ts` `makeCtx` to attach a `renderTargets.depthViewOf` (no-op returning a stub view) so its draws don't throw on the new read; confirm that file stays green.
- [ ] Construct the two foreground instances in `initGpu.ts` with `{ occludeAgainstDepth: true }`; leave the COSMO instances at `:213-214` unchanged.
- [ ] `npm test -- foregroundLabels` green (both files); `npm run typecheck` clean; `npm run build` clean.
- [ ] Commit (stage the three paths).

---

## Verification (visual — the load-bearing check)

Occlusion is a per-fragment GPU effect; the primary verification is visual on the running dev server (`:5175`, real data linked via `/link-data`). The USER runs this pass; HMR-driven shader tuning is not expected (there are no tunable constants here — the discard is exact). Confirm the spec's checks:

- **[V1]** Solar-system zoom, two planets roughly in line: the farther planet's caption + leader line are hidden where the nearer planet's disk covers them, and poke out where they clear its silhouette.
- **[V2]** A body's OWN caption is never clipped by its own disk (lifted above it into sky, where scene depth is `1.0`).
- **[V3]** The `near0-selection-ring` halo still draws ON TOP of bodies (it does not opt into occlusion — unaffected).
- **[V4]** COSMO galaxy/structure labels are visually unchanged (draw-order silhouette occlusion as before; they never opted in).
- **[V5]** Beyond-far star-map captions (viewed from inside the neighbourhood) are not spuriously clipped over empty sky.
- **[V6] iOS pass** — the depth-sample fragment variants compile and run on WebKit (stricter than Chrome's Tint; a bad shader silently drops the whole frame — CLAUDE.md). Confirm via `createShaderModuleWithDevLog` if anything fails to present.

After the visual pass: run `/feature-done` BEFORE merge (it gates the DoD, sweeps the backlog, and relocates this plan + its spec to `plans/completed/` + `specs/completed/`).

## Task order dependencies

- **Task 2 before Tasks 3, 4, 5** — the fragment variants import `lib/sceneDepth.wesl`; the renderers import `occlusionDepthGroup.ts`.
- **Task 3 before Task 4** — `labelRenderer` compiles `fragmentOcclude.wesl`.
- **Task 5** self-contained after Task 2 (its own fragment variant + renderer), parallel to Tasks 3/4.
- **Task 6 depends on Tasks 1, 2, 4, 5** — it constructs the occlusion instances (Tasks 4/5), threads the now-sampleable depth view (Task 1) through the layer, and both renderers must accept the 4th `sceneDepthView` arg.

## Interfaces produced by this plan

- **`lib/sceneDepth.wesl`** — NEW: `@group(1) @binding(0) var sceneDepthTex: texture_depth_2d;` + `occludedByScene(fragXY: vec2f, fragDepth: f32) -> bool`.
- **`occlusionDepthGroup.ts`** — NEW: `OCCLUSION_DEPTH_GROUP_INDEX = 1`, `OCCLUSION_DEPTH_LAYOUT_DESC: GPUBindGroupLayoutDescriptor`, `createOcclusionDepthBindGroup(device, layout, depthView): GPUBindGroup`.
- **`labels/fragmentOcclude.wesl` + `markerLines/fragmentOcclude.wesl`** — NEW discard-gated entry points over the extracted `shadeMsdf` / `shadeLine` shared shading functions.
- **`createLabelRenderer` / `createMarkerLineRenderer`** — gain a trailing `opts?: { occludeAgainstDepth?: boolean }`; their `draw` (and `LabelRenderer` / `MarkerLineRenderer` `.d.ts`) gain an optional 4th `sceneDepthView?: GPUTextureView`.
- **`renderTargets.ts`** — the `foreground:0` depth texture gains `TEXTURE_BINDING`.
- **`foregroundLabelsLayer.draw`** — threads `ctx.renderTargets.depthViewOf('foreground:0')` into both foreground renderer draws; `initGpu.ts` constructs the two foreground instances with `{ occludeAgainstDepth: true }`.
