# Selection Ring Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the per-galaxy selection ring out of the main points fragment shader into its own dedicated UI-overlay renderer, so the main points pipeline no longer carries selection-aware branches.

**Architecture:** A new `selectionRingPass` sits at the head of `UI_PASSES`, drawing one screen-aligned quad per selection on the swap-chain after tone-map. The pass invokes a lightweight `selectionRingRenderer` (factory closure, mirrors `markerLineRenderer.ts`) that owns a single pipeline, a 16-byte uniform, and one bind group. The CPU computes `ringRadiusPx` per frame from the selected galaxy's `diameterKpc`, camera distance, and `pxPerRad`; the GPU vertex shader projects `worldPos` via shared `CameraUniforms` and expands four corners by `ringRadiusPx` using the existing `expandBillboardScreen` helper from `lib/billboard.wesl`. The fragment shader emits a pure-white annulus with smoothstep edges. The pass `enabled()` returns `false` when nothing is selected, so the renderer is zero-cost in the common case. After wiring, the main points shader loses its `selected` varying, its `isSelected`/`sizeScale` math, and the entire `if (in.selected == 1u) { ... }` fragment branch.

**Tech Stack:** TypeScript + Vitest, raw WebGPU + WESL shaders (`?static` imports, `package::` paths), the project's pass-and-renderer factory conventions documented in `markerLineRenderer.ts` and `markerLinesPass.ts`.

---

## File Structure

**New files:**

- `src/services/gpu/shaders/selectionRing/io.wesl` — `SelectionRingUniforms` struct + `VsIn` + `VsOut`.
- `src/services/gpu/shaders/selectionRing/vertex.wesl` — projects `worldPos`, expands corners via `expandBillboardScreen`.
- `src/services/gpu/shaders/selectionRing/fragment.wesl` — annulus mask + white premultiplied output.
- `src/services/gpu/renderers/selectionRingRenderer.ts` — factory: pipeline, uniform buffer, corner VBO, bind group, `setSelection`, `render`, `destroy`.
- `src/@types/rendering/SelectionRingRenderer.d.ts` — public handle type.
- `src/services/engine/frame/passes/selectionRingPass.ts` — `Pass` literal; `enabled()` gates on `state.subsystems.selection.selected() !== null`; `draw()` computes `ringRadiusPx` and forwards to renderer.

**Modified files:**

- `src/services/gpu/shaders/points/io.wesl` — drop `selected` varying.
- `src/services/gpu/shaders/points/vertex.wesl` — drop `isSelected`, `sizeScale`, and the `out.selected` writes (both early-out and main path); drop the `!isSelected` bypass on the invisibility cull.
- `src/services/gpu/shaders/points/colorFragment.wesl` — delete the entire `if (in.selected == 1u) { ... }` branch (lines 92-179).
- `src/services/engine/frame/passes/index.ts` — import + add `selectionRingPass` to head of `UI_PASSES`.
- `src/@types/engine/handles/EngineGpuHandles.d.ts` — add `selectionRingRenderer: SelectionRingRenderer | null`.
- `src/services/engine/phases/initGpu.ts` — instantiate `selectionRingRenderer` next to `markerLineRenderer`; add to the `destroy()` chain.

**Tests:**

- `tests/services/gpu/renderers/selectionRingRenderer.test.ts` — CPU state (null device, setSelection/clearSelection, hasSelection count).
- `tests/services/engine/frame/passes/selectionRingPass.test.ts` — `enabled()` gate cases + `draw()` ringRadiusPx math + uniform forwarding.

---

## Design decisions committed at plan time

These are non-negotiable for the implementer:

1. **Timing slot.** Reuses the existing `ui-overlay` slot — DO NOT add a new entry to `TIMING_SLOT_NAMES`. All UI_PASSES share one `beginRenderPass` and one timing slot by design (see `encodeUiOverlay.ts` module header).
2. **Bind-group layout.** `@group(0) @binding(0)` is the shared `CameraUniforms` prefix; `@group(0) @binding(1)` is `SelectionRingUniforms`. Both vertex-visible; fragment reads neither (only the `VsOut` varyings).
3. **CameraUniforms vs SelectionRingUniforms.** Two separate UBOs, NOT one concatenated struct. The camera prefix is 80 bytes; the selection-specific tail is 16 bytes; combining them would force a per-frame 96-byte write where 16 will do for selection changes plus 80 for camera changes. Mirrors how `markerLineRenderer` writes only 80 bytes per frame.
4. **CPU-side ringRadiusPx formula:** `max(pointSizePx, apparentPxRadius) * 8` where `apparentPxRadius = (max(diameterKpc, 30) * 2 / 1000 / max(camDist, 0.001)) * pxPerRad`. Matches the existing vertex.wesl math byte-for-byte. (The `select(30.0, diameterKpc, diameterKpc > 0.0)` floor preserves the existing fallback behaviour for synthetic rows.)
5. **POI fold-in deferred.** This plan does NOT touch `clusterMarkersPass` or the POI ring/halo. The renderer's uniform shape is type-agnostic so a follow-up PR can add a `selectedPoi` branch to `selectionRingPass.draw()` without renderer or shader changes.
6. **pickRenderer.ts `SELECTED_PACKED_OFFSET` write stays.** It's harmless overhead writing into an otherwise-unread slot. A follow-up PR can remove both the uniform field and the pickRenderer write together; doing it here mixes concerns.

---

## Phase 1: Selection Ring Shaders

Build the three WESL files. No CPU code yet — these compile against any caller that follows the documented uniform shape.

### Task 1.1: Write the io.wesl struct module

**Files:**
- Create: `src/services/gpu/shaders/selectionRing/io.wesl`

- [ ] **Step 1: Write `io.wesl`**

```wesl
// selectionRing/io.wesl — shared struct definitions for the selection-ring
// renderer.  Imported by vertex.wesl + fragment.wesl; bindings themselves
// are re-declared in the consuming files (WESL has no global state — same
// pattern as markerLines/io.wesl).
//
// ## Uniform layout (two UBOs, two bindings)
//
// @group(0) @binding(0): shared CameraUniforms prefix (80 bytes; viewProj
//   + viewportPx + 2 reserved pads).  Drives world-space → clip projection
//   and the px → clip-space conversion for corner expansion.
//
// @group(0) @binding(1): SelectionRingUniforms (16 bytes):
//   bytes  0..11  worldPos       vec3<f32> — the selected galaxy's world Mpc
//   bytes 12..15  ringRadiusPx   f32       — CPU-computed pixel radius
//
// We use TWO uniform bindings rather than one concatenated struct so the
// per-frame upload writes only the 16-byte selection tail when the camera
// hasn't changed, while the camera prefix re-uploads at its own cadence.
// Mirrors the markerLine / label renderers' single-binding shape but with
// the renderer-specific tail moved to its own buffer because the camera
// part is shared with every other UI overlay.
//
// ## Why no per-instance attributes
//
// One instance per frame at most.  The vertex stage reads `u.sel.worldPos`
// from the uniform and uses `@builtin(vertex_index)` to pick its corner
// via `quadCorner(vi)`.  No vertex buffer is needed beyond the implicit
// 6-vertex non-indexed draw.

import package::lib::camera::CameraUniforms;

struct SelectionRingUniforms {
  // World-space position of the selected galaxy in Mpc.  Projected to
  // clip space via the shared CameraUniforms viewProj.
  worldPos: vec3<f32>,
  // Final on-screen ring radius in CSS pixels.  CPU-computed as
  // `max(pointSizePx, apparentPxRadius) * 8` (the same formula the
  // pre-extraction shader applied on the GPU side).
  ringRadiusPx: f32,
};

// ── vertex-to-fragment interface ──────────────────────────────────
//
// `uv` is the unit-quad corner in [-1, +1]² — the fragment stage uses
// `dot(uv, uv)` for the radial annulus mask.  `ringRadiusPx` is
// forward-flat so the fragment can compute the band fraction without
// re-binding the uniform.

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) ringRadiusPx: f32,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/services/gpu/shaders/selectionRing/io.wesl
git commit -m "feat(selection-ring): add WESL struct module for selection-ring renderer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 1.2: Write the vertex shader

**Files:**
- Create: `src/services/gpu/shaders/selectionRing/vertex.wesl`

- [ ] **Step 1: Write `vertex.wesl`**

```wesl
// selectionRing/vertex.wesl — project the selected galaxy's world
// position and expand a screen-aligned `ringRadiusPx`-radius quad.
//
// Bindings live here, not in io.wesl — WESL has no global state, so
// `@group/@binding` declarations are module-local.  We re-declare both
// uniforms here using the structs imported from io.wesl; the layout
// numbers (and the byte layouts via the imported structs) are
// guaranteed to match the fragment stage's redeclarations.

import package::selectionRing::io::SelectionRingUniforms;
import package::selectionRing::io::VsOut;
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<uniform> sel: SelectionRingUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  // Project the selected galaxy's world position to clip space.  The
  // shared helper makes the camera path identical to every other
  // billboard renderer in the project.
  let center = worldToClip(cam, sel.worldPos);

  // Look up this vertex's unit-quad corner in [-1, +1]² via the shared
  // billboard helper.  Six vertices per quad (non-indexed triangle-list)
  // — same shape as markerLines, labels, and the points renderer use.
  let corner = quadCorner(vi);

  // Expand the centre by `ringRadiusPx` pixels via the same helper the
  // points pipeline uses for its main billboards.  No per-instance
  // sizeScale here: the CPU already baked the 8× halo factor into
  // `ringRadiusPx`, so the helper returns the final clip-space delta.
  let offset = expandBillboardScreen(cam, center, sel.ringRadiusPx, corner);

  var out: VsOut;
  out.pos = center + vec4<f32>(offset, 0.0, 0.0);
  out.uv = corner;
  out.ringRadiusPx = sel.ringRadiusPx;
  return out;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/gpu/shaders/selectionRing/vertex.wesl
git commit -m "feat(selection-ring): add vertex shader projecting world pos to screen-aligned quad

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 1.3: Write the fragment shader

**Files:**
- Create: `src/services/gpu/shaders/selectionRing/fragment.wesl`

- [ ] **Step 1: Write `fragment.wesl`**

```wesl
// selectionRing/fragment.wesl — annulus mask + pure-white output.
//
// The annulus geometry mirrors the pre-extraction selection ring in
// `points/colorFragment.wesl`:
//
//   outer edge:   r² <= 1.0  (the quad's inscribed circle)
//   inner edge:   r² <= (1 - bandFraction)²
//   bandFraction: min(0.15, 4 / max(ringRadiusPx, 1)) — caps stroke
//                 width at ~4 px until the ring is small enough that 4
//                 px is more than 15 % of the radius, then falls back to
//                 the original 15 % proportional cap.
//
// Soft anti-aliased edges via smoothstep with a window 1/10th of the
// band width on each side — same shape as the pre-extraction code.
//
// ## Output colour
//
// Pure white, premultiplied alpha (`vec4(alpha, alpha, alpha, alpha)`).
// The pass writes to the swap-chain after tone-map, so HDR boost is
// not available — and not needed: the post-tone-map output of the
// pre-extraction ring was already "basically white" empirically (see
// grill session Q5).  No `tint` uniform; no per-galaxy colour.
//
// Bindings: this stage reads only the `VsOut` varyings (no uniform
// access), so no `@group/@binding` declarations are needed here.

import package::selectionRing::io::VsOut;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  // Radial distance² from the quad centre.  The vertex stage hands us
  // a UV in [-1, +1]², so `dot(uv, uv)` is `r²` in unit-quad space.
  let r2 = dot(input.uv, input.uv);

  // Outside the outer disc — discard.  Without the discard, the
  // smoothstep below would leak fragments outside the unit circle to
  // negative alpha, which the blend would clamp to zero but still cost
  // a per-fragment write.
  if (r2 > 1.0) { discard; }

  // Band fraction matches the pre-extraction formula.
  let bandFraction = min(0.15, 4.0 / max(input.ringRadiusPx, 1.0));
  let innerR = 1.0 - bandFraction;

  // r is needed to compare against the band edges; `sqrt` on a guarded
  // r2 (we know r2 <= 1) is cheap and lets the smoothstep windows live
  // in the same linear-distance space as `innerR` and the outer edge.
  let r = sqrt(r2);

  // Inside the inner disc — discard.  The ring is hollow.
  if (r < innerR) { discard; }

  // Soft edges on both sides of the band.  Window = 1/10th of the
  // band width on each side; matches the pre-extraction code's
  // `edgeFade = bandFraction * 0.1`.
  let edgeFade = bandFraction * 0.1;
  let inEdge   = smoothstep(innerR, innerR + edgeFade, r);
  let outEdge  = 1.0 - smoothstep(1.0 - edgeFade, 1.0, r);
  let alpha    = inEdge * outEdge;

  // Pure white, premultiplied.  Blend mode (set on the JS-side
  // pipeline descriptor) is premultiplied-alpha OVER — same as
  // markerLines and labels.
  return vec4<f32>(alpha, alpha, alpha, alpha);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/gpu/shaders/selectionRing/fragment.wesl
git commit -m "feat(selection-ring): add fragment shader emitting white annulus

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2: Renderer Service

A factory closure following the `markerLineRenderer` shape: null-device-safe, CPU state always allocated, GPU resources gated on `device !== null`.

### Task 2.1: Add the public handle type

**Files:**
- Create: `src/@types/rendering/SelectionRingRenderer.d.ts`

- [ ] **Step 1: Write the type**

```ts
/**
 * Public handle returned by `createSelectionRingRenderer`.  Mirrors the
 * shape of every other lightweight renderer in the project
 * (`MarkerLineRenderer`, `LabelRenderer`): explicit method types, no
 * internals leaked.
 *
 * The renderer holds one current selection at a time.  `setSelection`
 * replaces the current value (or clears it when passed `null`); the
 * pass uses `hasSelection` as a draw-gate proxy and `render` is a
 * no-op when nothing is selected.
 */

import type { Vec3 } from '../math/Vec3';

export type SelectionRingRenderer = {
  /** Human-readable identifier (`'selectionRingRenderer'`). */
  readonly label: string;
  /**
   * Replace the current selection.  Passing `null` clears it — the
   * next `render` call becomes a no-op and `hasSelection()` returns
   * `false`.  `ringRadiusPx` is the CPU-computed final pixel radius
   * (the 8× halo factor must already be baked in by the caller).
   */
  setSelection(value: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null): void;
  /** True when a non-null selection is currently set. */
  hasSelection(): boolean;
  /**
   * Record the draw call into an in-flight render pass.  Must be
   * called inside a `beginRenderPass` / `pass.end()` block on the
   * swap-chain texture (premultiplied-OVER blend expects an LDR target).
   * No-op when `hasSelection()` is false.
   */
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void;
  /** Release all GPU resources. No-op if constructed with a null device. */
  destroy(): void;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/@types/rendering/SelectionRingRenderer.d.ts
git commit -m "feat(selection-ring): add SelectionRingRenderer handle type

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 2.2: Write the renderer factory tests

**Files:**
- Create: `tests/services/gpu/renderers/selectionRingRenderer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createSelectionRingRenderer } from '../../../../src/services/gpu/renderers/selectionRingRenderer';

// Build a SelectionRingRenderer with a null device — the factory guards all
// GPU calls behind `if (device)`, so CPU state is safe to exercise in unit
// tests without a real WebGPU context.  Mirrors `markerLineRenderer.test.ts`.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'bgra8unorm' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createSelectionRingRenderer(ctx);
};

describe('SelectionRingRenderer (CPU state)', () => {
  it('starts with no selection', () => {
    const r = newRenderer();
    expect(r.hasSelection()).toBe(false);
  });

  it('reports hasSelection after setSelection', () => {
    const r = newRenderer();
    r.setSelection({ worldPos: [1, 2, 3], ringRadiusPx: 40 });
    expect(r.hasSelection()).toBe(true);
  });

  it('clears on setSelection(null)', () => {
    const r = newRenderer();
    r.setSelection({ worldPos: [1, 2, 3], ringRadiusPx: 40 });
    r.setSelection(null);
    expect(r.hasSelection()).toBe(false);
  });

  it('render() is a no-op when nothing is selected', () => {
    const r = newRenderer();
    // No throw — the function returns early because device is null AND
    // selection is empty.  Pass a null GPURenderPassEncoder to prove the
    // no-op never touches the encoder.
    r.render(null as unknown as GPURenderPassEncoder, new Float32Array(16), [1280, 720]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/gpu/renderers/selectionRingRenderer.test.ts`
Expected: FAIL with "Cannot find module .../selectionRingRenderer"

### Task 2.3: Implement the renderer factory

**Files:**
- Create: `src/services/gpu/renderers/selectionRingRenderer.ts`

- [ ] **Step 1: Write the renderer**

```ts
/**
 * selectionRingRenderer — the per-galaxy selection-halo overlay
 * renderer.  Lives in `UI_PASSES` (premultiplied-OVER, post-tone-map)
 * via `selectionRingPass`.
 *
 * ## Why a separate renderer instead of folding into points
 *
 * The pre-extraction main-points fragment carried a 90-line
 * `if (in.selected == 1u) { ... }` branch (see git history of
 * points/colorFragment.wesl pre-extraction).  Of the ~3.5 M point
 * fragments per frame, exactly ONE galaxy ever satisfied that branch.
 * The vertex stage similarly carried a `selected` varying + a
 * `sizeScale` factor + an invisibility-cull bypass — all paying for a
 * one-instance feature on every instance.  Extracting the ring into
 * its own pass with a one-instance draw call eliminates that overhead
 * and reduces the points shader to its actual job (render points).
 *
 * ## Why a factory closure, not a class
 *
 * Same convention every recently-extracted renderer follows
 * (`markerLineRenderer`, `clusterMarkerRenderer`, every Pass object
 * literal): factory returns a typed handle, internal state lives in
 * closures.  See `markerLineRenderer.ts`'s module header for the full
 * rationale; we apply it here verbatim.
 *
 * ## Why two uniform bindings (camera + selection)
 *
 * The camera prefix is 80 bytes; the selection-specific tail is 16
 * bytes.  Combining them into one buffer would force a 96-byte
 * writeBuffer every frame even when the selection hasn't moved.
 * Two bindings let each buffer upload at its own cadence: camera
 * every frame (cheap, always changes), selection only when the user
 * picks a new galaxy (~once per second of interaction at most).
 * Mirrors the markerLine / label renderers' split between shared
 * camera state and per-renderer state.
 *
 * ## Blend mode
 *
 * Premultiplied-alpha OVER (`src: one, dst: one-minus-src-alpha`) —
 * the ring is UI overlay, not emissive content.  Same blend as
 * markerLines and labels.  Not additive: at alpha=0 the ring should
 * fully reveal the swap-chain underneath, not double-expose against it.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { SelectionRingRenderer } from '../../../@types/rendering/SelectionRingRenderer';
import vsCode from '../shaders/selectionRing/vertex.wesl?static';
import fsCode from '../shaders/selectionRing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// ─── buffer constants ──────────────────────────────────────────────────────

/** Shared CameraUniforms prefix — 64 (viewProj) + 8 (viewportPx) + 8 (pads). */
const CAMERA_UNIFORM_BYTES = 80;

/** SelectionRingUniforms: vec3<f32> worldPos + f32 ringRadiusPx = 16 bytes. */
const SELECTION_UNIFORM_BYTES = 16;

export function createSelectionRingRenderer(ctx: GpuContext): SelectionRingRenderer {
  // The `as ... | null` cast lets a test pass `device: null as unknown as
  // GPUDevice` through GpuContext without TypeScript complaining at the
  // call site.  Runtime null-checks below gate every GPU call.
  const device = ctx.device as GPUDevice | null;
  const format = ctx.format;

  // Closure-scoped mutable selection.  `null` = nothing selected; the
  // `enabled()` proxy `hasSelection()` reads this directly.
  let currentSelection: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null = null;

  // GPU resources (null when device is null).
  let pipeline: GPURenderPipeline | null = null;
  let cameraBuffer: GPUBuffer | null = null;
  let selectionBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;

  if (device) {
    // One bind group, two bindings — both vertex-visible, neither read by
    // the fragment stage.
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'selection-ring-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'selectionRing.vertex');
    const fsModule = createShaderModuleWithDevLog(device, fsCode, 'selectionRing.fragment');

    pipeline = device.createRenderPipeline({
      label: 'selection-ring-pipeline',
      layout: device.createPipelineLayout({
        label: 'selection-ring-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: vsModule,
        entryPoint: 'vs',
        // No vertex buffers — the vertex stage uses `@builtin(vertex_index)`
        // alone to drive `quadCorner(vi)`.  Six-vertex non-indexed draw.
      },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied-alpha OVER blend.  Same as markerLines /
            // labels — the ring is UI overlay, not emissive content.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      // No depthStencil — UI overlay, no depth participation.
    });

    cameraBuffer = device.createBuffer({
      label: 'selection-ring-camera',
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    selectionBuffer = device.createBuffer({
      label: 'selection-ring-selection',
      size: SELECTION_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    bindGroup = device.createBindGroup({
      label: 'selection-ring-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: selectionBuffer } },
      ],
    });
  }

  function setSelection(value: { worldPos: Readonly<Vec3>; ringRadiusPx: number } | null): void {
    currentSelection = value;
  }

  function hasSelection(): boolean {
    return currentSelection !== null;
  }

  function render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void {
    if (!device || !pipeline || !bindGroup || !cameraBuffer || !selectionBuffer) return;
    if (currentSelection === null) return;

    // Camera UBO: viewProj (bytes 0..63) + viewportPx (64..71) + 2 pads
    // (72..79).  Float32Array zero-initialises, so the pads stay zero
    // without an explicit write — consistent with markerLineRenderer.
    const camUni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    camUni.set(viewProj, 0);
    camUni[16] = viewportSize[0];
    camUni[17] = viewportSize[1];
    device.queue.writeBuffer(cameraBuffer, 0, camUni);

    // Selection UBO: worldPos.xyz (bytes 0..11) + ringRadiusPx (12..15).
    // The vec3<f32> packs naturally into the leading 12 bytes; the f32
    // at offset 12 fills the remaining 4 bytes of the 16-byte buffer.
    const selUni = new Float32Array(SELECTION_UNIFORM_BYTES / 4);
    selUni[0] = currentSelection.worldPos[0];
    selUni[1] = currentSelection.worldPos[1];
    selUni[2] = currentSelection.worldPos[2];
    selUni[3] = currentSelection.ringRadiusPx;
    device.queue.writeBuffer(selectionBuffer, 0, selUni);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // Six-vertex non-indexed triangle-list — `quadCorner(vi)` in the
    // vertex stage maps `vi ∈ [0, 6)` to the two triangles' corners.
    pass.draw(6, 1, 0, 0);
  }

  function destroy(): void {
    cameraBuffer?.destroy();
    selectionBuffer?.destroy();
  }

  const renderer: SelectionRingRenderer = {
    label: 'selectionRingRenderer',
    setSelection,
    hasSelection,
    render,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/services/gpu/renderers/selectionRingRenderer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no new errors.  (The pass file doesn't exist yet, so anything that imports it would fail, but at this stage nothing does.)

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/renderers/selectionRingRenderer.ts tests/services/gpu/renderers/selectionRingRenderer.test.ts
git commit -m "feat(selection-ring): add factory closure for selection-ring renderer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3: Engine Pass + Wiring

Wire the renderer into engine state and add the pass that drives it from the per-frame loop. The new pass coexists with the still-present old selection-ring code in the points shader — the two will briefly render together (the in-shader ring on top of the new UI ring) until Phase 4 deletes the old code. This is intentional: keep the new path provably working before deleting the old one.

### Task 3.1: Add the renderer slot to EngineGpuHandles

**Files:**
- Modify: `src/@types/engine/handles/EngineGpuHandles.d.ts`

- [ ] **Step 1: Add the import + field**

Add to the imports block (next to `MarkerLineRenderer`):

```ts
import type { SelectionRingRenderer } from '../../rendering/SelectionRingRenderer';
```

Add to the `EngineGpuHandles` type, immediately after the `markerLineRenderer` field:

```ts
  /**
   * Selection-ring overlay renderer — draws a white annulus around
   * the currently-selected galaxy on the swap-chain UI overlay.  Null
   * until `initGpu` constructs it (same phase as `markerLineRenderer`,
   * no atlas or async dep).  Excluded from the `isEngineReady`
   * predicate for the same reason as `markerLineRenderer` — the
   * `selectionRingPass` null-checks this field at point of use.
   * Stored here so `destroy()` can release the renderer's GPU buffers
   * (two uniform buffers + one bind group).
   */
  selectionRingRenderer: SelectionRingRenderer | null;
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: FAIL — `initGpu.ts`, `engine.ts` (or wherever the `EngineState` literal is built) must initialise the new field.

- [ ] **Step 3: Find and update every site that constructs an EngineGpuHandles literal**

Run: `grep -rn "markerLineRenderer:" src/ --include="*.ts" --include="*.tsx"`
Expected: Find each occurrence of `markerLineRenderer: null` (or similar in tests) and add `selectionRingRenderer: null` next to it.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/handles/EngineGpuHandles.d.ts src/services/engine/engine.ts
# (plus any other files the typecheck flagged — typically engine.ts only)
git commit -m "feat(selection-ring): add renderer slot to EngineGpuHandles

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.2: Instantiate the renderer in initGpu

**Files:**
- Modify: `src/services/engine/phases/initGpu.ts`

- [ ] **Step 1: Add the import**

Add next to the existing `createMarkerLineRenderer` import:

```ts
import { createSelectionRingRenderer } from '../../gpu/renderers/selectionRingRenderer';
```

- [ ] **Step 2: Instantiate alongside markerLineRenderer**

Find the line `state.gpu.markerLineRenderer = createMarkerLineRenderer(uiCtx);` and add immediately after:

```ts
state.gpu.selectionRingRenderer = createSelectionRingRenderer(uiCtx);
```

- [ ] **Step 3: Add to the destroy chain**

Find the `destroy()` chain near the bottom of `initGpu.ts` (the block that calls `.destroy()` on `labelRenderer`, `markerLineRenderer`, etc.).  Add the new renderer to that block:

```ts
state.gpu.selectionRingRenderer?.destroy();
state.gpu.selectionRingRenderer = null;
```

If `initGpu.ts` doesn't own teardown for these (some engine versions put teardown in `engine.ts`'s top-level `destroy`), check that file and put the two lines next to the existing `markerLineRenderer` teardown.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/initGpu.ts
git commit -m "feat(selection-ring): wire renderer instantiation in initGpu

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.3: Write the pass tests

**Files:**
- Create: `tests/services/engine/frame/passes/selectionRingPass.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { selectionRingPass } from '../../../../../src/services/engine/frame/passes/selectionRingPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { RenderFrameSettings } from '../../../../../src/@types/engine/frame/RenderFrameSettings';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { mat4 } from 'gl-matrix';
import { Source } from '../../../../../src/data/sources';

// ── fixtures ──────────────────────────────────────────────────────

function makeCtx(): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    renderer: {} as never,
    postProcess: {} as never,
    volumeOffscreen: {} as never,
    texturedImpostors: {} as never,
  };
}

function makeSettings(overrides: Partial<RenderFrameSettings> = {}): RenderFrameSettings {
  return { pointSizePx: 4, ...overrides } as RenderFrameSettings;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const DEPS_STUB = {} as PassDeps;

// A minimal stand-in for the renderer's `setSelection` + `render`.
function makeRendererSpy() {
  return {
    label: 'selectionRingRenderer',
    setSelection: vi.fn(),
    hasSelection: vi.fn().mockReturnValue(false),
    render: vi.fn(),
    destroy: vi.fn(),
  };
}

// A catalog stub with one galaxy at known world position + diameter.
// Position is the flat Float32Array `positions[localIdx*3 .. +3]`.
function makeStateWithSelection(selection: { source: Source; localIdx: number } | null): EngineState {
  const positions = new Float32Array([0, 0, 100]); // 100 Mpc away on +z
  const diameterKpc = new Float32Array([60]);       // 60 kpc galaxy
  const catalog = { positions, diameterKpc } as unknown as Parameters<EngineState['sources']['catalogs']['set']>[1];
  const catalogs = new Map();
  catalogs.set(Source.GLADE, catalog);

  return {
    gpu: { selectionRingRenderer: makeRendererSpy() },
    sources: { catalogs },
    subsystems: {
      selection: {
        selected: () => selection,
      },
    },
    debug: { disabledPasses: new Set() },
  } as unknown as EngineState;
}

// ── enabled() ─────────────────────────────────────────────────────

describe('selectionRingPass.enabled', () => {
  it('returns false when renderer is null', () => {
    const state = {
      gpu: { selectionRingRenderer: null },
      subsystems: { selection: { selected: () => null } },
    } as unknown as EngineState;
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns false when nothing is selected', () => {
    const state = makeStateWithSelection(null);
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns true when renderer is non-null and a selection exists', () => {
    const state = makeStateWithSelection({ source: Source.GLADE, localIdx: 0 });
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });
});

// ── draw() ────────────────────────────────────────────────────────

describe('selectionRingPass.draw', () => {
  it('computes ringRadiusPx from catalog data and forwards to renderer', () => {
    const state = makeStateWithSelection({ source: Source.GLADE, localIdx: 0 });
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings({ pointSizePx: 4 }), DEPS_STUB);

    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    expect(rendererSpy.setSelection).toHaveBeenCalledOnce();
    const arg = rendererSpy.setSelection.mock.calls[0]![0]!;
    // worldPos copied straight from catalog.positions[0..3]
    expect(arg.worldPos[0]).toBeCloseTo(0);
    expect(arg.worldPos[1]).toBeCloseTo(0);
    expect(arg.worldPos[2]).toBeCloseTo(100);
    // ringRadiusPx = max(pointSizePx, apparentPxRadius) * 8
    // apparentPxRadius = (60 * 2 / 1000 / 100) * 720 = 0.864
    // pointSizePx (4) wins; * 8 = 32
    expect(arg.ringRadiusPx).toBeCloseTo(32, 5);
  });

  it('uses apparentPxRadius when galaxy is closer and larger on screen', () => {
    const state = makeStateWithSelection({ source: Source.GLADE, localIdx: 0 });
    // Override the catalog position to put galaxy at 10 Mpc so the
    // apparent radius dominates.
    const cat = state.sources.catalogs.get(Source.GLADE)!;
    (cat as unknown as { positions: Float32Array }).positions = new Float32Array([0, 0, 10]);

    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings({ pointSizePx: 4 }), DEPS_STUB);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    const arg = rendererSpy.setSelection.mock.calls[0]![0]!;
    // apparentPxRadius = (60 * 2 / 1000 / 10) * 720 = 8.64
    // pointSizePx = 4; apparent wins; * 8 = 69.12
    expect(arg.ringRadiusPx).toBeCloseTo(69.12, 4);
  });

  it('calls renderer.render() exactly once with viewProj + viewport', () => {
    const state = makeStateWithSelection({ source: Source.GLADE, localIdx: 0 });
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings(), DEPS_STUB);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    expect(rendererSpy.render).toHaveBeenCalledOnce();
    expect(rendererSpy.render.mock.calls[0]![2]).toEqual([1280, 720]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/engine/frame/passes/selectionRingPass.test.ts`
Expected: FAIL with "Cannot find module .../selectionRingPass"

### Task 3.4: Implement the pass

**Files:**
- Create: `src/services/engine/frame/passes/selectionRingPass.ts`

- [ ] **Step 1: Write the pass**

```ts
/**
 * selectionRingPass — per-galaxy selection halo overlay.
 *
 * Lives in `UI_PASSES` (premultiplied-OVER, post-tone-map), placed at
 * the HEAD of the array so marker-lines and labels composite OVER the
 * ring — labels carry information that should stay legible when they
 * overlap the ring's stroke.  See `passes/index.ts` for the full
 * ordering rationale.
 *
 * ## CPU-side ringRadiusPx
 *
 * The renderer is renderer-type-agnostic: its uniform carries a
 * pre-computed `ringRadiusPx`, not a galaxy diameter.  This pass owns
 * the galaxy-specific sizing math:
 *
 *   apparentPxRadius = (max(diameterKpc, 30) * 2 / 1000 / max(camDist, 0.001))
 *                      * pxPerRad
 *   ringRadiusPx    = max(pointSizePx, apparentPxRadius) * 8
 *
 * Mirrors the pre-extraction main-points vertex shader's selection
 * sizing (the 8× halo factor + the apparent-pixel-radius floor) byte-
 * for-byte, so the visible ring size matches what the in-shader
 * version drew at every zoom level.  The `max(diameterKpc, 30)`
 * floor handles the synthetic-fallback source (NaN diameter) and any
 * pre-v4-format galaxy without a measured size.
 *
 * Decoupling the formula from the renderer leaves room for the
 * follow-up POI fold-in: `else if (selectedPoi !== null) { ... }` here
 * picks up the POI's visual radius without touching the renderer or
 * shaders.
 *
 * ## Why one writeBuffer is fine
 *
 * Only one galaxy at most is selected per frame, so we upload 16 bytes
 * of selection state plus 80 bytes of camera state when the pass
 * fires.  The pass is gated `enabled()`-false when nothing is
 * selected, so the upload is paid only on frames where the ring is
 * actually visible — typically a tiny fraction of total frames.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const selectionRingPass: Pass = {
  name: 'selection-ring',

  enabled(state, _ctx, _settings) {
    if (state.gpu.selectionRingRenderer === null) return false;
    return state.subsystems.selection.selected() !== null;
  },

  draw(pass, ctx, state, settings, _deps) {
    // `enabled()` proved both fields are non-null.  The `!` assertions
    // are safe: the pass framework only calls `draw` when `enabled`
    // returned true.
    const sel = state.subsystems.selection.selected()!;
    const catalog = state.sources.catalogs.get(sel.source);
    // Defensive: catalog could be evicted between `enabled()` and
    // `draw()` if a tier swap completes mid-frame.  A no-op is the
    // correct response — the next frame's `enabled()` will see the
    // updated catalog map.
    if (!catalog) return;

    const i = sel.localIdx;
    const worldPos: [number, number, number] = [
      catalog.positions[i * 3 + 0]!,
      catalog.positions[i * 3 + 1]!,
      catalog.positions[i * 3 + 2]!,
    ];

    // Compute the on-screen halo radius — same formula the pre-
    // extraction main-points vertex shader used (lines 154-162 of
    // pre-extraction points/vertex.wesl).
    const diameterKpc = catalog.diameterKpc[i]!;
    const safeDiameterKpc = diameterKpc > 0 ? diameterKpc : 30;
    const dx = worldPos[0] - ctx.drawCamPos[0];
    const dy = worldPos[1] - ctx.drawCamPos[1];
    const dz = worldPos[2] - ctx.drawCamPos[2];
    const camDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const safeDist = Math.max(camDist, 0.001);
    const galaxyRadiusMpc = (safeDiameterKpc * 2) / 1000;
    const apparentPxRadius = (galaxyRadiusMpc / safeDist) * ctx.drawPxPerRad;
    const sizePx = Math.max(settings.pointSizePx, apparentPxRadius);
    const ringRadiusPx = sizePx * 8;

    state.gpu.selectionRingRenderer!.setSelection({ worldPos, ringRadiusPx });
    state.gpu.selectionRingRenderer!.render(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
    );
  },
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/services/engine/frame/passes/selectionRingPass.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/frame/passes/selectionRingPass.ts tests/services/engine/frame/passes/selectionRingPass.test.ts
git commit -m "feat(selection-ring): add selectionRingPass with TDD coverage

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.5: Register the pass at the head of UI_PASSES

**Files:**
- Modify: `src/services/engine/frame/passes/index.ts`

- [ ] **Step 1: Add import + array entry**

Add the import next to the existing `markerLinesPass` import:

```ts
import { selectionRingPass } from './selectionRingPass';
```

Change the `UI_PASSES` constant from:

```ts
export const UI_PASSES: readonly Pass[] = [markerLinesPass, labelsPass];
```

to:

```ts
export const UI_PASSES: readonly Pass[] = [selectionRingPass, markerLinesPass, labelsPass];
```

Update the docblock just above `UI_PASSES` to mention the new pass position (one-line tweak to match the present-tense narration).

Add the re-export at the bottom (matching the pattern of the other passes):

```ts
export { selectionRingPass } from './selectionRingPass';
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: PASS — including any tests that snapshot the pass order or count UI passes.

- [ ] **Step 3: Visual smoke check**

Ask the user to refresh the dev server tab and click a galaxy.  They should see TWO rings briefly: the in-shader ring from the still-present old code (HDR, slightly warmer), and the new white UI ring on top.  This confirms the new pass is firing.  If the user only sees one ring, the new pass isn't reaching the encoder — debug before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/frame/passes/index.ts
git commit -m "feat(selection-ring): register selectionRingPass at head of UI_PASSES

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4: Delete the Old Selection Code from the Points Shader

Now that the new path is provably rendering, delete the in-shader ring and its supporting machinery. Order: io → vertex → fragment, smallest-blast-radius first.

### Task 4.1: Remove the `selected` varying from VSOut

**Files:**
- Modify: `src/services/gpu/shaders/points/io.wesl`

- [ ] **Step 1: Delete the `@location(4) selected: u32` field**

Find the field in the `VSOut` struct (around line 297):

```wesl
  // 1u when this instance is the selected point; 0u otherwise. Used by
  // the visual 'fs' to apply the selection ring/halo.
  @location(4) @interpolate(flat) selected: u32,
```

Delete the entire 3-line block (comment + field declaration).

- [ ] **Step 2: Verify nothing in the file references the deleted field**

Run: `grep -n "selected" src/services/gpu/shaders/points/io.wesl`
Expected: no matches (or matches only inside doc-comment narrative — strip those if found).

### Task 4.2: Remove `isSelected` + `sizeScale` from the vertex shader

**Files:**
- Modify: `src/services/gpu/shaders/points/vertex.wesl`

- [ ] **Step 1: Delete the selection-check block**

Find lines 128-139:

```wesl
  // ── SELECTION CHECK ───────────────────────────────────────────────────────
  //
  // Compare the per-instance packed identity against 'u.selectedPacked'
  // ('0xFFFFFFFFu' when nothing is selected). Each source's identity
  // range is structurally disjoint by construction (top 5 bits = source
  // code), so the comparison is a straight u32 equality.
  let isFallbackFlag = select(0u, 1u, p.axisRatio < 0.0);
  let isSelected = (myPacked == u.selectedPacked);

  // Scale the billboard 8× for the selected point so the selection ring
  // is unmistakable — even a faint, magnitude-22 galaxy gets a visible halo.
  let sizeScale = select(1.0, 8.0, isSelected);
```

Replace with just:

```wesl
  let isFallbackFlag = select(0u, 1u, p.axisRatio < 0.0);
```

- [ ] **Step 2: Remove the `* sizeScale` multiplier on the offset**

Find line 172:

```wesl
  let offset = expandBillboardScreen(u.cam, center, sizePx, corner) * sizeScale;
```

Change to:

```wesl
  let offset = expandBillboardScreen(u.cam, center, sizePx, corner);
```

- [ ] **Step 3: Remove the `out.selected` writes**

Find the early-out block (around lines 112-126) and delete the line `earlyOut.selected = 0u;`.

Find line 253-254:

```wesl
  // Propagate the selection flag for 'fs'.
  out.selected = select(0u, 1u, isSelected);
```

Delete both lines (comment + assignment).

- [ ] **Step 4: Remove the `!isSelected` cull bypass**

Find lines 244-247:

```wesl
  let INVISIBILITY_THRESHOLD = 0.005;
  if (out.intensity < INVISIBILITY_THRESHOLD && !isSelected) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }
```

Change to:

```wesl
  let INVISIBILITY_THRESHOLD = 0.005;
  if (out.intensity < INVISIBILITY_THRESHOLD) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }
```

(The selected galaxy's normal disk is still drawn at full size by the points pass; the new UI ring is what makes the selection visible, so the cull bypass is no longer needed.)

- [ ] **Step 5: Verify no stale references**

Run: `grep -n "isSelected\|sizeScale\|selected" src/services/gpu/shaders/points/vertex.wesl`
Expected: matches only inside the module docblock narrative (acceptable — narrative can stay if it's just historical context).  No live code references.

### Task 4.3: Delete the selection branch from the fragment

**Files:**
- Modify: `src/services/gpu/shaders/points/colorFragment.wesl`

- [ ] **Step 1: Delete lines 92-179 (the entire `if (in.selected == 1u) { ... }` block)**

Find the block starting at the comment `// ── SELECTION RING vs NORMAL DISK ────`  (line 92) and ending at the closing `}` and `discard;` on line 179.  Delete the entire block including:

- The "SELECTION RING vs NORMAL DISK" docblock comment.
- The `if (in.selected == 1u) { ... }` body — inner-disk render, ring annulus, transparent gap, trailing `discard;`.

Leave the lines that come immediately after (`// ── NORMAL POINT — solid disk with Gaussian falloff (now ELLIPTICAL) ──` and below) untouched.

- [ ] **Step 2: Update the docblock at the top**

The current top-of-file comment claims the file handles both the selection branch and normal points.  Trim that — the file now only renders normal points.  One-paragraph edit at the top of the docblock; do not invent unrelated rationale.

- [ ] **Step 3: Verify no stale references**

Run: `grep -n "selected\|HALO_RADIUS_PX\|TARGET_STROKE_PX" src/services/gpu/shaders/points/colorFragment.wesl`
Expected: no matches.

### Task 4.4: Verify the shader still compiles + the full test suite passes

- [ ] **Step 1: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.  Any test that asserted "selection produces a halo on the points pass" will need updating to assert against the new pass instead — refactor in place if you encounter such a test.

- [ ] **Step 2: Search for stale tests against the points selection branch**

Run: `grep -rn "selectedPacked\|isSelected\|sizeScale" tests/services/gpu/ --include="*.test.ts"`
Expected: review each hit.  Tests that exercise the pickRenderer's `SELECTED_PACKED_OFFSET` write are still valid (the slot still exists in the uniform); tests that asserted vertex/fragment-side selection behaviour need updating or deletion.

- [ ] **Step 3: Visual smoke check**

Ask the user to refresh the dev tab and click a galaxy.  Exactly one ring should be visible — the new white UI ring.  The selected galaxy's inner disk should render at its normal apparent size (no 8× scale-then-renormalize artefact).

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/shaders/points/
git commit -m "feat(selection-ring): remove selection branch from main points pipeline

The selection ring is now drawn by the dedicated selectionRingPass; the
points pipeline can drop its 'selected' varying, isSelected math, and
the 90-line selection-ring fragment branch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5: End-to-End Verification

Final integration checks before declaring done. No new code — only verification.

### Task 5.1: Visual regression sweep

- [ ] **Step 1: Selection at three zoom levels**

Ask the user to test, in this order:

1. Zoom OUT until galaxies are sub-pixel dots, click one.  Expected: a small white ring (radius ≈ `pointSizePx * 8` = 32 px at default settings) appears around the dot.
2. Default zoom — pick a famous galaxy (M31, M81, etc.).  Expected: ring scales up modestly above 32 px because `apparentPxRadius` exceeds `pointSizePx`.
3. Zoom IN until the galaxy is a substantial textured disc.  Expected: ring tracks the disc, capped to ~4 px stroke width (the `bandFraction = min(0.15, 4/r)` cap kicks in).

- [ ] **Step 2: Deselect (click empty space)**

Expected: ring disappears completely; no flicker, no residual frame.

- [ ] **Step 3: Selected-galaxy disk parity**

Select a galaxy, then visually compare its INNER DISK colour and brightness to the same galaxy when not selected.  Expected: identical — the points pass no longer applies the 8× scale-then-shrink to selected galaxies, so the disk should look exactly like an unselected one.

### Task 5.2: Picking semantics

- [ ] **Step 1: Re-select the same galaxy**

Click a selected galaxy a second time.  Expected: no behavior change — the click resolves to the same identity, the subsystem dedup short-circuits, the ring stays drawn.

- [ ] **Step 2: Click inside the ring annulus**

Zoom such that the ring is visibly separated from the galaxy disk (a clear gap between the disc and the ring stroke).  Click in the ring's stroke region.  Expected: this does NOT register as a hit on the selected galaxy — the pick texture has nothing under the ring (the ring is post-tone-map UI, written to the swap chain only).  Behaviour is whatever the click resolver does with an empty pick: typically "deselect".

- [ ] **Step 3: Click just outside the ring**

Expected: deselects (empty space).

### Task 5.3: Pass-order sanity

- [ ] **Step 1: Verify label-over-ring composition**

Find a galaxy with a label visible at default zoom (a famous galaxy near the camera).  Select it so the ring appears.  The label should composite ON TOP of the ring where they overlap (because `labelsPass` runs after `selectionRingPass` in `UI_PASSES`).

### Task 5.4: Performance sanity

- [ ] **Step 1: Idle frame cost**

With nothing selected, observe the DebugPanel's `ui-overlay` timing slot.  Expected: near-zero (the `enabled()` gate skips the pass entirely; the UI overlay encoder still opens a possibly-empty render pass per the existing timing-instrumentation behaviour, but no draw happens).

- [ ] **Step 2: Selected frame cost**

Select a galaxy.  Expected: the same `ui-overlay` slot ticks up by a tiny amount — one 6-vertex draw call.  Still in the microseconds.

### Task 5.5: Final commit

If any tests, docs, or stale comments surfaced during verification, fix them in a final follow-up commit.

- [ ] **Step 1: Run the full suite once more**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS across all three.

- [ ] **Step 2: Commit any verification-driven fixes**

If commits were needed during Task 5.x, group them; otherwise this task is a no-op.

---

## Out-of-scope follow-ups (do NOT do in this PR)

These are listed so the implementer doesn't accidentally drift in:

- **POI fold-in.** Adding `else if (selectedPoi)` to `selectionRingPass.draw()` to subsume the POI ring/halo currently in `clusterMarkersPass` — separate PR.
- **Removing `selectedPacked` from `Uniforms`.** The uniform slot at byte offset 80 still exists, but nothing in the simplified shader reads it.  The `pickRenderer.ts` `SELECTED_PACKED_OFFSET = 80` write still happens (and is now a write into an unread slot).  Removing both the field and the pickRenderer write is a clean-up PR; doing it here mixes concerns.
- **Adding an `enabled()` flag for the ring.** The grill explicitly rules out an animation toggle.  Leave the ring static for v1.
