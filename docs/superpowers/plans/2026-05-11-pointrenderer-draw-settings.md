# PointRenderer.draw — group params into PointDrawSettings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 16 trailing positional parameters of `pointRenderer.draw()` with a single `PointDrawSettings` record so adding a new visual knob is a one-line addition to one place instead of three.

**Architecture:** Define `PointDrawSettings` next to the `PointRenderer` type. Change `draw()`'s signature to `(pass, viewProj, viewportPx, settings)` — 4 args total. Refactor the body to destructure once. Update the sole call site in `pointSpritesPass.ts`. The new type sits next to the renderer (not in `frame/renderFrame.ts`'s `RenderFrameSettings`) so the renderer module owns its own contract — the engine adapts to it, not the other way around.

**Tech Stack:** TypeScript, WebGPU, vitest.

---

## Background

Today the signature in `src/services/gpu/renderers/pointRenderer.ts:635-655` (type) and `:1261-1297` (implementation) is:

```ts
draw(
  pass: GPURenderPassEncoder,
  viewProj: mat4,
  viewportPx: [number, number],
  pointSizePx: number,
  brightness: number,
  selectedPacked: number,
  visibleSourceMask: number,
  camPosWorld: Readonly<[number, number, number]>,
  pxPerRad: number,
  highlightFallback: boolean,
  realOnlyMode: boolean,
  biasMode: number,
  absMagLimit: number,
  apparentMagLimit: number,
  schechterMStar: number,
  schechterAlpha: number,
  depthFadeEnabled: boolean,
  pxFadeStart: number,
  pxFadeEnd: number,
): void;
```

The single call site is `src/services/engine/frame/passes/pointSpritesPass.ts:72-99`. The 16 scalars already live as a coherent block in `RenderFrameSettings` (renderFrame.ts:91-169) + the per-frame `ctx`. Grouping them at the renderer boundary closes the "one new knob → edit type + impl + caller" loop into "one new knob → edit type + impl; caller fills the new field once".

Naming convention rationale: `PointDrawSettings` (not `PointRenderSettings` — the renderer has lifecycle methods beyond drawing) lives next to `PointRenderer` and is exported from the same module.

## File map

- **Modify:** `src/services/gpu/renderers/pointRenderer.ts`
  - Add `export type PointDrawSettings = { … }` near the existing `PointRenderer` type declaration (around line 565, just before the type)
  - Change the `draw` method in the `PointRenderer` type alias (line 635-655) to `draw(pass, viewProj, viewportPx, settings: PointDrawSettings): void`
  - Change the `draw` implementation (line 1261-1297) signature + first ~10 lines to destructure from `settings`
  - Update the JSDoc above the implementation (line 1201-1260)

- **Modify:** `src/services/engine/frame/passes/pointSpritesPass.ts`
  - Build a `PointDrawSettings` literal at the call site
  - Update the module header comment at line 30-34 that mentions "17-arg `pointRenderer.draw` call"

- **Modify:** `tests/services/gpu/renderers/pointRenderer.test.ts`
  - Add one test that calls `draw()` with a `PointDrawSettings` object against the stub device, asserting it doesn't throw and that `pass.setPipeline` was called (proves new shape wires through)

No new files.

---

## Task 1: Add `PointDrawSettings` type and a smoke test that calls `draw()`

**Files:**
- Modify: `src/services/gpu/renderers/pointRenderer.ts` (add type only — do not yet change `draw` signature)
- Test: `tests/services/gpu/renderers/pointRenderer.test.ts`

This task gets the type definition into the module *without* changing the draw signature yet. The test we add will fail to compile in Task 2 — that's the TDD signal that the call site refactor must follow.

- [ ] **Step 1: Add the `PointDrawSettings` type export**

Open `src/services/gpu/renderers/pointRenderer.ts`. Find the `PointRenderer` type alias (search for `export type PointRenderer = {`, around line 565). Insert the following ABOVE it:

```ts
/**
 * Per-call draw parameters for `PointRenderer.draw`.
 *
 * Pre-cleanup, `draw()` took these as 16 trailing positional arguments
 * (`pointSizePx`, `brightness`, …, `pxFadeEnd`).  Grouping them into a
 * single record decouples the renderer's contract from the order each
 * argument was added in: callers fill named fields, new knobs are
 * added at the type level with one edit, and TypeScript's structural
 * matching catches a missing field at compile time instead of a silent
 * shifted-argument bug at draw time.
 *
 * Field semantics are unchanged from the pre-cleanup positional list;
 * see each field's inline doc for details.  The block deliberately
 * mirrors `RenderFrameSettings`'s naming (renderFrame.ts) so the
 * engine-side pass code can pass `{ …settings, … }` without renames.
 */
export type PointDrawSettings = {
  /** Far-field billboard floor radius in pixels.  Galaxies smaller than this stay rendered at this size; nearby galaxies grow past it to their real disc size. */
  pointSizePx: number;
  /** Global brightness multiplier in [0, 1]. */
  brightness: number;
  /** Selected galaxy as `(source << 27) | localIdx`, or `0xFFFFFFFF` for "no selection". */
  selectedPacked: number;
  /** Bitmask of `Source` values to draw (see `data/sources.ts`). */
  visibleSourceMask: number;
  /** Camera position in world Mpc (`orbitCamera.position`), used by the vertex shader for apparent-size sizing. */
  camPosWorld: Readonly<[number, number, number]>;
  /** Pixels-per-radian for the current viewport + FOV: `viewportPx[1] / (2 * tan(fovYRad / 2))`. */
  pxPerRad: number;
  /** When true, fallback-orientation fragments are tinted magenta in the visual shader.  Selection / pick paths unaffected. */
  highlightFallback: boolean;
  /** When true, fallback-orientation fragments are `discard`ed entirely. */
  realOnlyMode: boolean;
  /** Malmquist-bias correction selector (`data/biasMode.ts`).  0 = no correction; next four fields ignored. */
  biasMode: number;
  /** Volume-limit threshold for `biasMode == 1`.  Galaxies fainter than this are discarded in the vertex stage. */
  absMagLimit: number;
  /** Reserved for `biasMode == 2` (1/V_max). */
  apparentMagLimit: number;
  /** Initial Schechter M* — per-source override applies in the draw loop. */
  schechterMStar: number;
  /** Initial Schechter α — per-source override applies in the draw loop. */
  schechterAlpha: number;
  /** Whether the points pass applies depth-based alpha fade. */
  depthFadeEnabled: boolean;
  /** Procedural-disk crossfade band — pixel threshold below which points render full-alpha. */
  pxFadeStart: number;
  /** Procedural-disk crossfade band — pixel threshold above which points render zero-alpha (hand-off to disk pass). */
  pxFadeEnd: number;
};

```

- [ ] **Step 2: Run typecheck to verify the type compiles**

Run: `npm run typecheck`
Expected: PASS (no errors). The type is currently unused — TypeScript does not flag unused exports.

- [ ] **Step 3: Add a smoke test that calls `draw()` with the new shape**

This test will INITIALLY FAIL because `draw()` still takes positional args. That's the TDD signal.

In `tests/services/gpu/renderers/pointRenderer.test.ts`, append the following `describe` block at the end of the file (after the last existing `describe`):

```ts
describe('PointRenderer.draw — PointDrawSettings shape', () => {
  it('accepts a single PointDrawSettings record', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.SDSS, makeCloud(10));

    // Stub the encoder.  draw() must call setPipeline + setBindGroup + draw
    // once (one source loaded, one passing visibility bit).
    const calls: string[] = [];
    const pass = {
      setPipeline: () => calls.push('setPipeline'),
      setBindGroup: () => calls.push('setBindGroup'),
      setVertexBuffer: () => calls.push('setVertexBuffer'),
      draw: () => calls.push('draw'),
    } as unknown as GPURenderPassEncoder;

    const viewProj = new Float32Array(16) as unknown as Parameters<PointRenderer['draw']>[1];

    renderer.draw(pass, viewProj, [800, 600], {
      pointSizePx: 1,
      brightness: 1,
      selectedPacked: 0xffffffff >>> 0,
      visibleSourceMask: 0xffffffff,
      camPosWorld: [0, 0, 0],
      pxPerRad: 1,
      highlightFallback: false,
      realOnlyMode: false,
      biasMode: 0,
      absMagLimit: 0,
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
      depthFadeEnabled: false,
      pxFadeStart: 0,
      pxFadeEnd: 0,
    });

    expect(calls).toContain('setPipeline');
    expect(calls).toContain('draw');
  });
});
```

You may also need to import `GPURenderPassEncoder` — it's a global ambient type from `@webgpu/types`, so usually no import is needed. If the test file does not already import `PointRenderer`, add it to the existing import: change

```ts
import {
  type PointRenderer,
  createPointRenderer,
  setBuildBufferRunner,
} from '../../../../src/services/gpu/renderers/pointRenderer';
```

(it's already imported — leave as-is).

- [ ] **Step 4: Run the new test to verify it fails as expected**

Run: `npm test -- pointRenderer.test.ts`
Expected: the new test FAILS to compile with TypeScript error "Expected 19 arguments, but got 4" or similar. Other tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/renderers/pointRenderer.ts tests/services/gpu/renderers/pointRenderer.test.ts
git commit -m "$(cat <<'EOF'
refactor(pointRenderer): introduce PointDrawSettings type

Add the grouped settings type and a failing test that calls draw()
with the new shape.  The draw() signature change follows in the
next commit — this one stages the type so the refactor lands as a
clean two-step.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Note: this commit intentionally leaves a failing test on `main` would be bad — but we're on a feature branch and the next commit lands immediately.

---

## Task 2: Refactor `draw()` signature and the single call site

**Files:**
- Modify: `src/services/gpu/renderers/pointRenderer.ts` (type alias + implementation + JSDoc)
- Modify: `src/services/engine/frame/passes/pointSpritesPass.ts` (call site + module comment)

- [ ] **Step 1: Update the `PointRenderer` type alias**

In `src/services/gpu/renderers/pointRenderer.ts`, find the `draw` method declaration inside `export type PointRenderer = {` (around line 635). Replace:

```ts
  /** Issue one instanced draw call per visible source. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    pointSizePx: number,
    brightness: number,
    selectedPacked: number,
    visibleSourceMask: number,
    camPosWorld: Readonly<[number, number, number]>,
    pxPerRad: number,
    highlightFallback: boolean,
    realOnlyMode: boolean,
    biasMode: number,
    absMagLimit: number,
    apparentMagLimit: number,
    schechterMStar: number,
    schechterAlpha: number,
    depthFadeEnabled: boolean,
    pxFadeStart: number,
    pxFadeEnd: number,
  ): void;
```

with:

```ts
  /** Issue one instanced draw call per visible source. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    settings: PointDrawSettings,
  ): void;
```

- [ ] **Step 2: Update the JSDoc above the implementation**

Find the JSDoc starting at line ~1201 (`* Write the per-frame uniforms (viewProj, viewport, …) once, then issue one`). The per-`@param` block from `pointSizePx` through `schechterAlpha` is now a single `@param settings` entry. Replace the entire JSDoc block (from `/**` through `*/`) with:

```ts
  /**
   * Write the per-frame uniforms (viewProj, viewport, …) once, then issue one
   * instanced draw call per visible source.
   *
   * @param pass        Active render pass encoder.
   * @param viewProj    Column-major 4×4 view-projection matrix.
   * @param viewportPx  Physical canvas size [w, h] in pixels.
   * @param settings    Per-draw scalar inputs.  See `PointDrawSettings` for the
   *                    full field list — every field flows into the global
   *                    uniform buffer this method writes once, before iterating
   *                    visible sources.
   */
```

- [ ] **Step 3: Update the implementation signature**

Find `function draw(` at line ~1261. Replace the entire signature (from `function draw(` through the matching `): void {`) with:

```ts
  function draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    settings: PointDrawSettings,
  ): void {
    const {
      pointSizePx,
      brightness,
      selectedPacked,
      visibleSourceMask,
      camPosWorld,
      pxPerRad,
      highlightFallback,
      realOnlyMode,
      biasMode,
      absMagLimit,
      apparentMagLimit,
      schechterMStar,
      schechterAlpha,
      depthFadeEnabled,
      pxFadeStart,
      pxFadeEnd,
    } = settings;
```

Do NOT change the body below this destructure — every reference to the named scalars still resolves the same way.

- [ ] **Step 4: Update the call site in `pointSpritesPass.ts`**

In `src/services/engine/frame/passes/pointSpritesPass.ts`, replace the `renderer.draw(...)` call (lines 72-99) with:

```ts
    renderer.draw(pass, vp, [width, height], {
      pointSizePx: settings.pointSizePx,
      brightness: settings.brightness,
      selectedPacked,
      visibleSourceMask: settings.visibleSourceMask,
      camPosWorld: drawCamPos,
      pxPerRad: drawPxPerRad,
      highlightFallback: settings.highlightFallback,
      realOnlyMode: settings.realOnlyMode,
      biasMode: settings.biasMode,
      absMagLimit: settings.absMagLimit,
      apparentMagLimit: settings.apparentMagLimit,
      schechterMStar: settings.schechterMStar,
      schechterAlpha: settings.schechterAlpha,
      depthFadeEnabled: settings.depthFadeEnabled,
      // Task 8 (procedural-disk-impostor): the points-pass fragment
      // fades alpha to zero across this same apparent-pixel-size band
      // that the procedural-disk pass fades IN over.  Both thresholds
      // come from `subsystems/thumbnailSubsystem`'s exported constants
      // — single source of truth shared between the two passes so
      // they can never drift apart and re-introduce the double-bright
      // donut artefact.
      pxFadeStart: settings.pxFadeStartPoints,
      pxFadeEnd: settings.pxFadeEndPoints,
    });
```

- [ ] **Step 5: Update the module-header comment in `pointSpritesPass.ts`**

Find the line at `pointSpritesPass.ts:30-34`:

```
 * - The whole `RenderFrameSettings` block — every entry of the
 *   17-arg `pointRenderer.draw` call originates either there or in
 *   `ctx`.  See `renderFrame.ts`'s `RenderFrameSettings` shape for
 *   the per-field rationale.
```

Replace with:

```
 * - The whole `RenderFrameSettings` block — every field of the
 *   `PointDrawSettings` object passed to `pointRenderer.draw`
 *   originates either there or in `ctx`.  See `renderFrame.ts`'s
 *   `RenderFrameSettings` shape for the per-field rationale.
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — both `tsc` invocations succeed.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — 1061 tests pass (1060 prior + 1 new draw smoke test). Critically, the new `'accepts a single PointDrawSettings record'` test now passes.

- [ ] **Step 8: Commit**

```bash
git add src/services/gpu/renderers/pointRenderer.ts src/services/engine/frame/passes/pointSpritesPass.ts
git commit -m "$(cat <<'EOF'
refactor(pointRenderer): collapse 16 trailing draw() params into PointDrawSettings

Single call site updated; module-level doc references updated.
No behavior change — the uniform buffer write order, the per-source
draw loop, and the cloud-fade per-instance bind-group strategy are
all byte-identical.

Closes H1 from the 2026-05-11 architectural audit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verification

- [ ] **Step 1: Final typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Final full test suite**

Run: `npm test`
Expected: 1061 tests pass (was 1060; +1 from new smoke test).

- [ ] **Step 3: Build sanity-check**

Run: `npm run build 2>&1 | tail -20`
Expected: Vite build completes without errors. Output ends with `✓ built in <N>s`.

- [ ] **Step 4: Visual smoke check (manual)**

The dev server is left running per project convention. Ask the user to confirm the scene still renders identically — points should bloom, fade, and respond to bias-mode toggles exactly as before. No frame should be visually different.

- [ ] **Step 5: Open PR**

If everything passes, push the branch and open a PR. Title: `refactor(pointRenderer): PointDrawSettings — collapse 16 draw() params into one record`.

---

## Self-review notes

- **Spec coverage:** Type added (Task 1), signature changed (Task 2), call site updated (Task 2), JSDoc updated (Task 2), module comment updated (Task 2 step 5), test added (Task 1 + verified in Task 2). All five touch points listed in the file map have at least one step.
- **Placeholders:** None — every step shows the exact code or command.
- **Type consistency:** `PointDrawSettings` is defined once (Task 1 step 1) and used twice (type alias step 1 of Task 2, implementation step 3 of Task 2). The call site (Task 2 step 4) does not name the type — it relies on contextual typing through the parameter. Field names (`pxFadeStart` / `pxFadeEnd`) deliberately drop the `Points` suffix used in `RenderFrameSettings` because the renderer doesn't know what it's crossfading *with* — keep the renderer-side name generic. The call site is the translation point.
