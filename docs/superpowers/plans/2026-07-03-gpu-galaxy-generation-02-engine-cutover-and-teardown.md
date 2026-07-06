# GPU galaxy generation 02 — engine cutover, live bridge & CPU-model teardown

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking. **Load the `wesl-shaders` skill before any `.wesl` task.**

**Spec:** `docs/superpowers/specs/2026-07-03-gpu-galaxy-generation-design.md`
**Series:** plan 02 of 2. Requires plan 01 (`2026-07-03-gpu-galaxy-generation-01-foundation-and-wgsl-port.md`) landed with its Task 8 parity record green. After this plan: `setParams` is a ~1–2 ms dispatch, structural sliders regenerate live (no debounce), every background extra has its own params, and the CPU model / worker / harness are gone.

**Goal:** Switch `createGalaxyEngine` from the worker/CPU generation path to the plan-01 compute passes, give extras per-galaxy dispatches, delete the bridge's debounce + fitting-suppression machinery, pass the user visual gate (including iOS), then tear down the CPU model.

**Architecture:** `GalaxyEngineHandle` is unchanged for every consumer — the cutover is entirely inside `createGalaxyEngine` (generation becomes an encoder section instead of an awaited worker round-trip) plus a _simpler_ `engineBridge` (regeneration is now cheap enough to treat like a live uniform write; the render scheduler's one-frame-per-RAF coalescing is the only throttle, per the spec's dispatch-storm analysis). `autoFit` keeps working unchanged because its `await setParams → grab` ordering rides the shared GPU queue: generation and draw are submitted in order, so the grab always renders the just-dispatched params.

**Tech Stack:** TypeScript, WebGPU compute, WESL (`?static`), Vitest.

## Global Constraints

- Worktree `.claude/worktrees/better-galaxy-renderer`; commands from its root; `npm test` + `npm run typecheck` green before every commit; stage specific paths only (never `git add -A`); prettier only touched files.
- **Byte-compat with the CPU model is waived**; determinism contract = same params → same buffer contents, via the stateless hash `rand(seed, populationId, starIndex, drawSlot)` (plan 01).
- The four seed params keep their family roles: `seed` main placement, `asymSeed` asymmetry, `clumpSeed` clump placement, `waveSeed` warp/wave.
- Rejection sampling: max 8 retries then dead point (size 0); capacity IS the dispatch size; stride-8 buffer layouts unchanged; buffers gain `STORAGE` alongside `VERTEX`.
- **`GalaxyEngineHandle` surface unchanged for consumers**; `setParams` resolves after submit (generation and draw share the queue — no readback, no completion await).
- Faithful port discipline carries over: constants cite CPU source lines; no new deviations beyond plan 01's five flagged ones.
- WESL rules: no backticks in `.wesl` comments; imports at top, one identifier per line; literal `package::` prefix; bind groups built at the compute pipelines (`layout: 'auto'` never crosses pipelines).
- TS house rules: `type` never `interface`; one exported type per file in `@types/`; `Vec3`/`Vec2` aliases never raw tuples; typed `vi.fn<() => void>()` in fixtures; didactic comments (why + alternative); reducer args named `settings`/`action` if any slice is touched (none should be in this plan).
- Search before writing helpers: preflight-grep `src/utils` and `tools/galaxy-renderer` before creating one.
- **CPU model + worker + parity harness are deleted in the FINAL task only, after the user visual gate passes.**

---

## Task 1 — `setParams` cutover: generation as a compute dispatch

**Files**

- Modify: `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts`

**Behaviour contract**

- Engine boot: `createGenerationPipelines(device)` once, next to the render pipelines; one
  generation UBO buffer for the main galaxy (`GENERATION_UBO.byteLength`, `UNIFORM | COPY_DST`, labelled).
- `setParams(p)` becomes synchronous-ish (`async` signature kept):
  1. `budget = splitStarBudget(classifyHubbleType(p.type), p)`; `starLayout` / `dustLayout` via the carve fns; destroy + recreate `starBuf`/`dustBuf` at `capacity · 32` bytes with usage `VERTEX | STORAGE` (no `mappedAtCreation`; the dispatch fills them). `dustBuf = null` when `dustLayout.capacity === 0`, exactly like today's empty-dust branch (`createGalaxyEngine.ts:472-484`).
  2. `queue.writeBuffer(genUbo, 0, packGenerationUniforms(p, budget, null))`.
  3. One command encoder: `encodeGeneration(...)` → `submit`. The promise resolves after submit — draw commands encoded later in the same queue are ordered behind it, so no readback is needed (spec §Buffers).
  4. `starCount = starLayout.capacity`, `dustCount = dustLayout.capacity` (instance counts ARE capacities; dead slots rasterize nothing). `opts.onStats` reports **planned** counts — sum of `iterations` per star population and dust capacity — a few % from true live counts (HII bonuses / gap skips wash); document this in the docblock and the Hud has no other change.
- Delete from the engine: the worker construction/`pending` map/`generateAsync` (`createGalaxyEngine.ts:293-327`), the `generateGalaxy` fallback import, the worker import, the `worker?.terminate()` in dispose. **The worker and CPU-model files themselves stay on disk until Task 5** — this task only unhooks the engine (typecheck stays green because the files are still valid modules).
- Rewrite the module-header pass-chain diagram: generation is now the frame-side compute section, not a worker box. Keep the didactic style.

**Steps**

- [x] Implement the cutover. No unit tests (GPU shell policy — correctness budget went into plan 01's tested pure seams + harness).
- [x] `npm run typecheck` + full `npm test` green (engine has no direct unit tests; the suite guards the seams).
- [ ] **Checkpoint (user):** dev server — default Sc renders visually equivalent to before (side-by-side judgement vs plan 01's parity record); dragging `starCount`/`radius` sliders still regenerates (still debounced — the bridge is Task 3); `sample()`/`grab()` still work (compare panel thumbnails render).
- [x] Commit.

---

## Task 2 — extras: one dispatch per background galaxy, `bakeExtraTransform` deleted

**Files**

- Modify: `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts`
- Delete: `tools/galaxy-renderer/src/engine/bakeExtraTransform.ts`, `tests/tools/galaxy-renderer/engine/bakeExtraTransform.test.ts`

**Behaviour contract**

- `setExtras(specs)` rebuilds each extra GPU-side: per spec — carve layouts from `spec.params`, create that extra's `VERTEX | STORAGE` buffers + a small per-extra UBO, `packGenerationUniforms(spec.params, budget, spec)` (the rigid transform + size scale ride the UBO's extra lanes; positions come out already world-placed), `encodeGeneration` into ONE shared encoder for all extras, single submit.
- The whole body is now synchronous up to submit — no awaits inside the loop, so the `extrasToken` interleaving guard has nothing left to guard; delete it (the old-buffers-destroy + rebuild sequence is atomic per call). Keep the `async` signature (`GalaxyEngineHandle` unchanged).
- `bakeExtraTransform` and the CPU buffer-copy path die here (spec: extras get _their own params_, not a transformed copy — `buildExtraSpecs` already produces per-extra params and is untouched).

**Steps**

- [x] Implement; delete the two files; update the engine docblock's "why extras are baked" section — the rationale inverts: the transform now folds in at generation time via the UBO, which is even more writeBuffer-race-proof than baking (nothing is ever rewritten).
- [x] `npm run typecheck` + full `npm test` green.
- [ ] **Checkpoint (user):** enable multi-galaxy — background galaxies appear with visibly distinct structure (unique params were previously identical-buffer copies; now e.g. arm counts differ), FPS badge stays healthy at count 50.
- [x] Commit.

---

## Task 3 — bridge: kill the debounces + fitting suppression; autoFit unchanged

**Files**

- Modify: `tools/galaxy-renderer/src/state/engineBridge.ts`
- Modify: `tests/tools/galaxy-renderer/state/engineBridge.test.ts`
- Verify only: `tools/galaxy-renderer/src/matcher/autoFit.ts` + its test (no edits expected)

**Behaviour contract**

- `galaxy` slice change → `void engine.setParams(state.galaxy)` immediately, every time — `PARAMS_DEBOUNCE_MS`, both timers, `scheduleParams`, and the `compare.fitting` suppression (schedule-time AND fire-time checks) are deleted. Regeneration now costs a dispatch; the RAF loop coalesces slider-drag bursts (spec §Risks), so re-introducing any debounce is a plan violation.
- `extras.count` change → immediate `setExtras` (delete `EXTRAS_DEBOUNCE_MS` + `scheduleExtras` too — same cost argument at smaller scale; the enabled/regenNonce branches already fire immediately and just lose their timer-cancel preamble).
- Why the fit stays correct without suppression: `autoFit`'s per-step `onStep` → slice echo → bridge `setParams(best)` runs _synchronously inside the dispatch_, strictly between the previous `grab` and the next trial's awaited `setParams` — every `grab` is still immediately preceded by its own params. The echo is a redundant-but-idempotent dispatch (~1-2 ms), not a double-generate hazard. Put this reasoning in the bridge docblock (it replaces the suppression story).
- Rewrite the module docblock: the bridge is now a pure immediate diff-and-forward; the two-timers paragraph goes away.

**Steps**

- [x] Update `engineBridge.test.ts` first: delete the debounce/suppression cases; add `galaxy slice change calls setParams immediately` (no fake timers), `params changes during compare.fitting still forward to the engine`, `extras count change calls setExtras immediately`. Run → fail against current code.
- [x] Implement. Run → pass. Full `npm test` (autoFit tests must pass untouched — if they need edits, STOP and re-examine, that's a regression signal).
- [ ] **Checkpoint (user):** structural sliders (radius, arm width, star count) now track the drag live with no settle pause; auto-fit end-to-end still converges with live progress + stop.
- [x] Commit.

---

## Task 4 — user visual gate (blocks the teardown)

No implementer subagent — this is the user-driven acceptance pass for the whole feature, mirroring the tool plans' visual gates. **Do not proceed to Task 5 without every box.**

- [ ] Reference presets vs photos: each reference galaxy in the compare panel still reads as its photo (M51, M104, LMC-class Irr, etc. — same judgement pass as the original tool gate).
- [ ] Live-drag structural sliders: radius / bulge / arm knobs / dust knobs regenerate per-frame with no debounce feel and no hitching (FPS badge is the instrument).
- [ ] Seed dice families: `seed` re-rolls placement; `asymSeed` re-rolls lopsidedness/arm personality; `clumpSeed` only the along-arm beading; `waveSeed` only the waviness — each die leaves the other three aspects visibly fixed.
- [ ] Determinism: re-entering the same seed values reproduces the identical galaxy (flip away and back).
- [ ] Extras: multi-galaxy backgrounds are structurally unique per galaxy; count slider tracks live; regenerate button re-rolls.
- [ ] Auto-fit e2e: fit runs, progress + stop work, report fills, result visually matches the reference at least as well as the CPU-era fit.
- [ ] Warp knobs still bend the outer disk (warp moved to WGSL — check an edge-on view).
- [ ] iOS/WebKit (house gotcha): open the tool on the iOS device — compute pipelines validate (no silently-dropped frames: camera drag visibly moves the scene), galaxies render. If frames drop, diagnose via `createShaderModuleWithDevLog` output before any teardown.

---

## Task 5 — teardown: delete the CPU model, worker, harness; docs; radar; handoff

**Files**

- Delete (model): `tools/galaxy-renderer/src/model/generateGalaxy.ts`, `createGalaxyBuildContext.ts`, `createDustField.ts`, `makeWarpOffset.ts`, `tempColor.ts`, `starWriter.ts`, `dustWriter.ts`, `populations/` (all 11)
- Delete (worker + harness): `tools/galaxy-renderer/src/worker/generateGalaxy.worker.ts`, `tools/galaxy-renderer/src/dev/gpuParityHarness.ts` + the `window.__galaxyParity` hook in `main.tsx`
- Delete (types): `@types/model/GalaxyBuildContext.d.ts`, `StarWriter.d.ts`, `DustWriter.d.ts`, `DustField.d.ts`, `DustSeed.d.ts`, `GeneratedGalaxy.d.ts`, `@types/dev/ParityReport.d.ts`
- Delete (tests): the mirrors of every deleted module (`model/generateGalaxy`, `createGalaxyBuildContext`, `starWriter`, `dustWriter`, `makeWarpOffset`, `tempColor`, `model/populations/` all three files)
- Delete if orphaned: `src/utils/random/makeValueNoise.ts` + `tests/utils/random/makeValueNoise.test.ts` — grep first; its only consumers were the dust field + its own test (the WGSL port carries the constants now). If a main-app consumer appeared since, keep it and note why.
- Keep (still consumed by the packer/carve seams, still tested): `classifyHubbleType`, `splitStarBudget`, `computeBarGeometry`, `hiiPalette`, `grainScale`, `carveStarLayout`, `carveDustLayout`, `populationIds`, `packGenerationUniforms`, `generationUboLayout` + `@types/model/{GalaxyParams, StarBudget, GalaxyCategory, BarGeometry, HiiPalette, PopulationRange, GenerationLayout}`.
- Modify: `tools/galaxy-renderer/README.md`

**Steps**

- [ ] Grep for lingering imports of every deleted module (including `GenerateGalaxyWorkerResponse` in the engine — should already be gone since Task 1); delete the files + tests + types.
- [ ] README: generation section rewritten — compute-pass architecture, the stateless-hash determinism contract, seed-family table, the planned-counts Hud caveat, and plan 01's flagged deviations (candidate-cap dust budgets, re-derived main-seed galaxy-level values).
- [ ] Run the `entanglement-radar` skill over the branch diff. Specifically verify the spec's un-braided choices survived: `GENERATION_UBO` is the ONLY offset authority (no literal offsets in packer/tests/WGSL comments drifting on their own); the population-ID table exists once per language with the parity mechanism documented; the carve fns are the only capacity/budget authority (no re-derived budget in the engine or harness leftovers); no debounce or fitting-suppression crept back into the bridge; `GalaxyEngineHandle` consumers unchanged (grep). File real findings as fixes here or as backlog details — never ship known braids silently.
- [ ] `npm run typecheck` (both configs) green; full `npm test` green (entire repo suite).
- [ ] Prettier touched files; commit (stage specific paths).
- [ ] Hand off: plans complete → run `/feature-done` (gates the DoD, relocates the spec + both plans to `completed/`).
