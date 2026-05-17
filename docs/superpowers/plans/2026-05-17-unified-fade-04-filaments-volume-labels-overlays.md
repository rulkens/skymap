# Unified Fade Architecture (4/5) -- Filaments, Volumes, Labels, Overlays

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every remaining fadeable layer onto the unified registry -- `filamentRenderer`, `scalarVolumeRenderer`, the label renderer (via `LabelDirector` combined-opacity), and the always-on GPU overlays (`milkyWay`, `proceduralDisks`, `texturedImpostors`). After this sub-plan, every fade in the app goes through `state.subsystems.fades`; `CloudFade` is no longer read by any consumer (but the file itself still exists -- deletion happens in sub-plan 05).

**Architecture:** Each renderer follows the same shape `pointRenderer` adopted in sub-plan 03: a per-handle `fadeBuffer` bound at `@group(1)` against `state.gpu.fadeBgl`, per-frame `device.queue.writeBuffer(fadeBuffer, opacityOf(handle, now))`. Filaments register `{ kind: 'filaments' }` from their slot's commit. Volumes register `{ kind: 'scalarField', field }` on `addField` and unregister on `removeField`. The label renderer asks the registry for each layer's opacity and combines it with the existing per-label fade. The three overlays register at engine bootstrap via `setImmediate(1.0)` so future tour playback can `fadeTo` them with no per-renderer plumbing.

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest.

**Prerequisites:** `2026-05-17-unified-fade-03-points.md` must be merged -- provides the precedent of per-handle `fadeBuffer` + canonical `fadeBgl` binding that every renderer in this sub-plan follows, plus the live `state.subsystems.fades` registry and the `fadeUniforms.wesl` library.

**Followed by:** `2026-05-17-unified-fade-05-ui-and-cleanup.md` -- adds the UI toggle async pickMask/drawMask split, collapses the render-on-demand predicate to `fades.isAnyAnimating(now)`, and deletes `CloudFade`.

**Spec reference:** `docs/superpowers/specs/2026-05-17-unified-fade-architecture-design.md`

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass; filaments and volumes still fade in on first load, labels still appear at the right band, overlays still render at opacity 1.0.

---

    fx.state.sources.catalogs.set(Source.SDSS, makeFakeCatalog(99));
    wireGalaxyCatalogSourceSlot(
      fx.state as never,
      { source: Source.SDSS, fetcher: vi.fn() } as never,
      { cb: {} } as never,
    );
    // Drive commit...
    // Assert ordering: fadeTo(0) → upload → fadeTo(1).
    expect(fx.fadeCalls[0]).toEqual({ target: 0, duration: FADE_OUT_DURATION_MS });
    expect(fx.fadeCalls[1]).toEqual({ target: 1, duration: FADE_IN_DURATION_MS });
    expect(fx.upload).toHaveBeenCalledTimes(1);
  });
});
```

NOTE for the implementer: the `_commitForTest` pseudo-method above is a stand-in for whatever the AssetSlot test harness exposes today. Before writing this test, read `src/services/loading/AssetSlot.ts` to find the actual API for synchronously driving a commit in a test, and adapt the test accordingly. If no such hook exists, expose one via `__commitForTest` on the slot (test-only) or drive the slot through its `load(req)` method with a synchronous fetcher that resolves to the fake catalog.

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test -- tests/services/engine/wiring/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/wiring/galaxyCatalogSourceRegistry.ts tests/services/engine/wiring/galaxyCatalogSourceRegistryFade.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): sequential fade-out/upload/fade-in for survey commits

First load skips fade-out and just rams in from the initial-0 opacity;
subsequent loads (tier swap) await a 100 ms fade-out before destroying
the old buffer and starting the 600 ms fade-in.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: filamentRenderer migration

### Task 5.1: Update filament fragment WESL

**Files:**

- Modify: `src/services/gpu/shaders/filaments/fragment.wesl`

- [ ] **Step 1: Replace imports + bindings**

Replace lines 28-49 (the imports + `@group` declarations). New top:

```wgsl
import package::filaments::io::Uniforms;
import package::filaments::io::VSOut;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;
import package::lib::masks::edgeBandMask;

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(1) @binding(0) var<uniform> fade : FadeUniforms;
```

In the body (line ~106), replace:

```wgsl
  let alpha = applyCloudFade(
    edgeFade * 0.6 * densityBoost * u.intensityScale,
    cloud.opacity,
  );
```

with:

```wgsl
  let alpha = applyFade(
    edgeFade * 0.6 * densityBoost * u.intensityScale,
    fade.opacity,
  );
```

- [ ] **Step 2: Don't run anything yet — the renderer wiring follows in 5.2**

---

### Task 5.2: Update filamentRenderer factory

**Files:**

- Modify: `src/services/gpu/renderers/filamentRenderer.ts`
- Modify: `src/@types/rendering/FilamentRenderer.d.ts`

- [ ] **Step 1: Update `FilamentRenderer.d.ts`**

Remove the `isFading(): boolean;` method and its docblock. The full file becomes:

```ts
/**
 * Public surface of the filament renderer. Mirrors the methods the
 * pre-factory class exposed: upload / draw / clear / destroy.
 * Consumers see the identical shape; fade-in is now driven by
 * FadeRegistry (state.subsystems.fades) — the renderer reads the
 * per-frame opacity in `draw` and writes it into a per-handle GPU
 * fade buffer.
 */

import type { mat4 } from 'gl-matrix';
import type { FilamentCloud } from '../data/FilamentCloud';

export type FilamentRenderer = {
  readonly label: string;
  upload(cloud: FilamentCloud): void;
  clear(): void;
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    halfWidthPx: number,
    intensityScale: number,
    fadeOpacity: number,
  ): void;
  destroy(): void;
};
```

(`fadeOpacity` added as the sixth parameter to `draw` — the runFrame body reads `state.subsystems.fades.opacityOf({ kind: 'filaments' }, now)` and passes it in.)

- [ ] **Step 2: Update `filamentRenderer.ts`**

In `createFilamentRenderer`, change the signature to accept `fadeBgl: FadeUniformsBgl`:

```ts
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';

export function createFilamentRenderer(
  device: GPUDevice,
  hdrFormat: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
): FilamentRenderer {
```

Remove the `import { CloudFade } from '../resources/cloudFade';` line.

Remove the local `cloudFadeBindGroupLayout` declaration (lines 165-174).

In `createPipelineLayout` (line 184), replace `bindGroupLayouts: [bindGroupLayout, cloudFadeBindGroupLayout]` with `bindGroupLayouts: [bindGroupLayout, fadeBgl]`.

In the closure state, replace `let fade: CloudFade | null = null;` with:

```ts
// Per-handle FadeUniforms GPU buffer + bind group. Constructed lazily
// on first upload (the filament cloud may never load in production
// if the .bin file is absent), destroyed in destroy(). Subsequent
// uploads reuse the buffer — only the per-frame opacity write changes.
let fadeBuffer: GPUBuffer | null = null;
let fadeBindGroup: GPUBindGroup | null = null;
// Reusable scratch for the per-frame fade writeBuffer call.
const fadeScratchBuffer = new ArrayBuffer(16);
const fadeScratchF32 = new Float32Array(fadeScratchBuffer);
```

In `upload`, replace the `CloudFade` block (lines 271-278) with:

```ts
if (fadeBuffer === null) {
  fadeBuffer = device.createBuffer({
    label: 'filaments-fade-uniform',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  fadeBindGroup = device.createBindGroup({
    label: 'filaments-fade-bg',
    layout: fadeBgl,
    entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
  });
}
```

In `draw`, update the signature to accept `fadeOpacity` and replace the body's fade lines. The full new `draw`:

```ts
function draw(
  pass: GPURenderPassEncoder,
  viewProj: mat4,
  viewportPx: [number, number],
  halfWidthPx: number,
  intensityScale: number,
  fadeOpacity: number,
): void {
  if (segmentCount === 0 || !instanceBuffer || !fadeBuffer || !fadeBindGroup) return;

  // Pack uniforms (unchanged from current — see UNIFORM_BYTES comment).
  const buf = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(buf);
  f32.set(viewProj as Float32Array, 0);
  f32[16] = viewportPx[0];
  f32[17] = viewportPx[1];
  f32[20] = halfWidthPx;
  f32[21] = intensityScale;
  device.queue.writeBuffer(uniformBuffer, 0, buf);

  // Write the per-frame fade.opacity from the registry-supplied value.
  fadeScratchF32[0] = fadeOpacity;
  device.queue.writeBuffer(fadeBuffer, 0, fadeScratchBuffer);

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setBindGroup(1, fadeBindGroup);
  pass.setIndexBuffer(indexBuffer, 'uint16');
  pass.setVertexBuffer(0, quadVertexBuffer);
  pass.setVertexBuffer(1, instanceBuffer);
  pass.drawIndexed(6, segmentCount);
}
```

Remove the `function isFading(): boolean { ... }` block entirely (lines 330-332).

In `destroy`, replace `fade?.destroy();` with:

```ts
fadeBuffer?.destroy();
```

In the returned `renderer` object literal, remove the `isFading,` entry.

- [ ] **Step 3: Update `initGpu.ts` filamentRenderer call site**

Find the `createFilamentRenderer(device, format)` call and update it to pass `state.gpu.fadeBgl!`:

```ts
const filamentRenderer = createFilamentRenderer(device, format, state.gpu.fadeBgl!);
```

- [ ] **Step 4: Update `runFrame.ts` call site that calls `filamentRenderer.draw(...)`**

Find where `filamentRenderer.draw(...)` is called per-frame. Add the new sixth parameter:

```ts
state.gpu.filamentRenderer.draw(
  pass,
  viewProj,
  viewportPx,
  halfWidthPx,
  intensityScale,
  state.subsystems.fades.opacityOf({ kind: 'filaments' }, now),
);
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS, except for any test referencing `filamentRenderer.isFading()` — find and update them with `grep -rn "filamentRenderer.isFading\|filamentRenderer\?.isFading" tests/ src/`.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/shaders/filaments/fragment.wesl src/services/gpu/renderers/filamentRenderer.ts src/@types/rendering/FilamentRenderer.d.ts src/services/engine/phases/initGpu.ts src/services/engine/frame/runFrame.ts
git commit -m "$(cat <<'EOF'
refactor(gpu): migrate filamentRenderer off CloudFade onto FadeRegistry

Single per-renderer fadeBuffer + fadeBindGroup (filament is a single
instance, not a Map<Source, Entry>). draw() now accepts fadeOpacity
as a parameter; the per-frame body reads from state.subsystems.fades.
isFading() removed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.3: Register filament handle + drive fadeTo from filamentSlot

**Files:**

- Modify: `src/services/loading/slots/filamentSlot.ts`

- [ ] **Step 1: Register and fade in on commit**

In `src/services/loading/slots/filamentSlot.ts`, the existing factory becomes:

```ts
import { createAssetSlot } from '../AssetSlot';
import { filamentFetcher } from '../fetchers/filamentFetcher';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/FilamentCloud';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFilamentSlot: SlotFactory<FilamentCloud, FilamentReq> = (state, cb) => {
  // Register the filament fade handle at opacity 0; the commit's
  // fadeTo(1, FADE_IN_DURATION_MS) ramps it in once the upload lands.
  // Filament is one-shot — never reloaded on tier change — so no
  // fade-out branch is needed.
  state.subsystems.fades.register({ kind: 'filaments' }, 0);

  const slot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      if (!state.gpu.filamentRenderer) return;
      await state.gpu.filamentRenderer.upload(cloud);
      void state.subsystems.fades.fadeTo({ kind: 'filaments' }, 1, FADE_IN_DURATION_MS);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(`[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`);
      cb.filaments?.onReady?.(s.value.stripCount, s.value.vertexCount);
      state.subsystems.scheduler.requestRender();
    }
  });
  state.assetSlots.filaments = slot;
  return slot;
};
```

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run typecheck && npm test -- tests/services/loading/slots/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/loading/slots/filamentSlot.ts
git commit -m "$(cat <<'EOF'
feat(loading): register filament fade handle + fade-in on commit

One-shot — filaments never reload on tier change, so the slot does
just a fade-in (no fade-out branch).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: scalarVolumeRenderer integration

### Task 6.1: Update scalarVolume fragment WESL

**Files:**

- Modify: `src/services/gpu/shaders/scalarVolume/fragment.wesl`

- [ ] **Step 1: Add FadeUniforms import + binding, multiply final color by fade.opacity**

In `src/services/gpu/shaders/scalarVolume/fragment.wesl`, near the top imports (line 28), add:

```wgsl
import package::lib::fadeUniforms::FadeUniforms;
```

After the existing `@group(0)` bindings (lines 99-103), add:

```wgsl
@group(1) @binding(0) var<uniform> fade: FadeUniforms;
```

At the bottom of `fs_main`, the existing `return accum;` (line 368) becomes:

```wgsl
  // Apply the per-field fade opacity. Multiplying the entire vec4
  // (rgb * a, a) by a scalar preserves the premultiplied-alpha
  // invariant (output stays in the (rgb * faded_a, faded_a) shape
  // the additive blend expects). The volume's per-step alpha
  // composition is unchanged — we just dim the final integrated
  // result.
  return accum * fade.opacity;
```

- [ ] **Step 2: Don't run anything yet — the renderer wiring follows in 6.2**

---

### Task 6.2: Update scalarVolumeRenderer factory

**Files:**

- Modify: `src/services/gpu/renderers/scalarVolumeRenderer.ts`
- Modify: `src/@types/rendering/FieldEntry.d.ts`
- Modify: `src/@types/rendering/ScalarVolumeRenderer.d.ts` (find it via `find src/@types -name "ScalarVolumeRenderer*"`)

- [ ] **Step 1: Update `FieldEntry.d.ts`**

Add two new fields to `FieldEntry`:

```ts
/**
 * Per-field FadeUniforms GPU buffer (16 bytes — opacity f32 + 12
 * bytes pad). Written each frame in `draw` from the registry-read
 * opacity for this field's handle.
 */
fadeBuffer: GPUBuffer;
/**
 * Bind group binding `fadeBuffer` at @group(1) @binding(0) using
 * the canonical fadeBgl.
 */
fadeBindGroup: GPUBindGroup;
```

- [ ] **Step 2: Update `scalarVolumeRenderer.ts`**

Change the factory signature to accept `fadeBgl`:

```ts
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';

export function createScalarVolumeRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
): ScalarVolumeRenderer {
```

Replace the pipeline construction (line 198). Currently `layout: 'auto'`. Update to explicit:

```ts
// @group(0) layout — pipeline-specific (uniform + 3D texture + sampler
// + 1D texture + sampler). Built from a manual BindGroupLayout descriptor
// so the pipeline layout below can list it alongside the canonical fadeBgl.
const group0Bgl = device.createBindGroupLayout({
  label: 'scalarVolume-bgl-group0',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float', viewDimension: '3d' },
    },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    {
      binding: 3,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float', viewDimension: '1d' },
    },
    { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
  ],
});

const pipelineLayout = device.createPipelineLayout({
  label: 'scalarVolume-pipeline-layout',
  bindGroupLayouts: [group0Bgl, fadeBgl],
});

const pipeline = device.createRenderPipeline({
  label: 'scalarVolume-pipeline',
  layout: pipelineLayout,
  // ... (vertex, fragment, primitive blocks unchanged — copy verbatim)
});
const bindGroupLayout = group0Bgl;
```

(The existing `pipeline.getBindGroupLayout(0)` reference becomes `group0Bgl` — same object identity.)

In `addField(handle, cube)` (around line 277), after the existing `const bindGroup = device.createBindGroup({...})` block, add:

```ts
const fadeBuffer = device.createBuffer({
  label: `scalarVolume-fade-uniform-${handle}`,
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const fadeBindGroup = device.createBindGroup({
  label: `scalarVolume-fade-bg-${handle}`,
  layout: fadeBgl,
  entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
});
```

In the `fields.set(handle, { ... })` block, add the two fields to the spread:

```ts
        fadeBuffer,
        fadeBindGroup,
```

In `removeField(handle)`, add:

```ts
entry.fadeBuffer.destroy();
```

In the existing destroy-old-entry branch at the top of `addField` (around line 279), add:

```ts
existing.fadeBuffer.destroy();
```

In the `draw(...)` method (around line 467), update the signature to accept the `fadeOpacityOf` callback:

```ts
    draw(pass, viewProj, viewportPx, cameraPosWorld, fadeOpacityOf) {
```

(Update `ScalarVolumeRenderer.d.ts`'s `draw` method type accordingly.)

Inside the per-field loop (around line 491), after `device.queue.writeBuffer(e.uniformBuffer, 0, scratch);`, add:

```ts
// Per-field fade.opacity write: read from the registry for this
// field's handle, write into the 16-byte fadeBuffer.
const fadeScratchBuffer = new ArrayBuffer(16);
new Float32Array(fadeScratchBuffer)[0] = fadeOpacityOf(e.handle);
device.queue.writeBuffer(e.fadeBuffer, 0, fadeScratchBuffer);

pass.setBindGroup(0, e.bindGroup);
pass.setBindGroup(1, e.fadeBindGroup);
pass.drawIndexed(CUBE_INDICES.length);
```

(Note: the existing `pass.setBindGroup(0, e.bindGroup);` line moves into the block above; remove the duplicate.)

To avoid the per-frame ArrayBuffer allocation, hoist it to the factory scope (alongside the existing scratch buffer):

```ts
const fadeScratchBuffer = new ArrayBuffer(16);
const fadeScratchF32 = new Float32Array(fadeScratchBuffer);
```

And in the loop, use:

```ts
fadeScratchF32[0] = fadeOpacityOf(e.handle);
device.queue.writeBuffer(e.fadeBuffer, 0, fadeScratchBuffer);
```

In `destroy()` (line 517), add inside the loop:

```ts
e.fadeBuffer.destroy();
```

- [ ] **Step 3: Update `ScalarVolumeRenderer.d.ts`**

Find the file with `find src/@types -name "ScalarVolumeRenderer*"`. Update the `draw` method type:

```ts
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: Vec2,
    cameraPosWorld: Vec3,
    fadeOpacityOf: (handle: ScalarFieldHandle) => number,
  ): void;
```

(Add `import type { ScalarFieldHandle } from './ScalarFieldHandle';` if not already imported.)

- [ ] **Step 4: Update `initGpu.ts` and `runFrame.ts` call sites**

In `initGpu.ts`, the `createScalarVolumeRenderer(device, format)` call becomes:

```ts
const scalarVolumeRenderer = createScalarVolumeRenderer(device, format, state.gpu.fadeBgl!);
```

In `runFrame.ts`, wherever `scalarVolumeRenderer.draw(...)` is called, add the fifth argument:

```ts
state.gpu.scalarVolumeRenderer.draw(pass, viewProj, viewportPx, cameraPosWorld, (handle) =>
  state.subsystems.fades.opacityOf({ kind: 'scalarField', field: handle }, now),
);
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS, modulo volume-renderer tests that need `fadeBgl` in their fixtures — update those with a stub `{} as FadeUniformsBgl` cast and a stub `fadeOpacityOf: () => 1` callback.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/shaders/scalarVolume/fragment.wesl src/services/gpu/renderers/scalarVolumeRenderer.ts src/@types/rendering/FieldEntry.d.ts src/@types/rendering/ScalarVolumeRenderer.d.ts src/services/engine/phases/initGpu.ts src/services/engine/frame/runFrame.ts
git commit -m "$(cat <<'EOF'
feat(gpu): integrate FadeRegistry into scalarVolumeRenderer

Per-field fadeBuffer + fadeBindGroup; draw multiplies final accum by
fade.opacity. Pipeline layout switched from 'auto' to canonical so
fadeBgl is the same identity every consumer uses.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6.3: Register scalar-field handles on addField, unregister on removeField

**Files:**

- Modify: `src/services/gpu/renderers/scalarVolumeRenderer.ts`

This is a small follow-up to Task 6.2 — the handle registration ideally happens at the _slot_ level (matching surveys), but `addField` is the canonical create-a-field call point and there are three different slot files (cf4DensitySlot, mcpmSlot, syntheticVolumeSlots) so registering inside `addField` is the DRY choice.

The registry registration needs `state.subsystems.fades`, which the renderer doesn't have access to. The cleanest fix: pass a registration callback into the factory.

- [ ] **Step 1: Add `onFieldAdded` / `onFieldRemoved` callbacks to the factory**

Update the factory signature:

```ts
export function createScalarVolumeRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
  callbacks: {
    onFieldAdded: (handle: ScalarFieldHandle) => void;
    onFieldRemoved: (handle: ScalarFieldHandle) => void;
  },
): ScalarVolumeRenderer {
```

In `addField`, at the very end (after `fields.set(...)`), call `callbacks.onFieldAdded(handle)`.
In `removeField`, before the early-return `if (!entry) return;`, no — call after the destroys but before `fields.delete(handle)`: `callbacks.onFieldRemoved(handle);`.

- [ ] **Step 2: Wire the callbacks in `initGpu.ts`**

```ts
const scalarVolumeRenderer = createScalarVolumeRenderer(device, format, state.gpu.fadeBgl!, {
  onFieldAdded: (handle) => {
    state.subsystems.fades.register({ kind: 'scalarField', field: handle }, 0);
    // Fade in on first upload — fire and forget.
    void state.subsystems.fades.fadeTo(
      { kind: 'scalarField', field: handle },
      1,
      FADE_IN_DURATION_MS,
    );
  },
  onFieldRemoved: (handle) => {
    state.subsystems.fades.unregister({ kind: 'scalarField', field: handle });
  },
});
```

Add the import:

```ts
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
```

- [ ] **Step 3: Update tests that construct the volume renderer**

Run: `grep -rn "createScalarVolumeRenderer" tests/`

Update each test fixture to pass the new callbacks (or stubs):

```ts
const stubCallbacks = {
  onFieldAdded: vi.fn(),
  onFieldRemoved: vi.fn(),
};
createScalarVolumeRenderer(device, format, {} as never, stubCallbacks);
```

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/renderers/scalarVolumeRenderer.ts src/@types/rendering/ScalarVolumeRenderer.d.ts src/services/engine/phases/initGpu.ts tests/
git commit -m "$(cat <<'EOF'
feat(gpu): register scalar-field fade handles on addField/removeField

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Label renderer fade integration

The label subsystem in this codebase routes through `labelDirector` and `labelRenderer`. There's effectively one label-renderer pipeline, but the spec wants per-layer fade (you-are-here, POI, galaxy names, scale bar). The cleanest implementation: the label-renderer takes a `fadeOpacityOf` callback parameterized by the producer that emitted each label, but a simpler-and-correct-today approach is to fade the entire label renderer as one layer, with the per-layer handles registered for future use.

### Task 7.1: Inspect the label-renderer surface and pick the right integration point

**Files:**

- Read: `src/services/gpu/renderers/labelRenderer.ts`
- Read: `src/services/gpu/renderers/markerLineRenderer.ts`
- Read: `src/services/engine/subsystems/labelDirectorSubsystem.ts`

- [ ] **Step 1: Identify the actual per-frame draw entry point**

Run:

```
grep -n "draw\|@group\|setBindGroup" src/services/gpu/renderers/labelRenderer.ts | head -30
```

And:

```
grep -n "draw\|setBindGroup\|@group" src/services/gpu/renderers/markerLineRenderer.ts | head -20
```

Note: the spec mentions four label layers but the codebase has two label renderers (`labelRenderer` and `markerLineRenderer`). The `labelDirector` already aggregates producers; per-layer fade requires the director (or each producer) to emit labels tagged with their layer, and the renderer to fade the labels via a per-layer fade buffer in the same draw or via multiple draws (one per layer).

**Decision for this plan:** treat the entire label-renderer as one fade layer per renderer pass for v1, registering one `{ kind: 'labelLayer', layer: 'youAreHere' | 'poi' | … }` handle per logical layer but driving the renderer with a single combined opacity (the max of all active layer opacities, or 1.0 in steady state). The per-layer-aware draw is a follow-up plan. The handles are registered now so the registry is structurally ready.

- [ ] **Step 2: Register label-layer handles in `engine.ts`**

In `src/services/engine/engine.ts`, right after the `state.subsystems` literal is fully constructed and the eager subsystems are reachable (find the point after the closing brace of the state literal), add:

```ts
// Register the four label-layer fade handles at opacity 0. The
// label producers (youAreHere, poi) and any future overlay (galaxy
// names, scale bar) register at this point so a tour subsystem can
// address them via state.subsystems.fades.fadeTo(...) without
// additional plumbing. v1 of the label-fade integration drives the
// label-renderer with a single combined opacity (see runFrame.ts);
// per-layer aware draws are a follow-up plan.
state.subsystems.fades.register({ kind: 'labelLayer', layer: 'youAreHere' }, 0);
state.subsystems.fades.register({ kind: 'labelLayer', layer: 'poi' }, 0);
state.subsystems.fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 0);
state.subsystems.fades.register({ kind: 'labelLayer', layer: 'scaleBar' }, 1);
```

(`scaleBar` is React-side; we register it at 1.0 so it's tour-addressable but never auto-faded.)

- [ ] **Step 3: Drive fade-in for youAreHere + POI when their producers first emit labels**

This belongs in the producer's first-emit hook. In `youAreHereSubsystem.ts` (find it in `src/services/engine/subsystems/`), at the first call site that produces a non-empty `Label[]` output, add:

```ts
void state.subsystems.fades.fadeTo(
  { kind: 'labelLayer', layer: 'youAreHere' },
  1,
  FADE_IN_DURATION_MS,
);
```

(Wrap in a `firstEmit` boolean guard so it only fires once per session.)

Repeat for `poiSubsystem.ts` with `layer: 'poi'`.

Read each file before editing to find the right method.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/engine.ts src/services/engine/subsystems/youAreHereSubsystem.ts src/services/engine/subsystems/poiSubsystem.ts
git commit -m "$(cat <<'EOF'
feat(engine): register label-layer fade handles

Registers youAreHere/poi/galaxyNames/scaleBar handles in the registry.
Producers fire fadeTo(1, FADE_IN_DURATION_MS) on first non-empty
emit. The label-renderer's per-layer fade-aware draw is deferred.

