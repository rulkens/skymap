# Entanglement radar — MCPM workbench render layer + Viewport orchestrator

Reviewed against `docs/superpowers/conventions/simplicity.md` and
`docs/superpowers/specs/2026-08-18-mcpm-workbench-design.md`. Scope:
`tools/mcpm-workbench/src/ui/Viewport.tsx` (committed HEAD — a bug-fix agent may
be mid-edit on the working copy) and `tools/mcpm-workbench/src/render/**`.

Ranked by leverage (highest first).

---

## 1. Viewport.tsx is a genuine god object — five jobs, one 980-line closure

**Where:** `tools/mcpm-workbench/src/ui/Viewport.tsx:192-978`, the whole
`useEffect` body.

**The braid:** at least five independently-variable jobs share one function
scope and ~30 `let`-bound closure variables: (a) the RAF render loop
(`startLoop`/`frame`), (b) orbit-camera pointer/wheel input, (c) the gizmo
drag state machine (hit-test, translate/resize/rotate math), (d) rebuild
orchestration (`requestBuild`/`buildOnce`/`buildFromPoints`, generation
tracking, catalog loading, harness + RenderGraph construction/disposal), (e)
export/histogram/preview-pass side effects triggered off store tokens. None of
these need to change together: tuning zoom feel, adding an export leg, and
changing the rebuild debounce are three unrelated edits that today all require
reading (and risk touching) the same 980-line file.

**The cost:** onboarding cost for any single change is "read the whole
orchestrator," not "read the 100-line piece that owns this." The FPS tracker
(`lastFrameTime`/`fpsEma`/`lastFpsPushTime`/`lastPushedFps`), the gizmo state
(`dragging`/`panning`/`lastX`/`lastY`/`gizmoDragging`/`hoverHandle`), and the
token-diff sentinels (`lastResetToken`/`lastClearToken`/`lastExportToken`/
`lastScfdToken`/`lastSampleRandomly`/`lastPreviewPacked`/`lastVolpathKey`) are
each self-contained enough to be their own tiny controller, but are
interleaved in one closure instead.

**Un-braided shape — the two extractions that pay for themselves:**
- **Pointer/gizmo input** (lines 756-964, ~210 lines: `onPointerDown/Up/Move`,
  `onWheel`, `onContextMenu`, `rayFromPointer`, `arrowLengthMpcFor`, `axesFor`,
  `ringReferenceDirFor`, `isAxisDrag`) → a `createViewportInput({ canvas,
  store, getBoxVisible, getBuiltBox... })` factory, same shape as the
  renderer-factory convention already used elsewhere in the tool
  (`createTracePass`, `createSplatPass`, …). It only needs `canvas` + `store`
  + a couple of box/camera getters — none of the harness/render-graph state.
  This is the single biggest, cleanest lever.
- **FPS tracker** (lines 246-249, 404-410, 425-438) → `createFpsTracker()` →
  `.sample(now): number | null`. Trivial, self-testable, zero coupling to
  anything else in the file.

`buildKey`/`gridShapeKeyFor` are already correctly extracted (per the prompt's
note) — these two follow the same precedent and should be the next cut.

**Confidence:** high. **Effort:** L for the whole file; S for the FPS
tracker alone, M for the pointer/gizmo controller (has to thread `now` and a
couple of store-derived getters cleanly).

---

## 2. Four hand-copied token-diff blocks in the store subscriber

**Where:** `Viewport.tsx:705-751` (`resetToken`/`clearTraceToken`/
`exportToken`/`scfdToken`, each `if (s.sim.X !== lastX) { lastX = s.sim.X;
<do the thing>; }`).

**The braid:** "which store token exists" and "what happens when it changes"
are the same *shape* of fact, restated four times by hand instead of once as
data. This is the exact pattern `simplicity.md`'s own "Known entanglements"
section already flags elsewhere in the codebase (`selectionWakeSaga.ts` /
`selectionRowsSaga.ts` — "the writer set × each consumer's copy of it") and
principle #7's "second `if` on the same discriminant → registry" trigger.

**The cost:** adding a fifth one-shot token (plausible — the tool already has
five: reset/clearTrace/export/scfd/previewPacked-adjacent) means remembering
to hand-write a fifth copy-pasted block. Nothing catches a forgotten one at
compile time or test time; the previous instance of this exact shape in the
codebase produced two separate live bugs (per the doc's own citation).

**Un-braided shape:** a small table — `Record<'reset'|'clearTrace'|'export'|
'scfd', { read: (s) => number; run: (h, s, store) => void }>` — iterated
generically each subscriber tick. `resetToken`'s handler does more (also
resets step count/histogram/camera) but that's still one row's closure, not a
reason to keep the chain.

**Confidence:** high. **Effort:** S-M.

---

## 3. `axesFor` duplicated verbatim

**Where:** `Viewport.tsx:174-180` and `render/boxPreviewPass.ts:119-125` —
byte-identical function bodies (`boxBasisVectors(rotation)` reshaped into a
3-tuple), each with its own near-identical doc comment that cross-references
the *other* file's copy by name ("same reshape boxPreviewPass.ts applies" /
"...Viewport.tsx applies").

**The cost:** two homes for one fact. The comments prove the authors already
know they're the same thing — they just didn't collapse it. A future change
to the reshape (e.g. a different axis order) has to be found and applied
twice.

**Un-braided shape:** one file, `field/boxAxesFor.ts` (one-symbol-per-file
convention), imported by both. Mechanical, no behavior change.

**Confidence:** high. **Effort:** S.

---

## 4. T18 preview-trace pass breaks RenderGraph's own ownership contract

**Where:** `Viewport.tsx:341-371` (`runPreviewPacked`) vs.
`render/RenderGraph.ts:57-143` (the `attachTrace`/`drawTrace`/`attachVolpath`/
`attachAgents` contract).

**The braid:** every other pass follows "caller hands RenderGraph a
`TraceSource`/`AgentBuffers`, RenderGraph owns pass construction
(`createTracePass`, `createSplatPass`, …) internally." The preview-packed view
breaks this: `Viewport.tsx` imports `createTracePass` and `LAYER_BLEND`
directly and builds a `TracePass` itself (`h.gpu.device.createShaderModule`,
`graph.hdrFormat`), then hands the finished pass back into
`graph.drawTracePass` for marching only. RenderGraph.ts's own doc comment
names this ("T18's previewPass, which Viewport owns and draws directly,
bypassing attachTrace/drawTrace") — the doc is honest about it, which is
exactly the "documenting a knot well is not removing it" signal
`simplicity.md` calls a STOP trigger.

**Is the asymmetry essential?** No. A preview trace and a live trace are the
same `TracePass` shape over a different buffer with a different lifetime
(rebuilt on toggle-on vs. rebuilt on harness rebuild) — that's a lifetime
difference, not a construction-ownership difference. Compare: `LAYER_BLEND`
vs. `OVERLAY_BLEND` (below) *is* essential (light-emitting vs. UI-overlay
semantics) and is handled cleanly — this one isn't the same kind of thing.

**The cost:** `{ device, targetFormat: graph.hdrFormat, blend: LAYER_BLEND,
makeShader, source }` — the recipe for "how to build a TracePass" — now has
two homes: `RenderGraph.attachTrace` (internal) and `Viewport.runPreviewPacked`
(external, copy-pasted). If `attachTrace`'s construction ever changes (a new
bind group, say), the preview path silently doesn't get it.

**Un-braided shape:** `RenderGraph.attachPreviewTrace(source)` /
`drawPreviewTrace()` / implicit dispose, symmetric with `attachTrace`/
`drawTrace` but independently swappable — Viewport stops importing
`createTracePass`/`LAYER_BLEND` entirely.

**Confidence:** medium. **Effort:** M.

---

## 5. `harness` / `renderGraph` / `points` / `latestWeights` — one lifecycle, four separately-mutable locals

**Where:** `Viewport.tsx:206-212`, written across `buildFromPoints`
(`:534-614`), read across `frame()`, `runExport`, `runScfdExport`,
`runPreviewPacked`, `runHistogram`, and the store subscriber.

**The braid:** these four values become valid together and invalid together
(one rebuild replaces all of them atomically in intent), but are stored as
four independent `let`s rather than one handle. Today's code is careful
enough that no bug is visible — `frame()`'s `!harness || !renderGraph` guard
happens to cover the window where `harness` is set but `renderGraph` isn't yet
— but that safety is a property of *this* call ordering, not of the type.

**The cost:** low today (nothing currently reads one without the other in an
inconsistent way), but it's fragile-by-convention: a future edit that adds a
consumer reading only `harness` (as `runExport`/`runScfdExport` already do,
correctly, since they don't need `renderGraph`) has no compiler help
distinguishing "safe to read `harness` alone" from "needs the whole session."

**Un-braided shape:** `let session: { harness, renderGraph, points, weights,
box } | null` replacing the four/five separate lets, replaced atomically at
the end of `buildFromPoints`. Lower priority than #1/#2/#4 — flagging as a
latent risk, not an active bug.

**Confidence:** medium-low (no observed bug; structural risk). **Effort:** M.

---

## 6. "Non-parallel helper axis" fallback copy-pasted three times

**Where:** `render/cameraBasis.ts:41`, `render/boxPreviewPass.ts:96`
(`crossArmVectors`), `Viewport.tsx:188` (`ringReferenceDirFor`) — all three
independently write `Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]`.

**The cost:** small (one-liner, well-commented, each site cross-references
the others by name, so drift is unlikely to go unnoticed) — but it's exactly
the shape the one-function-per-utils-file convention exists to catch: three
homes for one fact instead of one `utils/math/nonParallelHelperAxis.ts`
covered by one test.

**Confidence:** medium. **Effort:** S.

---

## 7. Draw order is prescribed in a comment, enforced only by call-site sequence, pinned by no test

**Where:** `render/RenderGraph.ts:12-14` (doc: "Draw order: `drawTrace` /
`drawSplat` / `drawGalaxyOverlay` / `drawVolpath` / `drawBoxPreview`, last so
its wireframe sits over the galaxy dots") vs. `Viewport.tsx:449-528`
(`frame()`'s actual imperative call sequence, the only place the order is
really enforced).

**The braid:** RenderGraph's interface makes every draw method independently
callable in any order (nothing in the type system stops `drawBoxPreview`
before `drawTrace`), so the *fact* "box preview must be last" lives in two
places — the doc comment and the one call site that happens to get it right —
with nothing checking they agree. This matters because the ordering is
genuinely load-bearing: `OVERLAY_BLEND`'s premultiplied-over semantics only
produce the intended "wireframe visible over a bright raymarch" result if
`drawBoxPreview` really is last.

**The cost:** currently zero (there's exactly one caller, and it's correct)
— but there's no automated tripwire if `frame()` is edited (a hotfix that
reorders a draw call, or Track V's future layers) beyond a visual regression.
No test doubles `RenderGraph` and asserts call order.

**Confidence:** low-medium (essential ordering, but only one call site today
and it's correct — this is more "no safety net" than "current knot"; also
harder to fix cleanly until #1's pointer-extraction makes `frame()` testable
in isolation). **Effort:** S-M once #1 lands, otherwise awkward to test in
isolation.

---

## 8. Per-frame `JSON.stringify` in the hot loop — unmeasured, worth a profile before touching

**Where:** `Viewport.tsx:440` (`gridShapeKey`, computed *unconditionally*
every frame regardless of which layers are visible) and `:499-505`
(`volpathKey`, stringifying the whole camera object plus `pathTracer` params
every frame the path-tracer layer is on).

**Note:** the spec itself (`§14 Risks`) says "`npm run perf` does not cover
this tool, so any claim here needs its own measurement" — so this is flagged
as a *pattern* worth profiling, not a proven regression.

**The pattern:** both keys exist purely to detect "did the relevant slice of
state change since last frame," which the store's immutable-update contract
already gives you for free via reference equality (`s.grid !== prevGridRef`),
but the code pays for a JSON round-trip (array/object allocation + string
build) every frame instead. `gridShapeKey` runs unconditionally at 60-144 Hz
forever, purely to drive a 200ms preview-timer trigger.

**Un-braided shape:** compare `s.grid` (and, for volpath, the individual
camera/pathTracer fields or a store-side version counter) by reference/value
directly instead of stringifying; reserve `JSON.stringify` for the
already-cheap, low-frequency `catalogKey`/`buildKey`/`gridShapeKeyFor` change
*detection* in the store subscriber (once per store notification), not for a
second copy inside the 60Hz render loop.

**Confidence:** low-medium (real pattern, unmeasured cost — per the perf
skill, measure before and after if this is actually pursued). **Effort:** S.

---

## 9. Production-readiness: no GPU error scope or device-loss handling on the live path

**Where:** `Viewport.tsx` frame loop and `RenderGraph.ts` — no
`pushErrorScope`/`popErrorScope` around per-frame command encoding, no
`device.lost` listener anywhere outside `probeGpuErrors.ts`'s dev-only
monkeypatch (`uncapturederror` / `device.lost` are wired only when the
headless probe runs, gated by its own script, not the live app).

**The gap:** a live device loss (eGPU unplug, driver reset, out-of-memory
grid allocation past the preflight's estimate) surfaces only as a browser
console entry; the tab silently freezes on the last drawn frame with no
HUD message. Canvas resize/dpr handling itself (`resizeCanvasToDisplay`,
shared with the main app) and the RAF/unmount lifecycle are otherwise solid —
`disposed` flag, `cancelAnimationFrame`, `unsubscribe()`, and
`disposeHarness()` are all correctly ordered in the effect cleanup, and no
module-level mutable state leaks across HMR/unmount (everything is
closure-scoped per mount).

**Confidence:** low (this is a maintainer-only tool per the spec's own
non-goals — "This is a maintainer instrument" — so the bar for
user-facing device-loss UX may reasonably be lower). Named for completeness,
not urgency. **Effort:** S-M if pursued (one `device.lost.then(...)` wired
into a store field the HUD already reads).

---

## Already clean

- `boxWireframeVisible` (`Viewport.tsx:774-776`) is the single canonical home
  for "is the gizmo/wireframe visible," called identically from the draw path
  and the pointer hit-test path — exactly the discipline the doc asks for,
  done correctly, with a comment explaining *why* it must agree.
- `LAYER_BLEND` vs. `OVERLAY_BLEND` (`RenderGraph.ts:36-55`) is a genuinely
  essential asymmetry (light-emitting layers add; the UI-overlay wireframe
  must replace), well-documented, and was already generalized once (the
  comment notes it collapsed a fifth duplicate blend-state literal into a
  shared constant) — a positive example, not a knot.
- Canvas size handling has one source of truth: `resizeCanvasToDisplay`
  writes `canvas.width/height`, and `RenderGraph.resize`,
  `VolpathPass.ensureAccumulator`, and `reducedTraceSize` all re-derive from
  it fresh each frame rather than caching a stale copy.
- Gizmo/drag transient state (`dragging`/`panning`/`gizmoDragging`/
  `hoverHandle`) is deliberately kept as closure-locals rather than store
  fields, matching the spec's own "State flow" call — the right value/place
  choice, not an oversight.
- `buildKey.ts`/`gridShapeKeyFor.ts` are already correctly pulled out of
  Viewport as single-purpose, well-commented derivation functions — the
  precedent the extractions above (#1, #3, #6) should follow.
