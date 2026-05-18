# Cluster / Supercluster / Void Visualization (3/4) — Pick + Camera Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make POI rings clickable so the InfoCard opens for clusters, superclusters, and voids, double-click tweens the camera to a per-category framing distance, empty-space click dismisses the panel, and the URL hash echoes the selected POI for shareability. No member isolation / focus-mode dimming — surrounding galaxies stay at full brightness (that's plan 4).

**Architecture:** The existing pick pass becomes the seam. A new ring-pick WESL fragment renders a filled disk (visible-ring radius + a few padding pixels) into the existing `r32uint` pick texture using the existing `depth24plus` depth attachment, encoded with the same `(sourceCode << 27) | (poiIndex + PICK_SENTINEL_OFFSET)` packing the galaxy path uses. `unpackPick` already returns a `PickResult` discriminated union (plan 1), so `wireInput` adds a `kind === 'cluster' | 'supercluster' | 'void'` branch that dispatches to a new `commitPoiFocus` helper (parallel to the existing `commitFocus`). A new `poiFocusDistanceMpc(category, radiusMpc)` helper provides per-category framing multipliers (cluster 8×, supercluster 2.5×, void 2.5×). React subscribes to a new `onPoiFocusChange(poiId | null)` camera callback to mirror the selection into the InfoCard and the URL hash (`#poi=<id>`), and the existing deep-link drain learns to honour `#poi=<id>` on first paint.

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest, React.

**Prerequisites:**
- `2026-05-18-cluster-viz-1-foundations.md` MUST be merged. Specifically that plan added:
  - `Source.Cluster = 5`, `Source.Supercluster = 6`, `Source.Void = 7` to `src/data/sources.ts` (appended, NOT in `ALL_SOURCES`).
  - `PickResult` discriminated union in `src/data/selectionEncoding.ts` (`{ kind: 'galaxy' | 'cluster' | 'supercluster' | 'void'; ... }`).
  - `physicalRadiusMpc` field on `PointOfInterest` (renamed from `crosshairSizeMpc`).
  - `clusterMembership` pure helper (used by plan 4; not consumed here).
- `2026-05-18-cluster-viz-2-at-rest-viz.md` MUST be merged. Specifically that plan added:
  - `clusterMarkerRenderer.ts` issuing one visual draw per POI category (cluster / supercluster / void), binding the per-category `SourceUniforms`.
  - `ring.wesl` (visible thin circle) + `halo.wesl` (cluster/SC additive billboard).
  - A `produceMarkers()` method on `poiSubsystem` returning per-frame `ClusterMarkerDescriptor` arrays.

**Followed by:** `2026-05-18-cluster-viz-4-focus-mode.md` — adds the `FocusUniforms` block, per-vertex member-vs-non-member alpha shading in `points/vertex.wesl`, void inversion, and the `focusContrast` fade handle. None of that is in this plan.

**Spec reference:** `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md` — especially §3.1 (gestures), §5 (camera integration), §6 (pickability), and §7.1/§7.2 (file inventory).

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass. Manual smoke test on `http://localhost:5173` confirms: single-click Virgo ring opens InfoCard with Virgo info; double-click Virgo ring tweens the camera so Virgo fills the centre of the screen; single-click Boötes Void ring opens InfoCard with void info; click empty sky dismisses the InfoCard; the URL hash flips to `#poi=virgo-m87` on focus and clears on dismiss; pasting `https://localhost:5173/#poi=virgo-m87` into a fresh tab tweens the camera to Virgo once data finishes loading; famous-galaxy single-click behaviour is unchanged.

---

## File Structure

**New files (this plan):**
- `src/services/gpu/shaders/clusterMarker/ringPick.wesl` — pick-fragment companion to the existing `ring.wesl`. Discards fragments outside a padded disk, writes `(source.sourceCode << 27) | (poiIndex + PICK_SENTINEL_OFFSET)` into `r32uint`.
- `src/services/engine/camera/poiFocusTween.ts` — pure `poiFocusDistanceMpc(category, radiusMpc)` helper with per-category multipliers + clamps.
- `src/services/engine/helpers/commitPoiFocus.ts` — protocol-kernel parallel to `commitFocus.ts`. Updates the POI subsystem's selection state, fires `onPoiFocusChange`, optionally builds + dispatches a POI tween.
- `tests/services/engine/camera/poiFocusTween.test.ts` — unit tests for the per-category multipliers and clamp behaviour.
- `tests/services/engine/helpers/commitPoiFocus.test.ts` — helper-protocol tests (mock-call recorder matches `commitFocus.test.ts` style).
- `tests/services/engine/subsystems/poiSubsystem.selection.test.ts` — selection-state tests for the new `setSelectedPoi` / `getSelectedPoiId` methods, plus assertion that the selected POI's marker descriptor has bumped alpha.

**Edited files (this plan):**
- `src/services/gpu/renderers/clusterMarkerRenderer.ts` — add a `pickRing(passEncoder, ...)` method (or similar) that issues per-category ring-pick draws into a caller-supplied render pass. The visible-ring renderer stays unchanged; this is purely a new entry point.
- `src/services/gpu/renderers/pickRenderer.ts` — after the existing galaxy pick draws, issue the POI ring-pick draws into the same render pass so they share the `r32uint` colour attachment and `depth24plus` depth attachment.
- `src/services/engine/interaction/clickHandler.ts` — extend the resolver so a POI hit returns a typed `{ kind: 'poi'; poi: PointOfInterest }` result alongside the existing `{ kind: 'clear' }` and `{ kind: 'select'; selection; info }` shapes. Decode via the existing `PickResult` union.
- `src/services/engine/phases/wireInput.ts` — branch on the resolver's POI variant: single-click → `commitPoiFocus(state, cb, poi, { tween: false })`; double-click → `commitPoiFocus(state, cb, poi, { tween: true })`. Empty-space click also clears the POI selection.
- `src/services/engine/subsystems/poiSubsystem.ts` — add `setSelectedPoi(poiId: string | null)` + `getSelectedPoiId()` methods. When a POI is selected, `produceMarkers` returns that POI's descriptor with `ringAlpha` multiplied by 1.5 (capped at 1.0); other POIs unchanged.
- `src/services/engine/engine.ts` — wire `focusOnPoi(poi)` onto the public handle next to `focusOn`. Adds the `onPoiFocusChange(null)` call to the empty-space-click path so the URL hash clears.
- `src/components/InfoCard/InfoCard.tsx` (+ `FullCard.tsx` or a new sibling) — render a POI-flavoured card body when the active info is a POI, reusing the existing card chrome (`<details>` wrapper stays stable across renders — see the React `<details>` collapse-on-hover bug noted in CLAUDE.md).
- `src/App.tsx` (or wherever the engine handle is constructed) — subscribe to `onPoiFocusChange`, mirror the selected POI into React state so the InfoCard renders, and call `useFocusUrlSync`'s POI hook (or a new `usePoiUrlSync` if the existing hook can't be extended cleanly — see Task 12 for the choice).
- `src/services/url/focusUrl.ts` (or new sibling `poiUrl.ts`) — parse/build the `#poi=<id>` hash body.
- `src/hooks/useFocusUrlSync.ts` (or new `usePoiUrlSync.ts`) — write `#poi=<id>` on focus, clear on dismiss, parse on mount + popstate, dispatch `engine.camera.focusOnPoi(poi)` from the drain when the POI table has loaded.
- `src/@types/engine/EngineCallbacks.d.ts` — add `onPoiFocusChange?: (poiId: string | null) => void` to `EngineCameraCallbacks`.
- `src/@types/engine/handles/EngineCameraHandle.d.ts` — add `focusOnPoi: (poi: PointOfInterest) => void`.
- `src/@types/engine/ClickResolution.d.ts` (or wherever the resolver's return type lives) — add a `{ kind: 'poi'; poi: PointOfInterest }` variant.

**Files explicitly NOT touched in this plan:**
- `src/services/gpu/shaders/points/vertex.wesl` — `FocusUniforms` integration is plan 4.
- `src/services/engine/subsystems/clusterFocusSubsystem.ts` — does not exist yet; plan 4 creates it.
- `src/utils/cluster/clusterMembership.ts` — exists from plan 1; not called here. Member isolation is plan 4.
- `src/services/gpu/renderers/pointRenderer.ts` — only changes if `FocusUniforms` is added; plan 4.

---

## Phase 1: Pick fragment + pick pass integration

### Task 1: `ringPick.wesl` — pick fragment for POI rings

**Files:**
- Create: `src/services/gpu/shaders/clusterMarker/ringPick.wesl`

**Pre-edit reading:**
1. `src/services/gpu/shaders/points/pickFragment.wesl` — canonical reference for the `vec4<u32>` write and the `PICK_SENTINEL_OFFSET` import path.
2. `src/services/gpu/shaders/lib/sourceUniforms.wesl` — the `SourceUniforms` struct (the per-category `sourceCode` lives here).
3. `src/services/gpu/shaders/lib/selectionEncoding.wesl` — the literal constant import path (`package::lib::selectionEncoding::PICK_SENTINEL_OFFSET`).
4. `src/services/gpu/shaders/clusterMarker/ring.wesl` (created in plan 2) — the canonical vertex stage this pick fragment will be paired with. Read its `@vertex fn vs` signature and the `VSOut` it produces so the pick fragment's `in: VSOut` matches byte-for-byte.

**WESL conventions reminder (load-bearing):**
- Use `import package::path::Symbol` syntax in the shader. Never relative WESL paths — the wesl-plugin linker resolves the literal `package::` prefix.
- `@group(N) @binding(M)` declarations are module-local. This file MUST re-declare any binding it reads (e.g. `@group(2) @binding(0) var<uniform> source: SourceUniforms`) using the struct imported from `lib/sourceUniforms.wesl`. Do NOT try to import the binding declaration itself; import only the struct type.
- On the TS side, use `import ringPickCode from './ringPick.wesl?static';` (the `?static` query is what the wesl-plugin's Vite linker keys off).
- Never share `GPUShaderModule` instances across pipelines. Each pipeline compiles its own module from the same source string.

- [ ] **Step 1: Write the failing parity test**

This test asserts the WESL constant matches the TS constant — same pattern as the existing `tests/data/selectionEncoding.test.ts` parity check. Add to that test file (or create a sibling `tests/services/gpu/shaders/clusterMarker/ringPick.test.ts` if you prefer a separate spec).

```ts
import { describe, it, expect } from 'vitest';
import ringPickCode from '../../../../src/services/gpu/shaders/clusterMarker/ringPick.wesl?raw';
import { PICK_SENTINEL_OFFSET } from '../../../../src/data/selectionEncoding';

describe('ringPick.wesl', () => {
  it('imports PICK_SENTINEL_OFFSET from the canonical lib path', () => {
    // We assert the IMPORT line is present rather than re-asserting the
    // literal value: the lib's selectionEncoding.wesl is the authority,
    // and a separate parity test (selectionEncoding.test.ts) already
    // asserts the lib constant matches the TS constant. So if this
    // shader imports from the lib, it's guaranteed correct.
    expect(ringPickCode).toContain(
      'import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET',
    );
    // Sanity: the TS constant is the value we expect downstream readers
    // to subtract. If this ever changes, both this shader and the lib
    // will need to update in lock-step.
    expect(PICK_SENTINEL_OFFSET).toBe(1);
  });

  it('declares the SourceUniforms binding at @group(2) @binding(0)', () => {
    expect(ringPickCode).toMatch(
      /@group\(2\)\s+@binding\(0\)\s+var<uniform>\s+source\s*:\s*SourceUniforms/,
    );
  });

  it('emits the canonical pick packing in the fragment body', () => {
    // (source.sourceCode << 27u) | (poiIndex + PICK_SENTINEL_OFFSET)
    expect(ringPickCode).toContain('source.sourceCode << 27u');
    expect(ringPickCode).toContain('PICK_SENTINEL_OFFSET');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ringPick`
Expected: FAIL — `ringPick.wesl` doesn't exist yet, so the `?raw` import resolves to nothing or throws a module-not-found error.

- [ ] **Step 3: Write `ringPick.wesl`**

Create the file with the literal contents below. The vertex stage is imported from the sibling visible-ring shader (plan 2's `ring.wesl`) — both pipelines share one vertex stage textually but compile their own `GPUShaderModule` per pipeline (see CLAUDE.md's WebGPU `layout:'auto'` trap).

```wesl
// clusterMarker/ringPick.wesl — offscreen r32uint picking fragment for
// cluster / supercluster / void POI rings.
//
// Sister to clusterMarker/ring.wesl (the visible-ring fragment). Both
// consume the same VSOut produced by the shared vertex stage; this one
// writes the packed POI identity into the pick texture instead of the
// visible-ring colour.
//
// ## Why a separate pick fragment
//
// Same rationale as points/pickFragment.wesl: a single shader module
// servicing both the visual and pick paths textually couples the two
// pipelines. Each renderer compiles its own GPUShaderModule from the
// source it actually needs, which structurally sidesteps the WebGPU
// 'auto' bind-group-layout trap and keeps the compile graph small.
//
// ## Hit-target shape: filled padded disk, not the visible ring
//
// The visible ring is ~2-3 px thick. Asking the user to click that
// precise band is hostile. Instead the pick fragment renders a FILLED
// disk at the ring's radius plus PICK_PADDING_PX (matches the galaxy
// path's PICK_PADDING_PX in pickRenderer.ts — see that constant's
// doc for the empirical 4-px rationale). Inside the disk: write the
// packed identity. Outside: discard.
//
// Why discard rather than write 0: the pick texture is cleared to 0
// before the pass, and 0 is the 'no hit' sentinel. Writing 0 from a
// fragment shader and depth-test passing is indistinguishable from the
// clear — so it's safer to discard and let the next-back fragment
// (which may be a galaxy behind the ring) get its chance at the pixel.
//
// ## Pick encoding
//
// Same '(sourceCode << 27) | (poiIndex + PICK_SENTINEL_OFFSET)' packing
// the galaxy path uses. The per-category SourceUniforms block carries
// the source code (5/6/7 for cluster/supercluster/void — see sources.ts).
// 'poiIndex' is the @builtin(instance_index) of this draw, which maps
// directly into the per-category POI array the renderer was handed.

import package::clusterMarker::ring::VSOut;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;

// Re-declare the per-source binding here so this module is self-
// contained. The same layout numbers are declared in clusterMarker/
// ring.wesl (the visible-ring path); WGSL is fine with multiple files
// declaring the same binding so long as the layout matches, and the
// SourceUniforms struct is imported from the single lib authoritative
// source so the byte layout cannot drift across modules.
@group(2) @binding(0) var<uniform> source: SourceUniforms;

// Match the galaxy pick path's empirical 4 px padding around the
// visible disk. The vertex stage emits a quad sized to (ringRadiusPx +
// PICK_PADDING_PX) on all four sides; here we discard anything outside
// that padded radius. Keep this constant in sync with PICK_PADDING_PX
// in src/services/gpu/renderers/pickRenderer.ts — the empirical
// 'comfortable mouse target' value is the same for both paths.
const PICK_PADDING_PX: f32 = 4.0;

@fragment
fn fsRingPick(in: VSOut) -> @location(0) vec4<u32> {
  // 'in.uv' is in [-1, +1]^2 over the padded quad. r2 = squared
  // distance from the quad centre in that normalised space. The padded
  // disk fills the quad, so r2 > 1.0 means we're outside the padded
  // hit area — discard.
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }

  // 'in.poiIndex' was assembled in the vertex stage as
  // 'u32(@builtin(instance_index))'. The shared VSOut carries it so
  // both the visible-ring fragment (which doesn't use it) and this
  // pick fragment can read from one interpolant set.
  let packed: u32 = (source.sourceCode << 27u) | (in.poiIndex + PICK_SENTINEL_OFFSET);
  return vec4<u32>(packed, 0u, 0u, 0u);
}
```

- [ ] **Step 4: Confirm `clusterMarker/ring.wesl` exposes `VSOut` and `poiIndex`**

The pick fragment imports `VSOut` from `package::clusterMarker::ring::VSOut`. If plan 2's `ring.wesl` doesn't already export a struct with that exact name and a `poiIndex: u32` member (flat-interpolated for the same reason `points/io.wesl` flat-interpolates `instanceIdx`), this Task needs a corresponding edit to `ring.wesl`:

```wesl
// In src/services/gpu/shaders/clusterMarker/ring.wesl, ensure VSOut has:
struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  // ... whatever the visible-ring path needs ...
  // Pick path needs the per-instance POI index, flat-interpolated
  // because integers can't be linearly interpolated and all 6 vertices
  // of one quad share the same value.
  @location(7) @interpolate(flat) poiIndex: u32,
};
```

And the `@vertex fn vs` body must populate it as `out.poiIndex = u32(in.instanceIdx);` (or wherever the vertex stage reads `@builtin(instance_index)`).

If plan 2's `ring.wesl` already has this, no edit needed — the pick fragment just imports the existing struct.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- ringPick`
Expected: PASS — all three assertions match.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/shaders/clusterMarker/ringPick.wesl tests/services/gpu/shaders/clusterMarker/ringPick.test.ts
# Also add any ring.wesl tweak required by Step 4.
git commit -m "feat(cluster-viz): ringPick.wesl pick fragment for POI rings

Adds the offscreen r32uint pick fragment for cluster/supercluster/void
POI rings. Renders a padded filled disk (visible-ring radius + 4 px)
into the pick texture, encoded with the canonical
(sourceCode << 27) | (poiIndex + PICK_SENTINEL_OFFSET) packing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: `clusterMarkerRenderer` — add `pickRing` draw entry point

**Files:**
- Modify: `src/services/gpu/renderers/clusterMarkerRenderer.ts` (created in plan 2)

**Pre-edit reading:**
1. `src/services/gpu/renderers/clusterMarkerRenderer.ts` — the renderer created by plan 2. Read its module header + the visible-ring draw entry to understand how it issues per-category draws (one per cluster / supercluster / void).
2. `src/services/gpu/renderers/pickRenderer.ts` lines 138-277 — the pattern for building a separate pipeline that reuses the same vertex source + same `SourceUniforms` bind-group layout but writes `r32uint` + uses `depth24plus`. The new pick pipeline inside `clusterMarkerRenderer` mirrors this.

- [ ] **Step 1: Write the failing test**

Create `tests/services/gpu/renderers/clusterMarkerRenderer.pick.test.ts`. The renderer's GPU side can't be unit-tested without a device; instead assert the public API has the new method.

```ts
import { describe, it, expect } from 'vitest';
import type { ClusterMarkerRenderer } from '../../../../src/@types/rendering/ClusterMarkerRenderer';

describe('ClusterMarkerRenderer pick API', () => {
  it('declares a pickRing method on the type', () => {
    // Type-only assertion: if the type doesn't have the method, this
    // file won't compile. The runtime expect() is just a hook for
    // vitest to report a pass.
    const _stub: Partial<ClusterMarkerRenderer> = {
      pickRing: (() => {}) as ClusterMarkerRenderer['pickRing'],
    };
    expect(_stub.pickRing).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- clusterMarkerRenderer.pick`
Expected: FAIL — `ClusterMarkerRenderer` type does not have `pickRing` yet.

- [ ] **Step 3: Extend the `ClusterMarkerRenderer` type**

Edit `src/@types/rendering/ClusterMarkerRenderer.d.ts` (created in plan 2). Add the new method:

```ts
import type { Source } from '../../data/sources';
import type { PickSourceDraw } from './PickSourceDraw';

export type ClusterMarkerRenderer = {
  readonly label: 'clusterMarkerRenderer';
  // ... existing fields from plan 2 (e.g. draw(), destroy()) ...

  /**
   * Issue one draw per POI category (cluster / supercluster / void)
   * into the caller-supplied render pass, using the ring-pick pipeline
   * + the per-category SourceUniforms bind group. The caller is
   * responsible for setting up the colour attachment (r32uint pick
   * texture), the depth attachment (depth24plus), and calling
   * passEncoder.end() afterwards. This method does NOT call
   * setBindGroup(0) (the per-frame uniforms) — the caller binds that
   * once before invoking pickRing because the same @group(0) is shared
   * with the galaxy pick draws that already ran.
   *
   * Why a method on the renderer rather than a free function: the
   * renderer owns the pipeline, the per-category SourceUniforms
   * buffers, and the per-category vertex / instance buffers. Passing
   * those out to a free function would widen the renderer's public
   * surface for one consumer.
   */
  readonly pickRing: (passEncoder: GPURenderPassEncoder) => void;
};
```

- [ ] **Step 4: Implement `pickRing` in `clusterMarkerRenderer.ts`**

Inside the renderer factory, add a new pipeline + per-category bind groups that mirror the visible-ring path but target `r32uint`. The pipeline layout MUST be EXPLICIT (not `'auto'`) and MUST share the `@group(0)` (per-frame camera uniforms) + `@group(2)` (per-category `SourceUniforms`) bind-group layouts with whatever `pickRenderer` and the visible-ring renderer use, so the caller's pre-bound `@group(0)` survives across the draw boundary. The `@group(1)` slot is `FadeUniforms` in the points pipeline — POI rings have no per-survey fade, so bind a dummy zeroed `FadeUniforms` buffer (mirror of the dummy fade buffer pattern in `pickRenderer.ts` lines 188-198).

```ts
// Add near the top of the file:
import ringPickCode from '../shaders/clusterMarker/ringPick.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// Inside the factory, after the visible-ring pipeline is built:

// Pick pipeline for POI rings. Shares the vertex shader textually with
// the visible-ring path but compiles its OWN GPUShaderModule (never
// share modules across pipelines — see the auto-layout trap doc in
// pickRenderer.ts).
const ringPickVsModule = createShaderModuleWithDevLog(
  device,
  ringVsCode, // imported from clusterMarker/ring.wesl?static — same source as visible-ring pipeline
  'clusterMarker.pick.vs',
);
const ringPickFsModule = createShaderModuleWithDevLog(
  device,
  ringPickCode,
  'clusterMarker.pick.fs',
);

const ringPickPipelineLayout = device.createPipelineLayout({
  label: 'clusterMarker-ring-pick-pipeline-layout',
  bindGroupLayouts: [
    cameraBgl, // @group(0) — shared canonical CameraUniforms layout
    fadeBgl,   // @group(1) — shared canonical FadeUniforms (dummy here)
    sourceBgl, // @group(2) — shared canonical SourceUniforms (per-category)
  ],
});

const ringPickPipeline = device.createRenderPipeline({
  label: 'clusterMarker-ring-pick-pipeline',
  layout: ringPickPipelineLayout,
  vertex: {
    module: ringPickVsModule,
    entryPoint: 'vs', // same entry as visible-ring vertex stage
    buffers: [{ arrayStride: RING_STRIDE, stepMode: 'instance', attributes: [...RING_ATTRIBUTES] }],
  },
  fragment: {
    module: ringPickFsModule,
    entryPoint: 'fsRingPick',
    targets: [{ format: 'r32uint' }],
  },
  primitive: { topology: 'triangle-list' },
  depthStencil: {
    format: 'depth24plus',
    // Same depth contract the galaxy pick path uses: front-most wins
    // per pixel. A galaxy in front of a POI ring claims the pixel.
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});

// Per-category dummy fade bind group (zeroed FadeUniforms; the pick
// fragment doesn't read fade.opacity — output is integer pixels into
// the pick texture).
const dummyFadeBuffer = device.createBuffer({
  label: 'clusterMarker-pick-fade-dummy',
  size: 16,
  usage: GPUBufferUsage.UNIFORM,
});
const dummyFadeBindGroup = device.createBindGroup({
  label: 'clusterMarker-pick-fade-bg-dummy',
  layout: fadeBgl,
  entries: [{ binding: 0, resource: { buffer: dummyFadeBuffer } }],
});

function pickRing(passEncoder: GPURenderPassEncoder): void {
  passEncoder.setPipeline(ringPickPipeline);
  passEncoder.setBindGroup(1, dummyFadeBindGroup);
  // Caller bound @group(0) before invoking us — see the type docstring
  // on pickRing for the contract.
  for (const category of ['cluster', 'supercluster', 'void'] as const) {
    const draw = perCategoryDraws.get(category);
    if (!draw || draw.count === 0) continue;
    passEncoder.setBindGroup(2, draw.sourceBindGroup);
    passEncoder.setVertexBuffer(0, draw.vertexBuffer);
    // 6 verts per quad (the padded disk billboard); 'draw.count' is
    // the number of POIs in this category.
    passEncoder.draw(6, draw.count);
  }
}

// Add to the returned object:
const renderer: ClusterMarkerRenderer = {
  // ... existing fields ...
  pickRing,
};
```

(Exact identifiers — `cameraBgl`, `fadeBgl`, `sourceBgl`, `RING_STRIDE`, `RING_ATTRIBUTES`, `perCategoryDraws` — are whatever plan 2's implementation chose. Match the existing names verbatim; if any are missing because plan 2 took a different shape, adapt the closest analogue.)

Also add `dummyFadeBuffer.destroy();` to the renderer's existing `destroy()` so the GPU buffer is released on teardown.

- [ ] **Step 5: Run the test + typecheck**

```bash
npm test -- clusterMarkerRenderer.pick
npm run typecheck
```
Expected: PASS for the test; clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/renderers/clusterMarkerRenderer.ts \
        src/@types/rendering/ClusterMarkerRenderer.d.ts \
        tests/services/gpu/renderers/clusterMarkerRenderer.pick.test.ts
git commit -m "feat(cluster-viz): clusterMarkerRenderer.pickRing draw entry

Adds a pick pipeline + per-category draw method on clusterMarkerRenderer
that the engine's pickRenderer will invoke after the galaxy pick draws.
Shares the visible-ring vertex stage textually; compiles its own
GPUShaderModule per pipeline (auto-layout trap).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: `pickRenderer` — invoke `pickRing` after the galaxy pick pass

**Files:**
- Modify: `src/services/gpu/renderers/pickRenderer.ts` (lines around 537-551 — the per-source draw loop inside the existing render pass).
- Modify: `src/services/engine/phases/wireInput.ts` (lines around 115 — the `createPickRenderer` call gets a new argument for the cluster marker renderer).
- Modify: `src/@types/rendering/PickRenderer.d.ts` (if a type signature change is needed for the new constructor arg).

**Pre-edit reading:**
1. `src/services/gpu/renderers/pickRenderer.ts` lines 466-551 — the single-encoder, single-submit pick pass body. Understand how the per-source loop iterates and where to insert the POI ring draws.
2. The new `clusterMarkerRenderer.pickRing` method from Task 2.

- [ ] **Step 1: Write the failing test**

The pick renderer's GPU side is hard to test without a device; instead extend the existing pickRenderer test suite (or create one if absent) with a constructor-signature assertion. If no existing tests, create `tests/services/gpu/renderers/pickRenderer.poi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';

describe('createPickRenderer POI integration', () => {
  it('accepts an optional clusterMarkerRenderer argument', () => {
    // Type-only test: if the signature drifts, the assignment below
    // will not compile.
    type ExpectedSig = Parameters<typeof createPickRenderer>;
    // The expected signature is (device, pointRenderer, fadeBgl,
    // sourceBgl, clusterMarkerRenderer?). The 5th positional is the
    // new POI-aware draw provider.
    const _check = (...args: ExpectedSig): void => {
      const fifth: ExpectedSig[4] = args[4];
      // The fifth arg must be optional (`?`) — a value with the right
      // shape OR undefined. Assigning undefined here will compile only
      // if the parameter is optional.
      const _undef: typeof fifth = undefined;
      void _undef;
    };
    expect(_check).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- pickRenderer.poi`
Expected: FAIL — `createPickRenderer` does not have a 5th parameter yet.

- [ ] **Step 3: Extend `createPickRenderer`'s signature**

Edit `src/services/gpu/renderers/pickRenderer.ts`:

```ts
import type { ClusterMarkerRenderer } from '../../../@types/rendering/ClusterMarkerRenderer';

export function createPickRenderer(
  device: GPUDevice,
  pointRenderer: PointRenderer,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
  // NEW: optional because the bootstrap may construct the pickRenderer
  // before the clusterMarkerRenderer is ready (or, in tests, may omit
  // the POI path entirely). When undefined, the POI pick pass is
  // skipped — galaxy picks still work.
  clusterMarkerRenderer?: ClusterMarkerRenderer,
): PickRenderer {
  // ... existing body ...
}
```

- [ ] **Step 4: Invoke `pickRing` inside the render pass**

Inside `pick()`, after the existing per-source galaxy draw loop (around line 550) and BEFORE `pass.end()`:

```ts
// Per-source galaxy pick draws (existing — unchanged).
for (const src of sourceList) {
  // ... existing body ...
}

// POI ring pick pass. Runs AFTER the galaxy draws so the depth test
// ('less') lets a galaxy in front of the ring claim the pixel — that
// matches the user's natural expectation: clicking through a ring at
// a foreground galaxy selects the galaxy, not the ring behind it.
//
// The clusterMarkerRenderer is optional at construction time (e.g.
// the bootstrap may build pickRenderer before the clusterMarker
// pipeline is ready). When absent, only the galaxy pick path runs;
// callers see PickResult.kind === 'galaxy' or null.
if (clusterMarkerRenderer) {
  clusterMarkerRenderer.pickRing(pass);
}

pass.end();
```

- [ ] **Step 5: Wire the new argument in `wireInput.ts`**

Edit `src/services/engine/phases/wireInput.ts` around line 115. The `clusterMarkerRenderer` should be on `state.gpu` after plan 2's bootstrap edits.

```ts
const pickRenderer = createPickRenderer(
  deps.phaseLocals!.device,
  renderer,
  state.gpu.fadeBgl!,
  state.gpu.sourceBgl!,
  state.gpu.clusterMarkerRenderer, // may be undefined if plan 2 chose lazy init
);
state.gpu.pickRenderer = pickRenderer;
```

- [ ] **Step 6: Run the test + typecheck**

```bash
npm test -- pickRenderer.poi
npm run typecheck
```
Expected: PASS + clean.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/renderers/pickRenderer.ts \
        src/services/engine/phases/wireInput.ts \
        tests/services/gpu/renderers/pickRenderer.poi.test.ts
git commit -m "feat(cluster-viz): wire POI ring pick pass into pickRenderer

After the galaxy pick draws, pickRenderer now invokes
clusterMarkerRenderer.pickRing into the same render pass so POI hits
land in the same r32uint texture. Depth test order (less) means a
foreground galaxy still wins the pixel — clicks through ring at galaxy
go to the galaxy, not the ring.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2: Camera framing helper

### Task 4: `poiFocusDistanceMpc` — per-category framing multipliers

**Files:**
- Create: `src/services/engine/camera/poiFocusTween.ts`
- Create: `tests/services/engine/camera/poiFocusTween.test.ts`

**Pre-edit reading:**
1. `src/services/engine/camera/focusTween.ts` — the galaxy version. Note the `MIN_FOCUS_DISTANCE_MPC = 0.15` clamp pattern and the `FALLBACK_DIAMETER_KPC` fallback for invalid input. Mirror the docstring style.
2. Spec §5.3 — the per-category multiplier table (cluster 8×, supercluster 2.5×, void 2.5×) and the rationale (8× a 50 Mpc supercluster radius would frame from 800 Mpc out, past the edge of the visible volume).

- [ ] **Step 1: Write the failing tests**

Create `tests/services/engine/camera/poiFocusTween.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { poiFocusDistanceMpc } from '../../../../src/services/engine/camera/poiFocusTween';

describe('poiFocusDistanceMpc', () => {
  it('frames a cluster at 8x its radius', () => {
    // Virgo: ~2 Mpc radius → 16 Mpc framing.
    expect(poiFocusDistanceMpc('cluster', 2)).toBe(16);
  });

  it('frames a supercluster at 2.5x its radius', () => {
    // Hercules SC: ~50 Mpc radius → 125 Mpc framing.
    expect(poiFocusDistanceMpc('supercluster', 50)).toBe(125);
  });

  it('frames a void at 2.5x its radius', () => {
    // Boötes Void: ~50 Mpc radius → 125 Mpc framing.
    expect(poiFocusDistanceMpc('void', 50)).toBe(125);
  });

  it('clamps tiny POIs up to the 1 Mpc minimum', () => {
    // A 0.05 Mpc cluster × 8 = 0.4 Mpc → clamp up to 1 Mpc so the
    // camera doesn't end up inside the halo.
    expect(poiFocusDistanceMpc('cluster', 0.05)).toBe(1);
  });

  it('clamps huge POIs down to the 800 Mpc maximum', () => {
    // A 500 Mpc supercluster × 2.5 = 1250 Mpc → clamp down to 800
    // Mpc so the framing stays inside the visible volume.
    expect(poiFocusDistanceMpc('supercluster', 500)).toBe(800);
  });

  it('treats non-finite radius as zero (then clamps to 1 Mpc minimum)', () => {
    // Defensive: a POI with NaN / Infinity radius should not produce a
    // NaN framing distance.  Same fallback shape as
    // focusDistanceMpc(undefined) → MIN_FOCUS_DISTANCE_MPC.
    expect(poiFocusDistanceMpc('cluster', Number.NaN)).toBe(1);
    expect(poiFocusDistanceMpc('cluster', Number.POSITIVE_INFINITY)).toBe(800);
    expect(poiFocusDistanceMpc('cluster', -1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- poiFocusTween`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `src/services/engine/camera/poiFocusTween.ts`:

```ts
/**
 * poiFocusTween — per-category framing-distance helper for POI focus
 * camera tweens.
 *
 * ### Why a separate helper from focusTween.ts
 *
 * The galaxy `focusDistanceMpc(diameterKpc)` uses a flat 8× multiplier
 * on the galaxy diameter — appropriate for objects whose physical size
 * is measured in kpc.  Applying the same 8× to a supercluster with a
 * 50 Mpc radius (100 Mpc diameter) would frame the camera 800 Mpc out
 * — past the edge of the visible volume, and a useless final position
 * because the structure would project to a few pixels.
 *
 * Per-category multipliers reflect that the user wants different
 * framings:
 *   - A cluster (~Mpc radius) at 8× shows the whole halo with comfort
 *     margin and a generous slice of the surrounding member field.
 *   - A supercluster (~10s of Mpc radius) at 2.5× fills the screen
 *     with the structure itself — the user is already at galaxy-cluster
 *     scale; pushing further out hands the screen back to anonymous
 *     background.
 *   - A void at 2.5× matches the supercluster framing — voids and
 *     superclusters are roughly the same scale, and the goal is the
 *     same: the structure fills the screen.
 *
 * Famous galaxies are NOT a category here.  They route through the
 * galaxy `focusOn` / `selectFamous` chain, which uses
 * `focusDistanceMpc(diameterKpc)` directly — see `selectFamous` in
 * engine.ts.
 *
 * ### Why we didn't extend `focusDistanceMpc` with an optional multiplier
 *
 * Considered briefly (spec §5.3 Option A): widen the galaxy helper to
 * accept a multiplier override.  Rejected because it would give a
 * single-purpose function a second responsibility (POI category
 * dispatch) that belongs to a different domain.  A dedicated helper
 * keeps both call surfaces narrow + audited — and makes the per-
 * category constants discoverable in one file.
 *
 * ### Clamp rationale
 *
 * - **Minimum 1 Mpc**: avoids burying the camera inside an unusually
 *   small POI.  The visible volume's near plane is ~0.01 Mpc, so 1
 *   Mpc still gives the user plenty of foreground context.
 * - **Maximum 800 Mpc**: the visible volume comfortably extends past
 *   1 Gpc, but framing further than 800 Mpc out makes most structures
 *   project to tens of pixels — the user reads it as "I didn't move"
 *   rather than "I'm framing this thing".  Clamps the framing of a
 *   freakishly-large structure to something visually useful.
 */

import type { PoiCategory } from '../subsystems/poiSubsystem';

// Per-category framing multipliers.  See module header for rationale.
// Famous galaxies are not in this table — they take the galaxy path
// via focusDistanceMpc(diameterKpc).
const CATEGORY_MULTIPLIER: Readonly<Record<Exclude<PoiCategory, 'famousGalaxy'>, number>> = {
  cluster: 8,
  supercluster: 2.5,
  void: 2.5,
};

const MIN_FRAMING_DISTANCE_MPC = 1;
const MAX_FRAMING_DISTANCE_MPC = 800;

/**
 * Compute the camera-target distance (Mpc) for a tween toward a POI of
 * the given category + physical radius.  Clamped to
 * [MIN_FRAMING_DISTANCE_MPC, MAX_FRAMING_DISTANCE_MPC].
 *
 * Non-finite or non-positive `physicalRadiusMpc` is treated as zero (so
 * the result clamps to the minimum) for `cluster` / `supercluster` /
 * `void`.  Positive infinity clamps to the maximum.
 *
 * Throws `TypeError` for `'famousGalaxy'` — that category routes
 * through the galaxy `focusDistanceMpc` path, not this helper.  Throwing
 * (rather than silently returning a fallback) makes a wrong-path call
 * surface immediately instead of producing a confusing framing.
 */
export function poiFocusDistanceMpc(
  category: PoiCategory,
  physicalRadiusMpc: number,
): number {
  if (category === 'famousGalaxy') {
    throw new TypeError(
      'poiFocusDistanceMpc: famousGalaxy POIs use the galaxy focusDistanceMpc path',
    );
  }
  const multiplier = CATEGORY_MULTIPLIER[category];
  // Treat NaN / negative as 0 so the clamp does the right thing.
  // Positive infinity passes through and hits the upper clamp.
  const safeRadius =
    Number.isFinite(physicalRadiusMpc) && physicalRadiusMpc > 0
      ? physicalRadiusMpc
      : physicalRadiusMpc === Number.POSITIVE_INFINITY
      ? physicalRadiusMpc
      : 0;
  const raw = multiplier * safeRadius;
  return Math.min(Math.max(raw, MIN_FRAMING_DISTANCE_MPC), MAX_FRAMING_DISTANCE_MPC);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- poiFocusTween`
Expected: PASS all six assertions.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/camera/poiFocusTween.ts \
        tests/services/engine/camera/poiFocusTween.test.ts
git commit -m "feat(cluster-viz): poiFocusDistanceMpc per-category framing helper

Per-category multipliers (cluster 8x, supercluster 2.5x, void 2.5x)
with [1 Mpc, 800 Mpc] clamps. Famous galaxies are explicitly excluded
(they take the galaxy focusDistanceMpc path).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3: POI subsystem selection state

### Task 5: `poiSubsystem` — `setSelectedPoi` + `getSelectedPoiId` + alpha bump

**Files:**
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `src/@types/engine/subsystems/PoiSubsystem.d.ts`
- Create: `tests/services/engine/subsystems/poiSubsystem.selection.test.ts`

**Pre-edit reading:**
1. `src/services/engine/subsystems/poiSubsystem.ts` — the current factory + module header. The existing pattern uses module-scoped `pois` and `visibility` variables inside the factory; the new selection state follows the same idiom.
2. Plan 2's `produceMarkers` implementation. The new selection state needs to compose with whatever `ringAlpha` field plan 2 added to `ClusterMarkerDescriptor`. If plan 2's descriptor uses a different field name, substitute it.

- [ ] **Step 1: Write the failing tests**

Create `tests/services/engine/subsystems/poiSubsystem.selection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  physicalRadiusMpc: 2,
};

const hercules: PointOfInterest = {
  id: 'hercules-sc',
  name: 'Hercules Supercluster',
  category: 'supercluster',
  worldPos: [50, 0, 0],
  physicalRadiusMpc: 50,
};

describe('poiSubsystem selection', () => {
  it('starts with no POI selected', () => {
    const s = createPoiSubsystem();
    expect(s.getSelectedPoiId()).toBeNull();
  });

  it('records a selected POI id', () => {
    const s = createPoiSubsystem();
    s.setPois([virgo, hercules]);
    s.setSelectedPoi('virgo-m87');
    expect(s.getSelectedPoiId()).toBe('virgo-m87');
  });

  it('clears selection when passed null', () => {
    const s = createPoiSubsystem();
    s.setPois([virgo]);
    s.setSelectedPoi('virgo-m87');
    s.setSelectedPoi(null);
    expect(s.getSelectedPoiId()).toBeNull();
  });

  it('bumps ringAlpha by 1.5x on the selected POIs marker descriptor, capped at 1.0', () => {
    const s = createPoiSubsystem();
    s.setPois([virgo, hercules]);
    s.setSelectedPoi('virgo-m87');
    const markers = s.produceMarkers(/* ctx — supply whatever produceMarkers takes */);
    const virgoMarker = markers.find((m) => m.id === 'virgo-m87');
    const herculesMarker = markers.find((m) => m.id === 'hercules-sc');
    expect(virgoMarker).toBeDefined();
    expect(herculesMarker).toBeDefined();
    // Virgo's base ringAlpha is whatever plan 2 set (assume 0.5 here
    // for the assertion to be portable — adjust the literal when this
    // test runs against the real plan-2 code).
    const baseVirgo = 0.5; // replace with plan-2's actual default
    const baseHercules = 0.5;
    expect(virgoMarker!.ringAlpha).toBeCloseTo(Math.min(1, baseVirgo * 1.5));
    expect(herculesMarker!.ringAlpha).toBeCloseTo(baseHercules);
  });

  it('does not change ringAlpha when no POI is selected', () => {
    const s = createPoiSubsystem();
    s.setPois([virgo]);
    const markers = s.produceMarkers(/* ctx */);
    const virgoMarker = markers.find((m) => m.id === 'virgo-m87');
    expect(virgoMarker!.ringAlpha).toBeCloseTo(0.5); // plan-2 default
  });
});
```

NOTE for the implementer: the `produceMarkers(ctx)` signature and the default `ringAlpha` value depend on plan 2's exact choices. When running this test against the real plan-2 code, replace the `/* ctx */` placeholder with the right context object (likely a `ReadyFrameContext` mock) and update the `baseVirgo` literal to match the real default. The structural assertions (selection round-trip, 1.5× multiplier, cap at 1.0, other POIs unchanged) stand regardless of those literals.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- poiSubsystem.selection`
Expected: FAIL — `setSelectedPoi` / `getSelectedPoiId` don't exist.

- [ ] **Step 3: Extend the `PoiSubsystem` type**

Edit `src/@types/engine/subsystems/PoiSubsystem.d.ts` (find with `grep -rn "type PoiSubsystem" src/@types/`):

```ts
export type PoiSubsystem = {
  // ... existing fields ...
  /**
   * Mark a POI as selected (for focus mode).  The selected POI's
   * marker descriptor has its `ringAlpha` multiplied by 1.5 (capped at
   * 1.0) so the user can visually distinguish the focused POI from
   * its neighbours; other POIs are unchanged.  Passing `null` clears
   * the selection.
   *
   * No-op when `poiId` doesn't match any POI currently in the
   * subsystem's table — defensive against deep-link drains that
   * race a tier swap.
   */
  readonly setSelectedPoi: (poiId: string | null) => void;
  /** Returns the currently-selected POI id, or `null` if none. */
  readonly getSelectedPoiId: () => string | null;
};
```

- [ ] **Step 4: Implement in the subsystem factory**

Edit `src/services/engine/subsystems/poiSubsystem.ts`. Add the new state inside the factory (next to the existing `pois` / `visibility` variables):

```ts
let selectedPoiId: string | null = null;

function setSelectedPoi(poiId: string | null): void {
  if (poiId === null) {
    selectedPoiId = null;
    return;
  }
  // Defensive: only accept ids that actually appear in the current
  // POI table.  A deep-link drain firing before the POI table is
  // populated, or after a tier swap that replaced the table, would
  // otherwise leave a stale id stranded.
  const exists = pois.some((p) => p.id === poiId);
  if (!exists) return;
  selectedPoiId = poiId;
}

function getSelectedPoiId(): string | null {
  return selectedPoiId;
}
```

Inside `produceMarkers` (the new method from plan 2), modify the per-POI loop so the selected POI's `ringAlpha` is bumped:

```ts
function produceMarkers(ctx: ReadyFrameContext): readonly ClusterMarkerDescriptor[] {
  const out: ClusterMarkerDescriptor[] = [];
  for (const p of pois) {
    if (!visibility[p.category]) continue;
    // ... existing per-POI descriptor build from plan 2 ...
    let descriptor = buildBaseDescriptor(p, ctx); // whatever plan 2 named it
    if (p.id === selectedPoiId) {
      // Bump the selected POI's ring alpha so it stands out from
      // its neighbours.  Capped at 1.0 so already-full-opacity
      // markers don't overflow.  Tuned constant — 1.5× was chosen
      // empirically as "noticeable but not jarring"; revisit if a
      // settings knob is requested later.
      descriptor = {
        ...descriptor,
        ringAlpha: Math.min(1, descriptor.ringAlpha * 1.5),
      };
    }
    out.push(descriptor);
  }
  return out;
}
```

Add the two new methods to the returned subsystem object:

```ts
const subsystem: PoiSubsystem = {
  // ... existing ...
  setSelectedPoi,
  getSelectedPoiId,
};
```

- [ ] **Step 5: Run the tests + typecheck**

```bash
npm test -- poiSubsystem.selection
npm run typecheck
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/subsystems/poiSubsystem.ts \
        src/@types/engine/subsystems/PoiSubsystem.d.ts \
        tests/services/engine/subsystems/poiSubsystem.selection.test.ts
git commit -m "feat(cluster-viz): poiSubsystem.setSelectedPoi + ringAlpha bump

Adds setSelectedPoi / getSelectedPoiId to track the focused POI. The
selected POI's marker descriptor returns with ringAlpha multiplied by
1.5 (capped at 1.0); other POIs unchanged. No member-isolation /
focus-mode shader edits in this commit — that lands in plan 4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4: commitPoiFocus helper + engine handle

### Task 6: `EngineCallbacks` — add `onPoiFocusChange`

**Files:**
- Modify: `src/@types/engine/EngineCallbacks.d.ts`

- [ ] **Step 1: Write the type-only test**

Create `tests/@types/engine/EngineCallbacks.poi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { EngineCallbacks } from '../../../src/@types/engine/EngineCallbacks';

describe('EngineCallbacks camera.onPoiFocusChange', () => {
  it('accepts a poiId string', () => {
    const cb: EngineCallbacks = {
      lifecycle: { onStatusChange: () => {} },
      selection: { onSelectChange: () => {}, onHoverChange: () => {} },
      camera: { onPoiFocusChange: (poiId: string | null): void => void poiId },
    };
    expect(cb.camera?.onPoiFocusChange).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- EngineCallbacks.poi`
Expected: FAIL — `onPoiFocusChange` is not in the type.

- [ ] **Step 3: Add the callback to the type**

Edit `src/@types/engine/EngineCallbacks.d.ts`. Inside the `camera?: { ... }` block, add:

```ts
    /**
     * Fired when the POI focus target changes — i.e. the user clicked
     * a cluster / supercluster / void ring (or a deep-link drain
     * resolved a `#poi=…` hash).  Passes the POI id on focus, `null`
     * when focus clears (empty-space click, InfoCard close button).
     *
     * Parallel to `onFocusChange` (the galaxy version).  The two
     * callbacks never both fire on the same gesture — clicking a POI
     * clears the galaxy selection, and vice versa — so React's URL-
     * hash hook can route each into its respective hash segment
     * (`#focus=` vs `#poi=`) without cross-talk.
     */
    onPoiFocusChange?: (poiId: string | null) => void;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- EngineCallbacks.poi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/EngineCallbacks.d.ts \
        tests/@types/engine/EngineCallbacks.poi.test.ts
git commit -m "feat(cluster-viz): EngineCallbacks.camera.onPoiFocusChange

Parallel to onFocusChange (galaxy version). Fires when a POI is
selected or cleared so React can mirror the focus into the URL hash
and the InfoCard.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: `EngineCameraHandle.focusOnPoi` type slot

**Files:**
- Modify: `src/@types/engine/handles/EngineCameraHandle.d.ts`

- [ ] **Step 1: Write the type-only test**

Create `tests/@types/engine/EngineCameraHandle.poi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { EngineCameraHandle } from '../../../src/@types/engine/handles/EngineCameraHandle';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';

describe('EngineCameraHandle.focusOnPoi', () => {
  it('exists and accepts a PointOfInterest', () => {
    const _stub: Pick<EngineCameraHandle, 'focusOnPoi'> = {
      focusOnPoi: (poi: PointOfInterest): void => void poi,
    };
    expect(_stub.focusOnPoi).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- EngineCameraHandle.poi`
Expected: FAIL — slot doesn't exist.

- [ ] **Step 3: Add the slot**

Edit `src/@types/engine/handles/EngineCameraHandle.d.ts`:

```ts
import type { GalaxyInfo } from '../GalaxyInfo';
import type { PointOfInterest } from '../subsystems/PointOfInterest';

export type EngineCameraHandle = {
  // ... existing ...
  /**
   * Smoothly tween the camera so the given POI is centred at a per-
   * category framing distance (see `poiFocusDistanceMpc` for the
   * multipliers).  Also opens the InfoCard for the POI via the
   * `onPoiFocusChange` callback.  No-op when `state.cam` isn't ready
   * (pre-bootstrap / post-destroy).
   */
  focusOnPoi: (poi: PointOfInterest) => void;
};
```

- [ ] **Step 4: Run the test + typecheck**

```bash
npm test -- EngineCameraHandle.poi
npm run typecheck
```
Expected: PASS + clean (engine.ts will fail typecheck if it now lacks `focusOnPoi` — Task 9 fixes that).

If the typecheck fails because `engine.ts` doesn't yet implement `focusOnPoi`, that's expected — proceed to Task 8 + 9.

- [ ] **Step 5: Commit (only if typecheck is clean)**

If clean:

```bash
git add src/@types/engine/handles/EngineCameraHandle.d.ts \
        tests/@types/engine/EngineCameraHandle.poi.test.ts
git commit -m "feat(cluster-viz): EngineCameraHandle.focusOnPoi type slot

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

If typecheck failed because engine.ts is missing the implementation, defer the commit until after Task 9.

---

### Task 8: `commitPoiFocus` helper

**Files:**
- Create: `src/services/engine/helpers/commitPoiFocus.ts`
- Create: `tests/services/engine/helpers/commitPoiFocus.test.ts`

**Pre-edit reading:**
1. `src/services/engine/helpers/commitFocus.ts` — the galaxy version. The new helper mirrors its protocol and module-header style.
2. `src/services/engine/camera/tweenToGalaxy.ts` — the galaxy tween payload. We will NOT call `tweenToGalaxy` (it uses `focusDistanceMpc`); instead the new helper builds the `state.subsystems.tweens.start({...})` payload inline so the POI-aware distance flows in via `poiFocusDistanceMpc`.
3. `src/services/engine/camera/poiFocusTween.ts` (from Task 4) — the per-category distance helper.

- [ ] **Step 1: Write the failing tests**

Create `tests/services/engine/helpers/commitPoiFocus.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { commitPoiFocus } from '../../../../src/services/engine/helpers/commitPoiFocus';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  physicalRadiusMpc: 2,
};

function makeMockState(): EngineState {
  return {
    cam: {
      target: new Float32Array([0, 0, 0]),
      distance: 100,
      yaw: 0,
      pitch: 0,
    },
    subsystems: {
      pois: { setSelectedPoi: vi.fn(), getSelectedPoiId: () => null },
      tweens: { start: vi.fn(), cancel: vi.fn() },
      scheduler: { requestRender: vi.fn() },
    },
  } as unknown as EngineState;
}

function makeMockCb(): EngineCallbacks {
  return {
    lifecycle: { onStatusChange: vi.fn() },
    selection: { onSelectChange: vi.fn(), onHoverChange: vi.fn() },
    camera: { onPoiFocusChange: vi.fn() },
  };
}

describe('commitPoiFocus', () => {
  it('calls setSelectedPoi then onPoiFocusChange when tween is false', () => {
    const state = makeMockState();
    const cb = makeMockCb();
    const order: string[] = [];
    (state.subsystems.pois.setSelectedPoi as ReturnType<typeof vi.fn>).mockImplementation(
      () => order.push('setSelectedPoi'),
    );
    (cb.camera!.onPoiFocusChange as ReturnType<typeof vi.fn>).mockImplementation(
      () => order.push('onPoiFocusChange'),
    );

    commitPoiFocus(state, cb, virgo, { tween: false });

    expect(state.subsystems.pois.setSelectedPoi).toHaveBeenCalledWith('virgo-m87');
    expect(cb.camera!.onPoiFocusChange).toHaveBeenCalledWith('virgo-m87');
    expect(state.subsystems.tweens.start).not.toHaveBeenCalled();
    expect(order).toEqual(['setSelectedPoi', 'onPoiFocusChange']);
  });

  it('starts a tween with poiFocusDistanceMpc when tween is true', () => {
    const state = makeMockState();
    const cb = makeMockCb();
    commitPoiFocus(state, cb, virgo, { tween: true });
    expect(state.subsystems.tweens.start).toHaveBeenCalledTimes(1);
    const payload = (state.subsystems.tweens.start as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Virgo: 2 Mpc radius × 8 = 16 Mpc framing distance.
    expect(payload.toDistance).toBe(16);
    // Target is virgo.worldPos.
    expect(Array.from(payload.toTarget)).toEqual([10, 0, 0]);
  });

  it('is a no-op when state.cam is null', () => {
    const state = makeMockState();
    (state as unknown as { cam: unknown }).cam = null;
    const cb = makeMockCb();
    commitPoiFocus(state, cb, virgo, { tween: true });
    // Tween is skipped because cam is null, but the subsystem update
    // and the React callback still fire — selection state can update
    // before the camera is ready, and the deep-link drain depends
    // on that ordering.
    expect(state.subsystems.pois.setSelectedPoi).toHaveBeenCalled();
    expect(cb.camera!.onPoiFocusChange).toHaveBeenCalled();
    expect(state.subsystems.tweens.start).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- commitPoiFocus`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `src/services/engine/helpers/commitPoiFocus.ts`:

```ts
/**
 * commitPoiFocus — the shared "we have decided to focus on this POI"
 * protocol.  Parallel to `commitFocus` (galaxy version).
 *
 * ### Why a separate helper from `commitFocus`
 *
 * Galaxy focus and POI focus share the same shape (update subsystem,
 * fire React callback, optional camera tween) but diverge on every
 * concrete: which subsystem, which callback, which distance helper.
 * One helper that branched on a `kind` flag would couple the two
 * concerns; two parallel helpers keep each call surface narrow.
 *
 * ### Tween: built inline, not via `tweenToGalaxy`
 *
 * `tweenToGalaxy` derives its target distance from
 * `focusDistanceMpc(diameterKpc)` — a galaxy-shaped helper that takes
 * a kpc diameter and uses an 8× multiplier.  POIs don't have a kpc
 * diameter (they have a Mpc radius), and the per-category framing
 * multipliers are different.  Calling `tweenToGalaxy` with a fudged
 * `diameterKpc` would silently produce the wrong framing.
 *
 * Instead we build the `state.subsystems.tweens.start({...})` payload
 * here, mirroring `tweenToGalaxy`'s shape but plugging in
 * `poiFocusDistanceMpc(category, physicalRadiusMpc)` for `toDistance`.
 *
 * ### Why `setSelectedPoi` + `onPoiFocusChange` fire even when cam is null
 *
 * `state.cam` is null pre-bootstrap and post-destroy.  Skipping the
 * subsystem update + React callback in those windows would strand a
 * deep-link drain (`useFocusUrlSync` parses `#poi=…` and calls
 * `engine.camera.focusOnPoi(poi)` the moment data is ready, BEFORE
 * the camera is necessarily live).  The subsystem update needs to
 * happen so the selected POI's marker descriptor renders with bumped
 * alpha as soon as the renderer comes up; the React callback needs
 * to fire so the URL hash mirrors the intent.
 *
 * Only the camera tween is gated on `state.cam !== null`.
 */

import { vec3 } from 'gl-matrix';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import { FOCUS_TWEEN_MS } from '../camera/focusTween';
import { poiFocusDistanceMpc } from '../camera/poiFocusTween';

export type CommitPoiFocusOptions = {
  /** True for double-click (tween + open InfoCard); false for single-click (open only). */
  readonly tween: boolean;
};

export function commitPoiFocus(
  state: EngineState,
  cb: EngineCallbacks,
  poi: PointOfInterest,
  options: CommitPoiFocusOptions,
): void {
  // 1. Update the subsystem first so the selected POI's marker
  //    descriptor reflects the new selection on the very next frame
  //    (before the React side has even processed the callback below).
  state.subsystems.pois.setSelectedPoi(poi.id);

  // 2. Fire the React-side callback so the URL hash + InfoCard update.
  //    This happens regardless of cam-null state — see module header.
  cb.camera?.onPoiFocusChange?.(poi.id);

  // 3. Optional tween, gated on cam availability.  POIs without a
  //    physicalRadiusMpc would produce NaN framing — defensively
  //    treated as zero by poiFocusDistanceMpc, which then clamps to
  //    the 1 Mpc minimum.  In practice every cluster / SC / void POI
  //    sets the field, so this is belt-and-braces.
  if (!options.tween) return;
  const cam = state.cam;
  if (!cam) return;
  const radius = poi.physicalRadiusMpc ?? 0;
  state.subsystems.tweens.start({
    startMs: performance.now(),
    durationMs: FOCUS_TWEEN_MS,
    fromTarget: vec3.clone(cam.target as vec3),
    toTarget: vec3.fromValues(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]),
    fromDistance: cam.distance,
    toDistance: poiFocusDistanceMpc(poi.category, radius),
    fromYaw: cam.yaw,
    toYaw: cam.yaw,
    fromPitch: cam.pitch,
    toPitch: cam.pitch,
  });
  state.subsystems.scheduler.requestRender();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- commitPoiFocus`
Expected: PASS all three assertions.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/helpers/commitPoiFocus.ts \
        tests/services/engine/helpers/commitPoiFocus.test.ts
git commit -m "feat(cluster-viz): commitPoiFocus helper

Parallel to commitFocus (galaxy version). Updates the POI subsystem's
selection state, fires onPoiFocusChange, optionally tweens the camera
using poiFocusDistanceMpc for the per-category framing distance.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: `engine.ts` — wire `focusOnPoi` onto the public handle

**Files:**
- Modify: `src/services/engine/engine.ts` (around lines 891 for `focusOn` and 1366 for the handle literal).

- [ ] **Step 1: Add the function near `focusOn`**

Inside `engine.ts`, near the existing `function focusOn(info: GalaxyInfo)` (around line 891), add:

```ts
function focusOnPoi(poi: PointOfInterest): void {
  // Mirror of focusOn (galaxy version).  commitPoiFocus absorbs the
  // cam-null guard for the tween path internally, but the subsystem
  // update + onPoiFocusChange callback still fire so a deep-link
  // drain that races bootstrap can establish the selected state
  // before the camera is live.
  commitPoiFocus(state, cb, poi, { tween: true });
}
```

Add the import at the top:

```ts
import { commitPoiFocus } from './helpers/commitPoiFocus';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
```

- [ ] **Step 2: Add to the public handle literal**

Around line 1366, find the `camera: { ... }` block in the handle literal. Add `focusOnPoi`:

```ts
camera: {
  setAutoRotate,
  reset: resetCamera,
  focusOn,
  focusOnPoi, // NEW
  focusOnHome,
  focusOnMilkyWay,
  logState: logCameraStateFn,
},
```

- [ ] **Step 3: Run typecheck + the existing engine tests**

```bash
npm run typecheck
npm test
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "feat(cluster-viz): engine.camera.focusOnPoi public handle

Wires commitPoiFocus onto the public handle next to focusOn. Will be
called by the React deep-link drain when #poi=<id> resolves.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

If Task 7's commit was deferred (typecheck failed because the handle didn't implement `focusOnPoi` yet), stage Task 7's files in this same commit.

---

## Phase 5: Click dispatch in `wireInput`

### Task 10: Extend `ClickResolution` to carry POI hits

**Files:**
- Modify: `src/@types/engine/ClickResolution.d.ts`
- Modify: `src/services/engine/interaction/clickHandler.ts`

**Pre-edit reading:**
1. `src/services/engine/interaction/clickHandler.ts` — the current resolver shape (returns `{ kind: 'clear' }` or `{ kind: 'select'; selection; info }`).
2. `src/data/selectionEncoding.ts` — the `unpackPick` discriminated `PickResult` (from plan 1) that the resolver decodes.

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/interaction/clickHandler.poi.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createClickResolver } from '../../../../src/services/engine/interaction/clickHandler';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  physicalRadiusMpc: 2,
};

describe('createClickResolver POI variant', () => {
  it('returns kind: "poi" with the resolved POI when picker hits a cluster ring', async () => {
    const pickRenderer = {
      pick: vi.fn().mockResolvedValue({ kind: 'cluster', poiIndex: 0 }),
    };
    const resolver = createClickResolver({
      pickRenderer: pickRenderer as never,
      resolveSelection: vi.fn(),
      buildGalaxyInfo: vi.fn(),
      // NEW: a callback to map (category, poiIndex) -> PointOfInterest.
      resolvePoi: ({ category, poiIndex }) => {
        if (category === 'cluster' && poiIndex === 0) return virgo;
        return null;
      },
    });
    const result = await resolver.resolveClick({
      pickXPx: 100,
      pickYPx: 100,
      viewportPx: [800, 600],
      visibleSources: [],
      pointSizePx: 2.5,
    });
    expect(result).toEqual({ kind: 'poi', poi: virgo });
  });

  it('returns kind: "clear" when picker resolves to a void poiIndex with no matching POI', async () => {
    const pickRenderer = {
      pick: vi.fn().mockResolvedValue({ kind: 'void', poiIndex: 99 }),
    };
    const resolver = createClickResolver({
      pickRenderer: pickRenderer as never,
      resolveSelection: vi.fn(),
      buildGalaxyInfo: vi.fn(),
      resolvePoi: () => null,
    });
    const result = await resolver.resolveClick({
      pickXPx: 100,
      pickYPx: 100,
      viewportPx: [800, 600],
      visibleSources: [],
      pointSizePx: 2.5,
    });
    expect(result).toEqual({ kind: 'clear' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- clickHandler.poi`
Expected: FAIL — `resolvePoi` is not in the input type; `kind: 'poi'` not a known variant.

- [ ] **Step 3: Extend the types**

Edit `src/@types/engine/ClickResolution.d.ts`:

```ts
import type { PointOfInterest } from './subsystems/PointOfInterest';

export type ClickResolution =
  | { readonly kind: 'clear' }
  | { readonly kind: 'select'; readonly selection: { source: Source; localIdx: number }; readonly info: GalaxyInfo | null }
  | { readonly kind: 'poi'; readonly poi: PointOfInterest };
```

Edit `src/@types/engine/CreateClickResolverInput.d.ts` (find with `grep -rn "CreateClickResolverInput" src/@types/`):

```ts
import type { PoiCategory } from '../../services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from './subsystems/PointOfInterest';

export type CreateClickResolverInput = {
  // ... existing ...
  /**
   * Map a POI pick hit `(category, poiIndex)` to its PointOfInterest
   * record.  Optional — when absent, POI hits fall through to
   * `{ kind: 'clear' }`.  In production this resolves against the
   * arrays the engine handed to `poiSubsystem.setPois`; in tests it
   * can be a static lookup.
   */
  readonly resolvePoi?: (input: { category: PoiCategory; poiIndex: number }) => PointOfInterest | null;
};
```

- [ ] **Step 4: Update the resolver body**

Edit `src/services/engine/interaction/clickHandler.ts`:

```ts
export function createClickResolver(input: CreateClickResolverInput): ClickResolver {
  const { pickRenderer, resolveSelection, buildGalaxyInfo, resolvePoi } = input;
  const resolver: ClickResolver = {
    async resolveClick(args: ClickResolveInput): Promise<ClickResolution> {
      const result = await pickRenderer.pick(
        args.viewportPx,
        args.pickXPx,
        args.pickYPx,
        args.visibleSources,
        args.pointSizePx,
        args.timingDescriptor,
      );
      if (result === null) return { kind: 'clear' };

      // POI variants from the discriminated PickResult (plan 1).
      if (result.kind === 'cluster' || result.kind === 'supercluster' || result.kind === 'void') {
        if (!resolvePoi) return { kind: 'clear' };
        const poi = resolvePoi({ category: result.kind, poiIndex: result.poiIndex });
        if (!poi) return { kind: 'clear' };
        return { kind: 'poi', poi };
      }

      // Galaxy variant (existing).
      const resolved = resolveSelection({ source: result.source, localIdx: result.localIdx });
      const info = resolved
        ? buildGalaxyInfo(resolved.cloud, resolved.localIdx, resolved.source)
        : null;
      return { kind: 'select', selection: { source: result.source, localIdx: result.localIdx }, info };
    },
    destroy(): void {},
  };
  resolver satisfies Destroyable;
  return resolver;
}
```

NOTE: this assumes `pickRenderer.pick` already returns the discriminated `PickResult` from plan 1. If plan 1 left `pick()` returning the old `{ source, localIdx } | null` shape, the type widening lives in plan 1 — flag it and stop.

- [ ] **Step 5: Run the test + typecheck**

```bash
npm test -- clickHandler.poi
npm run typecheck
```
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/interaction/clickHandler.ts \
        src/@types/engine/ClickResolution.d.ts \
        src/@types/engine/CreateClickResolverInput.d.ts \
        tests/services/engine/interaction/clickHandler.poi.test.ts
git commit -m "feat(cluster-viz): clickHandler returns kind: 'poi' for ring hits

Extends ClickResolution with a poi variant. The resolver branches on
the PickResult union from selectionEncoding (cluster | supercluster |
void → poi; galaxy → existing path; null → clear).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: `wireInput` — dispatch single/double-click to `commitPoiFocus`

**Files:**
- Modify: `src/services/engine/phases/wireInput.ts` (around lines 271 `lastClickedInfo`, 324 `onClick`, 347 `onDoubleClick`).

**Pre-edit reading:**
1. `src/services/engine/phases/wireInput.ts` lines 253-371 — the click + dblclick handlers.

- [ ] **Step 1: Write the failing assertion test**

Click dispatch is hard to unit-test (it requires a mock orbit controls + mock device). Instead add a manual smoke step at the end (Task 15) and a tight integration test that asserts the resolvePoi wiring works:

Create `tests/services/engine/phases/wireInput.poi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
// Phase test scaffolding is project-specific; if this file diverges from
// the existing wireInput tests, mirror their setup. This test is a
// smoke-level assertion that the wireInput phase passes a resolvePoi
// callback into createClickResolver.

describe('wireInput POI wiring', () => {
  it('passes a resolvePoi callback to createClickResolver', () => {
    // Inspect the wireInput source directly — the contract is structural.
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../../../src/services/engine/phases/wireInput.ts'),
      'utf8',
    );
    expect(src).toContain('resolvePoi');
    expect(src).toContain('commitPoiFocus');
  });
});
```

(Yes, a source-string assertion is crude — it's a guard against the wireInput integration regressing silently. The behaviour is verified end-to-end by Task 15.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- wireInput.poi`
Expected: FAIL — no `resolvePoi` reference in wireInput yet.

- [ ] **Step 3: Wire `resolvePoi` into the click resolver**

Edit `src/services/engine/phases/wireInput.ts`. Around the `createClickResolver({...})` call (line 123), add the `resolvePoi` callback:

```ts
state.subsystems.clickResolver = createClickResolver({
  pickRenderer,
  resolveSelection: (sel) => {
    // ... existing ...
  },
  buildGalaxyInfo: (cloud, localIdx, src) =>
    buildGalaxyInfo(cloud, localIdx, src, state.sources.famousMeta, state.sources.famousXrefs),
  // NEW: map (category, poiIndex) → PointOfInterest by reading the
  // POI subsystem's authoritative table.  The poiSubsystem keeps the
  // table indexed positionally — poiIndex from the pick fragment IS
  // the array index for that category.  Plan 2 added the
  // `getPoisForCategory(category)` accessor (or equivalent) on the
  // subsystem; if it didn't, add a thin accessor as part of this task.
  resolvePoi: ({ category, poiIndex }) => {
    const pois = state.subsystems.pois.getPoisForCategory?.(category);
    if (!pois) return null;
    return pois[poiIndex] ?? null;
  },
});
```

If `poiSubsystem.getPoisForCategory` doesn't exist (plan 2 may have chosen a different shape), add it:

```ts
// In src/services/engine/subsystems/poiSubsystem.ts:
function getPoisForCategory(category: PoiCategory): readonly PointOfInterest[] {
  return pois.filter((p) => p.category === category);
}
```

And add it to the `PoiSubsystem` type. The filter is O(n) but n ≤ ~20 POIs per category — well below per-frame budget; clicks are infrequent enough that the cost is invisible.

**Important** — the indexing contract: plan 2's `clusterMarkerRenderer` MUST issue its instanced draw with the same iteration order `getPoisForCategory` returns, otherwise the `@builtin(instance_index)` carried into `poiIndex` won't match the array index. If plan 2 chose a different ordering (e.g. sorted by distance), this resolver needs to mirror that. Add a comment in the resolver explaining the contract:

```ts
// Contract: clusterMarkerRenderer issues per-category draws using the
// same iteration order as getPoisForCategory(category).  The pick
// fragment's poiIndex is the @builtin(instance_index) into that draw,
// so the array index here is byte-identical.  If the renderer ever
// changes its iteration order, this resolver must change with it.
```

- [ ] **Step 4: Replace the click + dblclick bodies**

The existing `onClick` handler (line 324) needs to branch on the new `{ kind: 'poi'; poi }` result:

```ts
onClick: (xCss, yCss) => {
  const pick = runPickAtCss(xCss, yCss);
  if (!pick) return;
  pick.then((result) => {
    if (result.kind === 'clear') {
      // Empty space → clear BOTH galaxy selection AND POI selection,
      // close the InfoCard, clear the URL hash.
      state.subsystems.selection.setSelected(null);
      state.subsystems.pois.setSelectedPoi(null);
      cb.camera?.onPoiFocusChange?.(null);
      lastClickedInfo = null;
      lastClickedPoi = null;
    } else if (result.kind === 'select') {
      // Galaxy hit (existing path).
      state.subsystems.selection.setSelected(result.selection);
      lastClickedInfo = result.info;
      lastClickedPoi = null;
    } else {
      // POI hit — single-click opens InfoCard (no tween). Clear any
      // galaxy selection so the InfoCard shows the POI card body, not
      // a stale galaxy.
      state.subsystems.selection.setSelected(null);
      commitPoiFocus(state, cb, result.poi, { tween: false });
      lastClickedInfo = null;
      lastClickedPoi = result.poi;
    }
    state.subsystems.scheduler.requestRender();
  });
},
```

And the `onDoubleClick` handler (line 347):

```ts
onDoubleClick: () => {
  // POI takes priority over galaxy — clicking a ring while a galaxy
  // happens to be behind it should focus the POI on dblclick.
  if (lastClickedPoi) {
    deps.handleRef.current?.camera.focusOnPoi(lastClickedPoi);
    return;
  }
  if (!lastClickedInfo) return;
  deps.handleRef.current?.camera.focusOn(lastClickedInfo);
},
```

Add the `lastClickedPoi` closure variable near `lastClickedInfo` (line 271):

```ts
let lastClickedInfo: GalaxyInfo | null = null;
// Cache the most-recent POI single-click hit for the dblclick path.
// Same rationale as lastClickedInfo: avoid a second pick readback
// race in the dblclick handler.  Cleared on every empty-space click.
let lastClickedPoi: PointOfInterest | null = null;
```

Add the import at the top:

```ts
import { commitPoiFocus } from '../helpers/commitPoiFocus';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
```

- [ ] **Step 5: Run typecheck + the assertion test**

```bash
npm run typecheck
npm test -- wireInput.poi
```
Expected: clean + PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/phases/wireInput.ts \
        src/services/engine/subsystems/poiSubsystem.ts \
        src/@types/engine/subsystems/PoiSubsystem.d.ts \
        tests/services/engine/phases/wireInput.poi.test.ts
git commit -m "feat(cluster-viz): wireInput dispatches POI clicks to commitPoiFocus

- Single-click POI ring -> open InfoCard via commitPoiFocus({ tween: false }).
- Double-click POI ring -> camera tween via engine.camera.focusOnPoi.
- Empty-space click -> clear both galaxy + POI selection, clear URL hash.
- Adds resolvePoi callback wiring + poiSubsystem.getPoisForCategory accessor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6: URL hash + InfoCard

### Task 12: `poiUrl` codec — parse + build `#poi=<id>`

**Files:**
- Create: `src/services/url/poiUrl.ts`
- Create: `tests/services/url/poiUrl.test.ts`

**Pre-edit reading:**
1. `src/services/url/focusUrl.ts` — the galaxy version. Mirror its shape: pure functions, no DOM access. The hash format is `#poi=<poi-id>` where `<poi-id>` is the literal `PointOfInterest.id` (e.g. `virgo-m87`, `hercules-sc`, `bootes-void`).

- [ ] **Step 1: Write the failing tests**

Create `tests/services/url/poiUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePoiHash, poiIdToHash } from '../../../src/services/url/poiUrl';

describe('parsePoiHash', () => {
  it('parses #poi=virgo-m87 → virgo-m87', () => {
    expect(parsePoiHash('#poi=virgo-m87')).toBe('virgo-m87');
  });

  it('accepts no leading #', () => {
    expect(parsePoiHash('poi=virgo-m87')).toBe('virgo-m87');
  });

  it('returns null for unrelated hashes', () => {
    expect(parsePoiHash('#focus=m31')).toBeNull();
    expect(parsePoiHash('#about')).toBeNull();
    expect(parsePoiHash('')).toBeNull();
  });

  it('rejects unsafe characters', () => {
    // Same character-class as focusUrl: letters / digits / underscore / dash.
    expect(parsePoiHash('#poi=virgo m87')).toBeNull();
    expect(parsePoiHash('#poi=<script>')).toBeNull();
  });
});

describe('poiIdToHash', () => {
  it('builds #poi=<id>', () => {
    expect(poiIdToHash('virgo-m87')).toBe('poi=virgo-m87');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- poiUrl`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the codec**

Create `src/services/url/poiUrl.ts`:

```ts
/**
 * poiUrl — codec for the `#poi=<id>` hash that makes a POI selection
 * shareable.  Pure functions only — no DOM access, no React, no engine
 * coupling.  Sister module to `focusUrl.ts` (the galaxy version);
 * deliberately separate so the two URL schemes can evolve independently
 * (e.g. a future `#poi=<id>&tour=play` query-like extension wouldn't
 * touch the galaxy hash).
 *
 * The id is the literal `PointOfInterest.id` (e.g. `virgo-m87`,
 * `hercules-sc`, `bootes-void`).  POI ids are curated and stable across
 * rebuilds (they live in `clusterAnchors.ts`), so encoding them
 * directly is safe.
 *
 * Character class: `[a-z0-9_-]+`, matching `focusUrl`'s famous-id
 * fallback.  Rejects whitespace, angle brackets, percent-encoded payload
 * — anything that wouldn't appear in a legitimate POI id.
 */

const POI_ID_RE = /^[a-z0-9_-]+$/i;

export function parsePoiHash(hash: string): string | null {
  if (!hash) return null;
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!trimmed) return null;
  const eq = trimmed.indexOf('=');
  if (eq < 0 || trimmed.slice(0, eq) !== 'poi') return null;
  let raw: string;
  try {
    raw = decodeURIComponent(trimmed.slice(eq + 1));
  } catch {
    return null;
  }
  if (!raw || !POI_ID_RE.test(raw)) return null;
  return raw;
}

export function poiIdToHash(poiId: string): string {
  // No URL-encoding needed — the POI_ID_RE character class is hash-safe.
  return `poi=${poiId}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- poiUrl`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/url/poiUrl.ts tests/services/url/poiUrl.test.ts
git commit -m "feat(cluster-viz): poiUrl codec for #poi=<id> hash

Pure parse + build helpers for the POI deep-link hash. Mirrors
focusUrl's shape; separate file so the two URL schemes evolve
independently.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: `usePoiUrlSync` hook + App.tsx wiring

**Files:**
- Create: `src/hooks/usePoiUrlSync.ts`
- Modify: `src/App.tsx` (find the existing `useFocusUrlSync` call to mirror).

**Pre-edit reading:**
1. `src/hooks/useFocusUrlSync.ts` — the galaxy version. Mirror its three-effect shape: mount capture + popstate, selection → URL, drain + supersede.

- [ ] **Step 1: Write the (minimal) hook**

Pure URL-routing hooks are hard to unit-test in node (no DOM). Mirror the existing `useFocusUrlSync` pattern: the hook is thin glue over `parsePoiHash` (Task 12) + `poiIdToHash`; behaviour is verified in Task 15's manual smoke test.

Create `src/hooks/usePoiUrlSync.ts`:

```ts
/**
 * usePoiUrlSync — keeps `window.location.hash` in lock-step with the
 * currently-focused POI, and surfaces deep-link arrivals back to App
 * as a `pendingPoiId` it can resolve once the POI table has loaded.
 *
 * Sister hook to `useFocusUrlSync` (the galaxy version).  Two URL
 * schemes (`#focus=…` for galaxies, `#poi=…` for POIs) coexist; this
 * hook is the POI side.  Bare canvas clicks set `focusedPoiId` from
 * App's React state (driven by the `onPoiFocusChange` callback), so
 * this hook just mirrors that state into the URL + handles the
 * inverse (URL → pendingPoiId for the drain).
 *
 * Three internal effects, same pattern as useFocusUrlSync:
 *   1. Mount capture + popstate listener — parse `location.hash`,
 *      set `pendingPoiId` if it's a `#poi=…` hash.
 *   2. focusedPoiId → URL — write `#poi=<id>` via pushState when
 *      focus lands, clear on null.
 *   3. Drain — once engine is ready AND the POI table is populated,
 *      look up the pending id and dispatch `engine.camera.focusOnPoi`.
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { parsePoiHash, poiIdToHash } from '../services/url/poiUrl';
import type { EngineHandle } from '../@types/engine/handles/EngineHandle';
import type { PointOfInterest } from '../@types/engine/subsystems/PointOfInterest';

export type UsePoiUrlSyncInput = {
  /** Current React-side mirror of the engine's selected POI id (driven by onPoiFocusChange). */
  readonly focusedPoiId: string | null;
  /** True once engine has emitted status: ready. */
  readonly ready: boolean;
  /** The POI table — used by the drain to map an id back to a PointOfInterest. */
  readonly pois: readonly PointOfInterest[];
  /** Ref to the engine handle (populated after bootstrap). */
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

export function usePoiUrlSync(input: UsePoiUrlSyncInput): { pendingPoiId: string | null } {
  const { focusedPoiId, ready, pois, engineHandleRef } = input;
  const [pendingPoiId, setPendingPoiId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  // 1. Mount capture + popstate.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mountedRef.current) return;
    mountedRef.current = true;
    const id = parsePoiHash(window.location.hash);
    if (id) setPendingPoiId(id);
    const onPopState = () => {
      const i = parsePoiHash(window.location.hash);
      setPendingPoiId(i);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. focused → URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingPoiId !== null) return; // don't fight a still-resolving deep link
    const desiredBody = focusedPoiId ? poiIdToHash(focusedPoiId) : '';
    const currentBody = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    // Only touch the hash if it's empty or already a #poi=… hash —
    // don't clobber a coexisting #focus=… set by the galaxy hook.
    const hashIsPoiOrEmpty = currentBody === '' || currentBody.startsWith('poi=');
    if (!hashIsPoiOrEmpty) return;
    if (currentBody === desiredBody) return;
    const base = window.location.pathname + window.location.search;
    const next = desiredBody ? `${base}#${desiredBody}` : base;
    window.history.pushState(null, '', next);
  }, [focusedPoiId, pendingPoiId]);

  // 3. Drain.
  useEffect(() => {
    if (!pendingPoiId) return;
    if (!ready) return;
    const handle = engineHandleRef.current;
    if (!handle) return;
    if (pois.length === 0) return;
    const poi = pois.find((p) => p.id === pendingPoiId);
    if (!poi) return; // POI id not found in the current table — leave pending; tier swap may bring it.
    handle.camera.focusOnPoi(poi);
    setPendingPoiId(null);
  }, [pendingPoiId, ready, pois, engineHandleRef]);

  return { pendingPoiId };
}
```

- [ ] **Step 2: Wire into App.tsx**

Add to `App.tsx`:

```tsx
import { usePoiUrlSync } from './hooks/usePoiUrlSync';

// In the component body, alongside the existing useFocusUrlSync call:
const [focusedPoiId, setFocusedPoiId] = useState<string | null>(null);
// The POI table — populated from the engine via a setPois callback or
// imported from clusterAnchors directly. App.tsx already has access
// to the POI list because it builds the InfoCard's category-keyed
// view; if not, import from src/data/clusterAnchors.ts.
const pois = useMemo(() => /* readonly PointOfInterest[] */, []);
usePoiUrlSync({
  focusedPoiId,
  ready: status.kind === 'ready',
  pois,
  engineHandleRef,
});

// Wire the engine callback to update React state:
const cb: EngineCallbacks = {
  // ... existing ...
  camera: {
    // ... existing onFocusChange, onAutoRotateChange, etc ...
    onPoiFocusChange: (poiId) => setFocusedPoiId(poiId),
  },
};
```

(The exact lines depend on App.tsx's current structure — search for where the existing camera callbacks are constructed.)

- [ ] **Step 3: Run typecheck + a smoke test**

```bash
npm run typecheck
npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePoiUrlSync.ts src/App.tsx
git commit -m "feat(cluster-viz): usePoiUrlSync deep-link hook + App.tsx wiring

Mirrors the focused POI into #poi=<id> via pushState; parses
#poi=<id> on mount + popstate and dispatches engine.camera.focusOnPoi
once the engine + POI table are ready.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: `InfoCard` POI body

**Files:**
- Modify: `src/components/InfoCard/InfoCard.tsx`
- Modify: `src/components/InfoCard/FullCard.tsx` (or create a sibling `PoiCard.tsx` — see Step 1).

**Pre-edit reading:**
1. `src/components/InfoCard/InfoCard.tsx` — note the strict "outer wrapper stays identical across renders" rule (the `<details>` collapse-on-hover bug noted in memory).
2. `src/components/InfoCard/FullCard.tsx` lines 1-80 — the chrome (header, body, close button).

- [ ] **Step 1: Decide reuse vs split**

Two viable shapes:

- **Option A** (reuse): extend `FullCard` to accept a `PointOfInterest | GalaxyInfo` discriminated prop and switch the body inside. Pro: one card chrome, automatic; Con: branches in `FullCard` for two unrelated content types.
- **Option B** (sibling): create `src/components/InfoCard/PoiCard.tsx` with the same chrome + a POI-flavoured body. Have `InfoCard.tsx` route to `FullCard` or `PoiCard` based on the active selection's type. Pro: cleaner separation; Con: chrome duplication.

**Recommendation: Option A.** The POI card is small (name, distance, type label, physical radius, "Fly here" button) and the FullCard chrome is non-trivial — duplication would drift. Branch inside FullCard on a discriminator prop.

- [ ] **Step 2: Extend `InfoCardProps`**

```ts
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';

export type ActiveInfo =
  | { kind: 'galaxy'; info: GalaxyInfo }
  | { kind: 'poi'; poi: PointOfInterest };

export type InfoCardProps = {
  hovered: GalaxyInfo | null;
  selected: GalaxyInfo | null;
  // NEW: the currently-focused POI. When non-null, the FullCard renders
  // the POI body instead of the galaxy body.
  selectedPoi: PointOfInterest | null;
  onFocus?: (info: GalaxyInfo) => void;
  onPoiFocus?: (poi: PointOfInterest) => void; // NEW — "Fly here" button
  onClose?: () => void;
  onPoiClose?: () => void; // NEW — POI card close button
};
```

- [ ] **Step 3: Route in InfoCard.tsx**

Inside the InfoCard body, branch when `selectedPoi` is non-null:

```tsx
export function InfoCard({ hovered, selected, selectedPoi, onFocus, onPoiFocus, onClose, onPoiClose }: InfoCardProps): ReactNode {
  // POI takes priority over galaxy — if the user has a POI selected,
  // that's the card.  Hover preview for a galaxy still stacks if both
  // are active (rare in practice; the POI click clears the galaxy
  // selection).
  if (selectedPoi) {
    return (
      // SAME outer wrapper as the galaxy branch — preserves the
      // <details> open state across the galaxy↔POI transition per the
      // React reconciliation rule in the module header.
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        <FullCard
          mode={{ kind: 'poi', poi: selectedPoi }}
          pinned
          onPoiFocus={onPoiFocus}
          onClose={onPoiClose}
        />
        {hovered && (
          <CompactCard info={hovered} />
        )}
      </div>
    );
  }
  // ... existing galaxy branch ...
}
```

- [ ] **Step 4: Add POI body to FullCard.tsx**

Extend FullCard to accept the discriminated mode:

```tsx
type FullCardProps = {
  mode?: { kind: 'galaxy'; info: GalaxyInfo } | { kind: 'poi'; poi: PointOfInterest };
  // Backward-compat: callers passing `info` directly still work.
  info?: GalaxyInfo;
  pinned?: boolean;
  onFocus?: (info: GalaxyInfo) => void;
  onPoiFocus?: (poi: PointOfInterest) => void;
  onClose?: () => void;
};

export function FullCard(props: FullCardProps): ReactNode {
  const mode = props.mode ?? (props.info ? { kind: 'galaxy' as const, info: props.info } : null);
  if (!mode) return null;

  if (mode.kind === 'poi') {
    const { poi } = mode;
    const distanceMpc = Math.hypot(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]);
    const categoryLabel =
      poi.category === 'cluster' ? 'Galaxy Cluster' :
      poi.category === 'supercluster' ? 'Supercluster' :
      poi.category === 'void' ? 'Cosmic Void' :
      'Point of Interest';
    return (
      <div className={cx(styles.card, props.pinned && styles.pinned)}>
        <header className={styles.header}>
          <span className={styles.title}>{poi.name}</span>
          {props.pinned && <span className={styles.pinnedBadge}>PINNED</span>}
          {props.onClose && (
            <button type="button" className={styles.close} onClick={props.onClose}>×</button>
          )}
        </header>
        <div className={styles.body}>
          <div className={styles.row}><span>Type</span><span>{categoryLabel}</span></div>
          <div className={styles.row}><span>Distance</span><span>{distanceMpc.toFixed(1)} Mpc</span></div>
          {poi.physicalRadiusMpc !== undefined && (
            <div className={styles.row}><span>Radius</span><span>{poi.physicalRadiusMpc.toFixed(1)} Mpc</span></div>
          )}
          {props.onPoiFocus && (
            <button type="button" className={styles.focusButton} onClick={() => props.onPoiFocus!(poi)}>
              Fly here
            </button>
          )}
        </div>
      </div>
    );
  }

  // ... existing galaxy body for mode.kind === 'galaxy' ...
}
```

(CSS class names mirror the existing ones in `FullCard.module.css`; add new classes only where the existing ones don't fit.)

- [ ] **Step 5: Wire from App.tsx**

```tsx
const [focusedPoi, setFocusedPoi] = useState<PointOfInterest | null>(null);

// Update onPoiFocusChange to resolve the id → PointOfInterest:
camera: {
  // ...
  onPoiFocusChange: (poiId) => {
    setFocusedPoiId(poiId);
    setFocusedPoi(poiId ? pois.find((p) => p.id === poiId) ?? null : null);
  },
},

// In the InfoCard call:
<InfoCard
  hovered={hovered}
  selected={selected}
  selectedPoi={focusedPoi}
  onFocus={(info) => engineHandleRef.current?.camera.focusOn(info)}
  onPoiFocus={(poi) => engineHandleRef.current?.camera.focusOnPoi(poi)}
  onClose={() => engineHandleRef.current?.selection.clear()}
  onPoiClose={() => {
    engineHandleRef.current?.camera /* ... */;
    // Clearing a POI: tell engine to clear POI selection. Since there's
    // no explicit clearPoi() method on the handle, we synthesize an
    // empty-space click by calling commitPoiFocus(null) via a new
    // handle method OR by setting the subsystem directly via a small
    // new clear-POI API on the camera handle. Choose whichever is
    // minimal — the spec doesn't dictate the exact teardown API.
  }}
/>
```

If the chosen teardown API isn't obvious, add a small `clearPoiFocus()` method on `EngineCameraHandle`:

```ts
// In EngineCameraHandle.d.ts:
clearPoiFocus: () => void;
// In engine.ts:
function clearPoiFocus(): void {
  state.subsystems.pois.setSelectedPoi(null);
  cb.camera?.onPoiFocusChange?.(null);
}
```

- [ ] **Step 6: Run typecheck + build**

```bash
npm run typecheck
npm run build
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/InfoCard/InfoCard.tsx \
        src/components/InfoCard/FullCard.tsx \
        src/App.tsx \
        src/@types/engine/handles/EngineCameraHandle.d.ts \
        src/services/engine/engine.ts
git commit -m "feat(cluster-viz): InfoCard POI body + Fly here button

Extends FullCard to render a POI-flavoured body (name, distance, type
label, physical radius, Fly here button) when the active selection is
a POI. Reuses the existing card chrome — outer wrapper stays stable
across the galaxy <-> POI transition to preserve <details> open state.

Adds EngineCameraHandle.clearPoiFocus for the InfoCard close button.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7: Manual smoke verification

### Task 15: End-to-end smoke test

**Files:** none — this is verification.

**Pre-flight:**
1. Ensure `npm run typecheck && npm test && npm run build` all pass.
2. `npm run dev` should already be running per project convention. If not, start it.

- [ ] **Step 1: Verify Virgo single-click opens the InfoCard**

Open `http://localhost:5173`. Wait for the loading status to clear. Navigate (orbit + zoom) until you can see Virgo's yellow ring at the Virgo Cluster (~16 Mpc from the origin). Single-click the ring.

Expected:
- InfoCard appears in the top-right with body:
  - Title: "Virgo Cluster" (or whatever `clusterAnchors.ts` named it)
  - Type: "Galaxy Cluster"
  - Distance: ~16.5 Mpc
  - Radius: ~2.2 Mpc
  - "Fly here" button
- Camera does NOT move.
- URL bar shows `#poi=virgo-m87` (or the actual Virgo id from clusterAnchors).

- [ ] **Step 2: Verify Virgo double-click tweens the camera**

From the wide view, double-click Virgo's ring.

Expected:
- InfoCard opens (same as above).
- Camera tweens (600 ms) to centre Virgo. Final framing distance: ~16 Mpc (2 Mpc radius × 8 cluster multiplier).
- URL bar still shows `#poi=virgo-m87`.

- [ ] **Step 3: Verify Boötes Void single-click**

Pan / fly out to ~250 Mpc to find Boötes Void (cyan ring). Single-click.

Expected:
- InfoCard shows "Boötes Void", Type: "Cosmic Void", Distance ~200 Mpc, Radius ~50 Mpc.
- URL bar shows `#poi=bootes-void`.
- Surrounding galaxies stay at full brightness (member-isolation is plan 4).

- [ ] **Step 4: Verify empty-space click clears the selection**

Click on empty sky (no ring, no galaxy).

Expected:
- InfoCard disappears.
- URL bar's hash clears (back to no hash, or `#focus=…` if a galaxy was also pinned — POI clearing doesn't touch the galaxy hash).
- No console errors.

- [ ] **Step 5: Verify the deep link works**

In a fresh tab, paste `http://localhost:5173/#poi=virgo-m87` (substitute the actual Virgo id).

Expected:
- After data finishes loading, the camera tweens to frame Virgo.
- InfoCard opens with Virgo's body.
- URL stays as `#poi=virgo-m87`.

- [ ] **Step 6: Verify famous-galaxy single-click is unchanged**

Find a labelled famous galaxy (e.g. M31 / Andromeda). Single-click its label or the galaxy itself.

Expected:
- InfoCard shows the galaxy (NOT POI) body — name, distance, photometric magnitudes, etc.
- URL bar shows `#focus=m31` (galaxy hash), NOT `#poi=…`.
- Behaviour identical to before this plan.

- [ ] **Step 7: Verify front-galaxy beats ring on pick**

Find a galaxy that visually overlaps a POI ring (a Virgo member galaxy will do). Single-click directly on the galaxy.

Expected:
- The galaxy is selected (galaxy InfoCard opens), NOT the POI behind it. This confirms the depth test in the POI pick pass is doing its job (Task 3).

- [ ] **Step 8: Check console for errors / warnings**

Open DevTools. Confirm:
- No errors from the WGSL compiler (no "Invalid ShaderModule" warnings for `ringPick.wesl`).
- No "queue.writeBuffer" race warnings.
- No React reconciliation warnings about lost `<details>` state.

- [ ] **Step 9: Document any visual oddities**

If anything looks wrong (ring too small/big, padded hit area too generous/stingy, framing distance feels off), note it for plan 4's review. This plan does not tune those constants; plan 4 has the alpha + member-isolation tuning sweep.

- [ ] **Step 10: Commit the verification**

Verification doesn't produce a code change, but the implementer should `git status` to confirm a clean tree and document the smoke results in the PR description.

```bash
git status
# Expect: clean tree.
```

---

## Self-Review

**Spec coverage** (cross-check against §3.1, §5, §6):
- §3.1 single-click POI ring → InfoCard + no camera move: Task 11 onClick + Task 14 InfoCard body.
- §3.1 double-click POI ring → tween + InfoCard: Task 11 onDoubleClick + Task 9 focusOnPoi + Task 8 commitPoiFocus.
- §3.1 click empty space → exit + close: Task 11 onClick clear branch.
- §3.1 click InfoCard close button: Task 14 onPoiClose wiring.
- §5.1 reuse tween machinery: Task 8 builds inline (deliberately not reusing tweenToGalaxy — distance helper differs).
- §5.2 `commitPoiFocus` helper: Task 8.
- §5.3 per-category framing multipliers: Task 4.
- §5.4 `onPoiFocusChange` callback: Task 6.
- §5.5 `focusOnPoi` handle method: Task 7 + 9.
- §6.1 / §6.2 pick encoding using existing PickResult union: Tasks 1, 2, 3, 10.
- §6.3 ring as hit target (padded filled disk): Task 1.
- §6.4 depth + z-order: Task 3 (pick pass after galaxy pass, shared depth attachment).
- URL hash echo: Tasks 12 + 13.
- POI selection alpha bump: Task 5.

**Out of scope** (confirmed NOT touched):
- `FocusUniforms` shader edits — plan 4.
- `clusterFocusSubsystem` — plan 4.
- Non-member galaxy dimming — plan 4.
- Void inversion logic — plan 4.
- `clusterMembership` call sites — plan 4 (the pure helper from plan 1 is in place but unused here).

**Placeholders scan:** None — every step has code or commands. The InfoCard `Option A/B` decision in Task 14 is presented as a recommendation with rationale and a clear pick.

**Type consistency:**
- `setSelectedPoi(poiId: string | null)` — used identically in Tasks 5, 8, 11, 14.
- `onPoiFocusChange(poiId: string | null)` — Tasks 6, 8, 11, 13, 14.
- `focusOnPoi(poi: PointOfInterest)` — Tasks 7, 9, 11, 13, 14.
- `commitPoiFocus(state, cb, poi, { tween: boolean })` — Tasks 8, 9, 11.
- `poiFocusDistanceMpc(category, radiusMpc)` — Task 4, used in Task 8.
- `PickResult` discriminator — assumed from plan 1 (`kind: 'galaxy' | 'cluster' | 'supercluster' | 'void'`).

**Cross-plan handshakes:**
- Plan 1 must have shipped: `Source.{Cluster,Supercluster,Void}` enum entries, `PickResult` union from `unpackPick`, `physicalRadiusMpc` on `PointOfInterest`.
- Plan 2 must have shipped: `clusterMarkerRenderer` issuing per-category visible-ring draws, `clusterMarker/ring.wesl` with a `VSOut` carrying a `poiIndex: u32` interpolant, `produceMarkers()` on `poiSubsystem`, `ClusterMarkerDescriptor` type with a `ringAlpha` field.
- If plan 2 named anything differently (e.g. `markerAlpha` instead of `ringAlpha`), all references in this plan need a rename pass.
