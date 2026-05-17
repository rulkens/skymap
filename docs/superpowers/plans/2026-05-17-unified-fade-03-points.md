# Unified Fade Architecture (3/5) -- pointRenderer Migration + Galaxy-Catalog Orchestration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `pointRenderer` off `CloudFade` and onto the unified registry -- per-source fade + source uniform buffers bound at the canonical `@group(1)` / `@group(2)` slots, the picker getting a no-op fade binding at `@group(1)`, and the galaxy-catalog slot doing sequential `fadeOut -> upload -> fadeIn` via the registry. Filaments and volumes still live on `CloudFade` after this sub-plan; they migrate next.

**Architecture:** Each source's `BufferEntry` gains its own `fadeBuffer` (16-byte FadeUniforms) and `sourceBuffer` (16-byte SourceUniforms) along with the two bind groups built against the canonical BGLs. Per-frame, `pointRenderer` reads `state.subsystems.fades.opacityOf({ kind: 'survey', source }, now)` and writes 16 bytes via `device.queue.writeBuffer`. `pickRenderer` binds a single shared no-op fade buffer (opacity=1) so its pipeline layout matches `pointRenderer` exactly. `galaxyCatalogSourceRegistry.commit` awaits `fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS)`, uploads new buffers, then calls `fades.fadeTo(handle, 1, FADE_IN_DURATION_MS)` without awaiting.

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest.

**Prerequisites:** `2026-05-17-unified-fade-02-registry-and-bgls.md` must be merged -- provides `state.subsystems.fades`, `state.gpu.fadeBgl`, `state.gpu.sourceBgl`, and the `fadeUniforms.wesl` / `sourceUniforms.wesl` libraries this sub-plan imports.

**Followed by:** `2026-05-17-unified-fade-04-filaments-volume-labels-overlays.md` -- migrates `filamentRenderer`, `scalarVolumeRenderer`, the label renderer, and the always-on overlays onto the registry.

**Spec reference:** `docs/superpowers/specs/2026-05-17-unified-fade-architecture-design.md`

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass; survey fade-in on first load and tier-swap fade-out then fade-in look visually correct.

---


- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — the renderers don't consume these yet; the fields are additive.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/handles/EngineGpuHandles.d.ts src/services/engine/engine.ts src/services/engine/phases/initGpu.ts
git commit -m "$(cat <<'EOF'
feat(engine): construct canonical fade + source BGLs in initGpu

Stored on state.gpu.fadeBgl / state.gpu.sourceBgl, available to every
renderer factory below. No consumers yet — the renderer migrations
land in Phases 3+.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: pointRenderer migration

The points migration is the largest. It's split into five tasks: shaders, BufferEntry shape, factory wiring, draw-loop integration, and removing `isFading()`.

### Task 3.1: Update points WESL shaders for split uniforms

**Files:**

- Modify: `src/services/gpu/shaders/points/vertex.wesl`
- Modify: `src/services/gpu/shaders/points/colorFragment.wesl`

- [ ] **Step 1: Update `vertex.wesl`**

Replace the import + binding declarations + `packSelection` call site. The new top of `vertex.wesl` (lines 30-60 currently) becomes:

```wgsl
import package::points::io::Uniforms;
import package::points::io::PerVertex;
import package::points::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::colorIndex::ramp;
import package::lib::astro::distanceModulus;
import package::lib::selectionEncoding::packSelection;

// ── @group(0) — per-frame uniforms ──────────────────────────────────
//
// Same binding numbers as colorFragment.wesl. Both renderers' uniform
// buffers carry the layout described in 'points/io.wesl::Uniforms'.
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── @group(1) — FadeUniforms (declared but unused at vertex stage) ─
//
// We don't re-declare FadeUniforms here because the vertex stage
// never reads it — only the fragment stage multiplies fade.opacity
// into alpha. The pipeline layout's @group(1) slot is still present
// (the fragment module declares it), so the bind group built by the
// renderer is valid; the vertex module simply doesn't reference the
// binding.

// ── @group(2) — per-source SourceUniforms ──────────────────────────
//
// Each loaded survey has its OWN @group(2) bind group whose buffer
// carries SourceUniforms's 16-byte struct (sourceCode + 12 bytes pad).
// Per-source bind groups dodge the 'queue.writeBuffer' race entirely
// (different uniform buffers per source means writes to one don't
// race against draws against another). The vertex stage reads
// 'source.sourceCode' to compose '(sourceCode << 27u) | instance_index'
// for the selection-halo + pick-output paths.
@group(2) @binding(0) var<uniform> source: SourceUniforms;
```

Then in the body of `vs(...)`, replace **every** reference to `cloud.sourceCode` with `source.sourceCode`. There is one such reference, on the line currently reading:

```wgsl
  let myPacked = packSelection(cloud.sourceCode, ii);
```

After the change:

```wgsl
  let myPacked = packSelection(source.sourceCode, ii);
```

Everything else in `vertex.wesl` stays unchanged.

- [ ] **Step 2: Update `colorFragment.wesl`**

Replace the imports + binding declarations at the top (currently lines 22-29). The new top becomes:

```wgsl
import package::points::io::Uniforms;
import package::points::io::VSOut;
import package::lib::math::saturate;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<uniform> fade: FadeUniforms;
```

Then in the body of `fs(...)`, replace the line currently reading:

```wgsl
  alpha = applyCloudFade(alpha, cloud.opacity);
```

with:

```wgsl
  alpha = applyFade(alpha, fade.opacity);
```

Everything else in `colorFragment.wesl` stays unchanged. Note: the original imported `applyCloudFade` from `cloudFade.wesl`; we now import `applyFade` from `fadeUniforms.wesl`. The function is identical (`return alpha * opacity;`) but renamed for clarity.

- [ ] **Step 3: Check pickFragment.wesl for fade references**

Run: `grep -n "cloud\|fade\|applyCloudFade\|CloudUniforms" src/services/gpu/shaders/points/pickFragment.wesl`

Expected: no matches OR matches only in comments. The pick fragment uses the vertex's `VSOut.instanceIdx` directly and does not need fade. If matches appear in code, edit `pickFragment.wesl` to remove every `cloud.*` reference and the `import package::lib::cloudFade::CloudUniforms;` line.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS — TypeScript doesn't compile WESL, so the .wesl edits don't surface here.

Note: the shaders won't actually link until pointRenderer is updated to provide the new bind groups (Task 3.3). Don't run the renderer tests yet — they'll fail at runtime when the shader linker complains about missing @group(2) bindings.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/shaders/points/vertex.wesl src/services/gpu/shaders/points/colorFragment.wesl src/services/gpu/shaders/points/pickFragment.wesl
git commit -m "$(cat <<'EOF'
refactor(shaders): split points cloud uniform into fade + source

vertex.wesl now imports SourceUniforms at @group(2); colorFragment.wesl
imports FadeUniforms at @group(1). The renderer wiring lands in the
next task; this commit alone will not link.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Update PointRenderer types — BufferEntry + remove cloudFadeBuffer

**Files:**

- Modify: `src/@types/rendering/PointRenderer.d.ts`
- Modify: `src/@types/rendering/PickSourceDraw.d.ts`

- [ ] **Step 1: Update `PointRenderer.d.ts`**

Replace the `loadedSources()` return type's inline shape (lines 59-64 currently). The full block becomes:

```ts
  loadedSources(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    /**
     * The per-source SourceUniforms GPU buffer (16 bytes — sourceCode
     * u32 + 12 bytes pad). PickRenderer builds its OWN per-source
     * @group(2) bind group around this buffer using the canonical
     * sourceUniformsBgl layout (shared with the visual pipeline). The
     * underlying GPUBuffer is shared; PickRenderer's bind group is
     * just a per-pipeline view of the same bytes.
     *
     * The buffer is written ONCE at upload time (sourceCode never
     * changes for a given source) and read by both the visual and
     * pick pipelines on every draw.
     */
    sourceBuffer: GPUBuffer;
  }>;
```

Remove the `isFading(): boolean;` line entirely (line 88 currently). The render-on-demand predicate now consults the registry instead.

- [ ] **Step 2: Update `PickSourceDraw.d.ts`**

Replace the `cloudFadeBuffer: GPUBuffer;` line with:

```ts
/**
 * The per-source SourceUniforms GPU buffer (was `cloudFadeBuffer`
 * pre-unified-fade). PickRenderer builds its own bind group against
 * the canonical sourceUniformsBgl layout to bind this buffer at
 * @group(2). Per-source identity (the 5-bit sourceCode) flows from
 * here into the picker's packed (sourceCode << 27 | instanceIdx)
 * output.
 */
sourceBuffer: GPUBuffer;
```

- [ ] **Step 3: Run typecheck — expect failures**

Run: `npm run typecheck`
Expected: FAIL with type errors in `pointRenderer.ts` (still using `fade` / `CloudFade` and `cloudFadeBuffer`) and `pickRenderer.ts` (still using `src.cloudFadeBuffer`). These are fixed in the next two tasks.

Note: do not commit yet. The next task fixes the renderer.

---

### Task 3.3: pointRenderer factory — replace CloudFade with per-source fade+source buffers

**Files:**

- Modify: `src/services/gpu/renderers/pointRenderer.ts`

- [ ] **Step 1: Remove the `CloudFade` import**

In `pointRenderer.ts`, delete the line:

```ts
import { CloudFade } from '../resources/cloudFade';
```

Add new imports (alongside the existing `Source` / shaders / etc. block near the top):

```ts
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';
```

- [ ] **Step 2: Update the factory signature**

Change `createPointRenderer` (around line 590) to accept the two canonical BGLs:

```ts
export function createPointRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
): PointRenderer {
```

- [ ] **Step 3: Update the pipeline to use a canonical pipeline layout**

In the `device.createRenderPipeline({ ... })` call (around line 608), replace `layout: 'auto'` with an explicit pipeline layout. The relevant section becomes:

```ts
const pipelineLayout = device.createPipelineLayout({
  label: 'points-pipeline-layout',
  bindGroupLayouts: [
    // @group(0) — per-frame uniforms (viewProj, viewport, …). Built
    // from the pipeline's auto-derived layout via getBindGroupLayout(0)
    // below since it's pipeline-specific to this renderer.
    device.createBindGroupLayout({
      label: 'points-bgl-group0',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    }),
    // @group(1) — FadeUniforms (canonical, shared with every fading renderer).
    fadeBgl,
    // @group(2) — SourceUniforms (canonical, shared with PickRenderer).
    sourceBgl,
  ],
});

const pipeline = device.createRenderPipeline({
  label: 'points-pipeline',
  layout: pipelineLayout,
  // ... (vertex, fragment, primitive unchanged from current — copy verbatim)
});
```

Important: keep the existing `vertex`, `fragment`, and `primitive` blocks of `createRenderPipeline` byte-identical (don't simplify them). Only the `layout` field changes from `'auto'` to `pipelineLayout`.

- [ ] **Step 4: Update the global `bindGroup` to use the explicit @group(0) layout**

The current code reads `pipeline.getBindGroupLayout(0)`. That still works against the explicit pipeline layout (`getBindGroupLayout(0)` returns the layout we passed at index 0). Leave that line unchanged.

- [ ] **Step 5: Update the `BufferEntry` local type**

Find the inline-typed `clouds` Map (around lines 562-566). Update the `LoadedSource` (or whatever the inline type is called in this file — read the surrounding lines to confirm) to:

```ts
type BufferEntry = {
  buffer: GPUBuffer;
  count: number;
  interleaved: Float32Array;
  /**
   * 16-byte GPU buffer holding the per-source FadeUniforms struct
   * (opacity f32 + 12 bytes pad). Written once per frame in `draw`
   * from the registry-read opacity value.
   */
  fadeBuffer: GPUBuffer;
  /**
   * Bind group binding `fadeBuffer` at @group(1) @binding(0) using
   * the canonical `fadeBgl` layout (so the same bind group works for
   * both the visual and pick pipelines).
   */
  fadeBindGroup: GPUBindGroup;
  /**
   * 16-byte GPU buffer holding the per-source SourceUniforms struct
   * (sourceCode u32 + 12 bytes pad). Written ONCE at upload time
   * (sourceCode never changes for a given source) and read by both
   * the visual and pick pipelines.
   */
  sourceBuffer: GPUBuffer;
  /**
   * Bind group binding `sourceBuffer` at @group(2) @binding(0) using
   * the canonical `sourceBgl` layout.
   */
  sourceBindGroup: GPUBindGroup;
};

const clouds = new Map<Source, BufferEntry>();
```

(Adjust the exact location of this type definition and the `clouds` Map declaration to match the file's existing structure; the surrounding context lives around lines 540-566 of the current file.)

- [ ] **Step 6: Update `upload(source, cloud)` to allocate the new buffers**

Find the `upload` function body (around line 750-869 currently). Replace the existing `CloudFade` block (lines 832-862, including `prev.fade.restart()`, the `new CloudFade(...)` call, and `fade.setSourceCode(source)`) with the explicit two-buffer allocation. The relevant section of `upload` becomes:

```ts
// Destroy or recycle the previous-source state before replacing it.
const prev = clouds.get(source);
if (prev) {
  prev.buffer.destroy();
  prev.fadeBuffer.destroy();
  prev.sourceBuffer.destroy();
}

const buffer = device.createBuffer({
  label: `points-vertex-buffer-${source}`,
  size: interleaved.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(buffer, 0, interleaved);

// FadeUniforms — 16 bytes, written per frame from the registry.
const fadeBuffer = device.createBuffer({
  label: `points-fade-uniform-${source}`,
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const fadeBindGroup = device.createBindGroup({
  label: `points-fade-bg-${source}`,
  layout: fadeBgl,
  entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
});

// SourceUniforms — 16 bytes, written ONCE here at upload time. The
// 5-bit Source enum value never changes for a given source, so a
// per-frame write would be wasted bytes. Pack sourceCode into the
// first 4 bytes and leave the rest zero.
const sourceBuffer = device.createBuffer({
  label: `points-source-uniform-${source}`,
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const sourceScratch = new ArrayBuffer(16);
new Uint32Array(sourceScratch)[0] = source >>> 0;
device.queue.writeBuffer(sourceBuffer, 0, sourceScratch);
const sourceBindGroup = device.createBindGroup({
  label: `points-source-bg-${source}`,
  layout: sourceBgl,
  entries: [{ binding: 0, resource: { buffer: sourceBuffer } }],
});

clouds.set(source, {
  buffer,
  count: cloud.count,
  interleaved,
  fadeBuffer,
  fadeBindGroup,
  sourceBuffer,
  sourceBindGroup,
});

biasUploadCallback?.(source, cloud);
```

- [ ] **Step 7: Update `unload(source)` to destroy the new buffers**

Find the `unload` function (around line 877). Replace its body with:

```ts
function unload(source: Source): void {
  const entry = clouds.get(source);
  if (!entry) return;
  entry.buffer.destroy();
  entry.fadeBuffer.destroy();
  entry.sourceBuffer.destroy();
  clouds.delete(source);
  biasUnloadCallback?.(source);
}
```

- [ ] **Step 8: Update `destroy()` to destroy the new buffers**

Find the `destroy` function (around line 1319). Replace the per-entry teardown loop with:

```ts
function destroy(): void {
  for (const entry of clouds.values()) {
    entry.buffer.destroy();
    entry.fadeBuffer.destroy();
    entry.sourceBuffer.destroy();
  }
  clouds.clear();
  uniformBuffer.destroy();
}
```

- [ ] **Step 9: Update `loadedSources()` generator to emit `sourceBuffer`**

Find the `loadedSourcesGen` generator (around line 1034). Replace the yielded shape:

```ts
function* loadedSourcesGen(): IterableIterator<{
  source: Source;
  vertexBuffer: GPUBuffer;
  count: number;
  sourceBuffer: GPUBuffer;
}> {
  for (const source of ALL_SOURCES) {
    const entry = clouds.get(source);
    if (!entry) continue;
    yield {
      source,
      vertexBuffer: entry.buffer,
      count: entry.count,
      sourceBuffer: entry.sourceBuffer,
    };
  }
}
function loadedSources(): IterableIterator<{
  source: Source;
  vertexBuffer: GPUBuffer;
  count: number;
  sourceBuffer: GPUBuffer;
}> {
  return loadedSourcesGen();
}
```

- [ ] **Step 10: Update the `draw` loop to bind @group(1) + @group(2) and write fade per frame**

Find the per-source draw loop (around lines 1214-1226). It currently reads:

```ts
for (const source of ALL_SOURCES) {
  const entry = clouds.get(source);
  if (!entry) continue;
  if (((visibleSourceMask >> source) & 1) === 0) continue;
  entry.fade.writeFrame();
  pass.setBindGroup(1, entry.fade.bindGroup);
  pass.setVertexBuffer(0, entry.buffer);
  pass.draw(6, entry.count);
}
```

Replace with (the new `settings` object will carry a `fadeOpacity` lookup — see Task 3.4 for the signature change; for now use a closure-captured callback):

```ts
for (const source of ALL_SOURCES) {
  const entry = clouds.get(source);
  if (!entry) continue;
  if (((visibleSourceMask >> source) & 1) === 0) continue;

  // Read the registry-managed opacity for THIS source's handle and
  // write it into the per-source fadeBuffer. One 16-byte writeBuffer
  // per visible survey per frame — negligible.
  const opacity = settings.fadeOpacityOf(source);
  fadeScratchF32[0] = opacity;
  // f32[1..3] (the three pad slots) stay zero.
  device.queue.writeBuffer(entry.fadeBuffer, 0, fadeScratchBuffer);

  pass.setBindGroup(1, entry.fadeBindGroup);
  pass.setBindGroup(2, entry.sourceBindGroup);
  pass.setVertexBuffer(0, entry.buffer);
  pass.draw(6, entry.count);
}
```

At the top of the factory body (alongside other closure-captured const allocations like `uniformBuffer`), add the reusable scratch buffer:

```ts
// Reusable scratch for the per-source per-frame fade writeBuffer call.
// 16 bytes = opacity f32 + 12 bytes pad. The pad slots stay zero
// (ArrayBuffer is zero-initialised; we never write them).
const fadeScratchBuffer = new ArrayBuffer(16);
const fadeScratchF32 = new Float32Array(fadeScratchBuffer);
```

- [ ] **Step 11: Remove the `isFading` function**

Delete the `function isFading(): boolean { ... }` block (around lines 1236-1241) and the `isFading,` entry from the returned `renderer` object (line 1358).

- [ ] **Step 12: Don't typecheck yet — the type of `PointDrawSettings` and the engine.ts call site still need work**

These land in Task 3.4. For now we have a complete renderer that compiles given the type changes; let the next task land the consumer updates.

- [ ] **Step 13: Stage but DO NOT commit yet — Task 3.4 must land in the same commit to keep the build green**

---

### Task 3.4: Update PointDrawSettings, runFrame, and PickRenderer for the new shape

**Files:**

- Modify: `src/@types/rendering/PointDrawSettings.d.ts`
- Modify: `src/services/engine/frame/runFrame.ts`
- Modify: `src/services/gpu/renderers/pickRenderer.ts`
- Modify: `src/services/engine/phases/initGpu.ts` (createPointRenderer call site)

- [ ] **Step 1: Add `fadeOpacityOf` to `PointDrawSettings`**

In `src/@types/rendering/PointDrawSettings.d.ts`, add a new readonly field:

```ts
  /**
   * Look up the registry-managed opacity for a given source. Called
   * once per visible source per frame from the points draw loop;
   * the renderer writes the returned value into the per-source
   * fadeBuffer. Closure-captured by the runFrame body around
   * `state.subsystems.fades.opacityOf({ kind: 'survey', source }, now)`.
   */
  readonly fadeOpacityOf: (source: Source) => number;
```

(Add `import type { Source } from '../../data/sources';` to the file if not already imported.)

- [ ] **Step 2: Wire `fadeOpacityOf` in `runFrame.ts`**

In `src/services/engine/frame/runFrame.ts`, find the call site that builds the `PointDrawSettings` object passed to `renderer.draw(...)`. Add the new field:

```ts
  fadeOpacityOf: (source) =>
    state.subsystems.fades.opacityOf({ kind: 'survey', source }, now),
```

The `now` value is the `performance.now()` (or scheduler-supplied timestamp) already used in the surrounding code; reuse the same binding.

- [ ] **Step 3: Update `pickRenderer.ts` to bind `sourceBindGroup` at @group(2) using `sourceBgl`**

In `src/services/gpu/renderers/pickRenderer.ts`, the pick factory currently builds per-source bind groups against `pipeline.getBindGroupLayout(1)` (around lines 484-493). The replacement uses the canonical `sourceBgl` against `@group(2)`.

First, update the factory signature to accept `sourceBgl`:

```ts
export function createPickRenderer(
  device: GPUDevice,
  // ... existing params ...
  sourceBgl: SourceUniformsBgl,
): PickRenderer {
```

Then update the pipeline layout. The pick pipeline must declare `@group(1)` (Fade, fragment-stage — even though the pick fragment doesn't read it, the vertex shader is shared and its bound bind groups must match the pipeline layout — actually wait, the pick fragment doesn't import FadeUniforms; the shared vertex.wesl now imports SourceUniforms at @group(2) only). Re-read the pick fragment to confirm.

Run: `grep -n "@group\|import" src/services/gpu/shaders/points/pickFragment.wesl`

If `pickFragment.wesl` declares no @group(1) and the vertex.wesl no longer imports FadeUniforms, then the pick pipeline layout only needs @group(0) and @group(2) — but WGSL doesn't allow gaps in @group numbering when bound. The fix is to give the pick pipeline an explicit pipeline layout listing all three groups, with @group(1) bound to a dummy or unused layout, OR add a no-op fade-uniforms declaration in pickFragment.wesl that the linker can satisfy.

The simplest correct approach: make `pickFragment.wesl` also bind `@group(1) @binding(0) var<uniform> fade: FadeUniforms;` even though it doesn't read it, so the pipeline layout's @group(1) is satisfied; otherwise WebGPU validation will fail at draw time because the visual pipeline binds @group(1) and the pick pipeline doesn't declare it.

Add to `pickFragment.wesl`'s imports + declarations (re-read the current file first to confirm exact line numbers; insert near the existing imports at the top):

```wgsl
import package::lib::fadeUniforms::FadeUniforms;

@group(1) @binding(0) var<uniform> fade: FadeUniforms;
```

(The pick fragment doesn't read `fade`, but the binding is required so the pipeline layout matches what the visual shaders expect — and so the pick pipeline can reuse the visual renderer's @group(1) bind group identity.)

Now in `pickRenderer.ts`, build the pipeline layout explicitly:

```ts
const pipelineLayout = device.createPipelineLayout({
  label: 'pick-pipeline-layout',
  bindGroupLayouts: [
    device.createBindGroupLayout({
      label: 'pick-bgl-group0',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    }),
    fadeBgl, // @group(1) — passed in from caller; must match visual pipeline
    sourceBgl, // @group(2) — passed in from caller; shared identity with visual
  ],
});
```

(Also extend the factory signature to accept `fadeBgl: FadeUniformsBgl` alongside `sourceBgl`.)

In the pick `pick()` body (around line 484), replace the per-source bind-group block:

```ts
// Build per-source @group(2) bind groups against the SHARED
// canonical sourceBgl layout — no longer pipeline-specific, so
// the same bind group identity could be used for the visual pass
// (but we still build a fresh per-pipeline group here because the
// pick pipeline runs in its own pass with its own command encoder).
for (const src of sourceList) {
  const sourceBindGroup = device.createBindGroup({
    label: `pick-bg-source-${src.source}`,
    layout: sourceBgl,
    entries: [{ binding: 0, resource: { buffer: src.sourceBuffer } }],
  });
  // Bind a zeroed @group(1) — the pick pass doesn't use fade.opacity
  // but the pipeline layout requires the binding to be present.
  // Reusing the same dummy buffer across draws is fine; no race
  // because @group(1) is read-only at the pipeline level.
  pass.setBindGroup(1, dummyFadeBindGroup);
  pass.setBindGroup(2, sourceBindGroup);
  pass.setVertexBuffer(0, src.vertexBuffer);
  pass.draw(6, src.count);
}
```

At the top of the factory body, add the dummy fade buffer + bind group (these live for the pick renderer's lifetime; one allocation, never freed until `destroy()`):

```ts
// Pick pipeline declares @group(1) (FadeUniforms) to match the
// shared vertex shader's pipeline-layout shape, but the pick
// fragment doesn't read fade.opacity. A zeroed buffer is fine —
// the pick pipeline writes to the r32uint pick texture, not the
// visual swap chain, so opacity has no observable effect.
const dummyFadeBuffer = device.createBuffer({
  label: 'pick-fade-uniform-dummy',
  size: 16,
  usage: GPUBufferUsage.UNIFORM,
});
const dummyFadeBindGroup = device.createBindGroup({
  label: 'pick-fade-bg-dummy',
  layout: fadeBgl,
  entries: [{ binding: 0, resource: { buffer: dummyFadeBuffer } }],
});
```

In the pick `destroy()`, add:

```ts
dummyFadeBuffer.destroy();
```

- [ ] **Step 4: Update the `createPointRenderer` and `createPickRenderer` call sites in `initGpu.ts`**

Find the calls (in `src/services/engine/phases/initGpu.ts` or nearby phase files). Update each to pass the BGLs:

```ts
const renderer = createPointRenderer(device, format, state.gpu.fadeBgl!, state.gpu.sourceBgl!);
// ...
const pickRenderer = createPickRenderer(device, /* existing args */, state.gpu.fadeBgl!, state.gpu.sourceBgl!);
```

The `!` is safe here because `initGpu` constructed the BGLs at the top of the phase (Task 2.5).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. If errors remain, they're in places referencing the old `entry.fade.*` or `entry.cloudFadeBuffer` — find them with `grep -rn "cloudFadeBuffer\|\.fade\.\|CloudFade" src/` and fix each call site.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS except for tests that exercise the removed `pointRenderer.isFading()` — those will be addressed in Task 3.5. If any other test fails, debug before continuing.

- [ ] **Step 7: Commit the points migration (3.2 + 3.3 + 3.4 together)**

```bash
git add src/@types/rendering/PointRenderer.d.ts src/@types/rendering/PickSourceDraw.d.ts src/@types/rendering/PointDrawSettings.d.ts src/services/gpu/renderers/pointRenderer.ts src/services/gpu/renderers/pickRenderer.ts src/services/gpu/shaders/points/pickFragment.wesl src/services/engine/frame/runFrame.ts src/services/engine/phases/initGpu.ts
git commit -m "$(cat <<'EOF'
refactor(gpu): migrate pointRenderer off CloudFade onto FadeRegistry

- BufferEntry gains fadeBuffer + sourceBuffer + their bind groups.
- @group(1) is FadeUniforms (canonical), @group(2) is SourceUniforms.
- Per-frame fade.opacity write reads from state.subsystems.fades.
- Source 5-bit code written once at upload, never per-frame.
- PickRenderer threads the shared sourceBgl identity at @group(2).
- pointRenderer.isFading() removed from the type and implementation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.5: Register survey handles in galaxyCatalogSourceRegistry

**Files:**

- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`

- [ ] **Step 1: Add the registration call**

In `wireGalaxyCatalogSourceSlot` (around line 207-285), add a `fades.register` call near the top of the function body, before the `createAssetSlot` call. The full edit:

```ts
export function wireGalaxyCatalogSourceSlot(
  state: EngineState,
  cfg: GalaxyCatalogSourceConfig,
  deps: WirePointSourceDeps,
): void {
  const { source, fetcher } = cfg;
  const { cb } = deps;
  const slotName = `${sourceName(source)}-points`;

  // Register the survey's fade handle at opacity 0 — the slot commit
  // will fadeTo(1, FADE_IN_DURATION_MS) once the upload lands. See
  // src/services/animation/fadeRegistry.ts for the registry contract.
  state.subsystems.fades.register({ kind: 'survey', source }, 0);

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    // ... rest of body unchanged
  });
```

- [ ] **Step 2: Update tests that assert subsystem state**

Run: `grep -rn "wireGalaxyCatalogSourceSlot\|fades" tests/services/engine/wiring/ | head`

If the existing `galaxyCatalogSourceRegistry.test.ts` mocks `state.subsystems` without a `fades` field, update its fixture to include a stub registry:

```ts
const fadesStub = {
  label: 'fadeRegistry',
  register: vi.fn(),
  unregister: vi.fn(),
  fadeTo: vi.fn(() => Promise.resolve()),
  setImmediate: vi.fn(),
  opacityOf: vi.fn(() => 1),
  isAnyAnimating: vi.fn(() => false),
  tick: vi.fn(),
  destroy: vi.fn(),
};
```

Add `fades: fadesStub` to the subsystems mock in that test file.

Then add a positive assertion:

```ts
it('registers a survey fade handle for the wired source', () => {
  // ... arrange + wireGalaxyCatalogSourceSlot(state, cfg, deps) ...
  expect(fadesStub.register).toHaveBeenCalledWith({ kind: 'survey', source: cfg.source }, 0);
});
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test -- tests/services/engine/wiring/galaxyCatalogSourceRegistry.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/wiring/galaxyCatalogSourceRegistry.ts tests/services/engine/wiring/galaxyCatalogSourceRegistry.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): register survey fade handle at slot wiring time

Each row of GALAXY_CATALOG_SOURCE_REGISTRY registers its FadeHandle
at opacity 0 in wireGalaxyCatalogSourceSlot, before the slot's commit
step runs. The commit (next task) drives the fadeTo lifecycle.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Galaxy-catalog slot orchestration

### Task 4.1: Sequential fade-out → upload → fade-in in galaxyCatalogSourceRegistry commit

**Files:**

- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`

- [ ] **Step 1: Update the commit step**

In `wireGalaxyCatalogSourceSlot`, the `commit:` field of the slot factory currently looks like:

```ts
    commit: async (cloud) => {
      if (state.gpu.renderer === null) return;
      const t0 = performance.now();
      console.log(`[engine] upload start ${sourceName(source)} count=${cloud.count}`);
      await state.gpu.renderer.upload(source, cloud);
      state.sources.catalogs.set(source, cloud);
      // ...
    },
```

Replace its body with the sequential orchestration:

```ts
    commit: async (cloud) => {
      if (state.gpu.renderer === null) return;
      const handle: FadeHandle = { kind: 'survey', source };
      const fades = state.subsystems.fades;

      // If this is NOT the first load, fade out the existing buffer
      // before destroying it. The renderer keeps drawing the OLD
      // buffer with falling alpha until fade-out completes.
      const isFirstLoad = !state.sources.catalogs.has(source);
      if (!isFirstLoad) {
        await fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
      }

      const t0 = performance.now();
      console.log(`[engine] upload start ${sourceName(source)} count=${cloud.count}`);
      await state.gpu.renderer.upload(source, cloud);
      state.sources.catalogs.set(source, cloud);
      const dtMs = Math.round(performance.now() - t0);

      // Fire-and-forget: fade-in starts immediately, the slot's
      // `ready` transition fires (subscribers wake), the camera
      // doesn't have to wait for the smoothstep to saturate before
      // the next user interaction can proceed.
      void fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);

      const onGpu = Array.from(state.gpu.renderer.loadedSources())
        .map((e) => `${sourceName(e.source)}=${e.count}`)
        .join(', ');
      const total = state.gpu.renderer.totalCount();
      console.log(
        `[engine] upload done  ${sourceName(source)} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
```

Add imports at the top of `galaxyCatalogSourceRegistry.ts`:

```ts
import type { FadeHandle } from '../../../@types/animation/FadeHandle';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
```

- [ ] **Step 2: Write integration test**

Create `tests/services/engine/wiring/galaxyCatalogSourceRegistryFade.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { wireGalaxyCatalogSourceSlot } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import { Source } from '../../../../src/data/sources';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../../src/services/animation/fadeController';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';

function makeFakeCatalog(count: number): GalaxyCatalog {
  // Minimal stub — the slot commit only reads .count for logging.
  return { count, source: Source.SDSS } as unknown as GalaxyCatalog;
}

describe('wireGalaxyCatalogSourceSlot — fade orchestration', () => {
  function makeFixture() {
    const fadeCalls: Array<{ target: number; duration: number }> = [];
    const fades = {
      label: 'fadeRegistry',
      register: vi.fn(),
      unregister: vi.fn(),
      fadeTo: vi.fn(async (_h: unknown, target: number, duration: number) => {
        fadeCalls.push({ target, duration });
      }),
      setImmediate: vi.fn(),
      opacityOf: vi.fn(() => 1),
      isAnyAnimating: vi.fn(() => false),
      tick: vi.fn(),
      destroy: vi.fn(),
    };
    const upload = vi.fn(async () => {});
    const state = {
      gpu: {
        renderer: {
          upload,
          loadedSources: () => [][Symbol.iterator](),
          totalCount: () => 0,
        },
      },
      sources: { catalogs: new Map() },
      subsystems: { fades, scheduler: { requestRender: vi.fn() } },
      assetSlots: { points: new Map() },
    };
    return { state, fades, upload, fadeCalls };
  }

  it('first load fires fadeTo(1, FADE_IN_DURATION_MS) only (no fade-out)', async () => {
    const fx = makeFixture();
    wireGalaxyCatalogSourceSlot(
      fx.state as never,
      { source: Source.SDSS, fetcher: vi.fn() } as never,
      { cb: {} } as never,
    );
    const slot = fx.state.assetSlots.points.get(Source.SDSS)!;
    // Drive the commit directly:
    await (slot as never as { _commitForTest: (c: GalaxyCatalog) => Promise<void> })._commitForTest(
      makeFakeCatalog(1),
    );
    // ... or, more realistically, the slot has its own `load()` API; the
    // test harness here is illustrative. The assertion is what matters:
    expect(fx.fadeCalls).toEqual([{ target: 1, duration: FADE_IN_DURATION_MS }]);
  });

  it('second load awaits fadeTo(0, FADE_OUT_DURATION_MS) before upload', async () => {
    const fx = makeFixture();
    // Pre-seed: pretend a catalog is already loaded.
