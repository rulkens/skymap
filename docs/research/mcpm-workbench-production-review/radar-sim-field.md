# Entanglement radar — MCPM workbench sim/field/gizmo layers

Scope: `tools/mcpm-workbench/src/sim/**`, `src/field/**`, `src/gizmo/**`, and the
MCPM WESL shaders they drive (`src/services/gpu/shaders/mcpm/**`). Read-only.
No edits, tests, probes, or builds were run.

---

## Finding 1 — TS↔WESL byte-layout/binding-slot family has no parity test

**Where:**
- `tools/mcpm-workbench/src/sim/createMcpmHarness.ts:37-39` (`PROPAGATE_SLOTS`,
  `DECAY_SLOTS`, `HISTOGRAM_STORAGE_SLOTS`) mirroring `src/services/gpu/shaders/mcpm/io.wesl:48-60`'s
  `@group(1)` binding numbers and `histogram.wesl:48-50`'s `@group(2)` bindings.
- `tools/mcpm-workbench/src/sim/createGridBuffers.ts:6-16` (`UNIFORM_BYTES=64`,
  `HISTOGRAM_FLAGS_BYTES=4`, `HISTOGRAM_BINS=17`, `HISTOGRAM_BASE=10`) mirroring
  `io.wesl:18-35`'s `McpmUniforms` (16×4B), `histogram.wesl:37-39`'s `HistogramFlags`,
  and `constants.wesl:20-22`'s `N_HISTOGRAM_BINS`/`HISTOGRAM_BASE`.
- `tools/mcpm-workbench/src/sim/encodeStep.ts:25` (`DECAY_WG_EDGE=8`) mirroring
  `constants.wesl:16-18`'s three `override DECAY_WG_* = 8u`.
- `tools/mcpm-workbench/src/render/boxPreviewPass.ts:53,59` (`BOX_UNIFORM_BYTES=80`,
  `GLYPH_SEGMENT_FLOATS=12`) mirroring `boxLines.wesl:22-33,48-57`'s `BoxUniform`/`GlyphSegment`.
- `tools/mcpm-workbench/src/render/writeMcpmCamera.ts:21` (`MCPM_CAMERA_BYTES=64`)
  mirroring `camera.wesl:10-19`'s `McpmCamera`.

**The braid:** the numeric layout of a struct/binding set (WESL, one language) ×
its hand-typed restatement as a byte-count/slot-index constant (TS, a second
language). Both sides can change independently — nothing forces them to move
together.

**The cost:** `grep -rl "BOX_UNIFORM_BYTES\|GLYPH_SEGMENT_FLOATS\|MCPM_CAMERA_BYTES\|PROPAGATE_SLOTS\|DECAY_SLOTS\|HISTOGRAM_STORAGE_SLOTS"` against `tests/` returns nothing — none of these pairs has a parity test, unlike the project's own exemplar for this exact pattern (`selectionEncoding.ts` + its sister `.wesl` + parity test, simplicity.md §8). The comments are aware and explicit ("byte-for-byte — keep the two in sync", "this alias is declared exactly once... and must keep this exact spelling") but comments aren't enforcement. Consequences differ by kind: a binding-slot mismatch (createMcpmHarness) fails LOUD — WebGPU validation rejects the pipeline/bind group at construction, caught by `npm run mcpm-workbench:probe`. A struct-offset mismatch (BoxUniform, GlyphSegment, McpmCamera, McpmUniforms field order) fails SILENT — WebGPU only validates total buffer size ≥ minBindingSize, not that floats land at the offsets the shader expects, so a field added/reordered on one side without the other produces a wrong-looking gizmo or camera with no error anywhere.

**Un-braided shape:** one small parity-test helper (or per-struct test) that decodes each `.wesl` struct's field list via a tiny parser or a hand-maintained fixture and asserts byte offsets/binding numbers against the TS constant — the pattern `selectionEncoding.ts` already establishes for this exact class of problem. Doesn't need to be one mega-test; even one test per struct closes the silent-drift risk.

**Confidence:** high. **Effort:** M (five-ish small structurally-similar tests, or one generic byte-offset-diffing helper reused five times).

---

## Finding 2 — "in-grid density sample" logic implemented independently in three places, two languages

**Where:**
- `src/services/gpu/shaders/mcpm/histogram.wesl:84-103` — GPU: `floor()` before the `i32` cast, then `inGrid()`, binning + `atomicAdd`.
- `tools/mcpm-workbench/validate/dataPointHistogram.ts:36-48` — Node CLI: `Math.floor` per axis, bounds check, `log1p` sum/mean.
- `tools/mcpm-workbench/src/state/histogram/histogramSlice.ts:27-43` (`recordHistogramSample`) — live UI: sums `log1p` over the GPU readback's `densities` array, dividing by the GPU's own `sampledCount`.

**The braid:** the *definition* of "which catalog points count, and how their density becomes one convergence number" is restated three times — once as WGSL arithmetic, once as CPU floor/bounds arithmetic, once as a JS reduction over the first kernel's output. The docblocks on all three are explicit that this is deliberate and unshared: `histogram.wesl:6-9` — "this identity is load-bearing, not incidental"; `dataPointHistogram.ts:10-17` — "That identity requires `Math.floor`... on BOTH sides"; `histogramSlice.ts:21-25` — **"Kept in sync by convention rather than shared code: that function bundles voxel-lookup + binning + the mean into one pass over a full readback cube, so there is no separable 'just the mean' call to share."**

**The cost:** this is the one place in the tool where three independent implementations must agree on a *statistic*, not a byte layout — a drift here is silently wrong data (the "same fit twice" noise-floor band Phase 3 measures, and the compare-CLI's pass/fail verdict against the VAC anchor, both key off this number). No test cross-checks `dataPointHistogram.ts`'s CLI output against `recordHistogramSample`'s live-UI arithmetic on the same synthetic cube; `tests/tools/mcpm-workbench/validate/dataPointHistogram.test.ts` only exercises the CLI function in isolation.

**Un-braided shape:** the docblock already argues the GPU kernel can't be un-duplicated (different execution model). The CLI/UI pair *can* — `recordHistogramSample`'s mean-of-in-grid-densities math is ~4 lines and could call a shared `meanLogTrace(densities, sampledCount)` helper that `dataPointHistogram.ts` also composes from, or at minimum a same-cube fixture test asserting both give the same number. Given the acknowledged GPU-side limit, a cheaper partial fix: one test that feeds `dataPointHistogram`'s per-point loop and `recordHistogramSample`'s reduction the same synthetic `(values, points)` pair and asserts equal `meanLogTrace`.

**Confidence:** high (self-documented duplication, no cross-check). **Effort:** S (shared helper or one parity test) to M (if reworking histogram.wesl's binning is judged in-scope too, which the docblock argues against).

---

## Finding 3 — Allocation-refusal message is computed, thrown, then discarded before reaching the UI

**Where:** `tools/mcpm-workbench/src/sim/planGridBudget.ts:54-63` builds a specific
refusal (`buffer` name, `requestedBytes`, `limitBytes`, `maxLongAxis`); `createMcpmHarness.ts:121-127`
turns it into an `Error` with that detail in the message; `tools/mcpm-workbench/src/ui/Viewport.tsx`'s
`buildOnce` catches it at the generic `catch (err)` (around line 665) and calls
`store.setState(st => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'error') }))` —
**never** `setCatalogStatusMessage`, even though that exact field exists on the
same slice (`catalogSlice.ts:103-108`) and is populated for the sibling
"no catalog points" case a few lines above (`Viewport.tsx:655-661`), and `App.tsx`
already renders `catalog.statusMessage` in a status slot (`App.tsx:38,55`).

**The braid:** what × how — `planGridBudget`'s refusal *encodes* "why," but the
consumer that owns "how the human finds out" drops that value at exactly the
one call site (a thrown Error from deep inside `createMcpmHarness`) where the
message is the most specific it will ever be (byte counts, offending buffer,
suggested fix). Every other status path in this slice writes through `statusMessage`; this one silently doesn't.

**The cost:** on a real over-budget grid (the exact failure mode spec §14 calls out as the primary risk — "the 1200-class grid may not fit any browser"), the maintainer sees a bare "error" badge and must open devtools to read `console.error('mcpm-workbench: build failed', err)` to learn which buffer, by how much, and what long axis would fit. This is the specific question the task brief asks — "does anything surface it, or can the tool wedge?" — answer: it doesn't wedge (the catch is real, the UI stays interactive), but the diagnosis the preflight worked to produce doesn't reach the human without opening the console.

**Un-braided shape:** in `buildOnce`'s catch, `setCatalogStatusMessage(st.catalog, err instanceof Error ? err.message : String(err))` alongside the existing `setCatalogLoadStatus(..., 'error')` — one line, reusing plumbing that already exists end-to-end.

**Confidence:** high. **Effort:** S.

---

## Finding 4 — `createMcpmHarness` braids "acquire a GPUDevice" with "build/step the sim" (medium — forward-looking)

**Where:** `tools/mcpm-workbench/src/sim/createMcpmHarness.ts:61-112` — the harness
takes `canvas: HTMLCanvasElement` and calls `initGpu(opts.canvas, {...})` itself
(line 105) as its first GPU action.

**The braid:** "how do you get a `GPUDevice`" (a browser/canvas concern — one call site, one caller) is fused with "given a device, build the sim's buffers/pipelines/step function" (device-agnostic; every kernel, buffer, and bind group after line 113 only needs `device`). These can vary independently: the spec's own §2 "Architected for (not built now)" names a future in-engine live MCPM layer sharing this exact shader family — that consumer already owns a `GPUDevice` from the main engine's own `initGpu` call (`src/services/engine/phases/initGpu.ts`) and cannot hand `createMcpmHarness` a second canvas without minting a second, wasteful device/context.

**The cost:** today, none — there is exactly one caller (`Viewport.tsx`). It becomes real the day the "architected for" engine integration is attempted: `createMcpmHarness` would need a signature change at that point anyway, so the entanglement is latent, not yet paid.

**Un-braided shape:** accept `device: GPUDevice` (plus whatever preflight info depends on `device.limits`/`device.features`) as a parameter, and let the browser-tool caller do `canvas → initGpu → device` itself, one level up, exactly as `flow-workbench`'s and the runtime engine's own phase-based `initGpu` callers already do. Small, mechanical, and defers cleanly — not urgent since the spec explicitly marks the engine integration as future work.

**Confidence:** medium (real, but v1-scoped-out by the spec's own Non-goals framing — arguably deliberate deferral, not an accident). **Effort:** S.

---

## Production-readiness notes (not braids, but asked for explicitly)

- **Device-loss handling:** `grep -rl "device.lost"` across `src/` and `tools/` returns only the two `probeGpuErrors.ts` gates (test-time) and a code comment in `readbackTrace.ts:40`. Nothing in `createMcpmHarness.ts` or the render loop subscribes to `device.lost` at interactive runtime. Given spec §14's own risk framing (multi-hour, multi-GB runs are the intended use case), a mid-run device loss makes `device.queue.submit` a silent no-op — the trace freezes with no HUD signal, no thrown error, nothing but a stalled picture. Worth a `device.lost.then(...)` handler that flips a "device lost — reload" status, mirroring the probe's own capture pattern.
- **NaN hygiene:** checked `deriveAgentWeights.ts`, `renormalizeWeightMass.ts`, `cullPointsToBox.ts`, `seedAgents.ts` for NaN propagation into the sim. This is handled carefully and correctly: `deriveAgentWeights` clamps `max(W,0)` before `log10`, degrades to uniform when every mass is NaN (avoiding a `0/0` scale), `cullPointsToBox`'s voxel-range comparison naturally excludes NaN positions (NaN comparisons are false), and `seedAgents` degrades `aroundData` to `uniform` when the culled set is empty (avoiding an `index[-1]` NaN scatter). No gap found here.
- **Extractability:** `createMcpmHarness.ts` and everything under `sim/`/`field/` import zero React and zero store/state modules — confirmed by import list (only `@types`, sibling `sim`/`field` files, and `src/services/gpu/*`). This matches the spec's own claim (§4: "the sim layer imports no React") and is genuinely true today. The one real coupling to the browser tool is the canvas-vs-device point in Finding 4 above; short of that, the sim core is cleanly reusable.

---

## Already clean

- `field/worldToBoxLocal.ts` / `boxLocalToWorld.ts` / `worldToVoxel.ts` / `voxelToWorld.ts` — a genuinely single-sourced affine transform: `worldToVoxel` composes `worldToBoxLocal`, `voxelToWorld` composes `boxLocalToWorld`, both built on the one shared `rotateVec3ByQuat`. No duplicated math, correct conjugate/direct-rotation split for position-vs-direction (also correctly reused in `boxBasisVectors.ts` and `boxPreviewPass.ts`'s comment explaining the same "direction not position" leg).
- `field/deriveGridBox.ts` vs `field/autoFitGridBox.ts` — not a duplicate pair despite similar names; `deriveGridBox` is the sole call site that turns UI state into a `GridBox`, composing `autoFitGridBox` once. Its docblock is explicit about why "auto-fit" isn't a persistent mode this function branches on.
- `gizmo/*` — `GizmoHandleId` is a proper 3-arm tagged union; `pickGizmoHandle.ts` iterates the three typed arrays directly rather than switching on `.kind` (appropriate given a closed, inherently-3-way domain, not a growing enum); `encodeGizmoHandleId.ts` is the only place a `kind ===` chain appears, and it's a single 2-line ternary, not a repeated pattern.
- `sim/planGridBudget.ts` / `createGridBuffers.ts` — the byte-budget arithmetic is genuinely single-sourced within TS (`BYTES_PER_ELEMENT`, `AGENT_LANES` both live in one file and are imported, not restated).
- `sim/specializeGridElement.ts` — one small, well-tested textual rewrite, reused identically for all three kernel modules; no duplication.
