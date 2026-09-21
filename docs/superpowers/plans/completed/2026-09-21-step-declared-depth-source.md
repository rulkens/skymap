# Step-declared depth source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `FRAME_ORDER` render line declares WHICH target's depth it samples, and the executor hands its passes that depth (or a far-cleared placeholder) instead of each pass hardcoding `depthViewOf('foreground:0')`.

**Architecture:** `depth: 'sample'` becomes `depth: { sample: <targetId> }` on `RenderStepSpec`/`FrameStep`; the executor resolves the source's depth view plus the row that last cleared it onto `SlabView.sampledDepth`, drops its never-first guard (which silently skipped any sampling step outside the foreground chain), and `checkFrameOrder` validates the source at boot. Pixel-identical: `contactShadowsPass` keeps today's "my row cleared it" gate as one line in its own `enabled`.

**Tech Stack:** TypeScript, WebGPU, Vitest. No shader changes.

**Spec:** `docs/superpowers/specs/2026-09-21-local-froxel-aerial-perspective-design.md` §3.3–3.4 (prep 1). This is the "Ground preparation" refactor that lands BEFORE that feature; it is its own PR off `main`.

## Global Constraints

- `type` aliases only, one type per file under `src/@types/`, one symbol per file under `src/services/engine/frame/` (`frameFilePurity.test.ts` ratchet) and `src/utils/`.
- Comments explain WHY, module header ≤ 5 lines, comment lines ≤ half the code lines (`docs/superpowers/conventions/comments.md`).
- Pixel-identical on `main`'s frame: every existing test that changes here changes only its `'sample'` literal or the guard it pinned.
- Run `npx prettier --write <files>` on touched files; never `npm run format`. No `Co-Authored-By` trailer on commits.
- Deletion beats addition: the `depthClearedRows` set is REPLACED by the map below, not kept beside it.

---

### Task 1: The declared source, expansion, and boot validation

**Files:**
- Create: `src/@types/engine/frame/DepthSampleSource.d.ts`
- Modify: `src/@types/engine/frame/RenderStepSpec.d.ts`, `src/@types/engine/frame/FrameStep.d.ts`
- Modify: `src/services/engine/frame/bodyRowSteps.ts` (the `'sample'` literal), `src/services/engine/frame/expandFrameOrder.ts` (merge key at ~:119-131)
- Modify: `src/services/engine/frame/checkFrameOrder.ts`, `src/services/engine/phases/startLoop.ts:27-33`
- Test: `tests/services/engine/frame/expandFrameOrder.test.ts:308,311,345`, `tests/services/engine/frame/checkFrameOrder.test.ts`, `tests/services/engine/frame/frameOrderBoot.test.ts:30`

**Interfaces:**
- Produces:

```ts
// src/@types/engine/frame/DepthSampleSource.d.ts
/** A render step that SAMPLES a target row's depth as a texture: attaches none of its own. */
export type DepthSampleSource = { readonly sample: string };

// RenderStepSpec.d.ts and FrameStep.d.ts (both render variants)
readonly depth?: 'clear' | 'load' | DepthSampleSource;

// bodyRowSteps.ts — the marker's step names its own target
step((roster[at] as DepthSampledPasses).sampleDepth, { sample: spec.target }, 'SAMPLE_DEPTH')

// checkFrameOrder.ts — the 4th parameter widens from ids to id+depth rows
export function checkFrameOrder(
  order: readonly FrameStepSpec[],
  passes: readonly ContentPass[],
  computes: readonly ContentCompute[],
  targets: readonly Pick<RenderTargetSpec, 'id' | 'depth'>[],
): void;
// New failure: `checkFrameOrder: step samples depth of '<id>', which is not a depth-bearing render-target row`
// (thrown for an unknown id AND for a declared row whose `depth` is null).
```

- `expandFrameOrder`'s merge test (`a.depth === b.depth`) must treat two sampling steps as mergeable only when their `sample` ids are equal, and never merge a sampling step with a clearing/loading one. Compare through one small key helper (e.g. `depthKeyOf(depth): string` in `src/utils/render/`), not inline object juggling.
- `startLoop.ts` passes `state.gpu.renderTargets!.specs` (they carry `id` and `depth`) instead of mapping to ids.

- [ ] **Step 1: Update the existing tests to the new literal, and add the two validator tests**

`expandFrameOrder.test.ts`: the three `'sample'` expectations become `{ sample: 'foreground:0' }` (the foreground line's target in that fixture; read the fixture, do not assume).

`checkFrameOrder.test.ts`: the `TARGETS` fixture becomes rows `{ id, depth }` with `foreground:0` carrying `'depth32float'` and `hdr`/`swap` carrying `null`; every existing call keeps passing. Add:

```ts
it('throws naming a sampled depth source that is not a declared row', () => {
  const order: FrameStepSpec[] = [
    { kind: 'render', target: 'hdr', slab: 0, depth: { sample: 'forground:0' }, passes: ['a'] },
  ];
  expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).toThrow(/forground:0/);
});

it('throws naming a sampled depth source row that has no depth', () => {
  const order: FrameStepSpec[] = [
    { kind: 'render', target: 'hdr', slab: 0, depth: { sample: 'hdr' }, passes: ['a'] },
  ];
  expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).toThrow(/'hdr'/);
});
```

`frameOrderBoot.test.ts:30`: pass the specs (or a `Pick`-shaped list) rather than ids.

- [ ] **Step 2: Run the three files, confirm the new tests fail on the type/literal**

Run: `npx vitest run tests/services/engine/frame/expandFrameOrder.test.ts tests/services/engine/frame/checkFrameOrder.test.ts tests/services/engine/frame/frameOrderBoot.test.ts`
Expected: FAIL (typecheck of the new literal, and the two new validator tests).

- [ ] **Step 3: Implement the type, the literal, the merge key, the validation, the boot call**

- [ ] **Step 4: Tests + typecheck green**

Run: the three files above, then `npm run typecheck:fast`.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/frame/DepthSampleSource.d.ts src/@types/engine/frame/RenderStepSpec.d.ts src/@types/engine/frame/FrameStep.d.ts src/services/engine/frame/bodyRowSteps.ts src/services/engine/frame/expandFrameOrder.ts src/services/engine/frame/checkFrameOrder.ts src/services/engine/phases/startLoop.ts src/utils/render/depthKeyOf.ts tests/services/engine/frame/expandFrameOrder.test.ts tests/services/engine/frame/checkFrameOrder.test.ts tests/services/engine/frame/frameOrderBoot.test.ts
git commit -m "refactor(frame): a sampling step names the target whose depth it reads"
```

---

### Task 2: The executor hands the sampled depth to the step

**Files:**
- Create: `src/@types/engine/frame/SampledDepth.d.ts`
- Modify: `src/@types/engine/frame/SlabView.d.ts`, `src/@types/rendering/RenderTargets.d.ts`
- Modify: `src/services/gpu/renderTargets.ts` (placeholder texture + `farDepthView`, and the depth-texture comment at ~:376-388 that says "only a sampleDepth step INSIDE a row reads it")
- Modify: `src/services/engine/frame/executeFrame.ts` (`depthLoadOpFor` ~:119-133, `depthClearedRows` ~:178, the destination block ~:247-273)
- Modify: `src/services/engine/frame/passes/contactShadowsPass.ts:26-31,38,55`
- Modify: `docs/RENDERER.md` (one paragraph in the frame/executor section: a render line may declare `depth: { sample }`; the executor never attaches that depth and hands `view.sampledDepth`; the buffer holds the LAST cleared row only, and a step that needs its OWN row's depth compares `sampledDepth.row` to its slab)
- Test: `tests/services/engine/frame/executeFrame.test.ts:632-644` (replace), `tests/services/gpu/renderTargets.test.ts`

**Interfaces:**
- Consumes: `DepthSampleSource` (Task 1).
- Produces:

```ts
// src/@types/engine/frame/SampledDepth.d.ts
/**
 * What a `{ sample }` step's passes read: the source row's depth as a texture,
 * and the slab whose clearing step wrote it last this frame — `null` with the
 * 1×1 far-cleared placeholder when nothing has cleared that depth yet.
 */
export type SampledDepth = { readonly view: GPUTextureView; readonly row: Slab | null };

// SlabView.d.ts
/** Present only on a `{ sample }` step. */
readonly sampledDepth?: SampledDepth;

// RenderTargets.d.ts
/**
 * A 1×1 `FOREGROUND_DEPTH_FORMAT` texture cleared ONCE at construction to the
 * reversed-Z far value (`depthClearValueFor(true)`), for a sampling step whose
 * source no row has cleared this frame: every texel reads "nothing in front".
 */
farDepthView(): GPUTextureView;
```

- Executor rules, replacing the `depthClearedRows: Set<string>` bookkeeping with `lastDepthClear: Map<string, Slab>` keyed by TARGET id (the value is the `view.slab` of the step whose depth load-op resolved to `'clear'`):
  - `'load'` step whose target's last-cleared slab is not `view.slab` ⇒ `'clear'` (today's rule, same test).
  - `{ sample }` step ⇒ no depth attachment (`depthLoadOpFor` returns `undefined` for the object, as it did for `'sample'`); `sampledDepth = { view: renderTargets.depthViewOf(source), row: lastDepthClear.get(source) }` when the map has the source, else `{ view: renderTargets.farDepthView(), row: null }`; the step's `SlabView` is `{ ...slabViewOf(...), sampledDepth }`. The `if (step.depth === 'sample' && !rowCleared) break;` guard is DELETED.
  - Capture steps cannot sample (capture rosters are plain pass names); the capture branch keeps `depthLoadOpFor` and gains nothing.
- `contactShadowsPass.enabled` gains, before the mesh scan: `if (view.sampledDepth?.row !== view.slab) return false;` and `draw` reads `view.sampledDepth!.view` in place of `ctx.renderTargets.depthViewOf('foreground:0')` (both sites). The header's "it reads `foreground:0`'s depth" becomes "it reads the depth its step declared (`view.sampledDepth`), and only when its own row wrote it".
- `renderTargets.ts`: the placeholder is created and cleared in the factory (its own command encoder, one depth-only render pass, `queue.submit`), destroyed in `destroy()`. Never reallocated by `reconcile`.

- [ ] **Step 1: Replace the executor's guard test with the contract tests; add the placeholder test**

`executeFrame.test.ts` — delete `"skips a 'sample' step whose row's clearing step drew nothing"` and add (the `makeArgs` ctx's `renderTargets` mock gains `farDepthView: vi.fn(() => FAR_VIEW)`; read the fixture first):

```ts
it('hands a sampling step the far placeholder and row null when nothing cleared its source', () => {
  const sampler = makeContentPass({ name: 'sampler' });
  const program: FrameStep[] = [
    { kind: 'render', target: 'hdr', slab: NEAR0, depth: { sample: 'foreground:0' }, passes: [sampler] },
  ];
  const { args, renderTargets } = makeArgs({ program });
  executeFrame(args);
  const view = sampler.draw.mock.calls[0]![1] as SlabView;
  expect(view.sampledDepth).toEqual({ view: renderTargets.farDepthView(), row: null });
});

it("hands a sampling step the source's depth and the row that last cleared it", () => {
  const mars = makeContentPass({ name: 'mars' });
  const off = makeContentPass({ name: 'off', enabled: false });
  const sampler = makeContentPass({ name: 'sampler' });
  const program: FrameStep[] = [
    { kind: 'render', target: 'foreground:0', slab: 2, depth: 'clear', passes: [mars] },
    { kind: 'render', target: 'foreground:0', slab: 3, depth: 'clear', passes: [off] },
    { kind: 'render', target: 'foreground:0', slab: 3, depth: { sample: 'foreground:0' }, passes: [sampler] },
  ];
  const ctx = makeBodyCtx(['mars', 'venus']);
  const { args, renderTargets } = makeArgs({ program, ctx });
  executeFrame(args);
  const view = sampler.draw.mock.calls[0]![1] as SlabView;
  expect(view.sampledDepth!.view).toBe(renderTargets.depthViewOf('foreground:0'));
  expect(view.sampledDepth!.row).toBe(ctx.slabs[2]); // Mars's row, not the sampler's own
});

it('opens a sampling step with no depth attachment even on a depth-bearing target', () => {
  const env = makeEncoderEnv();
  const sampler = makeContentPass({ name: 'sampler' });
  const program: FrameStep[] = [
    { kind: 'render', target: 'foreground:0', slab: COSMO, passes: [sampler] },
    { kind: 'render', target: 'foreground:0', slab: COSMO, depth: { sample: 'foreground:0' }, passes: [sampler] },
  ];
  const { args } = makeArgs({ program, env });
  executeFrame(args);
  expect('depthStencilAttachment' in env.passes[1]!.desc).toBe(false);
});
```

`renderTargets.test.ts` (the device mock gains `createCommandEncoder` returning `{ beginRenderPass: () => ({ end() {} }), finish() {} }` and `queue: { submit: vi.fn() }`):

```ts
it('creates and clears the far-depth placeholder once, and farDepthView is stable across reconcile', () => {
  const { device, targets } = makeTargets(); // whatever the file's fixture is named
  const before = (device.createTexture as ReturnType<typeof vi.fn>).mock.calls.length;
  const a = targets.farDepthView();
  targets.reconcile(state, { width: 640, height: 480 });
  expect(targets.farDepthView()).toBe(a);
  expect((device.createTexture as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
  expect(device.queue.submit).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run both files, confirm the new tests fail**

Run: `npx vitest run tests/services/engine/frame/executeFrame.test.ts tests/services/gpu/renderTargets.test.ts`
Expected: FAIL (`farDepthView` missing; `sampledDepth` undefined; the third asserts on a pass that today is skipped).

- [ ] **Step 3: Implement `SampledDepth`, `farDepthView`, the executor map + resolution, the contact-shadows gate, the RENDERER.md paragraph**

- [ ] **Step 4: Full suite + typecheck green**

Run: `npm test` and `npm run typecheck`.
Expected: green; `frameFilePurity.test.ts` unchanged (no new frame files).

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/frame/SampledDepth.d.ts src/@types/engine/frame/SlabView.d.ts src/@types/rendering/RenderTargets.d.ts src/services/gpu/renderTargets.ts src/services/engine/frame/executeFrame.ts src/services/engine/frame/passes/contactShadowsPass.ts docs/RENDERER.md tests/services/engine/frame/executeFrame.test.ts tests/services/gpu/renderTargets.test.ts
git commit -m "refactor(frame): executor hands a sampling step its declared depth, or a far placeholder"
```

**review: yes** (executor + `SlabView` are files the renderer-landmine memory names).

---

## Verification (whole branch)

- `npm test`, `npm run typecheck` green; CI green on the draft PR.
- Pixel-identical eye-check by the user: a seated mesh body's contact shadow on terrain (Mars rover site) unchanged; a frame far from any body (no foreground rows) renders with no console error — the placeholder path.
- No `depthViewOf('foreground:0')` string remains under `src/services/engine/frame/passes/`.
