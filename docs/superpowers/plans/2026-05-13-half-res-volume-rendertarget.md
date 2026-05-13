# Half-resolution scalar-volume offscreen render target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every scalar-volume raymarch into a half-resolution rgba16float offscreen target, then bilinearly upsample-and-additively-blend into the HDR target. Cuts the fragment count of the volume pass by 4x without visible quality loss on the bandlimited 3D textures.

**Architecture:** Lift `scalarVolumePass` out of `HDR_PASSES`. Introduce two new frame-encoder helpers — `encodeVolumes` (raymarch into the half-res target) runs before the HDR mega-pass, and a new `volumeUpsamplePass` joins `HDR_PASSES` in the slot the old `scalarVolumePass` occupied. The half-res target lives on its own module `src/services/gpu/passes/volumeOffscreen.ts`, exposed at `state.gpu.volumeOffscreen`. It resizes in lockstep with the HDR target but is a separate module because conceptually it has nothing to do with the tone-map.

**Tech Stack:** WebGPU, WESL/WGSL, TypeScript, gl-matrix, Vitest.

---

## REVISION NOTE (mid-execution refactor)

Task 2 originally added the half-res target as a second field on `PostProcess` (`postProcess.halfResView`). During execution the user pointed out that this conflated two unrelated responsibilities — `postProcess` is the tone-map step, and its only input is the HDR view. The half-res target is the volume pass's *output*, not the tone-map's input. Putting both targets on one module made the role of `PostProcess` ambiguous.

The target was therefore extracted into a dedicated module `src/services/gpu/passes/volumeOffscreen.ts` with its own type `VolumeOffscreen` (view + resize + destroy). It is now reachable via `state.gpu.volumeOffscreen.view` (and once Task 3 lands, `ctx.volumeOffscreen.view` inside a `ReadyFrameContext`).

**When reading the rest of this plan, substitute:**
- `postProcess.halfResView` → `volumeOffscreen.view`
- `ctx.postProcess.halfResView` → `ctx.volumeOffscreen.view`
- `state.gpu.postProcess.halfResView` → `state.gpu.volumeOffscreen.view`

Task 2 below documents the original (pre-refactor) approach for the audit trail; do NOT re-execute it. The refactor commit replaced its outcome with the volumeOffscreen module.

---

## Pre-flight context (read before starting Task 1)

This plan touches the HDR encoder topology. Before editing, read in order:

- `src/services/engine/frame/renderFrame.ts` — the orchestrator.
- `src/services/engine/frame/encodeHdrSingle.ts` + `encodeHdrSplit.ts` — the two HDR-rendering shapes.
- `src/services/engine/frame/passes/index.ts` — the `HDR_PASSES` registry.
- `src/services/engine/frame/passes/scalarVolumePass.ts` — the pass being replaced.
- `src/services/gpu/passes/postProcess.ts` — where the HDR target lives. The half-res target is being added to this module.
- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — the raymarch renderer. Its `draw(pass, vp, viewportPx, camPosWorld)` signature is unchanged by this work; only the `pass` it's given changes (a half-res render pass instead of the HDR mega-pass).

Confirmed invariants this plan relies on:

- `scalarVolumeRenderer.draw` already takes a `GPURenderPassEncoder`. It does not introspect the encoder's attachment; it just records draws. We can hand it a render pass against the half-res target with zero renderer changes.
- The scalar-volume pipeline's blend state is `{ srcFactor: 'one', dstFactor: 'one', operation: 'add' }` for **both** color and alpha (see `createScalarVolumeRenderer` in `scalarVolumeRenderer.ts`). This is what makes the half-res sum mathematically equivalent to the in-place additive composite (modulo bilinear interpolation).
- `postProcess.view` (the HDR target view) is recreated on every `postProcess.resize(...)` call and `engine.ts` already calls that on canvas resize (see `runFrame.ts` resize block). The half-res target piggy-backs on this resize call site.
- `volumesEnabled` is the only master toggle. There is no per-half-res-scale-factor UI knob in this plan — the scale factor is a hard-coded 2x downscale.

Open question flagged for the implementer:

- **Q1**: Does the upsample shader read the half-res target with a `sampler` (so the GPU does the bilinear filter) or compute it manually? Use a linear `sampler` — `rgba16float` is **not** filterable by default in WebGPU, but the `float32-filterable` feature isn't required for `rgba16float` linear sampling on Tier 1 adapters; sampling-with-`linear` is the documented happy path. If a future device-feature audit forbids it, fall back to a manual 2×2 fetch in the fragment shader (one `textureLoad` per corner, manual lerp). Task 4 ships the sampler-based version; the fragment shader has a `TODO(manual-bilinear)` comment marking where the fallback would slot in.

---

### Task 1: Add `'volume-upsample'` to TIMING_SLOT_NAMES

The new pass joins the timing UI as one row. Slot pair `(18, 19)` is the next free pair after `pick` (16, 17); the query set is already sized 32 so no resize is needed.

**Files:**
- Modify: `src/@types/gpu/timing/TimingSlotName.d.ts`
- Modify: `src/services/gpu/timing/TIMING_SLOT_NAMES.ts`
- Test: `tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`

- [ ] **Step 1: Update the failing test first**

Edit `tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`. Add the new slot assertion in the first `it` block:

```typescript
    expect(TIMING_SLOT_NAMES.get('pick')).toEqual([16, 17]);
    expect(TIMING_SLOT_NAMES.get('volume-upsample')).toEqual([18, 19]);
  });
```

And update the count in the second `it` block:

```typescript
  it('reserves slots 20-31 (query set sized 32, 10 in use)', () => {
    expect(TIMING_QUERY_SET_SIZE).toBe(32);
    expect(TIMING_SLOT_NAMES.size).toBe(10);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`
Expected: FAIL — `volume-upsample` not present in map, and size is 9 not 10.

- [ ] **Step 3: Extend the `TimingSlotName` type**

In `src/@types/gpu/timing/TimingSlotName.d.ts`, add the new union member at the bottom and update the docstring's "9 inhabitants" count:

```typescript
export type TimingSlotName =
  | 'point-sprites'
  | 'procedural-disks'
  | 'textured-impostors'
  | 'filaments'
  | 'scalar-volume'
  | 'milky-way'
  | 'tone-map'
  | 'ui-overlay'
  | 'pick'
  | 'volume-upsample';
```

Update the count comment in the file header from "9 inhabitants" to "10 inhabitants" so the docstring stays honest.

- [ ] **Step 4: Add the row to TIMING_SLOT_NAMES**

In `src/services/gpu/timing/TIMING_SLOT_NAMES.ts`, append the new row to the Map literal:

```typescript
  ['pick', [16, 17]],
  ['volume-upsample', [18, 19]],
]);
```

Update the table in the module header docstring — add the new row between `pick` and `_reserved_`:

```
 *   | pick                  | 16        | 17      |
 *   | volume-upsample       | 18        | 19      |
 *   | _reserved_            | 20–31     |         |
```

And update the prose: "10 slots × 2 indices = 20" instead of "9 × 2 = 18".

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/@types/gpu/timing/TimingSlotName.d.ts \
        src/services/gpu/timing/TIMING_SLOT_NAMES.ts \
        tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts
git commit -m "feat(timing): add volume-upsample slot for half-res volume work"
```

---

### Task 2: Add a half-resolution target to `PostProcess`

The half-res rgba16float target lives on the `PostProcess` aggregate alongside the HDR target. They share a lifetime (both are sized to the canvas backing store) so they should share the resize call. Pre-existing convention: `postProcess.view` is the HDR view. We add a parallel `halfResView` accessor and resize them together.

**Files:**
- Modify: `src/@types/rendering/PostProcess.d.ts`
- Modify: `src/services/gpu/passes/postProcess.ts`
- Test: `tests/services/gpu/passes/postProcess.test.ts`

- [ ] **Step 1: Write failing tests for the half-res target**

Append two new `it` blocks to the existing `describe('createPostProcess', ...)` in `tests/services/gpu/passes/postProcess.test.ts`:

```typescript
  it('exposes a halfResView sized at floor(canvas / 2) with min 1 px', () => {
    const device = mockDevice();
    const post = createPostProcess(device, 'bgra8unorm', { width: 800, height: 600 });
    expect(post.halfResView).toBeDefined();
    // Two textures should be allocated at construction: the HDR target
    // plus the half-res offscreen target.
    expect((device.createTexture as any).mock.calls).toHaveLength(2);
    const halfResDesc = (device.createTexture as any).mock.calls[1][0];
    expect(halfResDesc.size).toEqual({ width: 400, height: 300 });
    expect(halfResDesc.format).toBe('rgba16float');
  });

  it('resizes both HDR and half-res views together, floored and min-1', () => {
    const device = mockDevice();
    const post = createPostProcess(device, 'bgra8unorm', { width: 800, height: 600 });
    const hdrBefore = post.view;
    const halfBefore = post.halfResView;
    post.resize({ width: 1, height: 1 });
    // floor(1 / 2) = 0 → clamped to 1.
    const halfResDesc = (device.createTexture as any).mock.calls.at(-1)[0];
    expect(halfResDesc.size).toEqual({ width: 1, height: 1 });
    expect(post.view).not.toBe(hdrBefore);
    expect(post.halfResView).not.toBe(halfBefore);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/gpu/passes/postProcess.test.ts`
Expected: FAIL — `post.halfResView` is undefined.

- [ ] **Step 3: Extend the `PostProcess` type**

In `src/@types/rendering/PostProcess.d.ts`, add `halfResView` between `view` and `resize`:

```typescript
export type PostProcess = {
  /** Current HDR colour-attachment view, stable until the next `resize()` call. */
  readonly view: GPUTextureView;
  /**
   * Half-resolution rgba16float view sized at `floor(canvas / 2)` per axis
   * (minimum 1 px).  Used as the colour attachment for the scalar-volume
   * pass — every volume field raymarches into this target with additive
   * blending, then a fullscreen upsample pass bilinearly samples it and
   * additively blends into the HDR target.
   *
   * Why on `PostProcess` rather than its own module: the half-res target's
   * lifetime is identical to the HDR target's (both are sized to the
   * canvas backing store, both recreated on resize, both released on
   * destroy).  Co-locating them avoids a second resize call site and a
   * second `state.gpu.*` field — one resize touches both.
   *
   * Why `rgba16float`: matches the HDR target's precision so the additive
   * sum doesn't lose dynamic range across the up-sample boundary.  Lower
   * precision would clip the bright tail of overlapping fields.
   */
  readonly halfResView: GPUTextureView;
  /** Recreate the HDR + half-res textures at a new size.  Old views become invalid. */
  resize(size: Size): void;
  // ... rest unchanged ...
```

(Keep the existing `draw` and `destroy` declarations as-is.)

- [ ] **Step 4: Allocate the half-res texture in `createPostProcess`**

Edit `src/services/gpu/passes/postProcess.ts`. After the existing `allocateHdr` helper, add a parallel `allocateHalfRes` helper and call both from `resize`:

```typescript
  // ── HDR target (lifecycle-controlled by resize/destroy) ───────────────
  let hdrTexture: GPUTexture | null = null;
  let hdrView: GPUTextureView | null = null;

  function allocateHdr(s: Size): void {
    if (hdrTexture) hdrTexture.destroy();
    hdrTexture = device.createTexture({
      label: 'hdr-target',
      format: 'rgba16float',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    hdrView = hdrTexture.createView();
  }

  // ── Half-resolution offscreen target for the scalar-volume pass ──────
  //
  // Sized at floor(canvas / 2) on each axis with a min of 1 px.  Why floor
  // not round: the math works for either choice, but floor matches the
  // upsample shader's "sample at uv" semantics — sampling a half-res target
  // with linear filtering at full-res fragment UVs is equivalent to a 2x
  // bilinear upscale.  Min 1 px protects against the degenerate
  // `floor(1 / 2) = 0` case (legal canvas sizes, illegal texture sizes).
  let halfResTexture: GPUTexture | null = null;
  let halfResView: GPUTextureView | null = null;

  function allocateHalfRes(s: Size): void {
    if (halfResTexture) halfResTexture.destroy();
    const w = Math.max(1, Math.floor(s.width / 2));
    const h = Math.max(1, Math.floor(s.height / 2));
    halfResTexture = device.createTexture({
      label: 'volume-half-res-target',
      format: 'rgba16float',
      size: { width: w, height: h },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    halfResView = halfResTexture.createView();
  }

  allocateHdr(size);
  allocateHalfRes(size);
```

In the returned object, add the `halfResView` getter and extend `resize` and `destroy`:

```typescript
  return {
    get view(): GPUTextureView {
      if (!hdrView) throw new Error('postProcess: view accessed after destroy');
      return hdrView;
    },
    get halfResView(): GPUTextureView {
      if (!halfResView) throw new Error('postProcess: halfResView accessed after destroy');
      return halfResView;
    },
    resize(s: Size): void {
      allocateHdr(s);
      allocateHalfRes(s);
    },
    draw(encoder, swapView, exposure, curve, timingDescriptor): void {
      // ... existing body unchanged ...
    },
    destroy(): void {
      if (hdrTexture) hdrTexture.destroy();
      hdrTexture = null;
      hdrView = null;
      if (halfResTexture) halfResTexture.destroy();
      halfResTexture = null;
      halfResView = null;
      uniformBuffer.destroy();
    },
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/gpu/passes/postProcess.test.ts`
Expected: PASS for the two new tests; existing tests still pass (resize and destroy already worked, we just added a parallel allocation).

- [ ] **Step 6: Commit**

```bash
git add src/@types/rendering/PostProcess.d.ts \
        src/services/gpu/passes/postProcess.ts \
        tests/services/gpu/passes/postProcess.test.ts
git commit -m "feat(postProcess): add half-res offscreen target alongside HDR"
```

---

### Task 3: Thread `volumeOffscreen` through `ReadyFrameContext`

**REVISED.** Originally this task pinned `postProcess.halfResView` as a regression test only — but during execution the half-res target was lifted out of `PostProcess` into its own `volumeOffscreen` module (commit landed mid-plan). Consumers now read `state.gpu.volumeOffscreen.view` instead of `state.gpu.postProcess.halfResView`. This task adds `volumeOffscreen` to the `ReadyFrameContext` type so it is reachable from any consumer (the upsample pass, the `encodeVolumes` helper).

The construction-time guarantee: `state.gpu.volumeOffscreen` is set by `initGpu` in the same phase as `state.gpu.postProcess`, so by the time `engineReady()` returns true the field is non-null. This is the same lifecycle invariant `postProcess` already enjoys.

**Files:**
- Modify: `src/@types/engine/frame/ReadyFrameContext.d.ts` — add `volumeOffscreen: VolumeOffscreen`.
- Modify: `src/@types/engine/ReadyEngineState.d.ts` — narrow `state.gpu.volumeOffscreen` to non-null.
- Modify: `src/services/engine/helpers/engineReady.ts` — include the non-null check.
- Modify: `src/services/engine/frame/frameContext.ts` (`deriveFrameContext`) — forward the handle onto `ctx`.
- Test: `tests/services/engine/frame/frameContext.test.ts` — regression for the round-trip.

- [ ] **Step 1: Widen `ReadyEngineState` and `ReadyFrameContext`**

Add the new field to both types:

```typescript
// src/@types/engine/ReadyEngineState.d.ts
import type { VolumeOffscreen } from '../rendering/VolumeOffscreen';

export type ReadyEngineState = EngineState & {
  cam: OrbitCamera;
  gpu: EngineState['gpu'] & {
    renderer: PointRenderer;
    pickRenderer: PickRenderer;
    postProcess: PostProcess;
    volumeOffscreen: VolumeOffscreen;
  };
  ...
};
```

```typescript
// src/@types/engine/frame/ReadyFrameContext.d.ts
import type { VolumeOffscreen } from '../../rendering/VolumeOffscreen';
// inside the type literal, parallel to `postProcess: PostProcess;`:
  volumeOffscreen: VolumeOffscreen;
```

- [ ] **Step 2: Tighten `isEngineReady`**

In `src/services/engine/helpers/engineReady.ts`, add `state.gpu.volumeOffscreen !== null &&` alongside the existing `postProcess` check.

- [ ] **Step 3: Forward the handle through `deriveFrameContext`**

In `src/services/engine/frame/frameContext.ts`, add `volumeOffscreen: state.gpu.volumeOffscreen` (or whatever the existing forwarding pattern is — match the `postProcess` line exactly).

- [ ] **Step 4: Add a regression test**

```typescript
  it('forwards state.gpu.volumeOffscreen onto the ready context', () => {
    const offscreen = {
      view: {} as GPUTextureView,
      resize: () => {},
      destroy: () => {},
    };
    const state = buildReadyState({ volumeOffscreen: offscreen });
    const ctx = deriveFrameContext(state, { width: 1280, height: 720 } as HTMLCanvasElement);
    expect(ctx.isReady).toBe(true);
    if (ctx.isReady) {
      expect(ctx.volumeOffscreen).toBe(offscreen);
    }
  });
```

Match the existing `buildReadyState` helper in the file. If it doesn't already accept a `volumeOffscreen` override, extend its signature with that one new optional field.

- [ ] **Step 5: Run typecheck + the affected tests**

```bash
npm run typecheck
npx vitest run tests/services/engine/frame/frameContext.test.ts tests/services/engine/helpers/engineReady.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/frame/ReadyFrameContext.d.ts \
        src/@types/engine/ReadyEngineState.d.ts \
        src/services/engine/helpers/engineReady.ts \
        src/services/engine/frame/frameContext.ts \
        tests/services/engine/frame/frameContext.test.ts
git commit -m "feat(frame): thread volumeOffscreen through ReadyFrameContext"
```

---

### Task 4: Build the upsample pipeline + WESL shaders

A trivial fullscreen pass: same covering-triangle vertex shader as tone-map, fragment samples the half-res target with a linear sampler and outputs RGBA. The render-pipeline blend state is additive `(one, one)` for both color and alpha — that's what makes the upsample mathematically equivalent to having drawn the volumes in-place in the HDR pass (modulo bilinear interpolation).

**Files:**
- Create: `src/services/gpu/shaders/volumeUpsample/vertex.wesl`
- Create: `src/services/gpu/shaders/volumeUpsample/fragment.wesl`
- Create: `src/services/gpu/shaders/volumeUpsample/io.wesl`
- Create: `src/services/gpu/passes/volumeUpsample.ts`
- Create: `src/@types/rendering/VolumeUpsample.d.ts`
- Test: `tests/services/gpu/passes/volumeUpsample.test.ts`

- [ ] **Step 1: Write the io WESL module**

Create `src/services/gpu/shaders/volumeUpsample/io.wesl`:

```wgsl
// volumeUpsample/io.wesl — shared structs for the half-res-to-HDR upsample pass.
//
// The upsample pass mirrors the tone-map pass's shape (covering-triangle
// vertex stage emitting a UV, fragment stage sampling one texture).  We
// keep io minimal — just the vertex-to-fragment interface — because the
// fragment uses no uniform buffer (no exposure / curve knobs to thread).
//
// ## Why split into io/vertex/fragment
//
// Same rationale as the tone-map pass: each stage compiles a strictly-
// smaller GPUShaderModule from disjoint source, and the io module is the
// single authoritative source of the VSOut shape so a typo can't drift
// the vertex and fragment apart.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
```

- [ ] **Step 2: Write the vertex WESL module**

Create `src/services/gpu/shaders/volumeUpsample/vertex.wesl`:

```wgsl
// volumeUpsample/vertex.wesl — fullscreen covering-triangle vertex stage.
//
// Identical to toneMap/vertex.wesl: synthesise three vertices that cover
// the entire viewport with UVs in [0, 1]².  The fragment stage samples
// the half-res target at `in.uv` with a linear sampler, which gives us
// a free 2x bilinear upscale.

import package::volumeUpsample::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Standard 'big triangle' trick — see toneMap/vertex.wesl for the
  // why-not-a-quad rationale.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
```

- [ ] **Step 3: Write the fragment WESL module**

Create `src/services/gpu/shaders/volumeUpsample/fragment.wesl`:

```wgsl
// volumeUpsample/fragment.wesl — sample the half-res target with bilinear
// filtering and emit the sample for additive blending into the HDR target.
//
// ## Why this is safe to bilinear-sample
//
// Every scalar-volume field draws into the half-res target with additive
// blending '(one, one)' for color AND alpha (see scalarVolumeRenderer.ts's
// pipeline blend state).  So the half-res target holds the additive sum
// of every field's contribution.  Bilinear sampling reads a weighted
// average of the four nearest half-res texels — mathematically equivalent
// to a low-pass-filtered reconstruction of the original sum.  The scalar-
// field data is bandlimited (3D textures are smooth; the per-fragment
// jitter dither in the raymarcher already covers high-frequency
// aliasing), so the bilinear blur is invisible.
//
// The pipeline blend state ((one, one) for both color and alpha) then
// adds this sampled value to the HDR target — net effect is identical
// to the pre-half-res "draw volumes directly into HDR" path up to the
// bilinear interpolation.
//
// TODO(manual-bilinear): if a future device-feature audit forbids
// 'linear' filtering on rgba16float, replace `textureSample` with four
// `textureLoad`s at the integer corner texels and a manual lerp.  The
// io.wesl interface and the consumer pipeline don't need to change.

import package::volumeUpsample::io::VSOut;

@group(0) @binding(0) var halfTex: texture_2d<f32>;
@group(0) @binding(1) var halfSamp: sampler;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return textureSample(halfTex, halfSamp, in.uv);
}
```

- [ ] **Step 4: Write the `VolumeUpsample` type declaration**

Create `src/@types/rendering/VolumeUpsample.d.ts`:

```typescript
/**
 * VolumeUpsample — fullscreen pass that samples the half-resolution
 * scalar-volume target with bilinear filtering and additively blends
 * the result into the HDR target.
 *
 * Owned by the engine alongside `PostProcess` because both are
 * fullscreen blits with similar lifetimes; constructed once at
 * `initGpu` and torn down by `destroy()`.
 *
 * ### Blend semantics — load-bearing
 *
 * The render pipeline is built with additive blending
 * '{ srcFactor: "one", dstFactor: "one", operation: "add" }' for BOTH
 * color and alpha.  This matches the scalar-volume pipeline's blend
 * state byte-for-byte — the upsampled half-res sample is added to the
 * HDR destination, exactly as if every field had drawn directly into
 * the HDR target.
 *
 * ### Why no `resize` method
 *
 * The pipeline is viewport-independent (the covering triangle covers
 * any viewport) and the half-res texture view is rebound on every
 * `draw` call (passed in as a parameter rather than cached) so a
 * resize of the half-res target needs no bookkeeping here.
 */

export type VolumeUpsample = {
  /**
   * Encode the fullscreen upsample draw into an already-open render
   * pass against the HDR target.  The caller is responsible for the
   * pass's lifecycle (`beginRenderPass` / `end`) — this method only
   * records `setPipeline` / `setBindGroup` / `draw`.
   *
   * @param pass          The render pass encoder writing into the HDR
   *                      target.  Must have been opened against the
   *                      HDR colour attachment with an additive-compatible
   *                      `loadOp` (typically `'load'` after the volume
   *                      pre-step has emitted its target).
   * @param halfResView   The half-resolution offscreen view to sample.
   *                      Bound fresh on every draw because the view
   *                      changes on canvas resize.
   */
  draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void;
  /** Tear down — releases the sampler, bind-group-layout, and pipeline. */
  destroy(): void;
};
```

- [ ] **Step 5: Write the failing test for the factory + draw shape**

Create `tests/services/gpu/passes/volumeUpsample.test.ts`:

```typescript
/**
 * volumeUpsample — unit tests for the half-res-to-HDR upsample pass
 * factory.  Mocks GPUDevice so the test runs in Vitest without a real
 * GPU.  Covers:
 *
 *   - the factory builds a pipeline with additive blend for both
 *     color and alpha (this is the load-bearing invariant — the
 *     upsample must add into HDR, not overwrite)
 *   - the linear sampler used for bilinear is allocated
 *   - draw() records exactly the expected commands on the pass
 *   - destroy() doesn't throw
 */
import { describe, it, expect, vi } from 'vitest';
import { createVolumeUpsample } from '../../../../src/services/gpu/passes/volumeUpsample';

function mockDevice(): GPUDevice {
  const renderPipelineDescs: GPURenderPipelineDescriptor[] = [];
  const samplerDescs: GPUSamplerDescriptor[] = [];
  return {
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn((desc: GPUSamplerDescriptor) => {
      samplerDescs.push(desc);
      return {};
    }),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelineDescs.push(desc);
      return {};
    }),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
    // Test-only escape hatch: expose what the factory created.
    __renderPipelineDescs: renderPipelineDescs,
    __samplerDescs: samplerDescs,
  } as unknown as GPUDevice;
}

describe('createVolumeUpsample', () => {
  it('builds a pipeline with additive blend for color and alpha', () => {
    const device = mockDevice();
    createVolumeUpsample(device, 'rgba16float');
    const descs = (device as any).__renderPipelineDescs as GPURenderPipelineDescriptor[];
    expect(descs).toHaveLength(1);
    const target = (descs[0].fragment as GPUFragmentState).targets![0]!;
    expect(target!.blend).toEqual({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
  });

  it('uses a linear sampler so the GPU performs the bilinear filter', () => {
    const device = mockDevice();
    createVolumeUpsample(device, 'rgba16float');
    const samplers = (device as any).__samplerDescs as GPUSamplerDescriptor[];
    expect(samplers).toHaveLength(1);
    expect(samplers[0]!.magFilter).toBe('linear');
    expect(samplers[0]!.minFilter).toBe('linear');
  });

  it('draw() records setPipeline, setBindGroup, draw(3, 1)', () => {
    const device = mockDevice();
    const upsample = createVolumeUpsample(device, 'rgba16float');
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    const halfResView = {} as GPUTextureView;
    upsample.draw(pass, halfResView);
    expect(pass.setPipeline).toHaveBeenCalledTimes(1);
    expect(pass.setBindGroup).toHaveBeenCalledTimes(1);
    expect(pass.draw).toHaveBeenCalledWith(3, 1, 0, 0);
  });

  it('destroy() does not throw', () => {
    const device = mockDevice();
    const upsample = createVolumeUpsample(device, 'rgba16float');
    expect(() => upsample.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/services/gpu/passes/volumeUpsample.test.ts`
Expected: FAIL — `createVolumeUpsample` does not yet exist.

- [ ] **Step 7: Implement the factory**

Create `src/services/gpu/passes/volumeUpsample.ts`:

```typescript
/**
 * volumeUpsample — fullscreen pass that bilinearly upsamples the
 * half-resolution scalar-volume offscreen target and additively blends
 * the result into the HDR target.
 *
 * ### Why a dedicated pass rather than a method on PostProcess
 *
 * The upsample pass is conceptually independent of tone-mapping — it
 * runs INSIDE the HDR mega-pass (as one entry in HDR_PASSES), while
 * tone-map runs AFTER the HDR mega-pass against the swap chain.  Their
 * blend semantics and target attachments differ, and folding them into
 * one factory would force the consumer to thread two unrelated
 * descriptors through one call.  Keeping them as siblings under
 * `services/gpu/passes/` keeps each factory single-purpose.
 *
 * ### Why additive blend
 *
 * The scalar-volume pipeline draws into the half-res target with
 * '{ srcFactor: "one", dstFactor: "one" }' for both color and alpha
 * (see scalarVolumeRenderer.ts).  The half-res target therefore holds
 * the per-fragment additive sum of every active field.  We bilinearly
 * upsample that sum and ADD it to the HDR target — net effect is
 * mathematically identical to having drawn every field directly into
 * the HDR target, up to bilinear interpolation.  Switching the blend
 * state to opaque or alpha-blended would break this equivalence and
 * change the look of overlapping fields.
 *
 * ### Why a linear sampler
 *
 * The "bilinear" filter is just two consecutive linear interpolations.
 * Sampling a half-res texture at full-res UVs with a `'linear'` sampler
 * gives us a 2x bilinear upscale for free (one fragment shader
 * invocation, one textureSample, zero math).  The alternative — manual
 * `textureLoad` at the four corner texels and an in-shader lerp — costs
 * 4x the texture-fetch traffic for identical output.  See the fragment
 * shader's TODO comment for the conditions under which we'd fall back
 * to the manual variant.
 */

import vsCode from '../shaders/volumeUpsample/vertex.wesl?static';
import fsCode from '../shaders/volumeUpsample/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import type { VolumeUpsample } from '../../../@types/rendering/VolumeUpsample';

export function createVolumeUpsample(
  device: GPUDevice,
  hdrFormat: GPUTextureFormat,
): VolumeUpsample {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'volumeUpsample.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'volumeUpsample.fragment');

  // Linear sampler — see module header for the "free 2x bilinear" rationale.
  const sampler = device.createSampler({
    label: 'volumeUpsample-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'volumeUpsample-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'volumeUpsample-pipeline',
    layout: device.createPipelineLayout({
      label: 'volumeUpsample-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: hdrFormat,
          // Additive blend for BOTH color and alpha — matches the
          // scalar-volume pipeline's blend state byte-for-byte.  Module
          // header explains why this is load-bearing.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  return {
    draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void {
      // Bind group rebuilt per draw because the half-res view is
      // recreated on every postProcess.resize().  Caching across resize
      // would bind a destroyed view.  One bind-group alloc per frame is
      // negligible compared to the fullscreen blit it carries.
      const bindGroup = device.createBindGroup({
        label: 'volumeUpsample-bg',
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: halfResView },
          { binding: 1, resource: sampler },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
    },
    destroy(): void {
      // No GPUTexture / GPUBuffer to release here — sampler + pipeline +
      // bind-group-layout don't have explicit destroy methods (they're
      // GC'd when their last reference drops).  The destroy method
      // exists for symmetry with PostProcess and to give the engine a
      // single teardown call shape across all GPU resource owners.
    },
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/services/gpu/passes/volumeUpsample.test.ts`
Expected: PASS for all four tests.

- [ ] **Step 9: Commit**

```bash
git add src/services/gpu/shaders/volumeUpsample/ \
        src/services/gpu/passes/volumeUpsample.ts \
        src/@types/rendering/VolumeUpsample.d.ts \
        tests/services/gpu/passes/volumeUpsample.test.ts
git commit -m "feat(gpu): half-res-to-HDR volume upsample pass"
```

---

### Task 5: Construct `volumeUpsample` in `initGpu` and store it on `EngineGpuHandles`

The upsample factory needs the device and the HDR format. It lives on `state.gpu.volumeUpsample` so `destroy()` has a reachable reference and the new pass can pull it via `state.gpu`.

**Files:**
- Modify: `src/@types/engine/handles/EngineGpuHandles.d.ts`
- Modify: `src/services/engine/phases/initGpu.ts`
- Test: `tests/services/engine/phases/initGpu.test.ts` (if it exists; otherwise skip the source-level test — the wiring is exercised end-to-end by Task 7's tests)

- [ ] **Step 1: Add `volumeUpsample` to `EngineGpuHandles`**

Edit `src/@types/engine/handles/EngineGpuHandles.d.ts`. Add the import at the top:

```typescript
import type { VolumeUpsample } from '../../rendering/VolumeUpsample';
```

And add the new field on `EngineGpuHandles` right after `scalarVolumeRenderer`:

```typescript
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /**
   * Half-res-to-HDR volume upsample pass.  Null until `initGpu`
   * constructs it (same phase as the other optional renderers).
   * Excluded from the `isEngineReady` predicate — when null, the
   * `volumeUpsamplePass` skips its draw (so a null handle is a silent
   * no-op).  Stored here so `destroy()` can release the pipeline +
   * sampler + bind-group-layout.
   */
  volumeUpsample: VolumeUpsample | null;
```

- [ ] **Step 2: Construct the upsample in `initGpu`**

Edit `src/services/engine/phases/initGpu.ts`. Add the import near the other passes imports:

```typescript
import { createVolumeUpsample } from '../../gpu/passes/volumeUpsample';
```

After the `state.gpu.scalarVolumeRenderer = createScalarVolumeRenderer(device, 'rgba16float');` line, add:

```typescript
  // ── Half-res-to-HDR volume upsample pass ──────────────────────────
  //
  // Built unconditionally alongside the scalar-volume renderer; the
  // pipeline is cheap (one sampler + one bind-group-layout + one render
  // pipeline) and the half-res target lives on `postProcess` so we have
  // nothing to allocate here that depends on viewport size.  Stored on
  // `state.gpu` so `destroy()` can release the pipeline and so the new
  // `volumeUpsamplePass` can read it via `state.gpu.volumeUpsample`.
  state.gpu.volumeUpsample = createVolumeUpsample(device, 'rgba16float');
```

- [ ] **Step 3: Add the null initialisation in the engine state literal**

Find where `EngineGpuHandles` is initialised (search the codebase for `scalarVolumeRenderer: null` — that's the same construction site).

Run: `grep -rn "scalarVolumeRenderer: null" /Users/rulkens/Development/js/skymap/src`

Expected: one match. In that file, add `volumeUpsample: null,` right after it on the same shape.

- [ ] **Step 4: Add destroy wiring**

Find where `state.gpu.scalarVolumeRenderer?.destroy()` is called (search the codebase for `scalarVolumeRenderer?.destroy`).

Run: `grep -rn "scalarVolumeRenderer?.destroy" /Users/rulkens/Development/js/skymap/src`

In the same destroy block, add (using the same pattern as the surrounding lines):

```typescript
    state.gpu.volumeUpsample?.destroy();
    state.gpu.volumeUpsample = null;
```

- [ ] **Step 5: Verify the type-check is green**

Run: `npm run typecheck`
Expected: PASS. The new field is correctly typed and all initialisation + destroy sites match.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/handles/EngineGpuHandles.d.ts \
        src/services/engine/phases/initGpu.ts \
        <whatever-file-holds-the-state-literal> \
        <whatever-file-holds-the-destroy-block>
git commit -m "feat(engine): wire volumeUpsample into GPU handles"
```

---

### Task 6: Create `encodeVolumes` — runs the half-res raymarch pre-step

This helper opens a render pass against the half-res target and asks the scalar-volume renderer to draw into it. Called before `encodeHdrSingle` / `encodeHdrSplit` opens its HDR mega-pass. The viewport passed to `scalarVolumeRenderer.draw` is the **half-res** size (so the raymarch's per-fragment jitter dither is computed against the right viewport).

**Files:**
- Create: `src/services/engine/frame/encodeVolumes.ts`
- Create: `src/@types/engine/frame/EncodeVolumesArgs.d.ts`
- Test: `tests/services/engine/frame/encodeVolumes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/services/engine/frame/encodeVolumes.test.ts`:

```typescript
/**
 * encodeVolumes — unit tests for the pre-HDR half-res render-pass helper.
 *
 * Coverage:
 *   - opens exactly one beginRenderPass against the half-res view with
 *     loadOp='clear', clearValue=(0,0,0,0)
 *   - calls scalarVolumeRenderer.draw inside the pass, passing the
 *     HALF-RES viewport size (not the full canvas size)
 *   - ends the render pass exactly once
 *   - threads timestampWrites onto the pass descriptor when one is
 *     passed in (split-encoder / timing path)
 *   - omits timestampWrites when one isn't passed (single-pass path)
 *   - does nothing if scalarVolumeRenderer is null
 */
import { describe, it, expect, vi } from 'vitest';
import { encodeVolumes } from '../../../../src/services/engine/frame/encodeVolumes';
import type { mat4 } from 'gl-matrix';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

function makeFakePass() {
  return {
    end: vi.fn(),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeFakeEncoder() {
  const pass = makeFakePass();
  const beginRenderPass = vi.fn(() => pass);
  return {
    encoder: { beginRenderPass } as unknown as GPUCommandEncoder,
    pass,
    beginRenderPass,
  };
}

function makeCtx(): ReadyFrameContext {
  const halfResView = { __id: 'half' } as unknown as GPUTextureView;
  const postProcess = {
    view: {} as GPUTextureView,
    halfResView,
    resize: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  } as never;
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    renderer: {} as never,
    postProcess,
    texturedImpostors: {} as never,
  };
}

describe('encodeVolumes', () => {
  it('opens one render pass against the half-res view with a (0,0,0,0) clear', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    const scalarVolumeRenderer = { draw: vi.fn(), hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      timestampWrites: undefined,
    });
    expect(env.beginRenderPass).toHaveBeenCalledTimes(1);
    const desc = env.beginRenderPass.mock.calls[0]![0] as GPURenderPassDescriptor;
    const att = Array.from(desc.colorAttachments as any)[0] as any;
    expect(att.view).toBe(ctx.volumeOffscreen.view);
    expect(att.loadOp).toBe('clear');
    expect(att.storeOp).toBe('store');
    expect(att.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(env.pass.end).toHaveBeenCalledTimes(1);
  });

  it('passes the half-res viewport size to scalarVolumeRenderer.draw', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx(); // canvas 1280x720 → half-res 640x360
    const drawSpy = vi.fn();
    const scalarVolumeRenderer = { draw: drawSpy, hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      timestampWrites: undefined,
    });
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    // The viewport size passed to the raymarcher must be the HALF-RES
    // size — that's what its per-fragment jitter dither is normalised
    // against, and it controls the dither pattern's spatial frequency.
    expect(args[2]).toEqual([640, 360]);
  });

  it('floors the half-res viewport size and clamps to min 1 px', () => {
    const env = makeFakeEncoder();
    const ctx: ReadyFrameContext = { ...makeCtx(), canvasSize: { width: 1, height: 1 } };
    const drawSpy = vi.fn();
    const scalarVolumeRenderer = { draw: drawSpy, hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      timestampWrites: undefined,
    });
    expect(drawSpy.mock.calls[0]![2]).toEqual([1, 1]);
  });

  it('threads timestampWrites onto the pass descriptor when provided', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    const tw = {
      querySet: {} as GPUQuerySet,
      beginningOfPassWriteIndex: 18,
      endOfPassWriteIndex: 19,
    };
    const scalarVolumeRenderer = { draw: vi.fn(), hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      timestampWrites: tw,
    });
    const desc = env.beginRenderPass.mock.calls[0]![0] as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(desc.timestampWrites).toBe(tw);
  });

  it('omits timestampWrites when none is provided', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    const scalarVolumeRenderer = { draw: vi.fn(), hasActiveFields: () => true } as any;
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer,
      timestampWrites: undefined,
    });
    const desc = env.beginRenderPass.mock.calls[0]![0] as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(desc.timestampWrites).toBeUndefined();
  });

  it('is a no-op when scalarVolumeRenderer is null', () => {
    const env = makeFakeEncoder();
    const ctx = makeCtx();
    encodeVolumes({
      encoder: env.encoder,
      ctx,
      scalarVolumeRenderer: null,
      timestampWrites: undefined,
    });
    expect(env.beginRenderPass).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the args type**

Create `src/@types/engine/frame/EncodeVolumesArgs.d.ts`:

```typescript
/**
 * EncodeVolumesArgs — inputs for `encodeVolumes()`.
 *
 * Why a named arg-bag (vs positional args) — same rationale as the rest of
 * the frame-encoder helpers in this directory: the caller threads ~6
 * values through one indirection site, and a struct keeps the call shape
 * legible and easy to extend without ordering surprises.  See
 * `RenderFrameInput.d.ts` for the matching argument-bag pattern.
 */

import type { ReadyFrameContext } from './ReadyFrameContext';
import type { ScalarVolumeRenderer } from '../../rendering/ScalarVolumeRenderer';

export type EncodeVolumesArgs = {
  encoder: GPUCommandEncoder;
  ctx: ReadyFrameContext;
  /**
   * Scalar-volume renderer.  Null in the brief bootstrap window before
   * `initGpu` has wired it up; the helper is a no-op in that case.
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /**
   * Optional `RenderPassTimestampWrites` for per-pass GPU timing.  When
   * `undefined` the helper omits the field from the `beginRenderPass`
   * descriptor (single-pass production path).  When defined the helper
   * spreads it in — used by `encodeHdrSplit` to bill the half-res
   * raymarch against the `'scalar-volume'` slot.
   */
  timestampWrites: GPURenderPassTimestampWrites | undefined;
};
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/services/engine/frame/encodeVolumes.test.ts`
Expected: FAIL — `encodeVolumes` does not exist.

- [ ] **Step 4: Implement `encodeVolumes`**

Create `src/services/engine/frame/encodeVolumes.ts`:

```typescript
/**
 * encodeVolumes — the per-frame pre-HDR scalar-volume raymarch pass.
 *
 * Runs BEFORE the HDR mega-pass (`encodeHdrSingle` / `encodeHdrSplit`).
 * Opens one render pass against the half-resolution offscreen target on
 * `ctx.volumeOffscreen.view`, asks the scalar-volume renderer to
 * iterate every active field and draw it into that target with the
 * additive blend state baked into the pipeline, and closes the pass.  The
 * downstream `volumeUpsamplePass` (one of the entries in `HDR_PASSES`)
 * then bilinearly samples this target and additively composites the
 * result into the HDR target.
 *
 * ### Why this isn't a `Pass` in `HDR_PASSES`
 *
 * Pre-this-change, `scalarVolumePass` lived in `HDR_PASSES` alongside the
 * five other additive contributions, all of which drew INSIDE the same
 * HDR mega-pass (the one `encodeHdrSingle` opens).  Moving the volume
 * raymarch to a half-res target requires opening a render pass against a
 * different colour attachment — which would mean either (a) breaking the
 * "one Pass = one set of draw calls inside the parent HDR render pass"
 * contract or (b) splitting the scalar-volume pass into a pre-HDR step.
 *
 * (b) is the right answer because the `HDR_PASSES` contract is load-
 * bearing for the OVER-blend coherency story (see `encodeHdrSingle.ts`'s
 * docstring): every entry runs inside one open render pass against the
 * HDR target so the OVER-blended UI overlays read coherent `dst.color`.
 * Carving out a pre-step is the minimal-cost path that keeps that
 * contract intact.  The new `volumeUpsamplePass` slot inside
 * `HDR_PASSES` reads the half-res target and contributes into the HDR
 * pass exactly like every other additive entry.
 *
 * ### Why half-res viewport (not canvas viewport) to the renderer
 *
 * `scalarVolumeRenderer.draw` takes a `viewportPx` argument that the
 * shader uses to compute the per-fragment jitter dither's spatial
 * frequency.  Passing the full canvas size when the actual target is
 * half-res would shift the dither pattern's frequency by 2x — visually
 * different (the dither would appear "finer" on the upsampled output).
 * Passing the half-res viewport matches the actual fragment count and
 * keeps the dither pattern consistent with the pre-half-res baseline
 * up to the bilinear blur.
 *
 * ### Why `loadOp: 'clear'` with a `(0, 0, 0, 0)` clearValue
 *
 * Every frame must start the half-res target at exactly zero so the
 * additive sum from frame N doesn't leak into frame N+1.  Alpha=0 is the
 * right additive identity — the upsample pass's additive blend will add
 * `(0, 0, 0, 0)` to HDR with no effect for any fragment the volumes
 * didn't reach.
 */

import type { EncodeVolumesArgs } from '../../../@types/engine/frame/EncodeVolumesArgs';

export function encodeVolumes(args: EncodeVolumesArgs): void {
  const { encoder, ctx, scalarVolumeRenderer, timestampWrites } = args;

  // Brief bootstrap window before initGpu has constructed the renderer.
  // The Pass-level gate in `volumeUpsamplePass.enabled` checks the same
  // null condition; this guard is the matching invariant on the pre-HDR
  // side.
  if (scalarVolumeRenderer === null) return;

  // Half-res viewport: floor(canvas / 2), min 1 px.  Matches the texture
  // dimensions allocated by `postProcess.resize()` (see
  // `services/gpu/passes/postProcess.ts`'s `allocateHalfRes`).  Computed
  // here rather than threaded through the context because (a) it's a
  // pure function of `canvasSize`, (b) keeping it local makes the
  // "viewport == texture size" invariant obvious at the call site.
  const halfW = Math.max(1, Math.floor(ctx.canvasSize.width / 2));
  const halfH = Math.max(1, Math.floor(ctx.canvasSize.height / 2));

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.volumeOffscreen.view,
        // Alpha=0 is the additive identity; see module header.
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    // Spread-if pattern matches `encodeHdrSplit.ts` — keeps the
    // descriptor byte-identical to the no-timing shape when
    // `timestampWrites` is undefined, so the visual baseline doesn't
    // shift between production and dev-with-timings.
    ...(timestampWrites ? { timestampWrites } : {}),
  });
  scalarVolumeRenderer.draw(
    pass,
    ctx.vp,
    [halfW, halfH],
    [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
  );
  pass.end();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/services/engine/frame/encodeVolumes.test.ts`
Expected: PASS for all six tests.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/frame/EncodeVolumesArgs.d.ts \
        src/services/engine/frame/encodeVolumes.ts \
        tests/services/engine/frame/encodeVolumes.test.ts
git commit -m "feat(frame): half-res scalar-volume pre-pass helper"
```

---

### Task 7: Create `volumeUpsamplePass` — the new `HDR_PASSES` entry

The new pass replaces `scalarVolumePass` in `HDR_PASSES`. Its `enabled` predicate mirrors the old pass's gate (master toggle + `hasActiveFields()`) plus a null-check on `state.gpu.volumeUpsample`. Its `draw` calls `volumeUpsample.draw(pass, halfResView)`.

**Files:**
- Create: `src/services/engine/frame/passes/volumeUpsamplePass.ts`
- Test: `tests/services/engine/frame/passes/volumeUpsamplePass.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/services/engine/frame/passes/volumeUpsamplePass.test.ts`:

```typescript
/**
 * volumeUpsamplePass — unit tests for the new HDR pass entry.
 *
 * Covers the enable gate (master toggle + hasActiveFields + non-null
 * upsample handle) and the draw shape (volumeUpsample.draw called with
 * the pass + half-res view).
 */
import { describe, it, expect, vi } from 'vitest';
import { volumeUpsamplePass } from '../../../../../src/services/engine/frame/passes/volumeUpsamplePass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { RenderFrameSettings } from '../../../../../src/@types/engine/frame/RenderFrameSettings';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { mat4 } from 'gl-matrix';

function makeCtx(halfResView: GPUTextureView = {} as GPUTextureView): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    renderer: {} as never,
    postProcess: {
      view: {} as GPUTextureView,
      halfResView,
      resize: vi.fn(),
      draw: vi.fn(),
      destroy: vi.fn(),
    } as never,
    texturedImpostors: {} as never,
  };
}

function makeSettings(overrides: Partial<RenderFrameSettings> = {}): RenderFrameSettings {
  return { volumesEnabled: true, ...(overrides as any) } as RenderFrameSettings;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const DEPS_STUB = {} as PassDeps;

describe('volumeUpsamplePass.enabled', () => {
  it('returns false when volumesEnabled is false', () => {
    const state = {
      gpu: {
        scalarVolumeRenderer: { hasActiveFields: () => true },
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx(), makeSettings({ volumesEnabled: false }))).toBe(false);
  });

  it('returns false when no fields are active', () => {
    const state = {
      gpu: {
        scalarVolumeRenderer: { hasActiveFields: () => false },
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns false when volumeUpsample is null (pre-bootstrap)', () => {
    const state = {
      gpu: {
        scalarVolumeRenderer: { hasActiveFields: () => true },
        volumeUpsample: null,
      },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns false when scalarVolumeRenderer is null (pre-bootstrap)', () => {
    const state = {
      gpu: {
        scalarVolumeRenderer: null,
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns true when every gate passes', () => {
    const state = {
      gpu: {
        scalarVolumeRenderer: { hasActiveFields: () => true },
        volumeUpsample: { draw: vi.fn(), destroy: vi.fn() },
      },
    } as unknown as EngineState;
    expect(volumeUpsamplePass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });
});

describe('volumeUpsamplePass.draw', () => {
  it('calls volumeUpsample.draw with the HDR pass and half-res view', () => {
    const halfResView = {} as GPUTextureView;
    const drawSpy = vi.fn();
    const state = {
      gpu: {
        scalarVolumeRenderer: { hasActiveFields: () => true },
        volumeUpsample: { draw: drawSpy, destroy: vi.fn() },
      },
    } as unknown as EngineState;
    volumeUpsamplePass.draw(PASS_STUB, makeCtx(halfResView), state, makeSettings(), DEPS_STUB);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(drawSpy.mock.calls[0]![1]).toBe(halfResView);
  });

  it('does not throw when volumeUpsample is null (defensive null-check)', () => {
    const state = {
      gpu: { scalarVolumeRenderer: { hasActiveFields: () => true }, volumeUpsample: null },
    } as unknown as EngineState;
    expect(() =>
      volumeUpsamplePass.draw(PASS_STUB, makeCtx(), state, makeSettings(), DEPS_STUB),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/services/engine/frame/passes/volumeUpsamplePass.test.ts`
Expected: FAIL — `volumeUpsamplePass` does not exist.

- [ ] **Step 3: Implement `volumeUpsamplePass`**

Create `src/services/engine/frame/passes/volumeUpsamplePass.ts`:

```typescript
/**
 * volumeUpsamplePass — the HDR_PASSES entry that bilinearly upsamples
 * the half-resolution scalar-volume target into the HDR target.
 *
 * Replaces the old `scalarVolumePass` (which raymarched directly into
 * the HDR target).  The raymarch itself now happens in `encodeVolumes`
 * — a pre-HDR step that opens its own render pass against the half-res
 * target.  This pass picks up where that step left off: it reads the
 * half-res target (the additive sum of every active field) with a
 * linear sampler and adds the result into the HDR target via the
 * additive-blend pipeline state baked into the upsample factory.
 *
 * ### Position in the HDR pass order
 *
 * Occupies the same slot the old `scalarVolumePass` did — after
 * filaments, before milky-way (see `passes/index.ts`).  Visual hierarchy:
 * the cosmic-web skeleton and density-field halos composite over the
 * brighter milky-way bulge, not vice versa.  Both surrounding passes
 * are additive so the slot choice is a visual rather than correctness
 * concern.
 *
 * ### Why three null-checks in `enabled`
 *
 * The pre-bootstrap window is the only legitimate case where any of the
 * three matters.  `scalarVolumeRenderer === null` means initGpu hasn't
 * finished; `volumeUpsample === null` means the same.  `hasActiveFields()`
 * is the per-frame fine-grained gate that skips the upsample when no
 * fields are enabled (since `encodeVolumes` then skipped the half-res
 * raymarch and the half-res target was cleared to zero — adding zero to
 * HDR is wasted work).
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const volumeUpsamplePass: Pass = {
  name: 'volume-upsample',

  enabled(state, _ctx, settings) {
    // Master toggle first — short-circuits before any null check.
    if (!settings.volumesEnabled) return false;
    // Pre-bootstrap window: either handle null means initGpu hasn't
    // finished.  Same shape as the old scalarVolumePass gate.
    if (state.gpu.scalarVolumeRenderer === null) return false;
    if (state.gpu.volumeUpsample === null) return false;
    // Skip the upsample when no fields are active — encodeVolumes
    // already skipped the raymarch into the half-res target, so the
    // target is at clear-value (0,0,0,0); adding zero to HDR is work
    // for no visual change.
    return state.gpu.scalarVolumeRenderer.hasActiveFields();
  },

  draw(pass, ctx, state, _settings, _deps) {
    // Defensive null-check — same pattern as filamentsPass / milkyWayPass:
    // the gate in `enabled` already proved the field is non-null, but
    // null-checking here too means future gate reorderings can't silently
    // skip the guard.  The cost is one reference read.
    if (state.gpu.volumeUpsample === null) return;
    state.gpu.volumeUpsample.draw(pass, ctx.volumeOffscreen.view);
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/services/engine/frame/passes/volumeUpsamplePass.test.ts`
Expected: PASS for all seven tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/frame/passes/volumeUpsamplePass.ts \
        tests/services/engine/frame/passes/volumeUpsamplePass.test.ts
git commit -m "feat(passes): add volumeUpsamplePass for half-res HDR composite"
```

---

### Task 8: Swap `scalarVolumePass` for `volumeUpsamplePass` in `HDR_PASSES`

Edit the registry and delete the old pass file.

**Files:**
- Modify: `src/services/engine/frame/passes/index.ts`
- Delete: `src/services/engine/frame/passes/scalarVolumePass.ts`
- Modify: `tests/services/engine/frame/passes/passes.test.ts`

- [ ] **Step 1: Update the passes.test.ts registry assertion**

Edit `tests/services/engine/frame/passes/passes.test.ts`. Replace the existing import for `scalarVolumePass` with `volumeUpsamplePass`, change the imported name throughout, and update the order assertion:

```typescript
import {
  HDR_PASSES,
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  filamentsPass,
  milkyWayPass,
} from '../../../../../src/services/engine/frame/passes';
```

(Note: the old `passes.test.ts` does not import `scalarVolumePass` by name — it only checks the names in `HDR_PASSES.map(p => p.name)`. So the import block changes minimally.)

In the existing `describe('HDR_PASSES registry', ...)` block, update the names array:

```typescript
    expect(HDR_PASSES).toHaveLength(6);
    expect(HDR_PASSES.map((p) => p.name)).toEqual([
      'point-sprites',
      'procedural-disks',
      'textured-impostors',
      'milky-way',
      'filaments',
      'volume-upsample',
    ]);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/services/engine/frame/passes/passes.test.ts`
Expected: FAIL — `HDR_PASSES` still ends with `'scalar-volume'`, not `'volume-upsample'`.

- [ ] **Step 3: Edit `passes/index.ts`**

Edit `src/services/engine/frame/passes/index.ts`:

Replace the import:

```typescript
import { scalarVolumePass } from './scalarVolumePass';
```

with:

```typescript
import { volumeUpsamplePass } from './volumeUpsamplePass';
```

Replace the registry entry:

```typescript
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  milkyWayPass,
  filamentsPass,
  volumeUpsamplePass,
];
```

And replace the re-export:

```typescript
export { scalarVolumePass } from './scalarVolumePass';
```

with:

```typescript
export { volumeUpsamplePass } from './volumeUpsamplePass';
```

Update the module-header docstring's "scalar-volume" line in the HDR_PASSES section to read:

```
 *   6. volume-upsample     — half-res raymarched scalar-field cubes
 *                            (pre-HDR step encodes them; this pass
 *                            bilinearly upsamples and additively blends
 *                            into HDR)
```

- [ ] **Step 4: Delete the old pass file**

```bash
git rm src/services/engine/frame/passes/scalarVolumePass.ts
```

- [ ] **Step 5: Run the tests to verify the registry assertion passes**

Run: `npx vitest run tests/services/engine/frame/passes/passes.test.ts`
Expected: PASS.

Also run a typecheck — there should be no other importers of `scalarVolumePass` (the test file's old `import` line, if any, is already replaced):

Run: `npm run typecheck`
Expected: PASS.

If typecheck reveals unexpected importers of `scalarVolumePass`, list each, replace with `volumeUpsamplePass`, and re-run typecheck. Then re-run the test.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/frame/passes/index.ts \
        tests/services/engine/frame/passes/passes.test.ts
git commit -m "feat(passes): replace scalarVolumePass with volumeUpsamplePass"
```

---

### Task 9: Wire `encodeVolumes` into `encodeHdrSingle` and `encodeHdrSplit`

`encodeVolumes` must run **before** the HDR mega-pass opens. Both encoder shapes call it (with the timing descriptor in the split path billed against the existing `'scalar-volume'` slot — same slot the old `scalarVolumePass` used; this preserves DebugPanel continuity).

**Files:**
- Modify: `src/services/engine/frame/encodeHdrSingle.ts`
- Modify: `src/services/engine/frame/encodeHdrSplit.ts`
- Modify: `tests/services/engine/frame/renderFrame.test.ts`
- Modify: `tests/services/engine/frame/renderFrame.timing.test.ts`

- [ ] **Step 1: Add a new test in `renderFrame.test.ts` for the no-timing path**

Append a new `it` block at the end of `describe('renderFrame', ...)` in `tests/services/engine/frame/renderFrame.test.ts`:

```typescript
  it('opens a pre-HDR render pass against the half-res view when volumes are active', () => {
    // When `volumesEnabled` is true AND scalarVolumeRenderer has active
    // fields, `encodeVolumes` must run BEFORE the HDR mega-pass.  The
    // fixture's default settings has volumesEnabled=false → no pre-pass
    // fires.  We force-enable it here and stub a renderer with an
    // active field, then check that the FIRST beginRenderPass goes
    // against the half-res view.
    const fx2 = makeInput({ settings: { volumesEnabled: true } });
    // Wire in a scalarVolumeRenderer with active fields.
    const drawSpy = vi.fn();
    (fx2.input as any).scalarVolumeRenderer = {
      draw: drawSpy,
      hasActiveFields: () => true,
    };
    // The half-res view comes off ctx.volumeOffscreen.view.  The
    // fixture's mock may not include volumeOffscreen — patch it on.
    const halfResView = { __id: 'half-res' } as unknown as GPUTextureView;
    (fx2.input.ctx as any).volumeOffscreen = { view: halfResView, resize: () => {}, destroy: () => {} };

    renderFrame(fx2.input);

    // The first beginRenderPass should be the half-res pre-pass.
    const calls = (fx2.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const firstAtt = Array.from(calls[0]![0].colorAttachments as any)[0] as any;
    expect(firstAtt.view).toBe(halfResView);
    expect(firstAtt.loadOp).toBe('clear');

    // The renderer was asked to draw inside that pass.
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the pre-HDR half-res pass when volumes are disabled', () => {
    // Default fixture has volumesEnabled=false → only one HDR pass.
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls).toHaveLength(1);
  });
```

- [ ] **Step 2: Update `renderFrame.timing.test.ts` for the split-path scalar-volume slot billing**

Open `tests/services/engine/frame/renderFrame.timing.test.ts`. The test currently checks that `descriptorFor` is called for `'point-sprites'`, `'milky-way'`, `'tone-map'`, `'ui-overlay'`. With the new pre-pass, when `volumesEnabled` is true and there are active fields, `'scalar-volume'` should ALSO be called. The existing fixture has `volumesEnabled: false`, so the existing assertions are unchanged. Add a new `it` block at the end of the timing `describe`:

```typescript
  it('bills the half-res pre-pass against the scalar-volume slot when timings are active', () => {
    const { svc, descriptorFor } = makeFakeTimingService();
    const { input, beginCalls } = makeMinimalInputWithTiming(svc);

    // Force volumes on with an active scalarVolumeRenderer.
    (input.settings as any).volumesEnabled = true;
    (input as any).scalarVolumeRenderer = {
      draw: vi.fn(),
      hasActiveFields: () => true,
    };
    // Provide a half-res view on the postProcess mock.
    (input.ctx as any).postProcess.halfResView = { __id: 'half' } as GPUTextureView;
    // The new volume-upsample pass also reads state.gpu.volumeUpsample —
    // null-check it so the upsample pass is skipped (we only care about
    // the pre-pass slot billing in this test).
    (input.state as any).gpu.volumeUpsample = null;

    renderFrame(input);

    const slots = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slots).toContain('scalar-volume');
    // The pre-pass beginRenderPass should carry the descriptor whose
    // stub-tag is 'scalar-volume'.
    const preDesc = beginCalls[0]!.desc as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(preDesc.timestampWrites).toBeDefined();
    const tag = (preDesc.timestampWrites!.querySet as unknown as { _stub: string })._stub;
    expect(tag).toBe('scalar-volume');
  });
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run tests/services/engine/frame/renderFrame.test.ts tests/services/engine/frame/renderFrame.timing.test.ts`
Expected: FAIL — the pre-pass is not yet wired up.

- [ ] **Step 4: Add the pre-pass call to `encodeHdrSingle`**

Edit `src/services/engine/frame/encodeHdrSingle.ts`. Add the import:

```typescript
import { encodeVolumes } from './encodeVolumes';
```

At the top of `encodeHdrSingle`, before `encoder.beginRenderPass(...)`, add:

```typescript
export function encodeHdrSingle(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  settings: RenderFrameSettings,
  deps: PassDeps,
): void {
  // ── Half-resolution scalar-volume pre-pass ────────────────────────────
  //
  // Runs BEFORE the HDR mega-pass opens.  Encodes one render pass against
  // the half-res offscreen target so every active scalar-field cube can
  // raymarch into a quarter-fragment target.  The downstream
  // `volumeUpsamplePass` (one of the HDR_PASSES entries) bilinearly samples
  // the half-res target and additively blends into the HDR target.
  //
  // Gating: the helper itself is a no-op if `state.gpu.scalarVolumeRenderer`
  // is null (pre-bootstrap), and the HDR-side `volumeUpsamplePass.enabled`
  // gate checks the master toggle + `hasActiveFields()` — but we ALSO gate
  // here to avoid opening an empty render pass when nothing's active.
  // Pre-HDR work that doesn't draw anything is still a non-zero cost on
  // tile-based GPUs (the GPU still loads / stores the target).
  if (
    settings.volumesEnabled &&
    state.gpu.scalarVolumeRenderer !== null &&
    state.gpu.scalarVolumeRenderer.hasActiveFields()
  ) {
    encodeVolumes({
      encoder,
      ctx,
      scalarVolumeRenderer: state.gpu.scalarVolumeRenderer,
      timestampWrites: undefined,
    });
  }

  const hdrPass = encoder.beginRenderPass({
    // ... existing body unchanged ...
```

- [ ] **Step 5: Add the pre-pass call to `encodeHdrSplit`**

Edit `src/services/engine/frame/encodeHdrSplit.ts`. Add the import:

```typescript
import { encodeVolumes } from './encodeVolumes';
```

Update the function signature and add the pre-pass call right after the clear pass:

```typescript
export function encodeHdrSplit(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  settings: RenderFrameSettings,
  deps: PassDeps,
  timingService: GpuTimingService,
): void {
  // ── Clear pass (no draws) ─────────────────────────────────────────
  const clearPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  clearPass.end();

  // ── Half-resolution scalar-volume pre-pass ────────────────────────
  //
  // Runs after the clear, before the HDR sub-passes.  Same gate as
  // `encodeHdrSingle`: skip when no fields are active so we don't open
  // an empty render pass.  Timestamp billing reuses the legacy
  // `'scalar-volume'` slot — that's what the DebugPanel's GpuTimings
  // row reads, and keeping the slot name stable means the row's label
  // and historical samples line up.
  if (
    settings.volumesEnabled &&
    state.gpu.scalarVolumeRenderer !== null &&
    state.gpu.scalarVolumeRenderer.hasActiveFields()
  ) {
    encodeVolumes({
      encoder,
      ctx,
      scalarVolumeRenderer: state.gpu.scalarVolumeRenderer,
      timestampWrites: timingService.descriptorFor('scalar-volume'),
    });
  }

  // ── HDR sub-passes — one beginRenderPass per enabled pass ─────────
  // ... existing body unchanged ...
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npx vitest run tests/services/engine/frame/renderFrame.test.ts tests/services/engine/frame/renderFrame.timing.test.ts`
Expected: PASS.

- [ ] **Step 7: Sanity-check full test suite**

Run: `npm test`
Expected: PASS. Existing tests that depended on `scalarVolumePass.name === 'scalar-volume'` for the HDR_PASSES ordering should have been updated in Task 8; if any still reference the old pass, fix them inline (replace name and import). The expected leftover surface is small — typecheck after the test run to be sure:

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/engine/frame/encodeHdrSingle.ts \
        src/services/engine/frame/encodeHdrSplit.ts \
        tests/services/engine/frame/renderFrame.test.ts \
        tests/services/engine/frame/renderFrame.timing.test.ts
git commit -m "feat(frame): wire half-res volume pre-pass into HDR encoders"
```

---

### Task 10: Verify end-to-end and update the engine-rewrite memory note

A final integration smoke test plus a quick run of the visual baseline (if it exists) catches any byte-shift in the encoder ordering.

**Files:**
- Modify: `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/project_skymap.md` (user memory, optional — only if the file describes the current `HDR_PASSES` order)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS. 590+ tests; the new tests bring the total higher. If any test fails, the failure is the breadcrumb — read it and fix.

- [ ] **Step 2: Run the typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build to verify the WESL linker accepts the new shader modules**

Run: `npm run build`
Expected: PASS — `wesl-plugin` links the new `volumeUpsample/{vertex,fragment,io}.wesl` triple without warnings, the WGSL emitter produces valid shader source.

If the build fails on the WESL side, consult the wesl-shaders skill — the most common bug is a missing `import package::...` line or a struct definition that doesn't match across modules. Walk the io.wesl / vertex.wesl / fragment.wesl trio and confirm the `VSOut` struct shape matches.

- [ ] **Step 4: Manual visual check (recommended, optional)**

If the dev server is running (`npm run dev`), open the page with CF-4 enabled and at least one MCPM field on, then ask the user to confirm:

1. The volume rendering looks visually identical to the baseline (no obvious blur, no resolution drop, no ghosting on fast camera motion). The bilinear filter SHOULD be invisible — the data is bandlimited.
2. The DebugPanel's `?gpuTimings` row for `scalar-volume` shows a roughly 4x reduction in cost vs the pre-change baseline.
3. The new `volume-upsample` row appears in the DebugPanel and shows a small additional cost (one fullscreen blit, sub-millisecond on M1).

Do NOT block on the visual check if the user isn't available — the unit tests cover the structural invariants and the WESL build covers the shader compilation. The visual confirmation is the final correctness check but can be deferred to PR review.

- [ ] **Step 5: Commit any test-suite cleanups**

If any tests had to be touched to keep the suite green that weren't covered by Tasks 1–9, commit them now with a `chore(test):` prefix.

If nothing new needs committing, skip this step.

- [ ] **Step 6: Final smoke verification**

Run: `npm test && npm run typecheck`
Expected: both PASS.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-half-res-volume-rendertarget.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
