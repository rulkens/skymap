# Cluster Viz (2/4) — At-Rest Halo + Ring Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-line crosshair gizmo for cluster / supercluster / void POIs with a soft additive halo + screen-anti-aliased ring, sized in world-space Mpc from `physicalRadiusMpc`, fading out when the projected ring grows past the viewport. No selection, picking, or focus mode behavior — those land in plans 3 and 4.

**Architecture:** A new `clusterMarkerRenderer` owns one halo pipeline + one ring pipeline, both reading the shared `CameraUniforms` prefix and a per-category `SourceUniforms` so plan 3's pick path can drop in without re-architecting. Per-POI instance data (position, radius, tints, alphas) is packed into a 36-byte vertex buffer; the halo and ring share a single unit-quad vertex/index buffer and re-use the existing billboard helpers from `shaders/lib/billboard.wesl`. The `poiSubsystem` grows a `produceMarkers` method that mirrors `produceLabels`'s fade-band shape but adds a max-apparent-size fade-out so the user can fly inside Virgo without a giant ring filling the view. `makeCrosshairLines` and its sole call site disappear; voids opt out of the halo pass via a per-category style flag.

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker with `?static`), Vitest. Heavy reuse of existing `lib/camera.wesl`, `lib/billboard.wesl`, `lib/sourceUniforms.wesl`.

**Prerequisites (Plan 1 — ASSUMED COMPLETE):** `Source.Cluster = 5`, `Source.Supercluster = 6`, `Source.Void = 7` exist in `src/data/sources.ts` (POI-only codes, deliberately excluded from `ALL_SOURCES`). `PointOfInterest.crosshairSizeMpc` has been renamed to `physicalRadiusMpc` in `src/@types/engine/subsystems/PointOfInterest.d.ts` and at every call site (`wireSlots.ts`, `buildPoisFromFamousMeta.ts`, anywhere else). The `clusterMembership` utility exists. If any of these are missing, STOP and finish plan 1 first — every task here assumes them.

**Followed by:** `2026-05-18-cluster-viz-3-pick-and-focus.md` (pick fragment + camera tween + InfoCard), then `2026-05-18-cluster-viz-4-member-isolation.md` (FocusUniforms + member-vs-non-member alpha + void inversion).

**Spec reference:** `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md` (especially §2, §7.1, §7.2, §8.1).

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass; the dev server smoke-test in Task 18 confirms (a) crosshair lines are gone for cluster/SC/void POIs, (b) Virgo / Coma show a warm-yellow halo + ring, (c) Boötes Void shows a cyan ring with no halo, (d) flying close to a cluster fades the ring out before it fills the screen, (e) famous-galaxy labels are unchanged.

---

## File Structure

### New files (visible-rendering side)

| Path | Responsibility |
|---|---|
| `src/services/gpu/renderers/clusterMarkerRenderer.ts` | Factory `createClusterMarkerRenderer(ctx)`. Owns two render pipelines (halo + ring), one per-POI instance vertex buffer, one shared unit-quad vertex+index buffer, three per-category `SourceUniforms` buffers (cluster=5, supercluster=6, void=7), and the shared `CameraUniforms` UBO. Public surface: `setMarkers(descriptors)`, `render(pass, viewProj, viewportSize)`, `markerCount()`, `destroy()`. |
| `src/services/gpu/shaders/clusterMarker/io.wesl` | Shared struct definitions: `Uniforms { cam: CameraUniforms }` (just the 80-byte prefix; no renderer-specific tail at v1), `VsIn` (per-vertex unit corner + per-instance position/radius/tints/alphas), `VsOut`. Single source of truth imported by halo.wesl and ring.wesl. |
| `src/services/gpu/shaders/clusterMarker/halo.wesl` | Vertex stage: world-space billboard at `position`, half-extent in world Mpc = `physicalRadiusMpc`, expanded screen-aligned via `worldToClip` + a world-radius billboard helper (NOT `expandBillboardScreen`, which is pixel-sized). Fragment: additive radial gradient — `alpha = haloAlpha * smoothstep(1.0, 0.0, length(uv))`, blend `(one, one)`. |
| `src/services/gpu/shaders/clusterMarker/ring.wesl` | Vertex stage: identical billboard setup; the quad's world half-extent is `physicalRadiusMpc * 1.05` so the 1-2 px AA ring at `r == physicalRadiusMpc` fits inside. Fragment: compute `d = length(uv)`, project the world-space ring width to a UV-space band, smoothstep AA across that band, alpha = `ringAlpha` inside the band, 0 outside. Premultiplied-OVER blend. |
| `src/@types/rendering/ClusterMarkerRenderer.d.ts` | Public handle type (`label`, `setMarkers`, `render`, `markerCount`, `destroy`). |
| `src/@types/rendering/ClusterMarkerDescriptor.d.ts` | One per-POI descriptor: `{ category: PoiCategory, worldPos: Vec3, physicalRadiusMpc: number, haloColor: Vec3, ringColor: Vec3, haloAlpha: number, ringAlpha: number }`. |
| `src/services/engine/frame/passes/clusterMarkersPass.ts` | One `Pass` const that draws the marker renderer. Lives in `HDR_PASSES` BEFORE labels (matches `markerLinesPass` precedent — overlays composite under labels). |
| `tests/services/gpu/renderers/clusterMarkerRenderer.test.ts` | CPU-state Vitest mirroring `markerLineRenderer.test.ts`: starts at 0 markers, counts after `setMarkers`, replaces (not appends), caps at `maxMarkers`. |

### Edited files

| Path | Edit |
|---|---|
| `src/services/engine/subsystems/poiSubsystem.ts` | Delete `makeCrosshairLines` + its call site inside `produceLabels`. Add new `produceMarkers(state, ctx) → ClusterMarkerDescriptor[]` method that walks `pois`, respects category visibility, applies the existing min-apparent-size fade-in band AND a new max-apparent-radius fade-out, and emits one descriptor per visible POI (skipping voids' halo via per-category `markerKind`). Update `POI_STYLES` rows to add `haloColor: Vec3 \| null` and `ringColor: Vec3`. The label producer keeps its current behavior except for the deleted crosshair line. Update the `PoiSubsystem` type to include `produceMarkers`. |
| `src/@types/engine/subsystems/PoiSubsystem.d.ts` | Add `produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[];` to the type. |
| `src/services/engine/phases/initGpu.ts` | Construct `state.gpu.clusterMarkerRenderer = createClusterMarkerRenderer(uiCtx)` right after the `markerLineRenderer` construction (same `uiCtx`, same swap-chain format). |
| `src/services/engine/engine.ts` | Add `clusterMarkerRenderer: null` to the initial `state.gpu` object alongside `markerLineRenderer`. Add `state.gpu.clusterMarkerRenderer?.destroy(); state.gpu.clusterMarkerRenderer = null;` to the engine's destroy bag alongside the existing `markerLineRenderer` teardown. |
| `src/@types/engine/state/EngineGpuState.d.ts` | Add `clusterMarkerRenderer: ClusterMarkerRenderer \| null;` field. |
| `src/services/engine/frame/runFrame.ts` | After `state.subsystems.labelDirector.runFrame(state, ctx)` (the existing producer flush), call `const markers = state.subsystems.pois.produceMarkers(state, ctx); state.gpu.clusterMarkerRenderer?.setMarkers(markers);` — same lifecycle position as the label director flush (before GPU dispatch). |
| `src/services/engine/frame/passes/index.ts` | Import `clusterMarkersPass` and append it to `HDR_PASSES` after `volumeUpsamplePass` (markers are additive HDR content). |
| `tests/services/engine/subsystems/poiSubsystem.test.ts` (extend or create) | Snapshot/structural tests: `produceMarkers` returns one descriptor per visible POI; voids have `haloAlpha === 0` (or `markerKind: 'ringOnly'`); famous-galaxy POIs return zero markers (label-only category); `makeCrosshairLines` is gone (assert by absence — call `produceLabels` and check `lines.length === 0` for a cluster-only POI set with no `labelAnchorOffsetMpc`). |

### Files explicitly untouched in this plan

- `src/services/gpu/shaders/points/vertex.wesl` — plan 4 owns the `FocusUniforms` edit.
- `src/services/gpu/renderers/pickRenderer.ts` — plan 3 owns ring pickability.
- `src/data/sources.ts` — plan 1 already added the three POI source codes.
- `src/data/clusterAnchors.ts` — plan 1 already renamed `crosshairSizeMpc` → `physicalRadiusMpc`.
- `src/components/InfoCard/*` — plan 3 owns POI-flavoured InfoCard content.

---

## WESL Conventions Reminder (BEFORE WRITING SHADER CODE)

The new `.wesl` files in this plan are subject to the conventions already established in `points/io.wesl` + `points/vertex.wesl`. Read those files once before Task 4. Specifically:

- **`?static` imports.** Use `import code from './foo.wesl?static';` on the TS side. The wesl-plugin Vite linker runs at build time and hands a fully-resolved WGSL string to `device.createShaderModule({ code })`. Never use `?raw` — extracting shared lib modules (`camera.wesl`, `billboard.wesl`, `sourceUniforms.wesl`) requires the linker.
- **Literal `package::` prefix on WESL `import`.** Always `import package::clusterMarker::io::VsOut` and `import package::lib::camera::worldToClip`. Never relative paths inside a `.wesl` file — the linker resolves only the literal `package::` prefix.
- **Bindings are module-local — re-declare in each consuming file.** `@group(N) @binding(M)` cannot be exported across modules. `io.wesl` exports the struct types; `halo.wesl` and `ring.wesl` each redeclare `@group(0) @binding(0) var<uniform> u: Uniforms;` and `@group(2) @binding(0) var<uniform> source: SourceUniforms;` using the imported struct types so byte layout is structurally locked in. Don't put `@group/@binding` lines inside `io.wesl`.
- **One module per pipeline, never share `GPUShaderModule` instances across pipelines.** Each pipeline (halo, ring, future ringPick) builds its OWN module from the same source via `device.createShaderModule({ code })`. WebGPU's `layout: 'auto'` derives a per-pipeline layout identity that doesn't survive cross-pipeline sharing — and we want explicit pipeline layouts anyway (next bullet).
- **Explicit `device.createPipelineLayout(...)`, not `layout: 'auto'`.** The MEMORY note `feedback_webgpu_auto_layout_trap.md` records the bite. The halo and ring pipelines share `CameraUniforms` (`@group(0)`) and `SourceUniforms` (`@group(2)`) buffers, so they must use an explicit shared bind-group-layout pair so a single `device.createBindGroup(...)` is valid against both pipeline layouts.
- **CameraUniforms prefix (80 bytes).** `viewProj` (64) + `viewportPx` (8) + two reserved f32 pads (8) — matches `lib/camera.wesl::CameraUniforms`. Reuse it for `Uniforms`; do NOT invent a new camera layout.
- **`@group(2)` SourceUniforms layout (16 bytes).** `sourceCode: u32 + 12 bytes pad`, matching `lib/sourceUniforms.wesl`. The per-category 5/6/7 source code is the value plan 3's pick fragment will read; carry it through now so plan 3 doesn't reshape the bind groups.
- **Add a parity test if a struct layout matters.** For halo/ring at v1, the only TS-side write that crosses into a WESL struct is the `CameraUniforms` 80-byte prefix (already validated by every other renderer's test). The per-instance vertex buffer attributes go through the typed `GPUVertexAttribute` table; the runtime pipeline validation catches drift. No extra parity test needed for v1.

---

## Task Outline

Phase A — Renderer scaffolding (Tasks 1-3): empty renderer factory + types + null-device CPU test.

Phase B — Shaders (Tasks 4-7): io.wesl, halo.wesl, ring.wesl, then the pipelines.

Phase C — poiSubsystem rework (Tasks 8-12): delete crosshair, add produceMarkers, fade math, descriptor production.

Phase D — Wire-up (Tasks 13-17): state, init, frame, pass.

Phase E — Verification (Task 18).

---

## Phase A — Renderer scaffolding

### Task 1: ClusterMarkerDescriptor type

**Files:**
- Create: `src/@types/rendering/ClusterMarkerDescriptor.d.ts`

- [ ] **Step 1: Write the type definition**

```ts
/**
 * One per-POI marker descriptor produced by `poiSubsystem.produceMarkers`
 * and consumed by `clusterMarkerRenderer.setMarkers`.
 *
 * Why a separate descriptor type instead of reusing `PointOfInterest`?
 * Separation of concerns: a descriptor carries only what the renderer
 * needs to draw one marker (already-evaluated tints, already-faded
 * alphas), so the renderer never has to know about category styles or
 * apparent-size math.  The subsystem boundary keeps `produceMarkers`
 * the single owner of every per-frame, per-POI computation.
 */

import type { Vec3 } from '../math/Vec3';
import type { PoiCategory } from '../../services/engine/subsystems/poiSubsystem';

export type ClusterMarkerDescriptor = {
  /** Category — drives which draw bucket this descriptor lands in (per-category source-code uniform). */
  readonly category: PoiCategory;
  /** World-space centre. */
  readonly worldPos: Vec3;
  /** Ring radius AND halo half-extent in Mpc. */
  readonly physicalRadiusMpc: number;
  /** RGB tint for the halo (premultiplied alpha applied via haloAlpha). */
  readonly haloColor: Vec3;
  /** RGB tint for the ring. */
  readonly ringColor: Vec3;
  /** [0..1] halo alpha after fade math.  0 → halo pass should skip this descriptor entirely (voids, fully-faded). */
  readonly haloAlpha: number;
  /** [0..1] ring alpha after fade math.  0 → ring also skipped. */
  readonly ringAlpha: number;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/@types/rendering/ClusterMarkerDescriptor.d.ts
git commit -m "feat(cluster-viz): add ClusterMarkerDescriptor type"
```

### Task 2: ClusterMarkerRenderer public handle type

**Files:**
- Create: `src/@types/rendering/ClusterMarkerRenderer.d.ts`

- [ ] **Step 1: Write the type**

```ts
/**
 * Public handle returned by `createClusterMarkerRenderer`.  Mirrors
 * `MarkerLineRenderer`'s shape: typed methods, no internals leaked.
 *
 * One renderer draws halos + rings for ALL POI categories.  Per-category
 * source-code differentiation happens inside the renderer (three
 * pre-built per-source bind groups) so plan 3's pick path inherits the
 * correct (sourceCode << 27) | poiIndex packing without further
 * scaffolding.
 */

import type { ClusterMarkerDescriptor } from './ClusterMarkerDescriptor';

export type ClusterMarkerRenderer = {
  /** Human-readable identifier. */
  readonly label: string;
  /**
   * Replace the current marker set.  Calling `setMarkers([])` clears all markers.
   * The descriptors are partitioned internally by `category` so the renderer
   * can issue one draw per category (halo) and one per category (ring),
   * each bound to that category's SourceUniforms.
   *
   * Designed to be called by `runFrame.ts` once per frame from the
   * output of `state.subsystems.pois.produceMarkers(state, ctx)`.
   */
  setMarkers(descriptors: readonly ClusterMarkerDescriptor[]): void;
  /** Issue the draws inside an in-flight render pass against the HDR target. */
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void;
  /** Number of markers last passed to setMarkers.  Used by the pass `enabled()` check. */
  markerCount(): number;
  /** Release all GPU resources.  No-op if constructed with a null device. */
  destroy(): void;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/@types/rendering/ClusterMarkerRenderer.d.ts
git commit -m "feat(cluster-viz): add ClusterMarkerRenderer handle type"
```

### Task 3: Renderer factory skeleton + null-device CPU test

**Files:**
- Create: `src/services/gpu/renderers/clusterMarkerRenderer.ts`
- Create: `tests/services/gpu/renderers/clusterMarkerRenderer.test.ts`

- [ ] **Step 1: Write the failing test first**

```ts
// tests/services/gpu/renderers/clusterMarkerRenderer.test.ts
import { describe, it, expect } from 'vitest';
import { createClusterMarkerRenderer } from '../../../../src/services/gpu/renderers/clusterMarkerRenderer';
import type { ClusterMarkerDescriptor } from '../../../../src/@types/rendering/ClusterMarkerDescriptor';

// Null-device pattern, mirrors markerLineRenderer.test.ts.
const newRenderer = (maxMarkers?: number) => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  return createClusterMarkerRenderer(ctx, maxMarkers);
};

const cluster = (id: number): ClusterMarkerDescriptor => ({
  category: 'cluster',
  worldPos: [id, 0, 0],
  physicalRadiusMpc: 2,
  haloColor: [1, 0.85, 0.4],
  ringColor: [1, 0.85, 0.4],
  haloAlpha: 1,
  ringAlpha: 1,
});

describe('ClusterMarkerRenderer (CPU state)', () => {
  it('starts with zero markers', () => {
    const r = newRenderer();
    expect(r.markerCount()).toBe(0);
  });

  it('counts markers after setMarkers', () => {
    const r = newRenderer();
    r.setMarkers([cluster(1), cluster(2), cluster(3)]);
    expect(r.markerCount()).toBe(3);
  });

  it('replaces (not appends) on subsequent setMarkers', () => {
    const r = newRenderer();
    r.setMarkers([cluster(1)]);
    r.setMarkers([cluster(2), cluster(3)]);
    expect(r.markerCount()).toBe(2);
  });

  it('caps at maxMarkers', () => {
    const r = newRenderer(2);
    r.setMarkers([cluster(1), cluster(2), cluster(3)]);
    expect(r.markerCount()).toBe(2);
  });

  it('label is stable', () => {
    const r = newRenderer();
    expect(r.label).toBe('clusterMarkerRenderer');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/services/gpu/renderers/clusterMarkerRenderer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal renderer factory (CPU state only — GPU code lands in Task 7)**

```ts
// src/services/gpu/renderers/clusterMarkerRenderer.ts
/**
 * clusterMarkerRenderer — instanced halo + ring overlay for cluster /
 * supercluster / void POIs.
 *
 * ### Why one renderer for two pipelines?
 *
 * Halos and rings share the same per-POI instance data (position,
 * radius, tints, alphas) and the same camera uniform; only the
 * fragment math differs (additive radial gradient vs. screen-AA ring).
 * One renderer that owns both pipelines + one shared instance vertex
 * buffer lets `setMarkers` upload once per frame and dispatch two
 * draws — versus two factory call sites maintaining two parallel
 * instance buffers.
 *
 * ### Why one draw per category (cluster / supercluster / void)?
 *
 * The marker renderer pre-architects for plan 3's pick fragment.
 * Plan 3 will add a `ringPick.wesl` whose fragment composes
 * `(source.sourceCode << 27) | poiIndex + PICK_SENTINEL_OFFSET` from
 * a per-source uniform — identical to `pointRenderer`'s per-survey
 * uniform pattern.  Issuing one draw per category here (with the
 * per-category SourceUniforms bound at `@group(2)`) means plan 3
 * adds the pick pipeline without re-shaping how descriptors are
 * batched.
 *
 * Voids skip the halo draw entirely (per the spec — a halo would
 * imply matter where the structure is defined by absence).  The
 * descriptor's `haloAlpha === 0` is the gate; descriptors flow into
 * the partition but the halo draw for the void bucket is skipped.
 *
 * ### CPU-only mode
 *
 * Constructed with a null device for unit tests.  GPU resource
 * allocation is guarded by `if (device)` so `setMarkers` packs the
 * CPU scratch buffer + bumps the counter without touching the GPU.
 * Mirrors `markerLineRenderer.ts`'s null-device pattern.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { ClusterMarkerRenderer } from '../../../@types/rendering/ClusterMarkerRenderer';
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';

/**
 * 9 floats per instance × 4 bytes = 36 bytes/instance.
 *
 * Layout (matches VsIn in clusterMarker/io.wesl):
 *   [0..2]  position.xyz       — world-space centre
 *   [3]     physicalRadiusMpc  — world-space half-extent
 *   [4..6]  haloColor.rgb      — additive halo tint
 *   [7]     haloAlpha          — premultiplied later
 *   [8]     ringAlpha          — premultiplied later
 *
 * Ring color piggybacks on halo color via a per-pipeline uniform
 * override at draw time (the spec lets ring + halo share the warm
 * tint per category; only the void diverges and voids skip halo).
 * If a future category needs distinct halo/ring tints we'd grow the
 * stride to 12 floats (48 bytes) and add `ringColor.rgb`.
 */
const MARKER_INSTANCE_FLOATS = 9;
const MARKER_INSTANCE_BYTES = MARKER_INSTANCE_FLOATS * 4;

export function createClusterMarkerRenderer(
  ctx: GpuContext,
  maxMarkers = 64,
): ClusterMarkerRenderer {
  // CPU scratch buffer — always allocated, safe with null device.
  const instanceBuf = new Float32Array(maxMarkers * MARKER_INSTANCE_FLOATS);
  let currentMarkerCount = 0;

  // Phase A — CPU state only.  GPU resources land in Task 7.
  // const device = ctx.device as GPUDevice | null;

  function setMarkers(descriptors: readonly ClusterMarkerDescriptor[]): void {
    currentMarkerCount = 0;
    const count = Math.min(descriptors.length, maxMarkers);
    for (let i = 0; i < count; i++) {
      const d = descriptors[i]!;
      const base = i * MARKER_INSTANCE_FLOATS;
      instanceBuf[base + 0] = d.worldPos[0];
      instanceBuf[base + 1] = d.worldPos[1];
      instanceBuf[base + 2] = d.worldPos[2];
      instanceBuf[base + 3] = d.physicalRadiusMpc;
      instanceBuf[base + 4] = d.haloColor[0];
      instanceBuf[base + 5] = d.haloColor[1];
      instanceBuf[base + 6] = d.haloColor[2];
      instanceBuf[base + 7] = d.haloAlpha;
      instanceBuf[base + 8] = d.ringAlpha;
      currentMarkerCount++;
    }
    // GPU upload lands in Task 7.
  }

  function render(
    _pass: GPURenderPassEncoder,
    _viewProj: Float32Array,
    _viewportSize: [number, number],
  ): void {
    // GPU draw lands in Task 7.
  }

  function markerCount(): number {
    return currentMarkerCount;
  }

  function destroy(): void {
    // GPU teardown lands in Task 7.
  }

  const renderer: ClusterMarkerRenderer = {
    label: 'clusterMarkerRenderer',
    setMarkers,
    render,
    markerCount,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
```

- [ ] **Step 4: Run the test — should pass now**

```bash
npx vitest run tests/services/gpu/renderers/clusterMarkerRenderer.test.ts
```

Expected: PASS — 5/5 tests.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS — the new types resolve through the existing `Renderer` contract.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/renderers/clusterMarkerRenderer.ts \
        tests/services/gpu/renderers/clusterMarkerRenderer.test.ts
git commit -m "feat(cluster-viz): scaffold clusterMarkerRenderer (CPU state)"
```

---

## Phase B — Shaders

### Task 4: clusterMarker/io.wesl — shared struct definitions

**Files:**
- Create: `src/services/gpu/shaders/clusterMarker/io.wesl`

- [ ] **Step 1: Write the io module**

```wgsl
// clusterMarker/io.wesl — shared struct definitions for the halo + ring pipelines.
//
// Both pipelines (halo, ring) read the same CameraUniforms prefix and
// the same per-category SourceUniforms.  Co-locating the structs here
// (and re-importing them into halo.wesl + ring.wesl) means a layout
// edit (e.g. adding a uniform field) lands in one place and propagates
// to both consumers.
//
// ## Why no @group/@binding declarations here
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> u'
// is module-local and cannot be exported across modules.  The
// consuming files (halo.wesl, ring.wesl) each redeclare the bindings
// using the structs imported from this file.  WGSL accepts the same
// @group/@binding pair across multiple compiled modules so long as the
// layout is identical; importing one authoritative struct definition
// makes drift structurally impossible.
//
// ## Uniforms layout — CameraUniforms-prefix only at v1
//
// The 80-byte CameraUniforms prefix carries viewProj + viewportPx +
// two pads.  No renderer-specific tail at v1.  The CPU-side write site
// in clusterMarkerRenderer.ts allocates 80 bytes and writes the same
// shape as markerLineRenderer.ts.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  cam: CameraUniforms,
};

// Per-vertex attribute (the unit-quad corner, broadcast across instances).
//
// quadCorner from lib/billboard.wesl maps @builtin(vertex_index) 0..5
// directly to the four corners (with two diagonal repeats).  We don't
// need a per-vertex attribute at all — the vertex stage calls
// quadCorner(vi) inline.  This struct only carries per-instance data.

struct VsIn {
  // shaderLocation 0: world-space centre (xyz) + physicalRadiusMpc (w).
  // Packing them in one vec4 saves a vertex-attribute slot.
  @location(0) positionAndRadius: vec4<f32>,
  // shaderLocation 1: halo RGB (xyz) + haloAlpha (w).
  @location(1) haloColorAndAlpha: vec4<f32>,
  // shaderLocation 2: ringAlpha alone.  At v1 ring colour comes from
  // halo colour (per-category — see the renderer); a future split adds
  // ringColor.rgb to the trailing slots of haloColorAndAlpha or a new
  // @location(3).
  @location(2) ringAlpha: f32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  // UV is the unit-quad corner in [-1, +1]², used by both fragments
  // to compute distance from the billboard centre.
  @location(0) uv: vec2<f32>,
  // The tint chosen at the vertex stage (halo: haloColor; ring: ringColor).
  @location(1) color: vec3<f32>,
  // Pre-applied alpha (haloAlpha for the halo pipeline, ringAlpha for
  // the ring).  The vertex stage selects which one.
  @location(2) alpha: f32,
  // For the ring fragment: the world-space ring radius in Mpc and the
  // distance from camera to billboard centre — together these let the
  // fragment compute the screen-space ring width without a separate
  // uniform.  Halo fragment ignores these.
  @location(3) radiusMpc: f32,
  @location(4) camDistMpc: f32,
};
```

- [ ] **Step 2: No test yet — WESL parser doesn't run until a pipeline tries to compile.**

Verification deferred to Task 7 (the first pipeline creation).

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/clusterMarker/io.wesl
git commit -m "feat(cluster-viz): clusterMarker io.wesl struct definitions"
```

### Task 5: clusterMarker/halo.wesl — additive radial-gradient billboard

**Files:**
- Create: `src/services/gpu/shaders/clusterMarker/halo.wesl`

- [ ] **Step 1: Write the shader**

```wgsl
// clusterMarker/halo.wesl — additive radial-gradient billboard for
// cluster / supercluster halos.
//
// One instance per POI.  The vertex stage projects the POI's
// world-space centre to clip space, then expands a unit quad whose
// world-space half-extent equals physicalRadiusMpc.  The fragment
// stage emits an additive radial-gradient: centre alpha full, edge
// alpha zero, smoothstep falloff across the quad.
//
// ## Why world-space-sized billboard (not screen-pixel-sized)
//
// expandBillboardScreen in lib/billboard.wesl is for billboards that
// stay the same pixel size regardless of camera distance (the
// "star" appearance for points).  Halos and rings here need the
// opposite — they should grow as the camera approaches, so the user
// reads "this cluster is X Mpc across" from the on-screen scale.
//
// World-space expansion: the corner's clip-space offset is
//   corner * radiusMpc * (some basis derived from viewProj).
// We derive the basis by projecting (centre + camera_right * r) and
// (centre + camera_up * r) — but we have no camera_right / camera_up
// in CameraUniforms (see lib/camera.wesl module header for why).  The
// dodge: project the centre to clip, then compute the clip-space
// delta for a 1-Mpc-radius sphere by projecting (centre + (1,0,0))
// and (centre + (0,1,0)) and taking the magnitudes — but those are
// world-axis-aligned, not camera-aligned, so the resulting quad would
// shear.
//
// Cleaner: build a true screen-aligned, world-sized billboard by
// projecting centre once, computing 'sizeClip' = radius / camDist *
// (cot(fovY/2)) for the Y direction (and aspect-correcting for X),
// then multiplying the unit-corner by sizeClip * centerClip.w to
// land the right pixel size for the given world radius.  But we
// don't have fovY in the uniform either.
//
// Simpler still: do the screen-space expansion in pixels, but COMPUTE
// the pixel size from the world radius + camera distance using the
// 'u.cam.viewportPx' we already have:
//
//   pxPerRad = u.cam.viewportPx.y / (2 * tan(fovY/2))     (already
//                                                          baked into
//                                                          viewportPx
//                                                          / 2 / tan)
//
// We don't have fovY, but the GPU has the proj matrix.  The
// projection matrix's [1][1] element IS '1 / tan(fovY/2)' for a
// standard perspective projection (gl-matrix's mat4.perspective writes
// it there).  So 'pxPerRad = u.cam.viewportPx.y * 0.5 * u.cam.viewProj[1][1]'.
// But viewProj = proj * view, so [1][1] there is proj[1][1] *
// view[1][1] which isn't a clean recovery.
//
// PRAGMATIC APPROACH (v1):
//
// Pass the world radius through to the fragment.  Compute the
// pixel-space billboard half-size by projecting two world points:
// centre, and (centre + radiusMpc * camera_right_estimate).  Use the
// inverse-viewProj to derive a camera-right basis from the +X column
// of inverse(viewProj) — but inverse isn't available in WGSL either.
//
// SIMPLEST CORRECT APPROACH: derive camera_right and camera_up by
// inverting the rotation in viewProj on the CPU side and passing them
// as additional CameraUniforms fields.
//
// But that grows the shared CameraUniforms struct — a cross-cutting
// change that touches every renderer's UBO write.
//
// FOR v1 we use a self-contained approximation:
//
//   1. Project centre → centerClip.
//   2. Project (centre + worldRight * radiusMpc) and
//      (centre + worldUp * radiusMpc) where worldRight = (1, 0, 0) and
//      worldUp = (0, 1, 0) — i.e. fixed world axes.
//   3. The billboard's clip-space half-extent in X is
//      max(|deltaX_right|, |deltaX_up|), and similarly for Y.
//
// This isn't camera-aligned (the halo can shear as the user orbits)
// but it does scale correctly with camera distance + world radius and
// stays bounded.  At cluster scales (~2 Mpc) the shear is a few
// percent of the halo radius and reads as soft anyway because of the
// radial gradient.
//
// **DEFERRED:** A follow-up may pass camera_right + camera_up as
// extra CameraUniforms fields and replace this with a clean
// view-aligned basis.  Flagged in §11 of the spec.

import package::clusterMarker::io::Uniforms;
import package::clusterMarker::io::VsIn;
import package::clusterMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  // Project the centre.
  let centerClip = worldToClip(u.cam, worldPos);

  // Project two world-axis-offset points to derive an approximate
  // world-sized billboard basis.  See the module header for the
  // limitation (axis-aligned vs camera-aligned).
  let rightClip = worldToClip(u.cam, worldPos + vec3<f32>(radiusMpc, 0.0, 0.0));
  let upClip    = worldToClip(u.cam, worldPos + vec3<f32>(0.0, radiusMpc, 0.0));

  // Perspective-divide each into NDC, then take the per-axis maximum
  // magnitude.  This widens the billboard to whichever world-axis is
  // most extended on screen — guarantees the visible halo is at least
  // radiusMpc across in every direction, at the cost of being a bit
  // wider when both axes contribute.
  let centerNdc = centerClip.xy / centerClip.w;
  let rightNdc  = rightClip.xy  / rightClip.w;
  let upNdc     = upClip.xy     / upClip.w;
  let halfX = max(abs(rightNdc.x - centerNdc.x), abs(upNdc.x - centerNdc.x));
  let halfY = max(abs(rightNdc.y - centerNdc.y), abs(upNdc.y - centerNdc.y));

  // Get the unit-corner in [-1, +1]².
  let corner = quadCorner(vi);

  // NDC offset for this corner.
  let offsetNdc = vec2<f32>(corner.x * halfX, corner.y * halfY);

  // Restore clip-space (multiply by centerClip.w so perspective-divide
  // recovers the offset NDC).
  var out: VsOut;
  out.pos = vec4<f32>(
    centerClip.xy + offsetNdc * centerClip.w,
    centerClip.zw,
  );
  out.uv = corner;
  out.color = input.haloColorAndAlpha.xyz;
  out.alpha = input.haloColorAndAlpha.w;
  out.radiusMpc = radiusMpc;
  // camDistMpc unused by halo; just pass through 0.  Ring fragment
  // computes its own distance because halo and ring share the VsOut
  // struct.
  out.camDistMpc = 0.0;
  return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  // Radial gradient: centre alpha full, edge zero.
  // length(input.uv) is 0 at centre, ~1.414 at corner; we clamp to 1.0
  // so the diagonal corner of the quad still gets faded to zero
  // smoothly.
  let r = length(input.uv);
  let g = 1.0 - smoothstep(0.0, 1.0, r);
  // Premultiplied alpha output for additive blend.  The pipeline's
  // blend state is (one, one) so we don't need the destination factor
  // to read alpha; emitting color * (g * input.alpha) and alpha = 0 (or
  // 1, doesn't matter for additive) both work.  We emit alpha = g *
  // input.alpha so a future blend-state change (e.g. additive-with-
  // alpha-cap) sees a coherent vec4.
  let a = g * input.alpha;
  return vec4<f32>(input.color * a, a);
}
```

- [ ] **Step 2: No test until Task 7 compiles the pipeline.**

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/clusterMarker/halo.wesl
git commit -m "feat(cluster-viz): clusterMarker halo.wesl additive radial gradient"
```

### Task 6: clusterMarker/ring.wesl — screen-AA ring at world radius

**Files:**
- Create: `src/services/gpu/shaders/clusterMarker/ring.wesl`

- [ ] **Step 1: Write the shader**

```wgsl
// clusterMarker/ring.wesl — screen-anti-aliased ring at world radius.
//
// One instance per POI.  Vertex stage: identical to halo.wesl's
// world-sized billboard expansion (same axis-aligned basis dodge —
// see that file's module header).  The quad's half-extent is the same
// radiusMpc so the ring (drawn at exactly 'uv == 1.0' in the
// fragment, i.e. the unit circle on the quad) lands at world radius
// 'radiusMpc' from the centre.
//
// Fragment: compute the distance from the billboard centre in UV
// space.  At |uv| == 1 we're exactly at the world-space radiusMpc
// from centre (because the quad's half-extent IS radiusMpc).  Emit a
// 1-2 px-wide AA band centred on |uv| == 1, alpha = ringAlpha inside
// the band, smoothstep AA on each edge.
//
// ### Computing the band width in UV space
//
// The visible ring should be ~1-2 px wide regardless of how big the
// halo is on screen.  Convert pixel width → UV width:
//
//   ringPxWidth (constant, e.g. 1.5)
//   halfQuadPx  = halfNdcExtent * viewportPx.y * 0.5   (per axis)
//   uvWidth     = ringPxWidth / halfQuadPx             (so 1 UV unit
//                                                       maps to one
//                                                       half-extent
//                                                       of the quad)
//
// We approximate halfQuadPx using a single axis (Y) — close enough
// because the quad is roughly square in screen space at typical
// orientations, and the AA band is symmetric anyway.

import package::clusterMarker::io::Uniforms;
import package::clusterMarker::io::VsIn;
import package::clusterMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;

@group(0) @binding(0) var<uniform> u: Uniforms;

// Ring width in CSS pixels (full visible band, halved for the AA
// smoothstep on each side).
const RING_PX_WIDTH: f32 = 1.5;
// AA falloff width, in CSS pixels.
const RING_AA_WIDTH: f32 = 1.0;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  // Same world-sized billboard expansion as halo.wesl.
  let centerClip = worldToClip(u.cam, worldPos);
  let rightClip = worldToClip(u.cam, worldPos + vec3<f32>(radiusMpc, 0.0, 0.0));
  let upClip    = worldToClip(u.cam, worldPos + vec3<f32>(0.0, radiusMpc, 0.0));
  let centerNdc = centerClip.xy / centerClip.w;
  let rightNdc  = rightClip.xy  / rightClip.w;
  let upNdc     = upClip.xy     / upClip.w;
  let halfX = max(abs(rightNdc.x - centerNdc.x), abs(upNdc.x - centerNdc.x));
  let halfY = max(abs(rightNdc.y - centerNdc.y), abs(upNdc.y - centerNdc.y));

  let corner = quadCorner(vi);
  let offsetNdc = vec2<f32>(corner.x * halfX, corner.y * halfY);

  var out: VsOut;
  out.pos = vec4<f32>(
    centerClip.xy + offsetNdc * centerClip.w,
    centerClip.zw,
  );
  out.uv = corner;
  // For the ring we use the same colour slot as the halo (see io.wesl
  // module header — voids skip the halo draw entirely, and clusters /
  // SCs use the same warm tint for both passes; ringColor split is a
  // follow-up).
  out.color = input.haloColorAndAlpha.xyz;
  out.alpha = input.ringAlpha;
  out.radiusMpc = radiusMpc;
  // Pass halfY through camDistMpc — repurposing the slot as the
  // per-instance NDC half-extent the fragment needs to convert
  // pixels → UV.  Cheaper than adding another VsOut slot for one
  // scalar.  We rename when we add a second use.
  out.camDistMpc = halfY;
  return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let d = length(input.uv);

  // halfY (smuggled in camDistMpc) is the quad's NDC half-extent in Y.
  // Convert to pixels: halfPx = halfY * viewportPx.y * 0.5.
  let halfPx = input.camDistMpc * u.cam.viewportPx.y * 0.5;
  // UV per pixel = 1.0 / halfPx (1 uv unit spans halfPx pixels).
  let uvPerPx = 1.0 / max(halfPx, 1.0);
  let bandHalfUv = RING_PX_WIDTH * 0.5 * uvPerPx;
  let aaUv = RING_AA_WIDTH * uvPerPx;

  // Distance from the |uv| == 1 ring centre line.
  let distFromRing = abs(d - 1.0);

  // 1.0 inside the band, smoothly to 0 at (band edge + AA width).
  let bandInner = bandHalfUv;
  let bandOuter = bandHalfUv + aaUv;
  let bandAlpha = 1.0 - smoothstep(bandInner, bandOuter, distFromRing);

  let a = bandAlpha * input.alpha;
  // Premultiplied alpha — pipeline blend state is OVER:
  //   (src.color * 1, dst.color * (1 - src.alpha)).
  return vec4<f32>(input.color * a, a);
}
```

- [ ] **Step 2: No test until Task 7.**

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/clusterMarker/ring.wesl
git commit -m "feat(cluster-viz): clusterMarker ring.wesl screen-AA ring"
```

### Task 7: Wire shaders into clusterMarkerRenderer — GPU resources + pipelines + render

**Files:**
- Modify: `src/services/gpu/renderers/clusterMarkerRenderer.ts`

This task fills in the GPU side of the renderer scaffolded in Task 3. The existing CPU-state test must continue to pass — null device must still work end-to-end.

- [ ] **Step 1: Replace the renderer with the full GPU implementation**

Open `src/services/gpu/renderers/clusterMarkerRenderer.ts` and replace the body with:

```ts
/**
 * clusterMarkerRenderer — instanced halo + ring overlay for cluster /
 * supercluster / void POIs.
 *
 * (Module header from Task 3 stays in place; below adds the GPU
 *  implementation that backed the CPU-state stub.)
 *
 * ### Pipeline shape
 *
 * Two pipelines built from one module each (never share GPUShaderModule
 * across pipelines — WebGPU layout: 'auto' bites otherwise; see the
 * MEMORY note `feedback_webgpu_auto_layout_trap.md`):
 *
 *   - Halo:  additive blend (one, one), vertex 'vs' + fragment 'fs'
 *            from halo.wesl
 *   - Ring:  premultiplied-OVER blend, vertex 'vs' + fragment 'fs'
 *            from ring.wesl
 *
 * Both pipelines share an EXPLICIT pipeline layout — not 'auto' —
 * built from one CameraUniforms BGL (`@group(0)`) and one
 * SourceUniforms BGL (`@group(2)`).  An explicit shared layout means
 * one `device.createBindGroup(...)` is valid against both pipelines
 * (which `layout: 'auto'` does NOT guarantee).
 *
 * ### Per-category source uniforms (pre-architects pick path)
 *
 * Three pre-built SourceUniforms buffers (one each for cluster=5,
 * supercluster=6, void=7).  The `render` method partitions descriptors
 * by category, binds the matching SourceUniforms, and issues one
 * instanced draw per non-empty bucket.  Plan 3's pick pipeline will
 * reuse this same per-category dispatch — its ringPick fragment reads
 * `source.sourceCode` to compose `(sourceCode << 27) | poiIndex + 1`.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { ClusterMarkerRenderer } from '../../../@types/rendering/ClusterMarkerRenderer';
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';
import type { PoiCategory } from '../../engine/subsystems/poiSubsystem';
import { Source } from '../../../data/sources';
import haloVsCode from '../shaders/clusterMarker/halo.wesl?static';
import haloFsCode from '../shaders/clusterMarker/halo.wesl?static';
import ringVsCode from '../shaders/clusterMarker/ring.wesl?static';
import ringFsCode from '../shaders/clusterMarker/ring.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/** Layout constant — see Task 3 docblock. */
const MARKER_INSTANCE_FLOATS = 9;
const MARKER_INSTANCE_BYTES = MARKER_INSTANCE_FLOATS * 4;

/** Shared CameraUniforms prefix size — same 80 bytes as markerLineRenderer. */
const UNIFORM_BYTES = 80;

/** SourceUniforms = u32 sourceCode + 12 bytes pad = 16 bytes. */
const SOURCE_UNIFORM_BYTES = 16;

/** Maps each pick-able POI category to its 5-bit source code (allocated by plan 1). */
const SOURCE_CODE_BY_CATEGORY: Readonly<Record<'cluster' | 'supercluster' | 'void', number>> = {
  cluster: Source.Cluster,
  supercluster: Source.Supercluster,
  void: Source.Void,
};

const POI_CATEGORIES_WITH_MARKERS: readonly ('cluster' | 'supercluster' | 'void')[] = [
  'cluster',
  'supercluster',
  'void',
];

export function createClusterMarkerRenderer(
  ctx: GpuContext,
  maxMarkers = 64,
): ClusterMarkerRenderer {
  const device = ctx.device as GPUDevice | null;
  const format = ctx.format;

  // CPU scratch buffer — always allocated.
  const instanceBuf = new Float32Array(maxMarkers * MARKER_INSTANCE_FLOATS);
  let currentMarkerCount = 0;

  // Per-category bucket bookkeeping: where each category's run begins
  // in the instance buffer + how many descriptors it owns.  Reset at
  // the start of every setMarkers call.
  const bucketOffsets: Record<'cluster' | 'supercluster' | 'void', number> = {
    cluster: 0,
    supercluster: 0,
    void: 0,
  };
  const bucketCounts: Record<'cluster' | 'supercluster' | 'void', number> = {
    cluster: 0,
    supercluster: 0,
    void: 0,
  };

  // GPU resources — null when device is null.
  let haloPipeline: GPURenderPipeline | null = null;
  let ringPipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let instanceBuffer: GPUBuffer | null = null;
  const sourceBuffers: Record<'cluster' | 'supercluster' | 'void', GPUBuffer | null> = {
    cluster: null,
    supercluster: null,
    void: null,
  };
  let cameraBindGroup: GPUBindGroup | null = null;
  const sourceBindGroups: Record<'cluster' | 'supercluster' | 'void', GPUBindGroup | null> = {
    cluster: null,
    supercluster: null,
    void: null,
  };

  if (device) {
    const cameraBgl = device.createBindGroupLayout({
      label: 'cluster-marker-camera-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const sourceBgl = device.createBindGroupLayout({
      label: 'cluster-marker-source-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    // @group(1) FadeUniforms slot is intentionally OMITTED at v1.  The
    // renderer's per-frame fade rides on the descriptor's alpha fields
    // (computed CPU-side by poiSubsystem).  Plan 4 may add a unified
    // FadeUniforms here once the fade architecture asks for it.
    const pipelineLayout = device.createPipelineLayout({
      label: 'cluster-marker-pipeline-layout',
      bindGroupLayouts: [cameraBgl, /* @group(1) empty */ sourceBgl, sourceBgl],
      // Note: WebGPU requires every group up to the highest bound to
      // appear in bindGroupLayouts.  We bind @group(0) and @group(2),
      // so @group(1) needs a placeholder BGL — but since our shaders
      // never reference @group(1), we can hand cameraBgl as the
      // placeholder (the validation only checks shape, not content).
      // Actually: we leave the shader without any @group(1) reference,
      // and explicitly mark the unused slot — see below.
    });
    // TODO during implementation: if WebGPU's validator complains
    // about the cameraBgl-as-placeholder above, switch to a minimal
    // empty BGL: device.createBindGroupLayout({ entries: [] }).  The
    // exact validator behaviour depends on the WebGPU implementation
    // version — pick whichever passes Chrome 124+.

    const haloVs = createShaderModuleWithDevLog(device, haloVsCode, 'clusterMarker.halo.vs');
    const haloFs = createShaderModuleWithDevLog(device, haloFsCode, 'clusterMarker.halo.fs');
    const ringVs = createShaderModuleWithDevLog(device, ringVsCode, 'clusterMarker.ring.vs');
    const ringFs = createShaderModuleWithDevLog(device, ringFsCode, 'clusterMarker.ring.fs');

    const vertexBuffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: MARKER_INSTANCE_BYTES,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x4' }, // positionAndRadius
          { shaderLocation: 1, offset: 16, format: 'float32x4' }, // haloColorAndAlpha
          { shaderLocation: 2, offset: 32, format: 'float32'   }, // ringAlpha
        ],
      },
    ];

    haloPipeline = device.createRenderPipeline({
      label: 'cluster-marker-halo-pipeline',
      layout: pipelineLayout,
      vertex: { module: haloVs, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: {
        module: haloFs,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Additive — halo is emissive glow, not occluding overlay.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      // No depthStencil — markers are UI overlay.
    });

    ringPipeline = device.createRenderPipeline({
      label: 'cluster-marker-ring-pipeline',
      layout: pipelineLayout,
      vertex: { module: ringVs, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: {
        module: ringFs,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied-alpha OVER — ring is an opaque indicator
            // edge, must occlude rather than accumulate.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    uniformBuffer = device.createBuffer({
      label: 'cluster-marker-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    instanceBuffer = device.createBuffer({
      label: 'cluster-marker-instances',
      size: maxMarkers * MARKER_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    cameraBindGroup = device.createBindGroup({
      label: 'cluster-marker-camera-bg',
      layout: cameraBgl,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // Per-category SourceUniforms — written once at construction.
    for (const cat of POI_CATEGORIES_WITH_MARKERS) {
      const buf = device.createBuffer({
        label: `cluster-marker-source-${cat}`,
        size: SOURCE_UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      // Write the 5-bit source code at offset 0; rest stays zero.
      const u32 = new Uint32Array(SOURCE_UNIFORM_BYTES / 4);
      u32[0] = SOURCE_CODE_BY_CATEGORY[cat];
      device.queue.writeBuffer(buf, 0, u32);
      sourceBuffers[cat] = buf;
      sourceBindGroups[cat] = device.createBindGroup({
        label: `cluster-marker-source-bg-${cat}`,
        layout: sourceBgl,
        entries: [{ binding: 0, resource: { buffer: buf } }],
      });
    }
  }

  function setMarkers(descriptors: readonly ClusterMarkerDescriptor[]): void {
    // Partition descriptors by category — preserves order within each
    // category and keeps the instance buffer cache-friendly.  Three
    // categories means three passes over the input is fine.
    currentMarkerCount = 0;
    bucketCounts.cluster = 0;
    bucketCounts.supercluster = 0;
    bucketCounts.void = 0;

    // First pass: count per category to compute offsets.
    const count = Math.min(descriptors.length, maxMarkers);
    for (let i = 0; i < count; i++) {
      const d = descriptors[i]!;
      if (d.category === 'cluster') bucketCounts.cluster++;
      else if (d.category === 'supercluster') bucketCounts.supercluster++;
      else if (d.category === 'void') bucketCounts.void++;
      // famousGalaxy and any future label-only category have no markers; skip.
    }
    bucketOffsets.cluster = 0;
    bucketOffsets.supercluster = bucketOffsets.cluster + bucketCounts.cluster;
    bucketOffsets.void = bucketOffsets.supercluster + bucketCounts.supercluster;

    // Second pass: pack into the instance buffer in category-ordered runs.
    const writeCursor: Record<'cluster' | 'supercluster' | 'void', number> = {
      cluster: bucketOffsets.cluster,
      supercluster: bucketOffsets.supercluster,
      void: bucketOffsets.void,
    };
    for (let i = 0; i < count; i++) {
      const d = descriptors[i]!;
      if (d.category !== 'cluster' && d.category !== 'supercluster' && d.category !== 'void') continue;
      const slot = writeCursor[d.category];
      writeCursor[d.category]++;
      const base = slot * MARKER_INSTANCE_FLOATS;
      instanceBuf[base + 0] = d.worldPos[0];
      instanceBuf[base + 1] = d.worldPos[1];
      instanceBuf[base + 2] = d.worldPos[2];
      instanceBuf[base + 3] = d.physicalRadiusMpc;
      instanceBuf[base + 4] = d.haloColor[0];
      instanceBuf[base + 5] = d.haloColor[1];
      instanceBuf[base + 6] = d.haloColor[2];
      instanceBuf[base + 7] = d.haloAlpha;
      instanceBuf[base + 8] = d.ringAlpha;
      currentMarkerCount++;
    }

    if (!device || !instanceBuffer || currentMarkerCount === 0) return;
    device.queue.writeBuffer(
      instanceBuffer,
      0,
      instanceBuf,
      0,
      currentMarkerCount * MARKER_INSTANCE_FLOATS,
    );
  }

  function render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void {
    if (
      !device || !haloPipeline || !ringPipeline || !uniformBuffer ||
      !instanceBuffer || !cameraBindGroup
    ) return;
    if (currentMarkerCount === 0) return;

    // Write the 80-byte CameraUniforms prefix.  Same shape as markerLineRenderer.
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj, 0);
    uni[16] = viewportSize[0];
    uni[17] = viewportSize[1];
    // uni[18], uni[19] stay zero (the two reserved pads).
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, instanceBuffer);

    // Halo passes first (additive) — voids skip; see spec §2.1.  We
    // could check bucket-level halo presence by inspecting each
    // descriptor's haloAlpha, but issuing the draw with haloAlpha == 0
    // on every instance is cheap and the per-fragment math is
    // multiplied by 0 → no observable contribution.  For voids the
    // descriptor sets haloAlpha = 0 (set by produceMarkers), so the
    // draw is a no-op visually.  Keep the per-category dispatch
    // explicit anyway — plan 3 will branch on category for pick.
    pass.setPipeline(haloPipeline);
    for (const cat of POI_CATEGORIES_WITH_MARKERS) {
      if (cat === 'void') continue; // explicit skip per spec
      if (bucketCounts[cat] === 0) continue;
      const bg = sourceBindGroups[cat];
      if (!bg) continue;
      pass.setBindGroup(2, bg);
      pass.draw(6, bucketCounts[cat], 0, bucketOffsets[cat]);
    }

    // Ring passes second (premultiplied OVER — composites over halo).
    pass.setPipeline(ringPipeline);
    for (const cat of POI_CATEGORIES_WITH_MARKERS) {
      if (bucketCounts[cat] === 0) continue;
      const bg = sourceBindGroups[cat];
      if (!bg) continue;
      pass.setBindGroup(2, bg);
      pass.draw(6, bucketCounts[cat], 0, bucketOffsets[cat]);
    }
  }

  function markerCount(): number {
    return currentMarkerCount;
  }

  function destroy(): void {
    uniformBuffer?.destroy();
    instanceBuffer?.destroy();
    for (const cat of POI_CATEGORIES_WITH_MARKERS) {
      sourceBuffers[cat]?.destroy();
    }
  }

  const renderer: ClusterMarkerRenderer = {
    label: 'clusterMarkerRenderer',
    setMarkers,
    render,
    markerCount,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
```

NOTE for the implementer: the `import` lines have `haloVsCode` and `haloFsCode` from the same file — that's intentional. WESL's `?static` import returns the same linked WGSL string regardless of which entry point in the file (`vs` / `fs`) the pipeline references. We pass the same string to two `createShaderModule` calls (one per stage) so each pipeline gets its own module per the cross-pipeline-sharing rule (`feedback_webgpu_auto_layout_trap.md`). Re-importing the same string makes the per-pipeline split explicit at the import site.

- [ ] **Step 2: Rerun the CPU-state tests — they should still pass**

```bash
npx vitest run tests/services/gpu/renderers/clusterMarkerRenderer.test.ts
```

Expected: PASS — 5/5. The null-device guards in `setMarkers` / `render` / `destroy` keep the CPU path unchanged.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run the full test suite to catch any regressions**

```bash
npm test
```

Expected: PASS — no other test references `clusterMarkerRenderer` yet.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/renderers/clusterMarkerRenderer.ts
git commit -m "feat(cluster-viz): wire halo + ring pipelines into clusterMarkerRenderer"
```

---

## Phase C — poiSubsystem rework

### Task 8: Extend POI_STYLES with halo + ring tint fields

**Files:**
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`

- [ ] **Step 1: Read the current POI_STYLES (lines 123-157 in poiSubsystem.ts) to confirm shape**

Already read during this plan's authoring — `POI_STYLES.cluster`, `.supercluster`, `.famousGalaxy`, `.void` exist with `labelColor`, `lineColor`, `minPixelSize`, `maxPixelSize`, `worldEmMpc`, `pixelWidth`, and (famousGalaxy only) `fadeBandPx`.

- [ ] **Step 2: Add marker-style fields to CategoryStyle and POI_STYLES**

Replace the `CategoryStyle` type (around line 79) with:

```ts
type CategoryStyle = {
  readonly labelColor: Vec4;
  readonly lineColor: Vec4;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
  /**
   * Smoothstep fade-band width in pixels above `minApparentSizePx`.
   * (Unchanged from the pre-cluster-viz revision; see the existing
   *  docblock — kept verbatim above this comment block.)
   */
  readonly fadeBandPx?: number;
  /**
   * RGB halo tint for the marker pass.  `null` opts the category OUT
   * of halo rendering — voids are 'absence', not 'presence'; emitting
   * an additive glow there would contradict the spec's semantics.
   * Cluster + supercluster use the same warm tint family as labelColor.
   */
  readonly haloColor: Vec3 | null;
  /**
   * RGB ring tint for the marker pass.  Always present — every
   * marker-bearing category gets a visible ring at its physicalRadiusMpc.
   * Mirrors labelColor.rgb (alpha is computed per-frame).
   */
  readonly ringColor: Vec3;
  /**
   * Apparent on-screen radius (pixels) above which the marker fades
   * OUT.  Above this threshold the ring is so big it fills the viewport
   * and obscures the galaxies it's meant to contain; the fade hands
   * the view back to the surrounding membership.  Reuses the smoothstep
   * shape of the existing `fadeBandPx` fade-IN ramp for symmetry.
   */
  readonly markerMaxApparentRadiusPx: number;
  /** Smoothstep band width for the marker fade-out. */
  readonly markerMaxApparentFadeBandPx: number;
};
```

Also: add `import type { Vec3 } from '../../../@types/math/Vec3';` near the existing Vec4 import (line ~73 — it may already be there from a previous edit; check before duplicating).

Then update each row in `POI_STYLES`:

```ts
export const POI_STYLES = {
  cluster: {
    labelColor: [1.0, 0.85, 0.4, 1] as Vec4,
    lineColor: [0.9, 0.75, 0.3, 1] as Vec4,
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 1.25,
    pixelWidth: 2,
    // Warm yellow (matches labelColor.rgb).
    haloColor: [1.0, 0.85, 0.4] as Vec3,
    ringColor: [1.0, 0.85, 0.4] as Vec3,
    markerMaxApparentRadiusPx: 800,
    markerMaxApparentFadeBandPx: 200,
  },
  supercluster: {
    labelColor: [1.0, 0.8, 0.5, 1] as Vec4,
    lineColor: [0.9, 0.7, 0.45, 1] as Vec4,
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 5.0,
    pixelWidth: 2,
    // Warm orange (matches labelColor.rgb).
    haloColor: [1.0, 0.8, 0.5] as Vec3,
    ringColor: [1.0, 0.8, 0.5] as Vec3,
    markerMaxApparentRadiusPx: 800,
    markerMaxApparentFadeBandPx: 200,
  },
  famousGalaxy: {
    labelColor: [1.0, 0.95, 0.8, 1] as Vec4,
    lineColor: [0.9, 0.85, 0.7, 1] as Vec4,
    minPixelSize: 30,
    maxPixelSize: 150,
    worldEmMpc: 0.0125,
    pixelWidth: 2.5,
    fadeBandPx: 4,
    // Famous galaxies don't get the halo/ring treatment — they have
    // curated thumbnails on close approach instead.  null tints mean
    // produceMarkers skips them entirely.
    haloColor: null,
    ringColor: [0, 0, 0] as Vec3, // unused — ringAlpha will be 0
    markerMaxApparentRadiusPx: 800,
    markerMaxApparentFadeBandPx: 200,
  },
  void: {
    labelColor: [0.6, 0.85, 0.95, 1] as Vec4,
    lineColor: [0.45, 0.7, 0.85, 1] as Vec4,
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 2.5,
    pixelWidth: 2,
    // Voids: ring only.  Cyan tint per spec §2.1.
    haloColor: null,
    ringColor: [0.45, 0.7, 0.85] as Vec3,
    markerMaxApparentRadiusPx: 800,
    markerMaxApparentFadeBandPx: 200,
  },
} as const satisfies Readonly<Record<string, CategoryStyle>>;
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS — the new fields are additive; existing callers of `POI_STYLES[cat]` keep reading the original keys.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: PASS — no test reads `haloColor` / `ringColor` yet, and the existing produceLabels test still works against the unchanged label fields.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/subsystems/poiSubsystem.ts
git commit -m "feat(cluster-viz): extend POI_STYLES with halo/ring tints + max-fade band"
```

### Task 9: Delete makeCrosshairLines + its call site

**Files:**
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`

- [ ] **Step 1: Delete `makeCrosshairLines` (lines 195-212 in the pre-edit revision)**

Remove the function in its entirety. The `MarkerLine` import at the top stays (the anchor-offset label line still uses it).

- [ ] **Step 2: Delete the call site inside `produceLabels`**

Find the `for (const line of makeCrosshairLines(p, style)) lines.push(line);` line near the end of the per-POI loop (~line 304) and delete it.

- [ ] **Step 3: Update the module-header docblock**

The crosshair section in the module header (lines 24-31, "### Crosshair shape") no longer describes accurate behaviour. Replace that block with:

```ts
 * ### Marker pass (clusters / superclusters / voids)
 *
 * Cluster, supercluster, and void POIs now render through the
 * separate `clusterMarkerRenderer` as soft additive halos + screen-AA
 * rings at their `physicalRadiusMpc` — see `produceMarkers` below.
 * The previous three-perpendicular-line crosshair gizmo was removed
 * in 2026-05-18 (cluster-viz plan 2/4); see the spec
 * `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md`
 * §2 for the rationale.  POIs without `physicalRadiusMpc` get a
 * label only.
```

- [ ] **Step 4: Add a failing test asserting crosshair lines are gone**

Open `tests/services/engine/subsystems/poiSubsystem.test.ts` (create if absent — check existence first with `ls tests/services/engine/subsystems/ | grep poiSubsystem`). Add:

```ts
import { describe, it, expect } from 'vitest';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

// Minimal stubs sufficient for produceLabels — the function reads
// only ctx.drawCamPos, ctx.canvasSize, ctx.drawPxPerRad, and state.subsystems.fades.
function makeCtx(): ReadyFrameContext {
  // Fill required fields with sensible defaults; cast through unknown
  // so tests don't have to construct the full mat4 + camera state.
  return {
    drawCamPos: [0, 0, 1000],
    canvasSize: { width: 1024, height: 768 },
    drawPxPerRad: 500,
  } as unknown as ReadyFrameContext;
}

function makeStateStub(): EngineState {
  // Only subsystems.fades.fadeTo is called from produceLabels (the
  // one-shot layer fade-in).  Provide a no-op stub.
  return {
    subsystems: {
      fades: {
        fadeTo: () => Promise.resolve(),
        // The rest of FadeRegistry methods are unused by produceLabels.
      },
    },
  } as unknown as EngineState;
}

describe('poiSubsystem — crosshair removal', () => {
  it('produces zero marker-lines for a cluster POI with no labelAnchorOffsetMpc', () => {
    const sub = createPoiSubsystem();
    const poi: PointOfInterest = {
      id: 'virgo',
      name: 'Virgo',
      category: 'cluster',
      worldPos: [10, 0, 0],
      // Plan 1 renamed crosshairSizeMpc → physicalRadiusMpc.
      physicalRadiusMpc: 2,
    };
    sub.setPois([poi]);
    const out = sub.produceLabels(makeStateStub(), makeCtx());
    // Pre-cluster-viz this would have been 3 (three perpendicular
    // crosshair lines).  Now: 0, because the cluster has no
    // labelAnchorOffsetMpc and the crosshair is gone.
    expect(out.lines).toHaveLength(0);
    // Label is still produced.
    expect(out.labels).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run the new test — should pass IMMEDIATELY (the deletion in Steps 1-2 already removed the crosshair)**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```

Expected: PASS — `out.lines.length === 0`.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: PASS — no other test depends on the deleted function. (If any test does, it's stale and should be updated to reflect the new behaviour.)

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/subsystems/poiSubsystem.ts \
        tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "feat(cluster-viz): remove makeCrosshairLines from poiSubsystem"
```

### Task 10: Add produceMarkers method skeleton

**Files:**
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `src/@types/engine/subsystems/PoiSubsystem.d.ts`

- [ ] **Step 1: Update the PoiSubsystem type**

```ts
// src/@types/engine/subsystems/PoiSubsystem.d.ts
import type { LabelProducer } from './LabelProducer';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from './PointOfInterest';
import type { ClusterMarkerDescriptor } from '../../rendering/ClusterMarkerDescriptor';
import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';

export type PoiSubsystem = LabelProducer & {
  setPois(pois: readonly PointOfInterest[]): void;
  clearPois(): void;
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
  /**
   * Per-frame producer for the at-rest cluster / supercluster / void
   * markers (halo + ring).  Returns one descriptor per visible POI
   * after applying the apparent-size fade-in band AND the
   * max-apparent-radius fade-out.  Famous-galaxy POIs always return
   * empty (they render through the textured-impostor + label paths).
   *
   * The producer never mutates engine state directly — the returned
   * array is fed to `state.gpu.clusterMarkerRenderer.setMarkers(...)`
   * by `runFrame`.
   */
  produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[];
  destroy(): void;
};
```

- [ ] **Step 2: Write the failing test FIRST (TDD)**

Append to `tests/services/engine/subsystems/poiSubsystem.test.ts`:

```ts
describe('poiSubsystem — produceMarkers', () => {
  it('returns one descriptor per visible cluster + supercluster + void POI', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'virgo', name: 'Virgo', category: 'cluster',
        worldPos: [10, 0, 0], physicalRadiusMpc: 2 },
      { id: 'hercules', name: 'Hercules SC', category: 'supercluster',
        worldPos: [0, 100, 0], physicalRadiusMpc: 50 },
      { id: 'bootes', name: 'Boötes Void', category: 'void',
        worldPos: [0, 0, 200], physicalRadiusMpc: 50 },
    ]);
    const markers = sub.produceMarkers(makeStateStub(), makeCtx());
    expect(markers).toHaveLength(3);
  });

  it('excludes famous-galaxy POIs from markers', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'm31', name: 'M31', category: 'famousGalaxy',
        worldPos: [0.78, 0, 0], physicalRadiusMpc: 0.05 },
    ]);
    const markers = sub.produceMarkers(makeStateStub(), makeCtx());
    expect(markers).toHaveLength(0);
  });

  it('voids have haloAlpha === 0 (ring-only per spec)', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'bootes', name: 'Boötes Void', category: 'void',
        worldPos: [0, 0, 200], physicalRadiusMpc: 50 },
    ]);
    const markers = sub.produceMarkers(makeStateStub(), makeCtx());
    expect(markers[0]?.haloAlpha).toBe(0);
    // Ring is the only visible primitive for voids.
    expect(markers[0]?.ringAlpha).toBeGreaterThan(0);
  });

  it('respects setCategoryVisible', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'virgo', name: 'Virgo', category: 'cluster',
        worldPos: [10, 0, 0], physicalRadiusMpc: 2 },
      { id: 'bootes', name: 'Boötes Void', category: 'void',
        worldPos: [0, 0, 200], physicalRadiusMpc: 50 },
    ]);
    sub.setCategoryVisible('void', false);
    const markers = sub.produceMarkers(makeStateStub(), makeCtx());
    expect(markers).toHaveLength(1);
    expect(markers[0]?.category).toBe('cluster');
  });

  it('skips POIs without physicalRadiusMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      // No physicalRadiusMpc — should not appear in markers (no
      // radius to draw to).
      { id: 'unsized', name: 'Unsized', category: 'cluster',
        worldPos: [10, 0, 0] },
    ]);
    const markers = sub.produceMarkers(makeStateStub(), makeCtx());
    expect(markers).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the new tests — expected to FAIL (produceMarkers doesn't exist yet)**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```

Expected: FAIL — `sub.produceMarkers is not a function`.

- [ ] **Step 4: Implement produceMarkers**

In `poiSubsystem.ts`, add the import near the top:

```ts
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';
import type { Vec3 } from '../../../@types/math/Vec3';
```

(Vec3 may already be imported transitively — check; the explicit import is harmless.)

Inside `createPoiSubsystem`, after `produceLabels`, add:

```ts
function produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[] {
  const out: ClusterMarkerDescriptor[] = [];
  // The same vertical-fov recovery produceLabels does — kept local
  // so the two producers don't share mutable state.
  const halfH = ctx.canvasSize.height * 0.5;
  const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
  // pxPerRad along the screen-Y axis at the current canvas size.
  // (Same form youAreHereSubsystem and the labels use.)
  const pxPerRad = ctx.canvasSize.height * 0.5 / Math.tan(fovYRad * 0.5);
  const [cx, cy, cz] = ctx.drawCamPos;

  for (const p of pois) {
    if (!visibility[p.category]) continue;
    // POIs without a physicalRadiusMpc have no ring to draw — skip.
    if (p.physicalRadiusMpc === undefined) continue;
    const style: CategoryStyle = POI_STYLES[p.category];
    // ringColor === null guards a never-happens path; we use
    // haloColor === null to mean "label-only category".  Famous
    // galaxies always hit this branch.
    if (style.haloColor === null && p.category === 'famousGalaxy') continue;

    const dx = p.worldPos[0] - cx;
    const dy = p.worldPos[1] - cy;
    const dz = p.worldPos[2] - cz;
    const distanceMpc = Math.hypot(dx, dy, dz);
    if (distanceMpc < 0.001) continue; // camera on top of POI — skip rather than NaN

    // Apparent on-screen radius in pixels.
    const apparentRadiusPx = (p.physicalRadiusMpc / distanceMpc) * pxPerRad;

    // Max-apparent-radius fade-out: smoothstep alpha from 1 → 0 as
    // the projected ring grows past markerMaxApparentRadiusPx into
    // the fade band.  Above the band: alpha = 0 (skip).
    let maxFadeAlpha = 1;
    if (apparentRadiusPx > style.markerMaxApparentRadiusPx) {
      const t = Math.min(
        1,
        (apparentRadiusPx - style.markerMaxApparentRadiusPx) / style.markerMaxApparentFadeBandPx,
      );
      // Smoothstep, then invert so we fade 1 → 0.
      maxFadeAlpha = 1 - t * t * (3 - 2 * t);
    }
    if (maxFadeAlpha <= 0) continue; // fully faded

    // Apparent-size fade-IN band reuses produceLabels' logic — only
    // applies when both minApparentSizePx AND apparentDiameterKpc are
    // set.  For cluster / SC / void anchors neither is set, so the
    // fade-in alpha defaults to 1 (always visible above 0 distance).
    // Implementer note: if a future POI wants a min-size fade-in for
    // markers, mirror the produceLabels logic here.
    const minFadeAlpha = 1;

    const fadeAlpha = Math.min(maxFadeAlpha, minFadeAlpha);

    // Halo: voids opt out (style.haloColor === null).  Cluster + SC
    // emit the warm tint with alpha = fadeAlpha; voids emit 0.
    const haloAlpha = style.haloColor === null ? 0 : fadeAlpha;
    const haloColor: Vec3 = style.haloColor ?? [0, 0, 0];

    out.push({
      category: p.category,
      worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
      physicalRadiusMpc: p.physicalRadiusMpc,
      haloColor,
      ringColor: style.ringColor,
      haloAlpha,
      ringAlpha: fadeAlpha,
    });
  }
  return out;
}
```

Update the returned `subsystem` object literal to include `produceMarkers`:

```ts
const subsystem: PoiSubsystem = {
  id: 'pois',
  produceLabels,
  produceMarkers,  // NEW
  setPois,
  clearPois,
  setCategoryVisible,
  destroy(): void { /* unchanged */ },
};
```

- [ ] **Step 5: Run the produceMarkers tests — should pass now**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```

Expected: PASS — all 5 tests including the original crosshair-removal test.

- [ ] **Step 6: Run typecheck + full suite**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/subsystems/poiSubsystem.ts \
        src/@types/engine/subsystems/PoiSubsystem.d.ts \
        tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "feat(cluster-viz): add produceMarkers to poiSubsystem"
```

### Task 11: Add awake propagation for marker fade transitions

**Files:**
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `src/@types/engine/subsystems/PoiSubsystem.d.ts`

Background: `produceLabels` already returns `awake: true` whenever the apparent-size fade-band is mid-transition, so the render-on-demand loop stays awake. The new marker fade-out needs the same hook — without it, panning toward Virgo would freeze mid-fade because the engine has nothing else to animate.

The simplest option (chosen here): roll the marker awake signal into `produceLabels`'s existing `awake` output. The two producers walk the same POI list; folding the fade detection into the label pass means one extra cheap check per POI per frame and no API change.

- [ ] **Step 1: Write the failing test**

Add to `poiSubsystem.test.ts`:

```ts
it('produceLabels sets awake=true when a marker is mid-fade-out', () => {
  const sub = createPoiSubsystem();
  // Put the camera so close to a small-radius cluster that the projected
  // ring lands inside the markerMaxApparentFadeBandPx fade band.  At
  // distance d the apparent radius is (r / d) * pxPerRad; we want it
  // between 800 and 1000 (markerMaxApparentRadiusPx=800,
  // markerMaxApparentFadeBandPx=200) given pxPerRad=500 and r=2:
  //   target = 850 → d = (2 / 850) * 500 = ~1.18
  sub.setPois([
    { id: 'virgo', name: 'Virgo', category: 'cluster',
      worldPos: [1.18, 0, 0], physicalRadiusMpc: 2 },
  ]);
  const ctx = {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1024, height: 768 },
    drawPxPerRad: 500,
  } as unknown as ReadyFrameContext;
  const out = sub.produceLabels(makeStateStub(), ctx);
  expect(out.awake).toBe(true);
});
```

- [ ] **Step 2: Run the test — should FAIL**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```

Expected: FAIL — `awake` defaults false in produceLabels, and produceMarkers does not affect it yet.

- [ ] **Step 3: Update produceLabels to detect marker mid-fade and set awake**

Inside `produceLabels`'s per-POI loop, after the existing apparent-size fade-IN handling, add:

```ts
// Marker fade-out awake propagation.  produceMarkers runs the same
// math each frame; mirror its mid-transition detection here so the
// render-on-demand loop stays awake through the fade.  Skipping the
// detection (e.g. by only running it in produceMarkers) is broken:
// produceMarkers' return value is consumed AFTER the awake decision
// has already been baked into the frame.
if (p.physicalRadiusMpc !== undefined) {
  const dxM = p.worldPos[0] - cx;
  const dyM = p.worldPos[1] - cy;
  const dzM = p.worldPos[2] - cz;
  const distMpc = Math.hypot(dxM, dyM, dzM);
  if (distMpc > 0.001) {
    const apRadPx = (p.physicalRadiusMpc / distMpc) * (ctx.canvasSize.height * 0.5 / Math.tan(fovYRad * 0.5));
    if (apRadPx > style.markerMaxApparentRadiusPx &&
        apRadPx < style.markerMaxApparentRadiusPx + style.markerMaxApparentFadeBandPx) {
      awake = true;
    }
  }
}
```

- [ ] **Step 4: Run the test — should PASS**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/subsystems/poiSubsystem.ts \
        tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "feat(cluster-viz): propagate marker mid-fade awake through produceLabels"
```

---

## Phase D — Wire-up

### Task 12: Add clusterMarkerRenderer to EngineGpuState

**Files:**
- Modify: `src/@types/engine/state/EngineGpuState.d.ts`

- [ ] **Step 1: Read the current EngineGpuState type**

Read the file to find where `markerLineRenderer` is declared.

- [ ] **Step 2: Add the new field**

Add an import:
```ts
import type { ClusterMarkerRenderer } from '../../rendering/ClusterMarkerRenderer';
```

Add the field next to `markerLineRenderer`:
```ts
clusterMarkerRenderer: ClusterMarkerRenderer | null;
```

- [ ] **Step 3: Run typecheck — expect failures in engine.ts**

```bash
npm run typecheck
```

Expected: FAIL — `engine.ts`'s `state.gpu` initial literal is missing the new field.

- [ ] **Step 4: Add the initial value in engine.ts**

In `src/services/engine/engine.ts`, find the `state.gpu` initialiser (around line 462). Next to `markerLineRenderer: null,` add:

```ts
clusterMarkerRenderer: null,
```

- [ ] **Step 5: Re-run typecheck — should pass**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/state/EngineGpuState.d.ts \
        src/services/engine/engine.ts
git commit -m "feat(cluster-viz): add clusterMarkerRenderer slot to EngineGpuState"
```

### Task 13: Construct clusterMarkerRenderer in initGpu

**Files:**
- Modify: `src/services/engine/phases/initGpu.ts`

- [ ] **Step 1: Add the import**

At the top of `initGpu.ts`, alongside `createMarkerLineRenderer`:

```ts
import { createClusterMarkerRenderer } from '../../gpu/renderers/clusterMarkerRenderer';
```

- [ ] **Step 2: Construct the renderer**

After `state.gpu.markerLineRenderer = createMarkerLineRenderer(uiCtx);` (line 247), add:

```ts
state.gpu.clusterMarkerRenderer = createClusterMarkerRenderer(uiCtx);
```

- [ ] **Step 3: Add destroy-bag entry in engine.ts**

In `engine.ts`'s destroy function (around lines 1322-1323 where `markerLineRenderer` is torn down), add:

```ts
state.gpu.clusterMarkerRenderer?.destroy();
state.gpu.clusterMarkerRenderer = null;
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/phases/initGpu.ts \
        src/services/engine/engine.ts
git commit -m "feat(cluster-viz): construct + destroy clusterMarkerRenderer in engine lifecycle"
```

### Task 14: Add clusterMarkersPass

**Files:**
- Create: `src/services/engine/frame/passes/clusterMarkersPass.ts`
- Modify: `src/services/engine/frame/passes/index.ts`

- [ ] **Step 1: Write the pass module**

```ts
// src/services/engine/frame/passes/clusterMarkersPass.ts
/**
 * clusterMarkersPass — halo + ring draws for cluster / supercluster /
 * void POIs.
 *
 * Lives in `HDR_PASSES` (NOT `UI_PASSES`) because halos are additive
 * emissive content — they participate in tone-map alongside point
 * sprites, procedural disks, etc.  Rings are premultiplied-OVER but
 * the alpha is already in the linear HDR range; tone-map applies
 * cleanly.
 *
 * Position: after volumeUpsamplePass so halos composite over the
 * cosmic web / volume fields rather than the other way round.  Labels
 * (in UI_PASSES) still draw on top of everything HDR via the post-
 * tone-map overlay pass.
 *
 * Enabled when: clusterMarkerRenderer is non-null AND has at least
 * one marker queued for this frame.  When the camera is sufficiently
 * far that every POI's apparent ring is sub-pixel, the renderer
 * still emits descriptors (the per-pixel fragment write degenerates
 * to ~zero alpha) — this is intentional, keeps the pass cheap and
 * uniformly enabled.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const clusterMarkersPass: Pass = {
  name: 'cluster-markers',

  enabled(state, _ctx, _settings) {
    if (state.gpu.clusterMarkerRenderer === null) return false;
    return state.gpu.clusterMarkerRenderer.markerCount() > 0;
  },

  draw(pass, ctx, state, _settings, _deps) {
    state.gpu.clusterMarkerRenderer!.render(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
    );
  },
};
```

- [ ] **Step 2: Register the pass in HDR_PASSES**

In `src/services/engine/frame/passes/index.ts`, add the import and append to `HDR_PASSES`:

```ts
import { clusterMarkersPass } from './clusterMarkersPass';
// ...
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  milkyWayPass,
  filamentsPass,
  volumeUpsamplePass,
  clusterMarkersPass,
];
// ...
export { clusterMarkersPass } from './clusterMarkersPass';
```

Update the HDR_PASSES JSDoc above the array to list the seventh pass:

```ts
 *   7. cluster-markers      — at-rest halo + ring for cluster / SC / void POIs
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/frame/passes/clusterMarkersPass.ts \
        src/services/engine/frame/passes/index.ts
git commit -m "feat(cluster-viz): add clusterMarkersPass to HDR_PASSES"
```

### Task 15: Wire produceMarkers → setMarkers in runFrame

**Files:**
- Modify: `src/services/engine/frame/runFrame.ts`

- [ ] **Step 1: Find the label director flush site**

In `runFrame.ts`, find `state.subsystems.labelDirector.runFrame(state, ctx);` (around line 295).

- [ ] **Step 2: Add the marker producer flush below it**

```ts
// Per-frame marker upload — mirrors the label-director flush right
// above: produceMarkers walks the POI list, applies fade math, and
// hands typed descriptors to the renderer.  Must run BEFORE the GPU
// dispatch so the instance buffer is uploaded before
// clusterMarkersPass's draw reads it.
if (state.gpu.clusterMarkerRenderer !== null) {
  const markers = state.subsystems.pois.produceMarkers(state, ctx);
  state.gpu.clusterMarkerRenderer.setMarkers(markers);
}
```

- [ ] **Step 3: Write an integration-style test**

Create or extend `tests/services/engine/frame/runFrame.test.ts` (check if it exists first with `ls tests/services/engine/frame/`). If absent, this step adds a minimal test ONLY for the marker flush — full runFrame coverage is out of scope.

If a test file is too large to extend safely, skip this step and rely on the smoke test (Task 18). Note the skip in the commit message.

- [ ] **Step 4: Typecheck + full suite**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/frame/runFrame.ts
# include the test file only if it was modified
git commit -m "feat(cluster-viz): flush produceMarkers → clusterMarkerRenderer each frame"
```

### Task 16: Integration test — renderer sees markers after frame setup

**Files:**
- Create: `tests/services/engine/integrationMarkerWire.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect } from 'vitest';
import { createPoiSubsystem } from '../../../src/services/engine/subsystems/poiSubsystem';
import { createClusterMarkerRenderer } from '../../../src/services/gpu/renderers/clusterMarkerRenderer';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';

describe('poiSubsystem.produceMarkers → clusterMarkerRenderer.setMarkers', () => {
  it('the renderer reports the same marker count produceMarkers emitted', () => {
    const sub = createPoiSubsystem();
    const renderer = createClusterMarkerRenderer({
      device: null as unknown as GPUDevice,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
    });
    sub.setPois([
      { id: 'virgo', name: 'Virgo', category: 'cluster',
        worldPos: [10, 0, 0], physicalRadiusMpc: 2 },
      { id: 'hercules', name: 'Hercules SC', category: 'supercluster',
        worldPos: [0, 100, 0], physicalRadiusMpc: 50 },
      { id: 'bootes', name: 'Boötes Void', category: 'void',
        worldPos: [0, 0, 200], physicalRadiusMpc: 50 },
      // famousGalaxy excluded.
      { id: 'm31', name: 'M31', category: 'famousGalaxy',
        worldPos: [0.78, 0, 0], physicalRadiusMpc: 0.05 },
    ] as PointOfInterest[]);

    const state = {
      subsystems: { fades: { fadeTo: () => Promise.resolve() } },
    } as unknown as EngineState;
    const ctx = {
      drawCamPos: [0, 0, 1000],
      canvasSize: { width: 1024, height: 768 },
      drawPxPerRad: 500,
    } as unknown as ReadyFrameContext;

    const markers = sub.produceMarkers(state, ctx);
    renderer.setMarkers(markers);
    // 3 markers: cluster + SC + void (famous excluded).
    expect(renderer.markerCount()).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/services/engine/integrationMarkerWire.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/services/engine/integrationMarkerWire.test.ts
git commit -m "test(cluster-viz): integration — produceMarkers → renderer round-trip"
```

### Task 17: Verification — typecheck + tests + build

**Files:** none (verification step)

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Expected: PASS — no regressions, all new tests green.

- [ ] **Step 3: Full build**

```bash
npm run build
```

Expected: PASS — Vite + wesl-plugin successfully links the new shaders into the bundle.

- [ ] **Step 4: If anything fails, STOP**

Do not move to the smoke test. Open the failing test or build error, diagnose with the `superpowers:systematic-debugging` skill, and fix the root cause. Do not commit a workaround.

- [ ] **Step 5: No commit** (this step has no file changes — it just gates the smoke test)

---

## Phase E — Manual smoke test

### Task 18: Visual verification in the dev server

**Files:** none — this is a manual user-driven check per CLAUDE.md.

- [ ] **Step 1: Confirm `npm run dev` is running**

Per CLAUDE.md, the dev server stays running between sessions; do not start a new one if one is already up. If it isn't running, ask the user to start it.

- [ ] **Step 2: Ask the user to navigate to Virgo and check the marker**

Walk the user through:

```
1. Open http://localhost:5173/ in your browser.
2. Use the Cmd+K palette (or click the Virgo POI label) to fly to Virgo.
3. Confirm you see a SOFT YELLOW HALO with a thin ring at the cluster's
   2 Mpc radius — NOT three perpendicular line segments.
4. Continue flying closer.  At very close approach the ring + halo should
   smoothly fade to zero so the surrounding 2MRS/GLADE galaxies are
   visible.
```

- [ ] **Step 3: Repeat for Hercules SC**

```
5. Fly to Hercules SC.
6. Confirm a similar (slightly more orange) halo + ring, sized to the
   SC's ~50 Mpc extent.
```

- [ ] **Step 4: Repeat for Boötes Void**

```
7. Fly to Boötes Void.
8. Confirm CYAN RING ONLY — no halo glow (voids are absence, not
   presence).
```

- [ ] **Step 5: Confirm labels unchanged**

```
9. Check that the POI labels (text + anchor-offset line for any POI
   that has labelAnchorOffsetMpc) render exactly as before.  Famous
   galaxy labels + thumbnails should be untouched.
```

- [ ] **Step 6: Check the console**

```
10. Open DevTools console.  Confirm:
    - No WebGPU validation errors (pipeline layout mismatch, BGL shape, etc.).
    - No "createShaderModule" compilation warnings about the new shaders.
    - No console.error / console.warn from any new code path.
```

- [ ] **Step 7: If anything looks wrong**

STOP. Do not commit a workaround. Diagnose with the `superpowers:systematic-debugging` skill. The most likely culprits at this stage:

- **Halo appears as a hard square, not a soft radial gradient.** Fragment math wrong — re-check the smoothstep in halo.wesl.
- **Ring is a filled disk, not a thin AA edge.** Fragment band-width math wrong — re-check the `bandHalfUv` derivation in ring.wesl.
- **Marker doesn't appear at all.** Check pipeline-layout shape (the `@group(1)` placeholder), bind-group binding, or whether `setMarkers` actually received non-zero descriptors (add a `console.log(markers.length)` in `runFrame` temporarily).
- **Marker fades to zero immediately on first frame.** `markerMaxApparentRadiusPx` may be too small for the default camera position; adjust the 800 px default in `POI_STYLES`.
- **Halo shears as the camera orbits.** Expected at v1 — the axis-aligned billboard basis is an approximation. Document the limitation; deferred to a follow-up.

- [ ] **Step 8: If everything looks good, no commit needed — the implementation is done**

The PR is ready for review. Plans 3 and 4 follow with pick + camera focus and member-isolation focus mode respectively.

---

## Self-Review Notes (for the plan author)

Spec coverage checklist (cross-referencing the user's "Your scope for plan 2" list against task coverage):

- [x] **Crosshair lines GONE for all POIs (clusters, SCs, voids)** — Task 9 deletes `makeCrosshairLines` and its call site; Task 9 Step 4 test asserts `out.lines.length === 0` for a no-anchor-offset POI set.
- [x] **Halo + ring renders for each POI, scaled to `physicalRadiusMpc`** — Tasks 4-7 (shaders + pipelines).
- [x] **Voids: ring-only (no halo), cyan-tinted** — POI_STYLES gives voids `haloColor: null`; produceMarkers emits `haloAlpha: 0`; clusterMarkerRenderer.render() explicitly skips the void halo bucket.
- [x] **Labels still render unchanged** — produceLabels only loses the crosshair lines; label emission untouched.
- [x] **Apparent-size fade-out works** — Task 10 (produceMarkers max-fade), Task 11 (awake propagation).
- [x] **No selection or focus behavior** — explicitly excluded throughout; no `FocusUniforms`, no pick fragment, no InfoCard edits.
- [x] **`clusterMarkerRenderer` with one draw per category** — Task 7's render() partitions by category and dispatches per-category SourceUniforms.
- [x] **Per-category SourceUniforms (5/6/7) pre-architects pick path** — Task 7 builds three bind groups indexed by category; plan 3 inherits.
- [x] **Halo draw first (additive), then ring (alpha blend), voids skip halo** — Task 7's render() loop.
- [x] **WESL conventions** — dedicated section before Phase B; reinforced in Tasks 4-6 module headers.
- [x] **poiSubsystem.produceMarkers** — Task 10.
- [x] **POI_STYLES per-category halo/ring tints + max-fade** — Task 8.
- [x] **Engine wire-up + destroy bag** — Tasks 12-13.
- [x] **Each frame setMarkers + render** — Tasks 14-15.
- [x] **Layering between points and labels** — Task 14 places `clusterMarkersPass` in HDR_PASSES after volumes, before tone-map; labels (UI_PASSES) still on top.
- [x] **Snapshot test asserting crosshairs absent** — Task 9 Step 4.
- [x] **Integration test that render is called per frame when POIs are set** — Task 16 (round-trip count assertion stands in for "render is called" — null device makes the actual render a no-op).
- [x] **Manual smoke test as last task** — Task 18.

Placeholder scan: no TBD / TODO / "implement later". The only "TODO during implementation" annotation in Task 7 is a real WebGPU validator nuance the implementer must reconcile against their browser version — not a deferred plan task.

Type consistency: `ClusterMarkerDescriptor` shape declared in Task 1, used in Tasks 3, 7, 10, 16 with identical field names (`category`, `worldPos`, `physicalRadiusMpc`, `haloColor`, `ringColor`, `haloAlpha`, `ringAlpha`). `produceMarkers` signature declared in Task 10 (`(state, ctx) → readonly ClusterMarkerDescriptor[]`), used in Tasks 10, 11, 15, 16.

Known limitation (called out in Task 5 module header and Task 18 Step 7): the world-sized billboard basis is approximated from world-axis projections, which can shear as the camera orbits. Acceptable at v1 because the radial gradient + screen-AA ring read soft; deferred fix flagged for the follow-up.
