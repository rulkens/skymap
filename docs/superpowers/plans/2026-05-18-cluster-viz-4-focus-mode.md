# Cluster-Viz 4/4 — Focus Mode (Member Isolation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the cluster-viz "focus mode" — when a user clicks a POI ring, non-member galaxies fade to ~8% alpha over 400 ms so the cluster's actual membership pops out of the field. Void POIs invert (galaxies inside the void fade, walls stay bright). Other POI rings dim to 25%. Dismissing the focus fades everything back smoothly.

**Architecture:** A new `FocusUniforms` (32-byte) uniform block lives at `@group(3)` on the points pipeline. The vertex shader recomputes `distance(worldPos, focus.center) < focus.radiusMpc` per vertex and lerps the intensity output between `1.0` (no focus) and `0.08` (non-member) by `focus.blend`. The `focus.blend` scalar is driven by a 400-ms smoothstep from a new `clusterFocusSubsystem` that owns the live `FocusState`, caches cone-search member arrays per POI, and writes the GPU buffer each frame. `pickRenderer` gets a dummy zeroed `FocusUniforms` bind group so its explicit pipeline layout matches the visual pipeline (mirroring the existing dummy `FadeUniforms` pattern).

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest.

**Prerequisites:**
- **Plan 1 (Foundations)** — `Source.Cluster/Supercluster/Void` enum values, `PickResult` discriminated union, `physicalRadiusMpc` rename on `PointOfInterest`, `computeClusterMembership` pure function, `FocusState` type all exist.
- **Plan 2 (At-rest viz)** — `clusterMarkerRenderer` exists with halo + ring; `poiSubsystem.produceMarkers` exists.
- **Plan 3 (Pick + camera focus)** — POI rings are clickable, `commitPoiFocus` exists, the InfoCard renders POI info, URL hash echoes POI selection, `poiSubsystem.setSelectedPoi(poiId | null)` and `poiSubsystem.getSelectedPoiId()` exist.

**Followed by:** Nothing — this is the last sub-plan of the cluster-viz design.

**Spec reference:** `docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md` (§3 focus mode, §4 membership computation, §7.1 + §7.2 new subsystem + edits, §8.2 focus-mode data flow).

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass. Manual smoke (see Task 16) confirms:

- Single-click Virgo → InfoCard opens AND non-member galaxies fade to ~8% over ~400 ms.
- Single-click Boötes Void → galaxies INSIDE the void radius fade; surrounding walls stay bright.
- Click close button / empty space → all galaxies fade back to full brightness smoothly.
- Other POI rings (Coma, Hercules SC) dim to ~25% while Virgo is selected.
- No WebGPU validation errors in the browser console.

---

## WESL conventions reminder (read before writing any shader code)

These are the linker-level constraints that bit us during the engine rewrite and the unified-fade migration. Re-read them at the top of every shader-touching task.

1. **`?static` imports on the TS side, `package::path::Symbol` on the WESL side.** `import code from './foo.wesl?static';` in TS; `import package::shaders::lib::focusUniforms::FocusUniforms;` in WESL. Never use relative WESL paths — `wesl-plugin` resolves the literal `package::` prefix.
2. **`@group(N) @binding(M) var<uniform> X: T` is module-local.** Each consumer module that reads the binding must re-declare it. Importing the struct (`FocusUniforms`) from a single authoritative lib file makes drift structurally impossible.
3. **Never share `GPUShaderModule` instances across pipelines.** The visual and pick pipelines each compile their OWN module from the same source string. The shared text is fine; a shared handle would tempt you into the WebGPU `'auto'` bind-group-layout trap (see `feedback_webgpu_auto_layout_trap.md` memory).
4. **`pickRenderer` MUST bind a dummy zeroed `FocusUniforms` at `@group(3)`** to match the visual pipeline's explicit layout. Mirror the existing `dummyFadeBindGroup` pattern. If you omit it, every pick will fail WebGPU validation at `pass.setPipeline()`.
5. **Re-normalize after `invModel` transforms** in volume shaders is unrelated here, but the corollary applies: don't trust that a 3-vector you derived "should be unit length" is unit length. We only do `distance()` and a scalar compare, so we're safe — but if a future tweak adds direction-based logic, normalize first.

---

## Phase 1: FocusUniforms shader library

### Task 1: Create `focusUniforms.wesl` lib file

**Files:**
- Create: `src/services/gpu/shaders/lib/focusUniforms.wesl`

- [ ] **Step 1: Write the WESL file**

```wgsl
// lib/focusUniforms.wesl — shared per-frame "which POI is focused" uniform.
//
// When a POI (cluster, supercluster, void) is selected, the renderer
// writes this block once per frame and the points pipeline's vertex
// stage uses it to lerp non-member galaxy alpha down to 8%. When
// nothing is focused, the CPU side writes blend=0 — every point of
// every pipeline reads a no-op multiplier and the path costs one
// vec3 subtract + one dot + one mix per vertex.
//
// ## Why @group(3)
//
// @group(0) is per-frame uniforms (CameraUniforms-prefixed). @group(1)
// is FadeUniforms (canonical, shared across every fadeable layer).
// @group(2) is per-source SourceUniforms. @group(3) is the first free
// slot and isolates the focus-mode contract from the existing three.
//
// ## Byte layout (canonical, 32 bytes total)
//
//   offset  0 : center           vec3<f32>  (12 B payload + 4 B trailing pad
//                                           per WGSL vec3 alignment rules)
//   offset 16 : radiusMpc        f32
//   offset 20 : blend            f32        (0..1, smoothstep-driven)
//   offset 24 : invert           u32        (0 = cluster/SC, 1 = void)
//   offset 28 : _pad             u32        (alignment to 32 bytes)
//
// vec3<f32> has 16-byte alignment in WGSL, so 'center' consumes bytes
// 0..15 (12 payload + 4 trailing pad). 'radiusMpc' then starts at the
// next 4-byte slot, which is offset 16. blend/invert/_pad pack into
// the second 16-byte half.
//
// ## Why blend instead of an enabled flag
//
// blend is the 0..1 smoothstep value driven by clusterFocusSubsystem's
// FadeController. At blend=0 the per-vertex mix returns 1.0 (no
// modulation); at blend=1 it returns either 1.0 (members) or 0.08
// (non-members). The shader path is branch-free and identical whether
// focus is active or not — the CPU side just rests blend at 0 when
// nothing's selected.

struct FocusUniforms {
  // POI world-space centre in Mpc. Galaxies' squared distance from
  // this point feeds the membership predicate.
  center: vec3<f32>,

  // POI physical radius in Mpc. Strict less-than: a galaxy exactly at
  // r == radiusMpc is NOT a member. Matches the CPU-side cone-search
  // predicate in `clusterMembership.ts` (see the spec §11 open
  // decision 6 on `<` vs `≤`).
  radiusMpc: f32,

  // Smoothstep-driven fade-in amount [0, 1]:
  //   0  → no focus active. Per-vertex multiplier collapses to 1.0.
  //   1  → focus fully active. Members at 1.0, non-members at 0.08.
  // Driven CPU-side by FadeController over ~400 ms.
  blend: f32,

  // 0 → "inside the radius" is a member (cluster, supercluster).
  // 1 → "outside the radius" is a member (void: walls stay bright,
  //      galaxies inside the void fade).
  // u32 rather than bool because WGSL uniform-buffer layouts disallow
  // bool; u32 packs into the 32-byte block cleanly.
  invert: u32,

  // Alignment pad to round the struct up to 32 bytes. Never written
  // from the CPU side; never read here.
  _pad: u32,
};

// Compute the per-vertex focus alpha multiplier.
//
//   isInside = distance(worldPos, focus.center) < focus.radiusMpc
//   isMember = (isInside) == (focus.invert == 1u)
//     → for invert=0 (cluster): inside → member
//     → for invert=1 (void):    outside → member
//   baseAlpha = isMember ? 1.0 : 0.08
//   return mix(1.0, baseAlpha, focus.blend)
//
// At focus.blend == 0 this returns 1.0 unconditionally — the
// renderer pays the predicate cost but the visual output is
// unchanged. That's deliberate: branch-free shader path, the CPU
// side controls "is focus active" entirely via the blend scalar.
fn focusAlphaMultiplier(worldPos: vec3<f32>, focus: FocusUniforms) -> f32 {
  let isInside = distance(worldPos, focus.center) < focus.radiusMpc;
  let isMember = isInside == (focus.invert == 1u);
  let baseAlpha = select(0.08, 1.0, isMember);
  return mix(1.0, baseAlpha, focus.blend);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (TS doesn't compile WESL, but verify the project still typechecks).

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/lib/focusUniforms.wesl
git commit -m "$(cat <<'EOF'
feat(shaders): add focusUniforms.wesl lib for focus-mode alpha modulation

32-byte uniform block declares FocusUniforms (center, radiusMpc, blend,
invert) and helper focusAlphaMultiplier that lerps non-member alpha to
0.08 by focus.blend. Branch-free shader path; CPU side controls focus
activation entirely via the blend scalar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Pipeline plumbing — `FocusUniformsBgl` + dummy bind group

### Task 2: Define the `FocusUniformsBgl` type and factory

**Files:**
- Create: `src/@types/rendering/FocusUniformsBgl.d.ts`
- Create: `src/services/gpu/resources/focusUniformsBgl.ts`
- Test: `tests/services/gpu/resources/focusUniformsBgl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createFocusUniformsBgl } from '../../../../src/services/gpu/resources/focusUniformsBgl';

describe('createFocusUniformsBgl', () => {
  it('returns a GPUBindGroupLayout with one uniform binding at slot 0', () => {
    // Mock device — only createBindGroupLayout matters; we capture its descriptor.
    let captured: GPUBindGroupLayoutDescriptor | null = null;
    const device = {
      createBindGroupLayout: (descriptor: GPUBindGroupLayoutDescriptor) => {
        captured = descriptor;
        return { __layout: 'focus' } as unknown as GPUBindGroupLayout;
      },
    } as unknown as GPUDevice;

    const bgl = createFocusUniformsBgl(device);
    expect(bgl).toBeDefined();
    expect(captured).not.toBeNull();
    expect(captured!.entries).toHaveLength(1);
    const entry = (captured!.entries as GPUBindGroupLayoutEntry[])[0]!;
    expect(entry.binding).toBe(0);
    expect(entry.visibility).toBe(GPUShaderStage.VERTEX);
    expect(entry.buffer?.type).toBe('uniform');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/gpu/resources/focusUniformsBgl.test.ts`
Expected: FAIL with "Cannot find module '.../focusUniformsBgl'".

- [ ] **Step 3: Implement `FocusUniformsBgl` type**

Write `src/@types/rendering/FocusUniformsBgl.d.ts`:

```ts
/**
 * Canonical GPUBindGroupLayout for the focus-mode uniform block.
 *
 * Mirrors the FadeUniformsBgl / SourceUniformsBgl pattern: one shared
 * layout identity, built once at device-bootstrap time, passed into
 * every pipeline that needs to declare @group(3) (FocusUniforms). The
 * visual pipeline binds the live buffer (written each frame by
 * clusterFocusSubsystem); the pick pipeline binds a zeroed dummy so
 * its pipeline-layout shape matches.
 */
export type FocusUniformsBgl = GPUBindGroupLayout;
```

- [ ] **Step 4: Implement the factory**

Write `src/services/gpu/resources/focusUniformsBgl.ts`:

```ts
/**
 * focusUniformsBgl — factory for the canonical @group(3) FocusUniforms
 * BindGroupLayout.
 *
 * One layout identity, shared by every pipeline that participates in
 * focus mode. The visual points pipeline reads the live buffer (written
 * each frame from clusterFocusSubsystem state); the pick pipeline reads
 * a zeroed dummy so its explicit pipeline-layout matches the visual
 * one (otherwise WebGPU validation fails at setPipeline).
 *
 * Visibility is VERTEX-only — the fragment stage doesn't touch focus
 * uniforms (the multiplier is folded into VSOut.intensity in the
 * vertex stage and rides along like any other per-vertex modulator).
 */

import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';

export function createFocusUniformsBgl(device: GPUDevice): FocusUniformsBgl {
  return device.createBindGroupLayout({
    label: 'focus-uniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/services/gpu/resources/focusUniformsBgl.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/@types/rendering/FocusUniformsBgl.d.ts src/services/gpu/resources/focusUniformsBgl.ts tests/services/gpu/resources/focusUniformsBgl.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu): add FocusUniformsBgl factory for shared @group(3) layout

Canonical bind-group layout for the focus-mode uniform block, mirroring
the FadeUniformsBgl pattern. One layout identity shared by visual and
pick pipelines; vertex-stage-only visibility.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Vertex shader integration

### Task 3: Edit `points/vertex.wesl` to apply focus alpha

**Files:**
- Modify: `src/services/gpu/shaders/points/vertex.wesl`

Be meticulous here. Per memory `feedback_wgsl_meticulous.md`: slow down on shader edits. The shader change is two new imports, one new binding declaration, one new line of math, one multiply into `out.intensity`.

- [ ] **Step 1: Add the FocusUniforms import**

In `vertex.wesl`, find the existing `import package::lib::selectionEncoding::packSelection;` line and add IMMEDIATELY AFTER it:

```wgsl
import package::shaders::lib::focusUniforms::FocusUniforms;
import package::shaders::lib::focusUniforms::focusAlphaMultiplier;
```

- [ ] **Step 2: Add the @group(3) binding declaration**

Find the existing `@group(2) @binding(0) var<uniform> source: SourceUniforms;` line and add IMMEDIATELY AFTER it:

```wgsl
// ── @group(3) — FocusUniforms (per-frame, optional focus mode) ──────
//
// Written each frame by clusterFocusSubsystem. When no POI is focused,
// the CPU side writes blend=0 and the per-vertex multiplier collapses
// to 1.0 (no visible effect). When focus is active, members of the
// focused POI's radius keep alpha=1.0 and non-members fade to 0.08
// scaled by the smoothstep blend factor.
//
// pickRenderer binds a dummy zeroed FocusUniforms here so the explicit
// pipeline layout matches the visual pipeline (see pickRenderer.ts).
@group(3) @binding(0) var<uniform> focus: FocusUniforms;
```

- [ ] **Step 3: Apply the focus multiplier to `out.intensity`**

Find the existing line (currently around line 232):

```wgsl
  out.intensity = clamp((22.0 - p.magnitude) / 8.0, 0.05, 1.0) * u.brightness * vMaxAlpha;
```

Replace with:

```wgsl
  // Focus-mode alpha modulation. focusAlphaMultiplier returns 1.0
  // unless a POI is focused AND this galaxy is a non-member (or, for
  // void POIs, a member of the inside-the-void region). At
  // focus.blend == 0 the multiplier is always 1.0 — no visible effect
  // when nothing is focused.
  let focusAlpha = focusAlphaMultiplier(p.position, focus);
  out.intensity = clamp((22.0 - p.magnitude) / 8.0, 0.05, 1.0) * u.brightness * vMaxAlpha * focusAlpha;
```

- [ ] **Step 4: Also apply the multiplier in the Malmquist early-out**

Find the existing block (currently around lines 113-131) that constructs `earlyOut` and writes:

```wgsl
    earlyOut.intensity = 0.0;
```

LEAVE THIS UNCHANGED. The early-out path returns zero intensity regardless of focus state — multiplying zero by anything stays zero. No edit needed.

(Documenting this explicitly so the implementer doesn't second-guess and add a redundant multiply.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (TS doesn't compile WESL).

Note: the shader won't link until pointRenderer is updated to declare @group(3) (Task 4). Tests that exercise the pipeline at runtime will fail until then; that's expected.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/shaders/points/vertex.wesl
git commit -m "$(cat <<'EOF'
feat(shaders): apply FocusUniforms-driven alpha modulation in points vs

Vertex stage now imports FocusUniforms at @group(3) and multiplies
out.intensity by focusAlphaMultiplier(p.position, focus). At
focus.blend==0 the multiplier collapses to 1.0 — branch-free no-op
path when nothing is focused. Renderer wiring lands in the next task;
this commit alone will not link.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: pointRenderer integration

### Task 4: pointRenderer factory accepts focusBgl + builds @group(3) bind group

**Files:**
- Modify: `src/services/gpu/renderers/pointRenderer.ts`
- Modify: `src/@types/rendering/PointRenderer.d.ts`

- [ ] **Step 1: Add the FocusUniformsBgl import**

In `pointRenderer.ts`, find the existing `import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';` line (~line 93) and add IMMEDIATELY AFTER it:

```ts
import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
```

- [ ] **Step 2: Extend the factory signature**

Find `export function createPointRenderer(` (~line 607) and add a fourth parameter:

```ts
export function createPointRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
  focusBgl: FocusUniformsBgl,
): PointRenderer {
```

- [ ] **Step 3: Add @group(3) to the pipeline layout**

Find the `bindGroupLayouts: [...]` array (~line 632) and add a fourth entry at the end:

```ts
  const pipelineLayout = device.createPipelineLayout({
    label: 'points-pipeline-layout',
    bindGroupLayouts: [
      device.createBindGroupLayout({
        label: 'points-bgl-group0',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      }),
      fadeBgl,
      sourceBgl,
      // @group(3) — FocusUniforms (per-frame, optional focus mode).
      // Single shared buffer + bind group across all source draws — the
      // focus state is global (only one POI focused at a time), not
      // per-source like fade.
      focusBgl,
    ],
  });
```

- [ ] **Step 4: Allocate the singleton focus buffer + bind group**

Immediately AFTER the existing `const bindGroup = device.createBindGroup({...})` block (~line 697-701), add:

```ts
  // ── Focus uniforms (singleton, shared across all source draws) ────
  //
  // Unlike fadeBuffer (per-source: each survey has its own opacity
  // handle), focus state is global — at most one POI is focused at a
  // time and the same FocusUniforms apply to every survey's draw call.
  // Allocate one 32-byte buffer + one bind group in the prologue and
  // bind it once per frame (outside the per-source loop).
  //
  // Written each frame by `draw` from clusterFocusSubsystem state. At
  // rest (no POI focused), the CPU side writes blend=0 and the shader
  // path collapses to a no-op multiplier.
  const focusBuffer = device.createBuffer({
    label: 'points-focus-uniform',
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const focusBindGroup = device.createBindGroup({
    label: 'points-focus-bg',
    layout: focusBgl,
    entries: [{ binding: 0, resource: { buffer: focusBuffer } }],
  });

  // Reusable scratch ArrayBuffer for per-frame focus writeBuffer call.
  // 32 bytes laid out per the focusUniforms.wesl byte layout:
  //   offset  0 : center           vec3<f32>  (12 B + 4 B trailing pad)
  //   offset 16 : radiusMpc        f32
  //   offset 20 : blend            f32
  //   offset 24 : invert           u32
  //   offset 28 : _pad             u32
  const focusScratchBuffer = new ArrayBuffer(32);
  const focusScratchF32 = new Float32Array(focusScratchBuffer);
  const focusScratchU32 = new Uint32Array(focusScratchBuffer);
```

- [ ] **Step 5: Bind @group(3) in the draw loop**

Find the existing draw-loop block (~line 1259-1282). Immediately AFTER the line `pass.setBindGroup(0, bindGroup);` (~line 1260) add:

```ts
    // @group(3) — focus uniforms (singleton; same bind group for every
    // source draw). The buffer was written above from
    // clusterFocusSubsystem state.
    pass.setBindGroup(3, focusBindGroup);
```

- [ ] **Step 6: Accept and write the per-frame FocusState in `draw`**

The `draw` function signature must accept the focus state for the frame. Find the existing `draw` function declaration (~line 1143) and add a new parameter. The exact prior shape varies — read lines 1140-1200 and find the params object. Add `focus: FocusUniformsValue` where `FocusUniformsValue` is the CPU-side counterpart.

Add this type at the top of `pointRenderer.ts` (or import from a sibling `.d.ts`):

```ts
/**
 * CPU-side mirror of FocusUniforms's 32-byte layout. Written into
 * focusBuffer by `draw` each frame.
 *
 * All-zero is the "no focus active" sentinel: center=[0,0,0],
 * radiusMpc=0, blend=0, invert=0. At blend=0 the shader multiplier
 * collapses to 1.0 regardless of any other field, so the at-rest
 * write is safe even if center/radiusMpc happen to be nonsense.
 */
type FocusUniformsValue = {
  readonly center: readonly [number, number, number];
  readonly radiusMpc: number;
  readonly blend: number;
  readonly invert: 0 | 1;
};
```

Inside `draw`, BEFORE the `pass.setPipeline(pipeline);` line, write the focus buffer:

```ts
    // Pack the per-frame FocusState into the scratch buffer and write
    // it to the singleton focus uniform. One 32-byte writeBuffer per
    // frame — negligible.
    focusScratchF32[0] = focus.center[0];
    focusScratchF32[1] = focus.center[1];
    focusScratchF32[2] = focus.center[2];
    // focusScratchF32[3] is the trailing pad of vec3<f32>; stays zero.
    focusScratchF32[4] = focus.radiusMpc;
    focusScratchF32[5] = focus.blend;
    focusScratchU32[6] = focus.invert;
    // focusScratchU32[7] is _pad; stays zero.
    device.queue.writeBuffer(focusBuffer, 0, focusScratchBuffer);
```

- [ ] **Step 7: Destroy focusBuffer in `destroy()`**

Find the existing `destroy()` function (~line 1285+). Add `focusBuffer.destroy();` alongside the other resource cleanups.

- [ ] **Step 8: Update `PointRenderer.d.ts` to type the new `draw` parameter**

Find the `draw(...)` method declaration in `src/@types/rendering/PointRenderer.d.ts`. Add `focus: FocusUniformsValue` to its parameter object (and export `FocusUniformsValue` from a sibling type file or inline-co-locate per project convention).

For type co-location consistency, create `src/@types/rendering/FocusUniformsValue.d.ts`:

```ts
/**
 * CPU-side mirror of FocusUniforms's 32-byte uniform-buffer layout.
 *
 * Written into pointRenderer's singleton focus buffer each frame by
 * `pointRenderer.draw`. Produced by clusterFocusSubsystem's
 * `produceFocusUniforms` per-frame method.
 *
 * All-zero is the "no focus active" sentinel — at blend=0 the shader
 * multiplier collapses to 1.0 regardless of center/radiusMpc/invert.
 */
export type FocusUniformsValue = {
  readonly center: readonly [number, number, number];
  readonly radiusMpc: number;
  /** 0..1 smoothstep amount. Rest at 0 means no focus. */
  readonly blend: number;
  /** 0 = cluster/SC (inside is member); 1 = void (outside is member). */
  readonly invert: 0 | 1;
};
```

Then in `pointRenderer.ts` replace the inline `FocusUniformsValue` type with:

```ts
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — every caller of `createPointRenderer` and `pointRenderer.draw` is now missing the new arguments. These get fixed in subsequent tasks (Task 5 fixes the picker, Task 7 fixes engine bootstrap, Task 11 fixes the per-frame draw call).

Note: do NOT commit yet. The picker and engine wiring must land together or the build is broken.

---

### Task 5: pickRenderer dummy FocusUniforms bind group

**Files:**
- Modify: `src/services/gpu/renderers/pickRenderer.ts`

The pick pipeline doesn't read focus uniforms at all (the vertex stage's `focus.center` access happens only in `out.intensity`, which the pick fragment ignores). But the pipeline layout MUST declare @group(3) anyway — otherwise the explicit pipeline layout shape disagrees with pointRenderer's, and WebGPU validation fails at draw time.

This mirrors the dummy FadeUniforms pattern already at lines 184-198.

- [ ] **Step 1: Add FocusUniformsBgl to the factory signature**

In `pickRenderer.ts`, find:

```ts
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
```

Add IMMEDIATELY AFTER:

```ts
import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
```

Find the factory declaration (~line 138):

```ts
export function createPickRenderer(
  device: GPUDevice,
  pointRenderer: PointRenderer,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
): PickRenderer {
```

Add a fifth parameter:

```ts
export function createPickRenderer(
  device: GPUDevice,
  pointRenderer: PointRenderer,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
  focusBgl: FocusUniformsBgl,
): PickRenderer {
```

- [ ] **Step 2: Add @group(3) to the pipeline layout**

Find the `bindGroupLayouts: [...]` array (~line 172). Add a fourth entry:

```ts
  const pipelineLayout = device.createPipelineLayout({
    label: 'pick-pipeline-layout',
    bindGroupLayouts: [
      device.createBindGroupLayout({
        label: 'pick-bgl-group0',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      }),
      fadeBgl,
      sourceBgl,
      focusBgl,
    ],
  });
```

- [ ] **Step 3: Allocate the dummy buffer + bind group**

Find the existing dummy fade block (~lines 189-198):

```ts
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

Add IMMEDIATELY AFTER:

```ts
  // Pick pipeline declares @group(3) (FocusUniforms) to match the
  // shared vertex shader's pipeline-layout shape, but the pick path
  // doesn't observe focus alpha — the pick fragment writes to the
  // r32uint texture and ignores VSOut.intensity entirely. A zeroed
  // 32-byte buffer is fine; the shader path still computes
  // focusAlphaMultiplier but its output is discarded. Mirror of the
  // dummyFadeBindGroup pattern above.
  const dummyFocusBuffer = device.createBuffer({
    label: 'pick-focus-uniform-dummy',
    size: 32,
    usage: GPUBufferUsage.UNIFORM,
  });
  const dummyFocusBindGroup = device.createBindGroup({
    label: 'pick-focus-bg-dummy',
    layout: focusBgl,
    entries: [{ binding: 0, resource: { buffer: dummyFocusBuffer } }],
  });
```

- [ ] **Step 4: Bind @group(3) in the pick pass**

Find the existing pick pass block (~line 522-526):

```ts
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // @group(1) is the same dummy buffer for every source in this pick —
    // bind once outside the per-source loop.
    pass.setBindGroup(1, dummyFadeBindGroup);
```

Add IMMEDIATELY AFTER:

```ts
    // @group(3) — dummy zeroed focus uniforms. Bound once outside the
    // per-source loop; the pick fragment ignores intensity anyway.
    pass.setBindGroup(3, dummyFocusBindGroup);
```

- [ ] **Step 5: Destroy the dummy in `destroy()`**

Find `destroy()` (~line 615):

```ts
  function destroy(): void {
    destroyed = true;
    pickTexture?.destroy();
    depthTexture?.destroy();
    stagingBuffer.destroy();
    dummyFadeBuffer.destroy();
  }
```

Add `dummyFocusBuffer.destroy();`:

```ts
  function destroy(): void {
    destroyed = true;
    pickTexture?.destroy();
    depthTexture?.destroy();
    stagingBuffer.destroy();
    dummyFadeBuffer.destroy();
    dummyFocusBuffer.destroy();
  }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: still FAIL at the bootstrap call sites (engine wiring), but pickRenderer.ts now compiles cleanly. Don't commit until the engine wiring lands (Task 7).

---

## Phase 5: clusterFocusSubsystem — state + member cache + fade

### Task 6: ClusterFocusSubsystem type + tests + implementation

**Files:**
- Create: `src/@types/engine/subsystems/ClusterFocusSubsystem.d.ts`
- Create: `src/services/engine/subsystems/clusterFocusSubsystem.ts`
- Test: `tests/services/engine/subsystems/clusterFocusSubsystem.test.ts`

- [ ] **Step 1: Write the type declaration**

`src/@types/engine/subsystems/ClusterFocusSubsystem.d.ts`:

```ts
import type { PointOfInterest } from './PointOfInterest';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { Source } from '../../../data/sources';
import type { Destroyable } from '../../rendering/Destroyable';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';

/**
 * clusterFocusSubsystem — owns the "which POI is focused" state, the
 * 400 ms fade between focused and at-rest, and the cached member-index
 * arrays per POI (so re-selecting the same POI doesn't re-walk every
 * galaxy in every catalog).
 *
 * The subsystem is the single source of truth for focus state. The
 * pointRenderer reads `produceFocusUniforms(state, ctx)` each frame to
 * pack the GPU uniform; React reads `isActive()` to know whether to
 * show the "click empty space to dismiss" affordance on the InfoCard;
 * the engine's render-on-demand predicate consults `isAwake()` to keep
 * the loop spinning while the blend smoothstep is mid-transition.
 *
 * ### Why "active" and "awake" are different
 *
 *   isActive() — true whenever there's a currently-focused POI, even
 *                if the fade has finished. Used by React/UI checks.
 *   isAwake()  — true only during the fade transition itself. Used by
 *                the engine render-on-demand predicate to keep the
 *                loop running through the smoothstep.
 *
 * Membership cache invalidation: keyed by `(poiId, dataRev)`. When the
 * engine's `dataRev` counter bumps (tier swap, catalog reload), the
 * cache silently invalidates on next access — no explicit eviction
 * needed.
 */
export type ClusterFocusSubsystem = {
  readonly id: 'clusterFocus';

  /**
   * Activate focus mode on the given POI. Computes (or reads from
   * cache) the member-index array, sets internal state, and fires
   * the 400 ms fade-in via the registry. Called by commitPoiFocus.
   *
   * Idempotent: calling twice with the same POI is a no-op (no
   * spurious re-fade, no recomputation).
   */
  focusOn(
    poi: PointOfInterest,
    catalogs: ReadonlyMap<Source, GalaxyCatalog>,
    dataRev: number,
  ): void;

  /**
   * Dismiss focus mode. Fires the 400 ms fade-out. The current
   * focus state (center/radius/invert) stays set during the fade so
   * the shader continues to compute the correct per-vertex alpha
   * until blend reaches 0 again.
   */
  clearFocus(): void;

  /**
   * Pack the current focus state into a FocusUniformsValue for the
   * renderer to upload this frame. At rest (no focus), returns an
   * all-zero value (blend=0 makes the shader path a no-op).
   */
  produceFocusUniforms(now: number): FocusUniformsValue;

  /**
   * True whenever a POI is focused (selection active). False after
   * clearFocus completes its fade-out.
   */
  isActive(): boolean;

  /**
   * True only while the fade transition is in flight. The engine's
   * render-on-demand predicate ORs this into its "should we wake the
   * frame loop?" check.
   */
  isAwake(now: number): boolean;
} & Destroyable;
```

- [ ] **Step 2: Write the failing tests**

`tests/services/engine/subsystems/clusterFocusSubsystem.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createClusterFocusSubsystem } from '../../../../src/services/engine/subsystems/clusterFocusSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import { Source } from '../../../../src/data/sources';

function makePoi(overrides: Partial<PointOfInterest> = {}): PointOfInterest {
  return {
    id: 'virgo',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [10, 0, 0],
    physicalRadiusMpc: 2,
    ...overrides,
  } as PointOfInterest;
}

function makeCatalog(positions: readonly (readonly [number, number, number])[]): GalaxyCatalog {
  // Minimal stub — clusterFocusSubsystem only reads count + positions.
  const count = positions.length;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const zs = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    xs[i] = positions[i]![0];
    ys[i] = positions[i]![1];
    zs[i] = positions[i]![2];
  }
  return { count, positionsX: xs, positionsY: ys, positionsZ: zs } as unknown as GalaxyCatalog;
}

describe('clusterFocusSubsystem', () => {
  it('starts inactive with blend=0 (no focus)', () => {
    const sub = createClusterFocusSubsystem();
    expect(sub.isActive()).toBe(false);
    const u = sub.produceFocusUniforms(0);
    expect(u.blend).toBe(0);
  });

  it('focusOn marks active and starts fade-in toward blend=1', () => {
    const sub = createClusterFocusSubsystem(0); // initial time = 0
    const poi = makePoi();
    const catalogs = new Map([[Source.TwoMRS, makeCatalog([[10, 0, 0]])]]);
    sub.focusOn(poi, catalogs, 0);
    expect(sub.isActive()).toBe(true);
    // mid-fade
    const midU = sub.produceFocusUniforms(200);
    expect(midU.blend).toBeGreaterThan(0);
    expect(midU.blend).toBeLessThan(1);
    // after fade
    const doneU = sub.produceFocusUniforms(500);
    expect(doneU.blend).toBe(1);
  });

  it('focusOn writes the correct center/radius/invert for a cluster', () => {
    const sub = createClusterFocusSubsystem(0);
    const poi = makePoi({ worldPos: [3, 4, 5], physicalRadiusMpc: 7 });
    sub.focusOn(poi, new Map(), 0);
    const u = sub.produceFocusUniforms(1000);
    expect(u.center).toEqual([3, 4, 5]);
    expect(u.radiusMpc).toBe(7);
    expect(u.invert).toBe(0);
  });

  it('focusOn sets invert=1 for a void POI', () => {
    const sub = createClusterFocusSubsystem(0);
    const poi = makePoi({ category: 'void' });
    sub.focusOn(poi, new Map(), 0);
    const u = sub.produceFocusUniforms(1000);
    expect(u.invert).toBe(1);
  });

  it('clearFocus fades blend back to 0', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.focusOn(makePoi(), new Map(), 0);
    // let fade-in finish
    sub.produceFocusUniforms(500);
    sub.clearFocus();
    const midU = sub.produceFocusUniforms(700); // 200 ms into fade-out
    expect(midU.blend).toBeGreaterThan(0);
    expect(midU.blend).toBeLessThan(1);
    const doneU = sub.produceFocusUniforms(1000);
    expect(doneU.blend).toBe(0);
    expect(sub.isActive()).toBe(false);
  });

  it('isAwake is true during fade, false at rest', () => {
    const sub = createClusterFocusSubsystem(0);
    expect(sub.isAwake(0)).toBe(false);
    sub.focusOn(makePoi(), new Map(), 0);
    expect(sub.isAwake(200)).toBe(true);
    // after fade settles
    sub.produceFocusUniforms(500);
    expect(sub.isAwake(500)).toBe(false);
  });

  it('focusOn called twice with the same POI is idempotent (no re-fade)', () => {
    const sub = createClusterFocusSubsystem(0);
    const poi = makePoi();
    sub.focusOn(poi, new Map(), 0);
    // let fade settle
    sub.produceFocusUniforms(500);
    expect(sub.produceFocusUniforms(600).blend).toBe(1);
    // re-select same POI mid-rest
    sub.focusOn(poi, new Map(), 0);
    // No spurious blend dip — should still be 1.
    expect(sub.produceFocusUniforms(600).blend).toBe(1);
  });

  it('caches members per POI (does not re-walk catalog on re-select)', () => {
    const sub = createClusterFocusSubsystem(0);
    const poi = makePoi();
    // Mock catalog to track read counts.
    const xs = new Float32Array([10, 100]);
    const ys = new Float32Array([0, 0]);
    const zs = new Float32Array([0, 0]);
    const readCounter = { count: 0 };
    const catalog = {
      count: 2,
      get positionsX() {
        readCounter.count++;
        return xs;
      },
      positionsY: ys,
      positionsZ: zs,
    } as unknown as GalaxyCatalog;
    const catalogs = new Map([[Source.TwoMRS, catalog]]);

    sub.focusOn(poi, catalogs, 7); // dataRev = 7
    const firstReadCount = readCounter.count;
    expect(firstReadCount).toBeGreaterThan(0);

    sub.clearFocus();
    sub.produceFocusUniforms(1000);

    sub.focusOn(poi, catalogs, 7); // same dataRev → cache hit
    expect(readCounter.count).toBe(firstReadCount); // no new reads
  });

  it('invalidates the cache when dataRev bumps', () => {
    const sub = createClusterFocusSubsystem(0);
    const poi = makePoi();
    const xs = new Float32Array([10]);
    const ys = new Float32Array([0]);
    const zs = new Float32Array([0]);
    const readCounter = { count: 0 };
    const catalog = {
      count: 1,
      get positionsX() {
        readCounter.count++;
        return xs;
      },
      positionsY: ys,
      positionsZ: zs,
    } as unknown as GalaxyCatalog;
    const catalogs = new Map([[Source.TwoMRS, catalog]]);

    sub.focusOn(poi, catalogs, 1);
    const firstReadCount = readCounter.count;
    sub.clearFocus();
    sub.produceFocusUniforms(1000);

    sub.focusOn(poi, catalogs, 2); // dataRev bump
    expect(readCounter.count).toBeGreaterThan(firstReadCount);
  });

  it('focusOn replaces a previously-focused POI without going through clearFocus', () => {
    const sub = createClusterFocusSubsystem(0);
    const virgo = makePoi({ id: 'virgo', worldPos: [10, 0, 0] });
    const coma = makePoi({ id: 'coma', worldPos: [-10, 0, 0] });
    sub.focusOn(virgo, new Map(), 0);
    sub.produceFocusUniforms(500); // settle
    sub.focusOn(coma, new Map(), 0);
    expect(sub.isActive()).toBe(true);
    // After fade settles, center reflects coma.
    const u = sub.produceFocusUniforms(1000);
    expect(u.center).toEqual([-10, 0, 0]);
    expect(u.blend).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/services/engine/subsystems/clusterFocusSubsystem.test.ts`
Expected: FAIL with "Cannot find module '.../clusterFocusSubsystem'".

- [ ] **Step 4: Implement clusterFocusSubsystem**

Write `src/services/engine/subsystems/clusterFocusSubsystem.ts`:

```ts
/**
 * clusterFocusSubsystem — owns focus-mode state, member caching, and
 * the 400 ms fade between focused and at-rest.
 *
 * ### Why a separate subsystem
 *
 * Could live inside poiSubsystem (which already owns POI selection
 * state from plan 3). Separated because:
 *
 *   - Member computation cost (cone search across ~3.5M galaxies)
 *     happens on click and is unrelated to the per-frame label /
 *     marker production poiSubsystem already does.
 *   - The shader-uniform contract (32 bytes, GPU buffer write) sits
 *     awkwardly inside a subsystem whose primary output is CPU-side
 *     Label[] / MarkerLine[] arrays.
 *   - Tier swap invalidation (cache keyed by dataRev) is a concern
 *     local to focus-mode and would muddy the poi subsystem's
 *     orientation around POI metadata.
 *
 * ### Cache
 *
 * Map<poiId, { dataRev, members }>. On focusOn, look up by poiId; if
 * present AND dataRev matches the caller-provided value, reuse;
 * otherwise compute and store. Never evicts in v1 (~20 POIs × a few
 * thousand member indices each = sub-megabyte; well within budget).
 *
 * ### Fade
 *
 * Uses an internal FadeController (smoothstep-based, 400 ms).
 * Activation: focusOn fades 0→1. Deactivation: clearFocus fades 1→0.
 * The FocusUniformsValue produced each frame carries the live
 * `blend = controller.currentOpacity(now)`. At blend=0 the shader
 * path collapses to a no-op multiplier — the renderer can keep
 * binding the buffer unconditionally with no visible effect.
 *
 * ### Idempotency
 *
 * focusOn(poi) with the same poi as the current selection is a no-op
 * (no re-fade, no recompute). focusOn(poi) with a DIFFERENT poi
 * while focus is active replaces the state in place (blend stays at
 * its current value) and recomputes members for the new poi — the
 * fade-in stays 1.0 since we never went through 0.
 */

import { createFadeController } from '../../animation/fadeController';
import { computeClusterMembership } from '../../../utils/cluster/clusterMembership';
import type { ClusterFocusSubsystem } from '../../../@types/engine/subsystems/ClusterFocusSubsystem';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import type { Source } from '../../../data/sources';
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';

/** Focus fade duration in ms. 400 ms per spec §3.4. */
export const FOCUS_FADE_DURATION_MS = 400;

const ZERO_FOCUS: FocusUniformsValue = {
  center: [0, 0, 0],
  radiusMpc: 0,
  blend: 0,
  invert: 0,
};

type CacheEntry = {
  readonly dataRev: number;
  readonly members: readonly number[];
};

export function createClusterFocusSubsystem(initialNowMs: number = performance.now()): ClusterFocusSubsystem {
  const fade = createFadeController(0, initialNowMs);
  // Currently-focused POI, or null when at rest.
  let currentPoi: PointOfInterest | null = null;
  const memberCache = new Map<string, CacheEntry>();

  function focusOn(
    poi: PointOfInterest,
    catalogs: ReadonlyMap<Source, GalaxyCatalog>,
    dataRev: number,
  ): void {
    // Idempotency: same POI already focused with a settled fade → no-op.
    if (currentPoi !== null && currentPoi.id === poi.id) {
      // Already focused. Don't re-fade and don't recompute.
      return;
    }

    // Member cache lookup; recompute on miss or stale dataRev.
    const cached = memberCache.get(poi.id);
    if (!cached || cached.dataRev !== dataRev) {
      const members = computeClusterMembership(catalogs, poi.worldPos, poi.physicalRadiusMpc);
      memberCache.set(poi.id, { dataRev, members });
    }

    currentPoi = poi;
    // Fire fade-in. If we were mid-fade-out, FadeController picks up
    // from the current opacity and ramps to 1 over 400 ms.
    void fade.fadeTo(1, FOCUS_FADE_DURATION_MS);
  }

  function clearFocus(): void {
    if (currentPoi === null) return;
    void fade.fadeTo(0, FOCUS_FADE_DURATION_MS);
    // Keep currentPoi set during the fade so produceFocusUniforms still
    // emits the right center/radius. We clear it when produceFocusUniforms
    // observes blend has reached 0.
  }

  function produceFocusUniforms(now: number): FocusUniformsValue {
    fade.tick(now);
    const blend = fade.currentOpacity(now);
    // Lazy clear: once the fade-out has fully settled, drop currentPoi.
    if (currentPoi !== null && blend === 0 && !fade.isAnimating(now)) {
      currentPoi = null;
    }
    if (currentPoi === null) return ZERO_FOCUS;
    return {
      center: [currentPoi.worldPos[0], currentPoi.worldPos[1], currentPoi.worldPos[2]] as const,
      radiusMpc: currentPoi.physicalRadiusMpc,
      blend,
      invert: currentPoi.category === 'void' ? 1 : 0,
    };
  }

  function isActive(): boolean {
    return currentPoi !== null;
  }

  function isAwake(now: number): boolean {
    return fade.isAnimating(now);
  }

  return {
    id: 'clusterFocus',
    focusOn,
    clearFocus,
    produceFocusUniforms,
    isActive,
    isAwake,
    destroy(): void {
      memberCache.clear();
      currentPoi = null;
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/engine/subsystems/clusterFocusSubsystem.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/subsystems/ClusterFocusSubsystem.d.ts src/services/engine/subsystems/clusterFocusSubsystem.ts tests/services/engine/subsystems/clusterFocusSubsystem.test.ts src/@types/rendering/FocusUniformsValue.d.ts
git commit -m "$(cat <<'EOF'
feat(engine): add clusterFocusSubsystem for focus-mode state + fade

Owns the live FocusState, caches member-index arrays per POI keyed by
(poiId, dataRev) so re-selecting doesn't re-walk the catalog, and drives
a 400 ms smoothstep fade-in/out via an internal FadeController. Produces
a FocusUniformsValue each frame for pointRenderer to upload.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Engine bootstrap wiring

### Task 7: Wire focusBgl + clusterFocusSubsystem into engine bootstrap

**Files:**
- Modify: `src/services/engine/phases/wireSlots.ts` (or whatever bootstrap file constructs subsystems — verify by `grep -n "createPoiSubsystem\|createPointRenderer" src/services/engine/phases/*.ts` and matching the existing pattern).
- Modify: `src/services/engine/engine.ts` (whichever file constructs `fadeBgl` / `sourceBgl` — add `focusBgl` alongside).
- Modify: `src/@types/engine/state/EngineSubsystems.d.ts` (or wherever the `state.subsystems` object's type lives — add the `clusterFocus` field).

- [ ] **Step 1: Locate the bootstrap site**

Run: `grep -rn "createPointRenderer\|createPickRenderer\|fadeBgl" src/services/engine/`
Expected: locate the bootstrap file that wires BGLs into the two renderers. Likely `src/services/engine/engine.ts` or `src/services/engine/phases/wireSlots.ts`.

- [ ] **Step 2: Construct focusBgl at the same site as fadeBgl/sourceBgl**

In the bootstrap file, find where `fadeBgl` is constructed (search for `createFadeUniformsBgl`). Add IMMEDIATELY AFTER:

```ts
import { createFocusUniformsBgl } from '../gpu/resources/focusUniformsBgl';
// ... in the bootstrap body, alongside the fadeBgl / sourceBgl construction:
const focusBgl = createFocusUniformsBgl(device);
```

(Adjust import path depth to match the actual file location.)

- [ ] **Step 3: Pass focusBgl to createPointRenderer + createPickRenderer**

Update the calls:

```ts
const pointRenderer = createPointRenderer(device, format, fadeBgl, sourceBgl, focusBgl);
const pickRenderer = createPickRenderer(device, pointRenderer, fadeBgl, sourceBgl, focusBgl);
```

- [ ] **Step 4: Construct clusterFocusSubsystem and register it on state.subsystems**

In the same bootstrap file (or the subsystem-construction phase if it's split), add:

```ts
import { createClusterFocusSubsystem } from './subsystems/clusterFocusSubsystem';
// ... in the body where other subsystems are constructed:
const clusterFocus = createClusterFocusSubsystem();
// ... when assembling state.subsystems:
state.subsystems = {
  // ...existing subsystems...
  clusterFocus,
};
```

- [ ] **Step 5: Update the EngineSubsystems type**

Find `src/@types/engine/state/EngineSubsystems.d.ts` (or equivalent). Add:

```ts
import type { ClusterFocusSubsystem } from '../subsystems/ClusterFocusSubsystem';

export type EngineSubsystems = {
  // ...existing fields...
  readonly clusterFocus: ClusterFocusSubsystem;
};
```

- [ ] **Step 6: Add clusterFocus.destroy() to the engine destroy bag**

Find the engine's `destroy()` body (or destroy-bag iteration). Add a call to `state.subsystems.clusterFocus.destroy()` alongside the other subsystem teardowns. The spec mentions ~13 teardown targets growing to 14.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS — everything wires up cleanly now.

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: PASS — including the clusterFocusSubsystem tests from Task 6.

- [ ] **Step 9: Commit**

```bash
git add src/services/engine/engine.ts src/services/engine/phases/wireSlots.ts src/@types/engine/state/EngineSubsystems.d.ts
git commit -m "$(cat <<'EOF'
feat(engine): wire focusBgl + clusterFocusSubsystem into bootstrap

createFocusUniformsBgl alongside fadeBgl/sourceBgl; both pointRenderer
and pickRenderer now receive it. clusterFocusSubsystem registered on
state.subsystems and added to the destroy bag.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: commitPoiFocus + InfoCard wiring

### Task 8: commitPoiFocus calls clusterFocus.focusOn

**Files:**
- Modify: `src/services/engine/helpers/commitPoiFocus.ts`
- Modify: `tests/services/engine/helpers/commitPoiFocus.test.ts` (extend if it exists; otherwise the test already from plan 3 lives at this path — add an assertion).

The spec §5.2 shows `commitPoiFocus` already calls `state.subsystems.clusterFocus.setSelected(poi)` (plan 3's draft). Bring the call name in line with what plan 4 introduces.

- [ ] **Step 1: Read existing commitPoiFocus**

Read: `src/services/engine/helpers/commitPoiFocus.ts`. Plan 3 should have introduced this file. Confirm its structure.

- [ ] **Step 2: Update commitPoiFocus to call clusterFocus.focusOn (not setSelected)**

The helper should call:

```ts
state.subsystems.clusterFocus.focusOn(
  poi,
  state.cloudLoader.loadedCatalogs(),  // or whatever the engine exposes as ReadonlyMap<Source, GalaxyCatalog>
  state.dataRev,                       // monotone counter; see spec §4.3
);
```

The first arg is the POI. The second is the live `ReadonlyMap<Source, GalaxyCatalog>` of every loaded catalog. The third is the monotone `dataRev` counter the engine bumps on tier swap (verify the actual property name on `EngineState` — search `grep -rn "dataRev\|catalogRev" src/services/engine/`; if the name differs, use what's there).

If `state.cloudLoader.loadedCatalogs()` doesn't exist with that signature, search for the property on `EngineState` that holds the loaded GalaxyCatalogs — likely `state.catalogs` or `state.gpu.pointRenderer.loadedSources()`. The shape must be `ReadonlyMap<Source, GalaxyCatalog>` (or convertible) so `computeClusterMembership` can iterate it.

- [ ] **Step 3: Extend commitPoiFocus.test.ts to assert focusOn was called**

In the test file, add a test:

```ts
it('calls clusterFocus.focusOn(poi, catalogs, dataRev) on single-click', () => {
  const focusOn = vi.fn();
  const state = {
    subsystems: { clusterFocus: { focusOn, clearFocus: vi.fn(), produceFocusUniforms: vi.fn() } },
    catalogs: new Map(),
    dataRev: 42,
    // ... rest of EngineState stub
  } as unknown as EngineState;
  const cb = { camera: { onPoiFocusChange: vi.fn() } };
  const poi = makePoi();
  commitPoiFocus(state, cb, poi);
  expect(focusOn).toHaveBeenCalledWith(poi, state.catalogs, 42);
});
```

(Adapt to match the existing test scaffolding — fakeState helpers etc.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/services/engine/helpers/commitPoiFocus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/helpers/commitPoiFocus.ts tests/services/engine/helpers/commitPoiFocus.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): commitPoiFocus activates clusterFocusSubsystem

Single-click on a POI now fires clusterFocus.focusOn(poi, catalogs,
dataRev) between the selection update and the optional camera tween.
Member computation + 400 ms fade-in start here.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire the dismiss path (InfoCard close + click empty space)

**Files:**
- Modify: `src/services/engine/phases/wireInput.ts` (or wherever empty-space clicks dispatch).
- Modify: `src/components/InfoCard/InfoCard.tsx` (or the file plan 3 modified — verify path).

- [ ] **Step 1: Locate the empty-space click handler from plan 3**

Plan 3 wired click-empty-space to dismiss POI selection. Find that handler — likely in `wireInput.ts` under a `kind: null` branch of the unpacked pick.

- [ ] **Step 2: Add clusterFocus.clearFocus() to the dismiss path**

In the empty-space handler, add:

```ts
state.subsystems.clusterFocus.clearFocus();
```

The handler likely already calls `poiSubsystem.setSelectedPoi(null)` and notifies React via `cb.camera.onPoiFocusChange?.(null)`. Add the clearFocus call alongside.

- [ ] **Step 3: Wire the InfoCard close button**

The InfoCard close button in plan 3 likely calls a prop like `onDismiss` that React forwards to the engine. Trace that prop down — the same dismiss path that triggers from the empty-space click should be reached. Verify by inspection; if the close button bypasses the engine's dismiss path, route it through the same engine handle method (e.g., `engineHandle.camera.clearPoiFocus()`).

- [ ] **Step 4: Add a public engine handle method `clearPoiFocus()`**

If plan 3 didn't add one, add to `EngineCameraHandle`:

```ts
readonly clearPoiFocus: () => void;
```

Implement in `engine.ts` parallel to `focusOnPoi`:

```ts
clearPoiFocus(): void {
  state.subsystems.poiSubsystem.setSelectedPoi(null);
  state.subsystems.clusterFocus.clearFocus();
  cb.camera?.onPoiFocusChange?.(null);
},
```

(Plan 3 may have already done this — verify; otherwise add now.)

- [ ] **Step 5: Typecheck + run all tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/phases/wireInput.ts src/services/engine/engine.ts src/components/InfoCard/InfoCard.tsx
git commit -m "$(cat <<'EOF'
feat(engine): wire focus-mode dismiss path (close + empty-space)

InfoCard close button and empty-space clicks now call
clusterFocus.clearFocus() alongside the existing selection-clearing
path. New engine handle method clearPoiFocus() exposes the same dismiss
behaviour to React.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Per-frame integration

### Task 10: Engine frame body calls produceFocusUniforms + passes to pointRenderer.draw

**Files:**
- Modify: `src/services/engine/engine.ts` (the per-frame body — search for the `pointRenderer.draw(` call site).

- [ ] **Step 1: Locate the per-frame draw call**

Run: `grep -n "pointRenderer.draw\|pointRenderer\.draw" src/services/engine/engine.ts`
Expected: one or two call sites in the frame body.

- [ ] **Step 2: Produce focus uniforms once per frame**

Immediately BEFORE the `pointRenderer.draw(...)` call, add:

```ts
// Produce the focus-mode uniform value for this frame. At rest (no
// POI focused) this returns an all-zero value (blend=0) — the shader
// path collapses to a no-op multiplier and the bind group stays bound
// unconditionally.
const focusUniforms = state.subsystems.clusterFocus.produceFocusUniforms(nowMs);
```

(`nowMs` should match the frame timestamp already in scope; check the surrounding code.)

- [ ] **Step 3: Pass focusUniforms to draw**

Update the `pointRenderer.draw(...)` call to include `focus: focusUniforms` in its argument object (or as a positional arg, matching the API decided in Task 4).

- [ ] **Step 4: Add clusterFocus.isAwake to the render-on-demand predicate**

Find the engine's render-on-demand predicate (search `grep -n "isAwake\|recentFade\|requestRender" src/services/engine/`). Add `state.subsystems.clusterFocus.isAwake(nowMs)` to the OR chain so the frame loop keeps spinning through the 400 ms fade transition.

- [ ] **Step 5: Typecheck + run all tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS — `tsc --noEmit` plus Vite build. This is the first time the WESL linker actually compiles the new shader with the @group(3) binding; any unlinked-symbol error here is fatal.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(engine): per-frame focusUniforms production + render-on-demand wake

Frame body calls clusterFocus.produceFocusUniforms(nowMs) and passes the
result to pointRenderer.draw. clusterFocus.isAwake(nowMs) joins the
render-on-demand predicate so the 400 ms fade transition keeps the
frame loop spinning.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: Other-POI dimming

### Task 11: poiSubsystem dims non-selected POIs when focus is active

**Files:**
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `tests/services/engine/subsystems/poiSubsystem.test.ts` (extend)

The spec §3.2 says: when a POI is selected AND focus is active, the OTHER POIs' rings/halos dim to ~25%. The selected POI is brightened (already done in plan 3, presumably 1.5×). Plan 4 adds the "dim the others" half.

- [ ] **Step 1: Write the failing test**

In `poiSubsystem.test.ts`, add:

```ts
describe('produceMarkers — focus-mode other-POI dimming', () => {
  it('dims non-selected POI markers to 25% when focus is active', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      makePoi({ id: 'virgo', category: 'cluster' }),
      makePoi({ id: 'coma', category: 'cluster', worldPos: [50, 0, 0] }),
    ]);
    sub.setSelectedPoi('virgo');
    const state = makeStateWithFocusActive(); // isActive() returns true
    const ctx = makeFrameCtx();
    const markers = sub.produceMarkers(state, ctx);
    const virgoMarker = markers.find((m) => m.poiId === 'virgo')!;
    const comaMarker = markers.find((m) => m.poiId === 'coma')!;
    // Plan 3: selected (virgo) bumped to 1.5× (we just assert it's > 1).
    expect(virgoMarker.ringAlpha).toBeGreaterThan(1.0);
    // Plan 4: non-selected (coma) dimmed to 0.25× of base.
    expect(comaMarker.ringAlpha).toBeCloseTo(0.25, 3);
    expect(comaMarker.haloAlpha).toBeCloseTo(0.25, 3);
  });

  it('does NOT dim other POIs when focus is inactive (clicked once then dismissed)', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      makePoi({ id: 'virgo' }),
      makePoi({ id: 'coma', worldPos: [50, 0, 0] }),
    ]);
    sub.setSelectedPoi(null);
    const state = makeStateWithFocusInactive();
    const ctx = makeFrameCtx();
    const markers = sub.produceMarkers(state, ctx);
    const virgoMarker = markers.find((m) => m.poiId === 'virgo')!;
    const comaMarker = markers.find((m) => m.poiId === 'coma')!;
    expect(virgoMarker.ringAlpha).toBeCloseTo(1.0, 3);
    expect(comaMarker.ringAlpha).toBeCloseTo(1.0, 3);
  });
});
```

(Adapt `makeStateWithFocusActive` / `makeFrameCtx` to match existing test helpers in the poiSubsystem test file. If the file's existing helpers don't accept a `clusterFocus` stub, extend them.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts`
Expected: FAIL — current `produceMarkers` doesn't dim others.

- [ ] **Step 3: Implement the dimming in produceMarkers**

In `poiSubsystem.ts`, inside `produceMarkers`, find the per-POI loop. Where ring/halo alphas are computed, add:

```ts
const focusActive = state.subsystems.clusterFocus.isActive();
const selectedId = getSelectedPoiId();
// ... per POI:
const isSelected = poi.id === selectedId;
let ringAlpha = baseRingAlpha;
let haloAlpha = baseHaloAlpha;
if (focusActive && selectedId !== null) {
  if (isSelected) {
    // Plan 3 already bumps selected to 1.5×; preserve that.
    ringAlpha *= 1.5;
    haloAlpha *= 1.5;
  } else {
    // Plan 4: dim non-selected POIs to 25%.
    ringAlpha *= 0.25;
    haloAlpha *= 0.25;
  }
}
ringAlpha = Math.min(1.0, ringAlpha);
haloAlpha = Math.min(1.0, haloAlpha);
```

(Adjust to match the actual variable names; plan 2 / plan 3 introduced this code, so the exact shape may differ.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/subsystems/poiSubsystem.ts tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): poiSubsystem dims non-selected POIs during focus mode

When clusterFocus.isActive() AND a POI is selected, non-selected POI
markers (ring + halo) dim to 25% alpha. The selected POI's 1.5× bump
from plan 3 is preserved. At-rest behaviour is unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 10: Validation

### Task 12: Full test suite + typecheck + build

**Files:** none (validation only).

- [ ] **Step 1: Run the full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 2: Check for WebGPU shader linker output**

Run: `npm run dev` in the background (the project keeps dev running for HMR; if it's already up, skip). Open the browser console. Confirm no `Invalid ShaderModule` errors and no `Bind group layout mismatch` warnings.

If errors appear:

- "@group(3) binding 0 not declared" → vertex.wesl edit didn't land. Re-read Task 3.
- "Bind group layout mismatch at index 3" → pickRenderer dummy bind group missing. Re-read Task 5.
- "Cannot find module 'package::shaders::lib::focusUniforms'" → Task 1 file path wrong, or import path string mismatch.

- [ ] **Step 3: No commit (validation step).**

---

### Task 13: Manual smoke test (user-driven)

**Files:** none (visual verification).

Per CLAUDE.md, visual verification is the user's job. Don't attempt to run the browser yourself. Instead, describe what should be seen and ask the user to verify.

- [ ] **Step 1: Describe the expected behaviour to the user**

Post the following to the user verbatim:

> Plan 4 (focus mode) is implemented. Please verify in the browser:
>
> 1. **Click Virgo's ring** (single click) → the InfoCard panel opens for Virgo AND the surrounding 2MRS/GLADE galaxies fade smoothly to ~8% brightness over ~400 ms. Virgo's own member galaxies (within 2 Mpc) stay at full brightness. The fade should be smoothstep-eased (no pop at start or end).
> 2. **Click Boötes Void's ring** → the inverse: galaxies INSIDE the void radius fade to ~8%; surrounding wall structure stays bright.
> 3. **Click the InfoCard close button OR click empty space** → all galaxies fade back to full brightness smoothly over ~400 ms.
> 4. **While Virgo is selected**, check the other POI rings (Coma Cluster, Hercules Supercluster, etc.) — they should dim to ~25% alpha. Virgo's own ring should appear brightened (~1.5×). When focus is dismissed, all POI rings return to normal alpha.
> 5. **No console errors.** Open DevTools → Console. Expected: zero WebGPU validation errors, zero `Invalid ShaderModule` warnings, zero `Bind group layout mismatch` complaints.
> 6. **Picker sanity check.** Click on a regular galaxy (not a POI ring). The galaxy's InfoCard should open as it did pre-plan-4 — the pickRenderer dummy FocusUniforms bind group didn't break galaxy selection.

- [ ] **Step 2: Block on user confirmation**

Do NOT mark the task complete until the user explicitly confirms all six checks pass. Per the project's `feedback_wgsl_meticulous.md` memory: don't ship shader confidence without visual verification.

- [ ] **Step 3: No commit (verification step). Plan complete on user sign-off.**

---

## Self-review checklist (executor: skim before declaring done)

1. **Spec §3 (focus mode):** Tasks 1, 3, 6, 8, 9 cover gestures, member alpha, void inversion, transition.
2. **Spec §4 (membership):** Task 6 wires `computeClusterMembership` (assumed from plan 1) with `(poiId, dataRev)` caching; the GPU side uses the uniform `center + radiusMpc + invert` approach (option (b) per §4.4).
3. **Spec §7.1 + §7.2 (new subsystem + edits):** Tasks 1 (focusUniforms.wesl), 2 (FocusUniformsBgl), 3 (vertex.wesl edit), 4 (pointRenderer), 5 (pickRenderer dummy), 6 (clusterFocusSubsystem), 7 (engine bootstrap).
4. **Spec §8.2 (data flow):** Tasks 8, 9, 10 trace the click → commitPoiFocus → clusterFocus.focusOn → per-frame produceFocusUniforms → GPU write → shader path.
5. **No placeholders:** every code block above is complete; every commit message is concrete; every commit lists exact files.
6. **WESL conventions respected:** Task 1 uses `package::` prefix, `?static` imports come in via TS, Task 5 mirrors the dummy FadeUniforms pattern to dodge the auto-bind-group trap.
7. **TDD shape:** Tasks 2, 6, 11 are RED → GREEN cycles. Tasks 3 (shader-only) and 8/9/10 (wiring) rely on the build + manual smoke (Task 13) as their verification — shader edits don't have unit tests for visual output, which is consistent with the project's existing pattern.
