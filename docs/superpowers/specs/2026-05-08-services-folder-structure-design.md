# Services Folder Structure (Spec C)

**Date:** 2026-05-08
**Status:** Spec
**Predecessors:**
- [Engine ↔ Renderer Boundary Tightening (Spec A)](2026-05-07-engine-renderer-boundaries-design.md) — landed 2026-05-07
- [Engine Internal Restructure (Spec B)](2026-05-08-engine-internal-restructure-design.md) — in progress

## Goal

Restructure two flat directories — `src/services/engine/` (~30 files post-Spec-B) and `src/services/gpu/` (16 files) — into a logical subfolder hierarchy so that finding existing code and placing new code becomes obvious instead of folkloric. Every file lands in exactly one bucket whose purpose can be stated in one sentence; root-level inhabitants are limited to the entry point and the few files that genuinely belong nowhere else.

This is a **pure relocation pass**. No file gets renamed, no module gets split, no abstraction gets introduced. Imports update at every call site (no barrel re-exports, no shims — per the project's no-backwards-compat-hacks rule). The dev-server, tests, type-check, and runtime all behave identically before and after.

## Background

Both `services/engine/` and `services/gpu/` were "just a folder" when they started. They've each grown to the size where a flat `ls` no longer fits a glance and where new contributors (human or AI) can't tell where a new file belongs without reading every existing one. Per `CLAUDE.md`'s "where to look" map, these directories are advertised as discoverable; right now they aren't.

### Current state — `services/engine/` (post-Spec-B, ~30 files)

Today's flat layout has 25 files at the root on `main`; once Spec B's five PRs all land, three more sit at the root (`tweenToGalaxy.ts`, `runFrame.ts`, `pointSourceRegistry.ts`) and a new `phases/` subfolder appears with five files (`initGpu.ts`, `wireSlots.ts`, `wireInput.ts`, `startLoop.ts`, `bootstrap.ts`). Spec B has already done one piece of grouping work — `phases/` exists because the bootstrap phases form an obvious lifecycle bundle. Everything else is one shapeless heap.

Grouped by **proposed taxonomy** (see Architecture for the why):

```
phases/                 (Spec B — already a subfolder)
  initGpu.ts            ─┐
  wireSlots.ts           │ ordered bootstrap stages
  wireInput.ts           │
  startLoop.ts           │
  bootstrap.ts          ─┘  orchestrator over the four

subsystems/             (closure-keyed factories owning multi-frame state)
  thumbnailSubsystem.ts
  spaceMouseSubsystem.ts
  tweenManager.ts
  renderScheduler.ts
  loadProgressAggregator.ts
  fpsCounter.ts

frame/                  (per-frame work)
  runFrame.ts
  renderFrame.ts

bake/                   (off-thread per-cloud bakes)
  buildPointInterleavedBuffer.ts
  buildPointInterleavedBuffer.worker.ts
  computeSchechterRatios.ts
  computeSchechterRatios.worker.ts
  computeAngularWeights.ts
  computeAngularWeights.worker.ts

interaction/            (input → engine effects, selection, camera tweens)
  inputBindings.ts
  clickHandler.ts
  tweenToGalaxy.ts
  resolveFocusTarget.ts
  focusTween.ts
  cameraFraming.ts

wiring/                 (declarative glue tables consumed by phases)
  settingsTable.ts
  seedSettingsCallbacks.ts
  pointSourceRegistry.ts

helpers/                (pure leaf math + projection helpers)
  autoLod.ts
  scaleBar.ts
  pointInfoBuilder.ts

(root)
  engine.ts             — public entry point, hosts createEngine
  index.ts              — public barrel (already exists; documented in CLAUDE.md as the engine's surface)
```

### Current state — `services/gpu/` (16 files)

```
renderers/              (one GPU pipeline owner per file)
  pointRenderer.ts
  pickRenderer.ts
  quadRenderer.ts
  diskRenderer.ts
  proceduralDiskRenderer.ts
  milkyWayRenderer.ts
  filamentRenderer.ts

passes/                 (post-process / off-screen render targets)
  postProcess.ts

resources/              (long-lived GPU resources used by multiple renderers)
  textureAtlas.ts
  cloudFade.ts

labels/                 (BMFont label pipeline, pre-renderer)
  fontMetrics.ts
  labelLayout.ts
  youAreHereVisibility.ts

shaders/                (already a subfolder; left untouched)
  …

(root)
  device.ts             — WebGPU bootstrap; needed before anything renderer-shaped exists
  shaderCompileLogger.ts — wesl-plugin debug helper, called from every renderer
```

### Current pain

- Engine: 30+ files at the root by the time Spec B lands. New file? Pick a name and pray.
- GPU: 16 files at the root including a label-pipeline trio (`fontMetrics`, `labelLayout`, `youAreHereVisibility`) that's clearly its own thing, two reusable resources (`textureAtlas`, `cloudFade`) lost in the same `ls` as seven renderers.
- The eye can't tell at a glance whether a file is "the engine's per-frame loop" or "an orientation helper" or "a worker entry point" until you open it.
- For an LLM agent picking up work, this matters more than for a human — `ls` is the first signal we use to bucket attention.

## Architecture

### Engine subfolder taxonomy

Six subfolders plus the existing `phases/`. Each name names a **responsibility** the file lives to discharge, not a code shape (no `helpers/` containing 12 files of unrelated math; no `utils/` catch-alls). Files at the root are the strict minimum.

#### `phases/` (already exists, from Spec B)
The four ordered stages of `createEngine` async startup, plus the orchestrator. Already grouped because they share an explicit ordering contract; this spec doesn't touch them.

#### `subsystems/` — closure-keyed factories with cross-frame internal state
Inhabitants:
- `thumbnailSubsystem.ts` — owns the entire galaxy-thumbnail pipeline (atlas, queue, bitmap memo, sorted emission).
- `spaceMouseSubsystem.ts` — owns the 6DOF puck input, axes-to-camera, dt baseline.
- `tweenManager.ts` — owns the at-most-one in-flight CameraTween facade.
- `renderScheduler.ts` — coalescing rAF wrapper used by every event handler that wants to wake the loop.
- `loadProgressAggregator.ts` — projects `aggregateRegistry` snapshots onto the engine's load-progress callback.
- `fpsCounter.ts` — rolling-window FPS estimator.

Why these belong together: each one is a **factory returning a typed handle whose closure carries state across frames**. They are the "things the engine builds once at startup, holds for its lifetime, and consults each frame". The pattern is documented in each module's docstring as the deliberate idiom (e.g. `thumbnailSubsystem.ts` calls it "closure-returning factory rather than a class"). When a future feature wants the same shape (e.g. "a label subsystem"), this folder is where it goes.

`renderScheduler` is borderline — it's a singleton coalescer not a multi-frame state owner. It earns its place here because the engine treats it identically (build once, hold a handle, call methods from event handlers); not putting it here would mean a folder of one. The next factory of its shape (currently theoretical) joins it.

#### `frame/` — the per-frame body and its GPU pass
Inhabitants:
- `runFrame.ts` (Spec B) — top-level per-frame body: camera state mgmt, auto-LOD mask refresh, hover-pick readback, scheduling.
- `renderFrame.ts` — owns the per-frame WebGPU command-encoder lifecycle: HDR pass → thumbnails → post-process → submit.

Why a folder of two: these two files together **are** the work the engine does on every frame. `runFrame` is the orchestrator; `renderFrame` is the GPU command production it dispatches to. They co-evolve: a new draw pass means edits to both. A reader looking for "what happens during a frame?" should land here without further hunting.

#### `bake/` — off-thread per-cloud computation, paired with worker entry points
Inhabitants:
- `buildPointInterleavedBuffer.ts` + `buildPointInterleavedBuffer.worker.ts`
- `computeSchechterRatios.ts` + `computeSchechterRatios.worker.ts`
- `computeAngularWeights.ts` + `computeAngularWeights.worker.ts`

Why these belong together: each pair is one bake — a pure function that takes a `PointCloud` plus parameters and produces a new typed array, paired with a worker entry point that wraps `postMessage` plumbing around the same function. They share an identical idiom (pure module + `?worker` sibling), the same lifetime (one message in, one out, terminate), and the same reason for existing (multi-second main-thread work moved off-thread). Three pairs is enough to want a folder; the next bake (a likely future Schechter-with-evolution variant) drops in trivially.

A future reader scanning `bake/` immediately knows two things: (a) this is per-cloud, off-thread work, (b) every file follows the pure-fn + worker-sibling pattern.

#### `interaction/` — input events, selection, and camera-following effects
Inhabitants:
- `inputBindings.ts` — pointer/keyboard/resize listener attachments + cleanup.
- `clickHandler.ts` — pick texture readback + selection-index resolver.
- `tweenToGalaxy.ts` (Spec B) — shared "build target Vec3, start tween, requestRender" used by select/focus paths.
- `resolveFocusTarget.ts` — URL focus-target → (source, localIdx) resolver.
- `focusTween.ts` — constants/helpers for the focus-on-galaxy camera tween (FOCUS_TWEEN_MS et al).
- `cameraFraming.ts` — initial camera framing math from a bbox scalar.

Why these belong together: every file in this folder is part of the **user-action → camera state-change chain**. Either the user did something (clicked, opened a focus URL, mounted the page) or the engine reacted by moving the camera (tween-to-galaxy, initial framing). They share one mental model: "given an external trigger, where does the camera need to go and how does it get there?" `clickHandler` and `inputBindings` are the input edge; `tweenToGalaxy`, `focusTween`, `resolveFocusTarget`, `cameraFraming` are the camera-effect responses.

`cameraFraming` is the wobbliest fit (it could plausibly live in `helpers/` since it's pure math). Choosing `interaction/` because (a) its sole caller is the bootstrap's "frame the camera around the loaded cloud" step, which is a one-shot mount-time interaction, and (b) it's narratively close to `focusTween` which sits firmly here. See "edge cases" below.

#### `wiring/` — declarative tables consumed by phases
Inhabitants:
- `settingsTable.ts` (already exists) — typed table of "boring" public-handle setters.
- `seedSettingsCallbacks.ts` — fan-out helper that fires every settings-echo callback once with engine defaults.
- `pointSourceRegistry.ts` (Spec B) — typed array of `(Source, fetcher, initialTier)` consumed by `wireSlots`.

Why these belong together: each is a **declarative constant + a tiny consumer helper** that drives one phase of bootstrap or one part of the public handle. `settingsTable` drives setter generation; `seedSettingsCallbacks` drives the startup echo fan-out; `pointSourceRegistry` drives slot wiring. They share a shape (data table + builder/iterator) and a consumer pattern (read once at startup or at handle build time). Future "table-shaped glue" lands here.

This folder is the answer to "where does declarative configuration live?" — useful once Spec B's `pointSourceRegistry` lands, because right now an LLM scanning for "the list of point sources" has no obvious starting file.

#### `helpers/` — pure leaf math + projection helpers
Inhabitants:
- `autoLod.ts` — `autoLodMask` pure function: camera distance → source bitmask.
- `scaleBar.ts` — pure scale-legend math (label + pixel width from camera + viewport).
- `pointInfoBuilder.ts` — pure (cloud, idx) → `PointInfo` builder with helpers `maxAbsCoord`, `niceRound`.

Why these belong together: each is a **pure function** (no GPU, no I/O, no engine state mutation) that other code in the engine calls. They are the leaves of the dependency graph — easy to test in isolation, never imported in cycles. The current root location buries them next to the GPU-touching files; lifting them to `helpers/` lets a reader immediately tell that anything in this folder is safe to import from anywhere without dragging device or React state along.

The folder is small (3 inhabitants); each justifies its place by being publicly exported and individually unit-tested.

#### Files that stay at the engine root

- **`engine.ts`** — the entry point. `createEngine` lives here; it composes every other folder. Burying it in a subfolder would invert the "the entry is the obvious file" rule the rest of the codebase follows (`App.tsx`, `main.tsx`, `tools/buildAllBins.ts` all sit at their respective roots).
- **`index.ts`** — the package barrel that re-exports `createEngine` and `autoLodMask`. Already exists, documented in CLAUDE.md as the engine's public surface, consumed by `App.tsx` and tests. Keeping it at the root preserves the import path `'./services/engine'` that consumers already use. (This is the only barrel the engine has; per CLAUDE.md's "no barrel exports for components" rule, the prohibition is scoped to `components/` — service-layer barrels at the package boundary are an established pattern.)

### GPU subfolder taxonomy

Four subfolders plus the existing `shaders/`. Same rules as engine: every folder names a responsibility; root files justify themselves.

#### `renderers/` — one GPU pipeline owner per file
Inhabitants:
- `pointRenderer.ts` — instanced billboard point sprites (the main 3.5M-galaxy draw).
- `pickRenderer.ts` — r32uint pick texture for hover/click.
- `quadRenderer.ts` — textured screen-aligned thumbnail quads.
- `diskRenderer.ts` — texture-based 3D-oriented galaxy disks.
- `proceduralDiskRenderer.ts` — procedural 3D-oriented galaxy impostors.
- `milkyWayRenderer.ts` — single-quad procedural Milky Way at the origin.
- `filamentRenderer.ts` — instanced-quad cosmic-web skeleton.

Why these belong together: each file owns one **`GPURenderPipeline` lifecycle** — pipeline + bind groups + per-instance vertex buffer + draw method. They share a docstring shape ("Public API: new XRenderer(device, format); upload(...); draw(...)"). They co-evolve: when the camera uniform layout changes, every renderer updates the same struct. This is the project's flagship "one folder, one well-known pattern" win.

Seven inhabitants is a healthy size — large enough to justify the folder, small enough that a reader can mentally enumerate them.

#### `passes/` — non-renderer GPU work (post-process, future off-screen passes)
Inhabitants:
- `postProcess.ts` — HDR offscreen target + tone-map pass that writes the swap chain.

A folder of one — an exception to the "every folder has at least 2" guideline I'm bending because:
- The narrative distinction matters: `postProcess` is **not** a renderer (no per-instance draw, no upload), it's a fullscreen blit that consumes the HDR target every renderer wrote into. Putting it in `renderers/` would dilute that folder's well-known shape.
- Spec A's "single post-process module" decision (#9) explicitly framed it as its own concern, separate from the renderers feeding it.
- The next pass (a likely-future bloom or DoF pass) sits here without ceremony.

If the user prefers, the alternative is to leave `postProcess.ts` at the gpu root and mark it as one of the "root inhabitants with a reason". I weakly prefer the folder because it's a forward-compatible naming choice. **Flagging this as the one decision I'd most welcome user input on.**

#### `resources/` — long-lived GPU resources used by multiple renderers
Inhabitants:
- `textureAtlas.ts` — 2048×2048 LRU atlas of 128×128 thumbnail slots; consumed by `quadRenderer` and `diskRenderer`.
- `cloudFade.ts` — reusable per-source fade-in helper (uniform buffer + bind group); consumed by `pointRenderer` and `filamentRenderer`.

Why these belong together: each owns a **GPU resource (texture, buffer, bind group) shared across renderers**. They are not renderers themselves — they don't draw, they don't own a pipeline — but they live longer than a single draw call and are imported by multiple renderer files. The folder name signals "if you're adding something that's a resource not a pipeline, here's its home". Two inhabitants is enough; future shared resources (e.g. a shared depth buffer if we ever extract one) drop in.

#### `labels/` — BMFont label pipeline, pre-renderer
Inhabitants:
- `fontMetrics.ts` — BMFont JSON parser → glyph map.
- `labelLayout.ts` — string → per-glyph quad attribute tuples.
- `youAreHereVisibility.ts` — alpha-from-distance for the "YOU ARE HERE" Milky Way marker.

Why these belong together: each is part of the **labels rendering subsystem**. `fontMetrics` parses the atlas JSON; `labelLayout` arranges glyphs; `youAreHereVisibility` is the first concrete consumer (the Milky Way marker fade). The MSDF labels work documented in `2026-05-07-msdf-labels-design.md` will add a `labelRenderer.ts` here next; the folder pre-positions for that.

`youAreHereVisibility.ts` is debatable — the "fade by camera distance" math could equally be a generic helper. Choosing `labels/` because (a) its sole concrete use is a label marker and (b) the spec that introduced it groups it explicitly with the label work. Re-bucket later if a non-label consumer materialises.

#### `shaders/` — already exists, untouched
The existing `shaders/{disks,filaments,labels,lib,milkyWay,points,proceduralDisks,quads,toneMap}/` tree is well-shaped (one directory per renderer + a `lib/` for shared WESL fragments). This spec doesn't touch it.

#### Files that stay at the gpu root

- **`device.ts`** — WebGPU bootstrap (adapter, device, canvas context). Every other GPU file's existence depends on a `GPUDevice` produced here; nothing else in the package imports `device.ts`'s siblings. It's the conceptual entry point of `services/gpu/` and lives at the root for the same reason `engine.ts` does.
- **`shaderCompileLogger.ts`** — `createShaderModuleWithDevLog` helper called from every renderer's pipeline construction. Could plausibly land in `resources/` as a "shared GPU helper", but its function is **build-time** (during pipeline creation, once at startup), not a long-lived resource — it does not own any GPU memory. Keeping it at the root signals "this is a wrapper helper every renderer uses at construction time"; tucking it into `resources/` would mislead readers about its lifetime. The next build-time helper (none currently exist) would either join it at the root or graduate to a folder.

### Cross-folder rationale

#### Why these names?

- **`subsystems/`** — already in the project's idiom. `thumbnailSubsystem.ts` and `spaceMouseSubsystem.ts` are both named `*Subsystem`, the docstrings explicitly call themselves "subsystems", and the pattern they use is documented as such. The folder name is the singular-of-the-suffix the existing code already announces.
- **`phases/`** — locked in by Spec B. Spec C inherits it.
- **`frame/`** — singular because it names "the frame" — the unit of work the loop produces. A reader who asks "where does the per-frame work live?" should answer with one word.
- **`bake/`** — chosen over alternatives like `workers/` (which would group the three `*.worker.ts` files but split them from their pure pairs — a split the docstrings actively argue against) and `precompute/` (longer, less precise — these are not arbitrary precomputations, they are the canonical "bake" step upload runs through).
- **`interaction/`** — covers both the input edge (clicks, key events, URL hashes) and the camera response (tweens, framing). `input/` would shrink to inputBindings + clickHandler and miss the connection to the tween/focus helpers that exist *because* of input.
- **`wiring/`** — names the role: declarative glue tables consumed by other modules. Avoided `config/` (overloaded with build-config meaning) and `tables/` (too shape-focused, says nothing about purpose).
- **`helpers/`** — chosen over `pure/` (technically accurate but unidiomatic) and `math/` (overspecific — `pointInfoBuilder` is more than math). The folder's contract is "leaf-of-dependency-graph functions safe to import anywhere"; `helpers/` is the most-honest one-word version.
- **`renderers/`, `passes/`, `resources/`, `labels/`** — each names a thing in the WebGPU mental model. No abstraction-shaped names.

#### Edge cases

A few files could plausibly go in two folders. Picking one is a choice; here are the calls and why:

- **`cameraFraming.ts`** — `interaction/` vs `helpers/`. It's a pure function (would fit `helpers/`) but its narrative use is one-shot mount-time interaction. **Pick `interaction/`** because the folder's neighbours (`focusTween`, `resolveFocusTarget`) form the camera-effect cluster it's the boot-time member of. If `helpers/` later acquires a sibling on framing math, revisit.
- **`focusTween.ts`** — `interaction/` vs `helpers/`. Mostly constants (FOCUS_TWEEN_MS) plus tiny helpers; could be a leaf. **Pick `interaction/`** for the same reason as `cameraFraming`: its sole consumer narrative is "focus on a galaxy = an interaction". The constants travel together with the interaction code that uses them.
- **`renderScheduler.ts`** — `subsystems/` vs `frame/`. It's per-frame in the sense that it schedules frames, but it lives across frames as a singleton with internal `_pending` state. **Pick `subsystems/`** because the engine treats it like the other handle-bearing subsystems (build once, hold across the lifetime, call from many sites).
- **`youAreHereVisibility.ts`** — `labels/` vs root. Pure math (would fit a hypothetical `helpers/` if gpu had one). **Pick `labels/`** because its narrative use is the Milky Way label marker; that's the only consumer and the docstring explicitly grounds itself in the label work.
- **`shaderCompileLogger.ts`** — `resources/` vs root. **Pick root** because it's a build-time wrapper, not a resource owner; tucking it into `resources/` would misclassify its lifetime.
- **`postProcess.ts`** — `passes/` vs `renderers/` vs root. **Pick `passes/`** as documented above; flagged as the most user-input-worthy decision.

### Discovery checklist (already done)

The proposed taxonomy was derived by:

1. Reading the module-header docstring of every file in `src/services/engine/` and `src/services/gpu/`. Each file's primary responsibility went into a slot.
2. Cross-checking the ".worker.ts" siblings as obviously-paired, then asking what their shared role is (the answer: "off-thread cloud bakes" → `bake/`).
3. Identifying the closure-returning-factory pattern (documented as such in `thumbnailSubsystem.ts` and `spaceMouseSubsystem.ts`) and listing every file that follows it → `subsystems/`.
4. Flagging the input-and-camera-response cluster as a single narrative thread → `interaction/`.
5. Identifying the small declarative-table set that Spec B's `pointSourceRegistry` joins → `wiring/`.
6. Sanity-checking the residual "pure leaf math" set is small and well-defined → `helpers/`.
7. For GPU: separating "owns a `GPURenderPipeline`" (renderers) from "owns a shared GPU resource" (resources) from "consumed by multiple renderers as a fullscreen blit" (passes) from "the BMFont label subsystem" (labels). The split runs cleanly with no leftovers requiring a `misc/` folder.

#### Import-update churn estimate

A pragmatic check on scale: `grep -rn "from '..\?/services/engine\|from '..\?/services/gpu" src/ tests/ | wc -l` returns **~150 import sites** across both directories (the spot check on `services/engine|services/gpu` substring matched 53 files; each averages 2–4 import lines from these subtrees). Every move requires a `git mv` and an import update at every consumer. The post-Spec-B engine total of ~30 files moving to subfolders means ~30 internal cross-references inside `engine/` itself update too.

This is mechanical churn — tedious but pure search-and-replace. A modern editor's "update imports on file move" affordance handles most of it; the rest gets caught by `tsc --noEmit` failing with `Cannot find module` errors that point at every stale path.

## Migration strategy

**One PR per service directory. Two PRs total.** Engine first, then GPU.

Why this split:

- Each PR is bounded and reviewable. Mixing both directories in one PR makes the diff hard to scan and conflicts more likely against in-flight work elsewhere.
- The two directories are independent — no shared file moves between them. Merging engine first doesn't change anything in `gpu/`.
- The engine PR is bigger (30 files vs 16), so it ships first while attention is fresh; the GPU PR follows as a smaller, cleaner second pass.

Within each PR, the work is one atomic transaction:

1. `git mv` every file to its new location. Using `git mv` (not `mv` + `git add`) preserves blame across the move — important because several files (`thumbnailSubsystem.ts`, `pointRenderer.ts`) carry years of bug-fix history we will want to `git log --follow` later.
2. Update every import site in one pass. `grep -rln "services/engine/<filename>"` or the editor's move-aware refactor catches all consumers; `tsc --noEmit` validates.
3. Move the matching test file under `tests/services/{engine,gpu}/` to the same subfolder — `tests/services/engine/thumbnailSubsystem.test.ts` becomes `tests/services/engine/subsystems/thumbnailSubsystem.test.ts`. Keeps the "tests mirror src" invariant the project follows.
4. Run `npx tsc --noEmit && npx vitest run` before commit. Test count stays identical — no green-then-red-then-green flicker; if a test goes red, an import slipped.

**No staged/incremental option within a PR.** A half-moved engine (some files in subfolders, some still at root, some imports updated, some not) is a worse review experience than the full move. The diff is mechanical; the type-checker is the safety net.

**Why not "move subsystems/ first, then bake/, then …" within engine?** Tempting — each subfolder is independently movable. Rejected because every micro-PR pays the same cost (rebase, review attention, test rerun) for less work moved, and the order of subfolders doesn't matter for correctness. One sweep per directory is cleaner.

**Coordination with in-flight work.** Spec B's five PRs land first (the implementation of this spec is gated on Spec B completion — see "Predecessors"). Once Spec B is done, the engine restructure operates on the post-Spec-B file set. If a Spec-B PR is in flight when the engine restructure lands, rebase the in-flight branch over the moves; conflicts are file-rename conflicts, mechanical to resolve.

### Test directory mirror

The `tests/services/{engine,gpu}/` trees today are flat — same shape as the src directories pre-restructure. Post-restructure, the test trees mirror the new src layout one-to-one:

```
tests/services/engine/
  subsystems/
    thumbnailSubsystem.test.ts
    spaceMouseSubsystem.test.ts
    tweenManager.test.ts
    renderScheduler.test.ts
    loadProgressAggregator.test.ts
    fpsCounter.test.ts
  frame/
    runFrame.test.ts                   (Spec B adds this)
    renderFrame.test.ts
  bake/
    buildPointInterleavedBuffer.test.ts
    computeSchechterRatios.test.ts
    computeAngularWeights.test.ts
    computeAngularWeights.rebake.test.ts
  interaction/
    inputBindings.test.ts
    clickHandler.test.ts
    tweenToGalaxy.test.ts              (Spec B adds this)
    resolveFocusTarget.test.ts
    cameraFraming.test.ts
  wiring/
    settingsTable.test.ts
    seedSettingsCallbacks.test.ts
    pointSourceRegistry.test.ts        (Spec B adds this)
  helpers/
    pointInfoBuilder.test.ts
    scaleBar.test.ts
  phases/
    (Spec B's bootstrap test, if any)
  proceduralDiskEmission.test.ts       (root — engine integration test, not file-mirror)
  engine.tier-swap-race.test.ts        (root — engine integration test, not file-mirror)

tests/services/gpu/
  renderers/
    pointRenderer.test.ts
    pickRenderer.test.ts
    proceduralDiskRenderer.test.ts
    filamentRenderer.test.ts
    milkyWayRenderer.test.ts
  passes/
    postProcess.test.ts
    toneMap.test.ts                    (legacy file from the pre-Spec-A split — keeps its name pending separate cleanup)
  resources/
    textureAtlas.test.ts
  labels/
    fontMetrics.test.ts
    labelLayout.test.ts
    youAreHereVisibility.test.ts
```

Tests for files without an existing matching test (e.g. `autoLod.ts` doesn't have its own `*.test.ts` — it's exercised via `engine.tier-swap-race.test.ts`) don't get one created here. Pure relocation, no new tests.

The two engine tests at the test root (`proceduralDiskEmission.test.ts`, `engine.tier-swap-race.test.ts`) don't mirror a single src file — they're cross-cutting integration tests that exercise multiple files. They stay at the test root for the same reason `engine.ts` stays at the src root: they aren't inhabitants of any single subfolder's responsibility.

## Testing

No new tests. This spec is a pure relocation; behaviour is unchanged.

Verification before each commit:

```bash
npx tsc --noEmit && npx vitest run
```

`tsc --noEmit` catches every stale import. `vitest run` confirms no test broke (same total count, all passing). If both pass, the move is correct by construction — there's no other way for a relocation to silently break behaviour.

## What this spec deliberately does NOT do

- **No file renames.** `pointRenderer.ts` stays `pointRenderer.ts`; the camelCase convention is preserved as documented in CLAUDE.md.
- **No splitting of large files.** `engine.ts` (~1500 lines post-Spec-B), `pointRenderer.ts` (~83 KB), `thumbnailSubsystem.ts` (~40 KB) all move as single units. Splitting them is its own concern with its own design surface and isn't bundled with relocation.
- **No new abstractions.** No new barrel `index.ts` files in the new subfolders (per CLAUDE.md's no-component-barrels rule, generalised here to "don't add barrels just because there's a folder"). The existing `services/engine/index.ts` stays unchanged. Imports in the codebase reach into specific files, not into folder barrels — which is what the rest of `services/{camera,input,loading,url}/` already does.
- **No re-export shims for moved files.** Hard rename, every consumer updates. Per CLAUDE.md's "no backwards-compatibility hacks" rule.
- **No touch on `src/services/{camera,input,loading,url}/`.** Each is small (1–8 files); their flat layouts still fit a glance. Revisit if any grows past a similar threshold.
- **No touch on `src/components/`, `src/data/`, `src/utils/`.** Different concerns, different reviewers, different blast radius. Possible follow-up specs if any of those grows pain-shaped.
- **No proposing folders for "things that don't exist yet".** Every folder in this spec has at least 2 inhabitants in the post-Spec-B tree, with the explicit exception of `passes/` which is documented as a near-future fit and weakly recommended for user input.
- **No re-litigation of phase ordering.** `phases/` was decided in Spec B and is preserved as-is.

## Success criteria

- Both directories restructured into the agreed layout.
- Every src file lands in exactly one subfolder (or stays at the root with a documented justification: `engine.ts`, `index.ts`, `device.ts`, `shaderCompileLogger.ts`).
- `tests/services/{engine,gpu}/` mirrors the new src layout file-for-file, except for the cross-cutting integration tests at the test roots.
- `git mv` used for every file move so `git log --follow` and `git blame` stay useful.
- `npx tsc --noEmit && npx vitest run` is green at every commit boundary — no green-then-red-then-green test count flicker, no `Cannot find module` errors mid-PR.
- No new abstractions introduced (no new `index.ts` barrel files, no re-export shims).
- Two PRs landed (engine first, then gpu), each independently reviewable.

The win is measurable in the post-restructure `ls`: a reader running `ls src/services/engine/` sees 7 directories + 2 files instead of 30 files, and each directory's name tells them what's inside without opening it.
