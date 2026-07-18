# Renderer Unification 01 — Compositor primitive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking. **Every task that creates or edits a `.wesl` file must load the `wesl-shaders` skill first.**

**Spec:** `docs/superpowers/specs/2026-06-29-renderer-unification-design.md` — Phase 1 only.
**Series:** plan 01 of the renderer-unification phasing. Phases 2 (slab/target/ContentLayer/FrameStep) and 3 (pick program) are separate future plans.

**Goal:** Introduce the `Compositor` primitive — one factory owning every "merge an offscreen into a target" pipeline, keyed by `(blend, dstFormat)`, reusing `lib/tonemap.wesl` when a tone-map is requested — and repoint `postProcess`'s HDR→swap tonemap draw to it, deleting the bespoke tone-map pipeline it replaces. Behaviour-neutral: the rendered frame is visually identical before and after.

**Architecture:** `postProcess` KEEPS ownership of the HDR target/texture (target-table ownership moves in phase 2); only its tone-map _pipeline_ half is replaced by a delegation to `state.gpu.compositor`. The `PostProcess.draw` public signature is unchanged, so `renderFrame.ts` is untouched. The Compositor is a long-lived GPU-resource owner: constructed in `initGpu`, stored on `state.gpu.compositor`, released in `engine.ts`'s destroy chain. Its `draw` signature is the spec's, verbatim: `draw(pass, src, blend, tone)` + `destroy()`. Pipelines (plus a per-pipeline uniform buffer) are built lazily and cached by `(blend, dstFormat)`; all three blends (`replace` / `over` / `additive`) are implemented now so PR #386's `foregroundComposite` dissolves into one `draw(..., 'over', TONE)` call on rebase, even though phase 1 has exactly one consumer (`replace` + tone).

**Tech Stack:** TypeScript, WebGPU, WESL (`?static` linker), Vitest with mocked `GPUDevice` (the `postProcess.test.ts:28-56` mock shape).

## Scope verification (the evidence behind the spec's corrected phase-1 list)

The spec's original phase-1 draft named three repoint targets; shader verification narrowed it to one, and the spec was corrected in the same PR (see its "Resolved during iteration" section). This section records the evidence. Two candidates do **not** fit the Compositor model and are **out of scope** here:

1. **`drawPickDebugOverlay` is not a composite.** Its fragment (`src/services/gpu/shaders/pickDebugOverlay/fragment.wesl`) is a bespoke r32uint visualisation: `texture_2d<u32>` + `textureLoad` (integer textures cannot be `textureSample`d), a per-source debug palette, and hashed per-instance intensity. That is a _debug renderer_, not "sample rgba src, optional tonemap". It stays as-is.
2. **`volumeUpsamplePass`'s blit is not a plain sample.** Its fragment (`src/services/gpu/shaders/volumeUpsample/fragment.wesl`) is a deliberate 4-tap rotated-grid low-pass that suppresses the raymarch's per-fragment jitter grain. Replacing it with the Compositor's single-sample fragment would visibly increase noise — not behaviour-neutral. It stays as-is.
3. **The locked `draw` signature cannot recover `dstFormat` from the pass encoder** (WebGPU exposes no attachment-format getter on `GPURenderPassEncoder`). Phase 1 resolves it with a constructor-provided mapping (`'replace'`/`'over'` → swap format, `'additive'` → HDR format) — an acknowledged, documented blend→format coupling that phase 2 dissolves when `encodeCompositeStep` knows each dest target's `RenderTargetSpec.format` and can key the cache directly. The cache key is `(blend, dstFormat)` from day one so that transition is a lookup change, not a restructure.

Net phase-1 scope: the Compositor primitive + the `postProcess` tonemap repoint. That is still the load-bearing de-duplication — PR #386's byte-identical second tone-map is the duplication the spec's "Why now" names, and it lands on this primitive.

## Global Constraints

- **Behaviour-neutral phase:** the rendered frame must be visually identical before/after; the final task includes a user visual gate on the dev server.
- **One type per file** in `src/@types`; `type` aliases never `interface`; filename = type name.
- **WESL shaders:** NO backticks in comments (parse error); literal `package::` import prefix; `?static` on the TS import side; be meticulous — shader edits get extra scrutiny. The new shader dir follows the existing layout (`vertex.wesl` / `fragment.wesl` / `io.wesl`).
- **Factory takes a named bag** (`docs/superpowers/conventions/renderers.md`), `satisfies Renderer` latch, GPU resources in the closure, `destroy()` releases everything.
- **Didactic comments** (why + what the alternative was); timeless — no dates/PR refs.
- **Before writing any new helper, grep `src/utils`** for an existing one (search-before-writing-helpers). Known reuse in this plan: `clampExposure` (`src/utils/clampExposure.ts`), `createShaderModuleWithDevLog` (`src/services/gpu/shaderCompileLogger.ts`).
- **Typed `vi.fn` in test fixtures:** `vi.fn<() => void>()`, never bare `vi.fn()`.
- **Keep the suite green:** `npm run typecheck` + `npm test` per task; prettier ONLY on touched files.
- **Final task:** run the entanglement-radar lens over the phase diff — verify no mirror state, no per-type branches, the spec's un-braided `(blend, dstFormat)`-keyed table preserved.
- Commits stage specific paths, never `git add -A`.

---

## Task 1 — contract types

**Files**

- Create: `src/@types/rendering/CompositeBlend.d.ts`
- Create: `src/@types/rendering/ToneMap.d.ts`
- Create: `src/@types/rendering/Compositor.d.ts`

**Interfaces** (the spec sketch, split one-type-per-file):

```ts
// CompositeBlend.d.ts
export type CompositeBlend =
  | 'replace' // overwrite dst          (hdr → swap: swap is cleared)
  | 'over' // Porter-Duff OVER       (future: foreground → swap, PR #386)
  | 'additive'; // add into dst           (no consumer yet; row is cheap, kept for symmetry)

// ToneMap.d.ts — null at the call site means "source is already LDR, pass through"
export type ToneMap = {
  readonly exposure: number;
  readonly curve: ToneMapCurve; // deliberate narrowing of the spec sketch's bare `number`
};

// Compositor.d.ts
export type Compositor = {
  readonly label: string; // Renderer base contract (spec sketch omits it; renderers.md requires it)
  /** Pipelines keyed by (blend, dstFormat); applies the shared lib/tonemap.wesl when `tone` is set. */
  draw(
    pass: GPURenderPassEncoder,
    src: GPUTextureView,
    blend: CompositeBlend,
    tone: ToneMap | null,
  ): void;
  destroy(): void;
};
```

`ToneMapCurve` is the existing literal union at `src/@types/data/ToneMapCurve.d.ts`. Deep relative imports, no barrels. Docblocks explain the tone-null semantics and the phase-2 destiny (CompositeStep carries `(blend, tone)` as data).

- [x] Write the three `.d.ts` files.
- [x] `npm run typecheck` → clean.
- [x] Commit (stage the three new files).

---

## Task 2 — Compositor factory + shaders + tests; tonemap math moves in

**Files**

- Create: `tests/services/gpu/passes/compositor.test.ts`
- Create: `src/services/gpu/passes/compositor.ts`
- Create: `src/services/gpu/shaders/compositor/io.wesl`, `.../vertex.wesl`, `.../fragment.wesl`
- Modify: `src/services/gpu/passes/postProcess.ts` (relocate the JS-mirror cluster; transitional constant import)
- Modify: `tests/services/gpu/passes/toneMap.test.ts`, `tests/services/gpu/passes/postProcess.test.ts` (import repoints)

**Factory signature**

```ts
export function createCompositor(init: {
  device: GPUDevice;
  swapFormat: GPUTextureFormat; // dst for 'replace' and 'over'
  hdrFormat: GPUTextureFormat; // dst for 'additive'
}): Compositor;
```

`label: 'compositor'`; `satisfies Renderer` at the return site.

**Internal contract** (the load-bearing decisions; bodies are the implementer's):

- Lazy cache `Map<string, { pipeline: GPURenderPipeline; uniformBuffer: GPUBuffer }>` keyed `` `${blend}:${dstFormat}` `` where `dstFormat` comes from the constructor mapping above. One uniform buffer _per cache entry_ — a single shared buffer would make multiple composite draws in one frame last-write-wins (the known `queue.writeBuffer`-interleave bite; see CLAUDE.md "Things that have bitten us"). Document both choices didactically.
- Blend-state table (data, not branches — one `Record<CompositeBlend, { blend: GPUBlendState | undefined; preserveAlpha: 0 | 1 }>`; alpha semantics are a column of this table, NOT a draw argument):

  | blend      | color blend                                | alpha blend                          | preserveAlpha |
  | ---------- | ------------------------------------------ | ------------------------------------ | ------------- |
  | `replace`  | `undefined` — no blending, overwrite       | `undefined`                          | 0             |
  | `over`     | `src src-alpha, dst one-minus-src-alpha, add` | `src one, dst one-minus-src-alpha, add` | 1             |
  | `additive` | `src one, dst one, add`                    | `src one, dst one, add`              | 1             |

  `over` is **straight-alpha** Porter-Duff, matching PR #386's `foregroundComposite.ts` blend state byte-for-byte (the fragment emits un-premultiplied colour; the blend hardware applies the coverage multiply — premultiplying in the shader would double-multiply, cite the `foregroundComposite/fragment.wesl` "straight vs premultiplied" rationale). `additive` matches `volumeUpsample.ts:82-87`. `preserveAlpha` feeds the uniform below: `replace` forces alpha 1.0 (the swap chain is premultiplied-alphaMode and the tonemap consumer relies on an opaque result), `over`/`additive` carry the source's alpha (coverage is data the composite must preserve — a translucent atmosphere tints labels rather than hard-masking them).

- Uniform layout — 32-byte buffer, packed via `Float32Array`/`Uint32Array` views over one `ArrayBuffer` (the `postProcess.ts:249-251` idiom):

  | offset | field         | type | value                                                   |
  | ------ | ------------- | ---- | ------------------------------------------------------- |
  | 0      | exposure      | f32  | `clampExposure(tone.exposure)`; `1.0` when tone is null |
  | 4      | whitepointSq  | f32  | `DEFAULT_WHITEPOINT²` (16.0); `0` when tone is null     |
  | 8      | asinhSoftness | f32  | `DEFAULT_ASINH_SOFTNESS` (10.0); `0` when tone is null  |
  | 12     | curve         | u32  | `tone.curve >>> 0`; `0` when tone is null               |
  | 16     | toneEnabled   | u32  | `1` when tone is set, `0` when null                     |
  | 20     | preserveAlpha | u32  | the blend-table column above — derived from `blend` at pack time, never passed by the caller |
  | 24–31  | padding       | —    | zero                                                    |

  The exposure clamp moves here with the pipeline — point-of-use ownership per `clampExposure.ts`'s docblock.

- `draw(pass, src, blend, tone)`: resolve/build the cache entry → pack + `writeBuffer` → `createBindGroup` per draw (src view is recreated on resize; caching would bind a destroyed view — same rationale as `volumeUpsample.ts:94-106`) → `setPipeline` / `setBindGroup` / `draw(3, 1, 0, 0)`. It does NOT `beginRenderPass` — the caller owns the pass (and its `timestampWrites`).
- Sampler: one shared `nearest` sampler (carry over the "each texel sampled exactly once at its centre; linear may require float32-filterable" rationale from `postProcess.ts:206-214`).
- `destroy()`: destroy every cached uniform buffer, clear the cache.
- Move the **JS-mirror curve cluster** — `DEFAULT_WHITEPOINT`, `DEFAULT_ASINH_SOFTNESS`, `linearClamp`, `reinhardExtended`, `asinhStretch`, `gamma2`, `acesFilmic` (`postProcess.ts:107-165`) — into `compositor.ts` verbatim, with the "kept by-hand-in-sync with the WGSL" header. The shader owner owns the mirror. `postProcess.ts` keeps packing its own uniform until Task 4, so it transitionally imports the two `DEFAULT_*` constants from `'./compositor'` (export them) — that import is deleted in Task 4.

**Shaders** (`shaders/compositor/`):

- `io.wesl`: `CompositorUniforms` struct matching the byte table above (6 fields), plus `VSOut { @builtin(position) clip, @location(0) uv }`. Model the header on `toneMap/io.wesl`.
- `vertex.wesl`: the covering-triangle stage — functionally identical to `toneMap/vertex.wesl:26-38`, importing `package::compositor::io::VSOut`. Carry the covering-triangle-vs-quad rationale.
- `fragment.wesl`: bindings `@group(0)` — `srcTex: texture_2d<f32>` @0, `srcSamp: sampler` @1, `u: CompositorUniforms` @2. Body contract: `textureSample` ONCE, unconditionally, at the top (keeps the sample out of any control flow — no uniformity-analysis edge cases); then `if (u.toneEnabled == 0u) { return sample; }` (raw pass-through: no clamp, alpha preserved — additive HDR values legitimately exceed 1); else scale `.rgb` by `u.exposure` and run the five-curve chain exactly as `toneMap/fragment.wesl:54-67` (same `applyLinear`/`applyReinhard`/`applyAsinh`/`applyGamma2`/`applyAces` imports from `package::lib::tonemap`, same ACES fallback for unknown curve values), returning `vec4<f32>(mapped, select(1.0, sample.a, u.preserveAlpha == 1u))` — `replace` packs `preserveAlpha=0` and gets the historical alpha-1.0 (the swap chain is premultiplied-alphaMode; carry the `toneMap/fragment.wesl:68-71` comment), while `over`/`additive` pack `1` and carry the source's coverage straight (un-premultiplied — the blend hardware applies the `src-alpha` multiply; carry the `foregroundComposite/fragment.wesl` double-multiplication warning). `lib/tonemap.wesl` is untouched — it stays the single source of curve truth.

**Tests** (`compositor.test.ts` — extend the `postProcess.test.ts:28-56` `mockDevice` shape; mock pass = `{ setPipeline: vi.fn<...>(), setBindGroup: vi.fn<...>(), draw: vi.fn<...>() }`):

- [x] `exposes label, draw, destroy` — `label === 'compositor'`, both methods are functions.
- [x] `builds one pipeline per (blend, dstFormat) key and reuses it across draws` — two `draw(..., 'replace', TONE)` calls → `device.createRenderPipeline` called exactly once.
- [x] `distinct blends build distinct pipelines` — `'replace'` then `'additive'` → two `createRenderPipeline` calls.
- [x] `replace has no blend state; over is straight-alpha OVER (color src-alpha/one-minus-src-alpha, alpha one/one-minus-src-alpha); additive is one/one` — inspect each captured pipeline descriptor's `fragment.targets[0].blend` against the table above.
- [x] `replace and over target the swap format; additive targets the hdr format` — `fragment.targets[0].format` per captured descriptor (`swapFormat: 'bgra8unorm'`, `hdrFormat: 'rgba16float'` in the fixture).
- [x] `tone set packs clamped exposure, curve, and toneEnabled=1` — capture `queue.writeBuffer`'s bytes; with `{ exposure: 1e9, curve: 2 }` assert f32@0 === 16 (upper clamp), f32@4 === 16 (whitepoint²), f32@8 === 10, u32@12 === 2, u32@16 === 1. Second draw with `exposure: 1e-9` asserts the 0.05 lower clamp.
- [x] `tone null packs toneEnabled=0` — u32@16 === 0.
- [x] `preserveAlpha packs from the blend, not the caller` — `draw(..., 'replace', TONE)` → u32@20 === 0; `draw(..., 'over', TONE)` → u32@20 === 1.
- [x] `draw encodes the covering triangle` — `pass.draw` called with `(3, 1, 0, 0)`; `setPipeline` + `setBindGroup` called; no `beginRenderPass` anywhere (the mock device has none to call).
- [x] `destroy releases every cached uniform buffer` — after draws on two keys, `destroy()` calls `.destroy()` on both `createBuffer` results.
- [x] Repoint `toneMap.test.ts:16-22` and `postProcess.test.ts:19-26` curve imports to `'.../compositor'`; delete the now-redundant `postProcess JS-mirror tone-map curves` describe block (`postProcess.test.ts:92-111`) — `toneMap.test.ts` owns that coverage. (postProcess.test.ts imports removed outright — sole consumer block was deleted; toneMap.test.ts repointed.)
- [x] `npm test -- compositor toneMap postProcess` → all pass (new suite + repointed suites).
- [x] `npm run typecheck` → clean.
- [x] Commit (stage the new + modified files by path).

---

## Task 3 — engine wiring: handle slot, construction, teardown

**Files**

- Modify: `src/@types/engine/handles/EngineGpuHandles.d.ts`
- Modify: `src/services/engine/engine.ts` (state literal + destroy chain)
- Modify: `src/services/engine/phases/initGpu.ts`
- Modify: `tests/services/engine/phases/initGpu.destroyReachability.test.ts`

**Contract:**

- `EngineGpuHandles` gains `compositor: Compositor | null` with a docblock following the bag's lifecycle rule (null → set once by `initGpu` → destroyed + re-nulled). Place it next to `postProcess` (`EngineGpuHandles.d.ts:113-119`); note it owns the cached pipelines' uniform buffers, so the destroy chain must reach it.
- `engine.ts` state literal (`engine.ts:259` area): add `compositor: null`. Destroy chain (`engine.ts:646-648` area): `state.gpu.compositor?.destroy(); state.gpu.compositor = null;` adjacent to the `postProcess` entry.
- `initGpu.ts`: construct the compositor immediately BEFORE `createPostProcess` (`initGpu.ts:134-139`) — Task 4 threads it into the postProcess bag, so lexical order must make the dependency obvious:
  ```ts
  const compositor = createCompositor({ device, swapFormat: format, hdrFormat: 'rgba16float' });
  state.gpu.compositor = compositor;
  ```
  Didactic comment: one compositor serves every offscreen→target merge; the blend→dstFormat mapping is constructor data because a render-pass encoder cannot be queried for its attachment format.
- `initGpu.destroyReachability.test.ts`: add a `vi.mock` for `'../../../../src/services/gpu/passes/compositor'` (same `makeStub` shape as `postProcess` at `initGpu.destroyReachability.test.ts:94-96` — the mock also keeps the `?static` shader imports from evaluating in JSDOM), add `compositor: null` to `makeState()`'s gpu bag, and extend the assertions.

**Tests** (extend the existing suites in that file):

- [x] `writes compositor onto state.gpu.*` — after `initGpu`, `state.gpu.compositor` is the stub.
- [x] `replaying the destroy chain reaches compositor.destroy()` — `state.gpu.compositor?.destroy()` + null-out; stub's destroy called once, field null.
- [x] Implement the wiring above. (Plus forced-minimal `compositor: null` in `tests/@types/engineState.test.ts` strict literals.)
- [x] `npm test -- initGpu.destroyReachability` → green (existing + new assertions).
- [x] `npm run typecheck` + `npm test` → full suite green (nothing consumes the handle yet; that is expected and fine for this task).
- [x] Commit.

---

## Task 4 — repoint postProcess; delete the bespoke tone-map pipeline

**Files**

- Modify: `src/services/gpu/passes/postProcess.ts`
- Modify: `src/@types/rendering/PostProcess.d.ts` (docstrings only — the shape is unchanged)
- Modify: `src/services/engine/phases/initGpu.ts` (call site)
- Delete: `src/services/gpu/shaders/toneMap/vertex.wesl`, `.../fragment.wesl`, `.../io.wesl`
- Modify: `tests/services/gpu/passes/postProcess.test.ts`

**New factory signature** (positional → named bag, per renderers.md "convert when you next need a new dependency"; `swapFormat` is dropped entirely — its only use was the deleted pipeline's target descriptor):

```ts
export function createPostProcess(init: {
  device: GPUDevice;
  size: Size;
  compositor: Compositor; // non-null: constructed lines above in initGpu
}): PostProcess;
```

**Contract:**

- `PostProcess.draw(encoder, swapView, exposure, curve, timingDescriptor?)` keeps its exact signature (`PostProcess.d.ts:33-39`) so `renderFrame.ts:158-164` is untouched. Its body becomes: begin the swap render pass exactly as today (clear-to-black attachment + conditional `timestampWrites` spread — `postProcess.ts:284-299`, keep the byte-identity comment), then `compositor.draw(pass, hdrView, 'replace', { exposure, curve })`, then `pass.end()`. Raw `exposure` is forwarded — the clamp now lives in the compositor (Task 2).
- Delete from `postProcess.ts`: the `?static` shader imports, `createShaderModuleWithDevLog` calls, sampler, uniform buffer + packing views, bind-group layout, pipeline, per-draw bind group, and the `clampExposure` import; `destroy()` shrinks to the HDR texture alone. Delete the transitional `DEFAULT_*` import from Task 2. Rewrite the module header: it now owns the HDR target and _delegates_ the tonemap composite; keep the HDR-target rationale paragraphs, drop the five-curves/pipeline paragraphs (they move conceptually to `compositor.ts`).
- `initGpu.ts:134-139`: `createPostProcess({ device, size: { width: canvas.width, height: canvas.height }, compositor })`.
- Delete the three `shaders/toneMap/*.wesl` files (grep first — `vsCode from '../shaders/toneMap/...'` in `postProcess.ts` must be the only importers).

**Tests** (`postProcess.test.ts` — mock compositor: `{ label: 'compositor', draw: vi.fn<Compositor['draw']>(), destroy: vi.fn<() => void>() }`; mock encoder: `{ beginRenderPass: vi.fn(() => ({ end: vi.fn<() => void>() })) }`):

- [x] Update the existing three tests (`exposes view, resize, draw, destroy` / `view reflects the new texture immediately after resize` / destroy-release) to the bag call shape; the destroy test now asserts the HDR texture's destroy fired and `device.createBuffer` was **never called** (the uniform buffer is gone).
- [x] Add `draw opens one clearing pass on the swap view and delegates to the compositor` — `beginRenderPass` called once with `colorAttachments[0].view === swapView` and `loadOp: 'clear'`; `compositor.draw` called with the begun pass, the current HDR view, `'replace'`, and `{ exposure: 1.5, curve: 2 }` (raw, unclamped); the pass's `end` called.
- [x] Add `timing descriptor is spread into the internal pass only when provided` — with a descriptor, `beginRenderPass` arg has `timestampWrites`; without, the property is absent.
- [x] Implement; delete the shader files.
- [x] `npm test -- postProcess compositor toneMap initGpu.destroyReachability` → green.
- [x] `npm run typecheck` + `npm test` → full suite green.
- [x] Commit (stage `postProcess.ts`, `PostProcess.d.ts`, `initGpu.ts`, the test, and the three deletions by path).

---

## Task 5 — gate: full suite, visual baseline, entanglement radar

- [x] `npm run typecheck` + `npm test` → everything green.
- [x] Grep for stragglers: no references to `shaders/toneMap` remain; `linearClamp`/`reinhardExtended`/etc. are imported only from `compositor.ts`; `clampExposure` has exactly one consumer (`compositor.ts`). (Sweep also repointed stale comment pointers in proceduralDisks / pickDebugOverlay / volumeUpsample / fullscreenTri / toneMapCurve.)
- [x] Prettier the touched files only.
- [x] **User visual gate** on the dev server (leave it running): confirm the scene is unchanged — tone-map curve switching in the settings panel still works across all five curves, exposure slider behaves identically at both extremes (clamp intact), volumes and the pick-buffer debug overlay unchanged. This is the behaviour-neutral acceptance for the phase.
- [x] Run the `entanglement-radar` skill over the phase diff. Verify: no mirror state (the compositor caches no settings values — exposure/curve arrive per draw); no per-blend `if`-chains (blend-state and dstFormat resolution are data tables); the `(blend, dstFormat)` cache key is preserved as the spec's un-braided axis pair. Named accepted residue: the constructor-scoped blend→dstFormat mapping (Scope verification item 3) — confirm it is documented at the definition and nowhere else. (All four points verified; one radar finding — the per-entry-buffer race guarantee is per-key, not per-draw — addressed by narrowing the header's claim.)
- [x] Commit any radar fixes; final commit of the plan checkbox state.
