# Galaxy field renderer extraction — design (Track B / prep P3)

Branch: fresh worktree off `main` (this spec is written standalone; execution
gets its own worktree/session per `docs/research/engine/decisions.md`
"Execution tracks"). Depends on: `docs/research/engine/decisions.md` (settled
decisions, not re-litigated here), `docs/research/engine/field-seam-map.md`
(the tool↔app seam inventory this spec's file-move map is drawn from).

## Goal

`tools/galaxy-renderer/src/engine/` owns the only working implementation of
the v2 analytic Milky Way field: Gaussian-mixture splatting, the multiplicative
dust-column map, HII regions, and the fluid ISM-map generator that seeds all
of it. The app has none of this — `frameProgram.ts` has no `field`/`dustMap`/
`hii` step, no target, no settings surface (field-seam-map §4). This spec
moves the field/ISM **orchestration** — not the shaders (already shared via
`wesl.toml` symlinks) and not the pure data builders (already shared,
`galaxyGenerator/v2/*`) — into `src/services/gpu/renderers/galaxyField/` as an
instantiable module, so Track C (landing the field in the app) consumes a
built module instead of hand-porting ~1250 lines of `createGalaxyEngine.ts`.

## Motivation: the hand-mirror risk

The one precedent for "app and tool both draw this, kept in sync by
discipline alone" already exists and already documents its own cost.
`tools/galaxy-renderer/src/engine/post/encodeBloomPyramid.ts`'s header:

> a deliberate duplicate of the runtime's `runBloom` pass sequence, calling
> the SAME shared `bloomPyramid`. Only the orchestration is copied... The pass
> ORDER is load-bearing and must stay in step with `runBloom`: every pass
> reads a level written earlier in this same sequence.

That duplicate is tolerated because bloom's shared primitive
(`bloomPyramid.ts`) is small and its order is a five-line comment. Field/ISM
orchestration is not: `createFieldPipelines.ts` is ~19 KB, `packFieldUniforms.ts`
encodes a 68-float header plus a 16-float-per-component byte contract with
`field/io.wesl`, and the ISM-map fluid chain is ~20 files deep with an
orientation feedback loop. Hand-porting this into the app (Track C) and then
hand-keeping it in sync would reproduce the bloom mirror at far greater
surface area, for byte layouts far less forgiving of drift than a pass order.
The fix is the one the shaders already took: one implementation, imported by
both consumers, not two kept honest by a comment. Track B does for the TS
orchestration what `wesl.toml` already did for the WGSL.

## Public surface (contract only — no implementation)

```ts
// src/services/gpu/renderers/galaxyField/createGalaxyFieldRenderer.ts

export type GalaxyFieldRendererDeps = {
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
};

// One instance per galaxy. MW is instance #1 (decisions.md "Fly-by target");
// no singleton, no store/settings read — every per-galaxy input arrives
// through setMixture() or encode(), never pulled from global state.
export function createGalaxyFieldRenderer(
  device: GPUDevice,
  deps: GalaxyFieldRendererDeps,
): GalaxyFieldRenderer;

export type GalaxyFieldMixtureInput = {
  readonly geometry: GalaxyDescription | null; // shared/describeGalaxy — same value v1's sprite tier consumes
  readonly fieldTuning: GalaxyFieldTuning;
  readonly seed: number;
};

// Render targets the HOST allocates and owns (canvas-sized/scaled offscreens
// today live in the tool's createGalaxyRenderTargets.ts — that allocator is
// NOT part of this module; see "What stays tool-side"). The module only
// receives views to draw into.
export type GalaxyFieldRenderTargets = {
  readonly fieldTex: GPUTextureView;
  readonly dustMapTex: GPUTextureView;
  readonly hiiTiers: Readonly<Record<HiiTier, GPUTextureView>>;
};

export type GalaxyFieldRenderer = {
  // Rebuilds the analytic mixture + dust/HII component buffers from a new
  // GalaxyDescription/tuning/seed. Idempotent no-op when the identity check
  // (createKeyedRebuild-style) finds nothing moved. Synchronous today.
  setMixture(input: GalaxyFieldMixtureInput): void;

  // Advances the fluid ISM-map solver by one step. Returns done:true once
  // settled. TODAY: MW's eager path calls this in a loop to completion
  // inside setMixture (matching createIsmMapFluidRunner's current
  // behavior) — this method exists so a FUTURE per-galaxy scheduler (fly-by
  // target, decisions.md) can spread the same calls across frames with no
  // API change, not because time-slicing ships in this spec.
  stepIsmMap(): { readonly done: boolean };

  // Encodes field splat, dust-map, and HII-tier passes into the caller's
  // command encoder against caller-owned target views. No pass ordering
  // decision lives here beyond what's intrinsic to one galaxy's own passes
  // (dustMap before field, per createGalaxyEngine.ts's existing order) —
  // where this galaxy's passes sit in the FRAME's overall order is the
  // host's call (frameProgram step, or the tool's drawFrame).
  encode(encoder: GPUCommandEncoder, targets: GalaxyFieldRenderTargets): void;

  dispose(): void;
};
```

`GalaxyDescription`, `GalaxyFieldTuning`, `GalaxyFieldComponent` are existing
shared types (`src/@types/galaxy/*`) — no new type surface there. `HiiTier`
**promotes to `src/@types/galaxy/HiiTier.ts` in the move commit**: the
dependency rule below forbids the shared surface referencing anything under
`tools/`, and `GalaxyFieldRenderTargets` needs the union. The `HII_TIERS`
value table in `data/hiiTiers.ts` stays tool-side; Track C decides whether the
app draws the same tiering or a subset.

## File move map

All moves are `npm run move-files -- <from> <to>` (batched via `--manifest`)
or `npm run refactor -- move <from> <to>` — never hand-edited import paths.
Root: `tools/galaxy-renderer/src/engine/` → `src/services/gpu/renderers/galaxyField/`,
subfolder names preserved.

| moves (relative to engine/) | destination (relative to galaxyField/) |
|---|---|
| `field/buildFieldHeaderInputs.ts` | `field/buildFieldHeaderInputs.ts` |
| `field/createFieldPipelines.ts` | `field/createFieldPipelines.ts` |
| `field/deriveDustHeaderLanes.ts` | `field/deriveDustHeaderLanes.ts` |
| `field/dustSliceEdges.ts` | `field/dustSliceEdges.ts` |
| `field/encodeDustMapPass.ts` | `field/encodeDustMapPass.ts` |
| `field/encodeDustPresentPass.ts` | `field/encodeDustPresentPass.ts` |
| `field/encodeSplatPass.ts` | `field/encodeSplatPass.ts` |
| `field/findHiiSegment.ts` | `field/findHiiSegment.ts` |
| `field/packBubbleInstances.ts` | `field/packBubbleInstances.ts` |
| `field/packFieldUniforms.ts` | `field/packFieldUniforms.ts` |
| `ismMap/createIsmMapGenerator.ts` | `ismMap/createIsmMapGenerator.ts` |
| `ismMap/createIsmMapOutput.ts` | `ismMap/createIsmMapOutput.ts` |
| `ismMap/createIsmMapFluidRunner.ts` | `ismMap/createIsmMapFluidRunner.ts` |
| `ismMap/createIsmMapOrientation.ts` | `ismMap/createIsmMapOrientation.ts` |
| `ismMap/createIsmMapRingReduce.ts` | `ismMap/createIsmMapRingReduce.ts` |
| `ismMap/createIsmMapDustCdfScan.ts` | `ismMap/createIsmMapDustCdfScan.ts` |
| `ismMap/createIsmMapPlaceDust.ts` | `ismMap/createIsmMapPlaceDust.ts` |
| `ismMap/createIsmMapPlaceArmCloud.ts` | `ismMap/createIsmMapPlaceArmCloud.ts` |
| `ismMap/createIsmMapPlaceArmSpurCloud.ts` | `ismMap/createIsmMapPlaceArmSpurCloud.ts` |
| `ismMap/createIsmMapPlaceDigVeil.ts` | `ismMap/createIsmMapPlaceDigVeil.ts` |
| `ismMap/computePlaceDustBudget.ts` | `ismMap/computePlaceDustBudget.ts` |
| `ismMap/computeDigVeilBudget.ts` | `ismMap/computeDigVeilBudget.ts` |
| `ismMap/buildDigArmEnvelopeTable.ts` | `ismMap/buildDigArmEnvelopeTable.ts` |
| `ismMap/packIsmMapFluidConstants.ts` | `ismMap/packIsmMapFluidConstants.ts` |
| `ismMap/packIsmMapFluidEvents.ts` | `ismMap/packIsmMapFluidEvents.ts` |
| `ismMap/packIsmMapFluidStepIndex.ts` | `ismMap/packIsmMapFluidStepIndex.ts` |
| `ismMap/packPlaceDustParams.ts` | `ismMap/packPlaceDustParams.ts` |
| `ismMap/packPlaceArmCloudParams.ts` | `ismMap/packPlaceArmCloudParams.ts` |
| `ismMap/packPlaceArmSpurCloudParams.ts` | `ismMap/packPlaceArmSpurCloudParams.ts` |
| `ismMap/packPlaceDigVeilParams.ts` | `ismMap/packPlaceDigVeilParams.ts` |
| `ismMap/packArmCloudArmRecords.ts` | `ismMap/packArmCloudArmRecords.ts` |
| `ismMap/packArmSpurCloudRecords.ts` | `ismMap/packArmSpurCloudRecords.ts` |
| `ismMap/packIsmMapCdfArmEnvelope.ts` | `ismMap/packIsmMapCdfArmEnvelope.ts` |
| `ismMap/packIsmMapCdfParams.ts` | `ismMap/packIsmMapCdfParams.ts` |
| `gpu/bakeVolumeTexture.ts` | `gpu/bakeVolumeTexture.ts` |
| `gpu/createGrowOnlyRecordBuffer.ts` | `gpu/createGrowOnlyRecordBuffer.ts` |

36 files move. `createGalaxyFieldRenderer.ts` itself is **new** code (the
public-surface sketch above), written in the implementation plan, not moved.

### Drift found against `field-seam-map.md` (2 days old)

- **`ismMap/createIsmMapOutput.ts` is missing from the seam map's table
  entirely.** It is not a peripheral file — `createIsmMapGenerator.ts`
  constructs it first and re-exports its texture/buffers/pipelines wholesale;
  it is "the packed artifact... and everything downstream of it" per its own
  header. Added to the move set above.
- **Four `ismMap/pack*.ts` files are missing**: `packArmCloudArmRecords.ts`,
  `packArmSpurCloudRecords.ts`, `packIsmMapCdfArmEnvelope.ts`,
  `packIsmMapCdfParams.ts`. Same role as the packers the seam map does list
  (uniform/storage-buffer packers for the placement dispatch hosts); added.
- The seam map's own `ismMap/` count was hedged ("~20 files"); the real
  count is 30. Net: 24 of 30 move (see "stays tool-side" below), not the ~20
  the seam map implied would be candidates.
- `field/` and `gpu/` matched the seam map's file lists exactly — no drift
  there.

## What stays tool-side, and why

| file(s) | why |
|---|---|
| `probe/*` | headless readback path the auto-fit matcher drives — tool has no app-side equivalent need |
| `timing/*` | tool's own frame-median + GPU-timing windows; the app has its own `gpuTimingService`/`TIMED_SLOTS` (Track A's concern, not this one) |
| `post/encodeBloomPyramid.ts`, `post/createGradePipeline.ts`, `post/packGradeUniforms.ts`, `post/gradeIsActive.ts` | grade is "the one deliberately tool-only pass" (`tools/galaxy-renderer/README.md:200-205`); bloom-mirror deletion is its own backlog item (decisions.md "Spun off to backlog"), not this spec's scope |
| `ismMap/createIsmMapReadbacks.ts`, `createOrientationDiagnostics.ts`, `decodeOrientationTexels.ts`, `orientationCoherenceStats.ts`, `decodeIsmMapTexels.ts` | debug/diagnostics readback path — `decodeIsmMapTexels.ts`'s only caller is `createIsmMapReadbacks.ts` (verified); none sit on the placement-critical path per `2026-08-11-gpu-side-v2-placement.md`'s "readbacks demote to diagnostics" |
| `field/createArmRidgeDebugSample.ts`, `ismMap/createIsmMapDustCdfScanDebugSample.ts` | "numeric-validation exception" fixtures — own dispatch, own one-shot readback, explicitly "no production caller" per their own headers. Judgment call, not in the seam map's tool-only table framing (they sit in `field/`/`ismMap/`, not a `diagnostics/` folder) — classified here as diagnostics because their entire purpose is offline validation, matching the class of thing the scope excludes. **Flagged OPEN below.** |
| `gpu/createGalaxyRenderTargets.ts` | target **allocation**, not orchestration — owns both tiers' offscreens sized off the tool's own canvas (README: "One module, both tiers, by design"). The extracted module receives target *views* (see `GalaxyFieldRenderTargets` above), it doesn't allocate them. Track C's app-side target rows are that track's concern, not this move. |
| `gpu/createReadbackQueue.ts`, `gpu/readTextureChannelSum.ts` | debug-only readback machinery (flux-sum readback, `mapAsync`-based staging) — no placement-critical caller |
| `model/createGalaxyModel.ts` | "what a galaxy IS" — owns both v1 and v2 mixtures, drives the ISM-map generator's `rebuild()`, computes budgets. Stays tool-side entirely; it becomes a **consumer** of the moved module (its imports to moved files get rewritten by `move-files`, same as any other caller) |
| `sprites/*`, `frame/deriveFrameView.ts`, `passes/*`, `camera/*`, `createGalaxyEngine.ts`, `createRafLoop.ts`, `createKeyedRebuild.ts` | v1 tier, tier-independent pass vocabulary, and the tool's own engine shell — none of it is field/ISM orchestration |

## Dependency rule

`src/services/gpu/renderers/galaxyField/**` imports:

- **nothing from `tools/`** — the direction is tool → shared module, never
  the reverse. (Today's direction is already backwards inside `engine/`:
  `tools/galaxy-renderer` importing from `../../../src/...` for shaders and
  data builders. This move fixes the TS orchestration to match.)
- **nothing from `src/state/`** — no Redux, no `useAppSelector`, no settings
  reads. Every input is a constructor arg or a method argument (`setMixture`,
  `encode`). This is what makes the module usable per-galaxy without a
  singleton: the host (tool today, app Track C tomorrow) owns lifecycle,
  budget, and eviction; the module owns GPU resource lifetime and pass
  encoding only.
- **freely from `src/@types/galaxy/*`, `src/services/gpu/shaders/**`,
  `src/services/gpu/lib/*`, `src/services/engine/galaxyGenerator/{v2,shared}/*`,
  `src/utils/**`** — the existing shared surface (field-seam-map §3), unchanged
  by this move.

## Migration sequencing (separate commits)

1. **Move.** `npm run move-files` per the table above, one manifest, one
   commit. `move-files` rewrites every relative TS import project-wide
   (including `model/createGalaxyModel.ts`'s references into the moved
   files) — do not hand-edit import paths. It does **not** rewrite
   `?static`/`?worker` specifiers (`reference_move_files_blind_spots`,
   `project_galaxy_tool_own_build`); grep the moved files for `wesl?static`
   after the move and fix relative depth by hand, then verify with the
   tool's own build (below) — `npm run typecheck` and `npm run build` both
   pass on a broken `?static` path and prove nothing.
2. **Consume.** `createGalaxyEngine.ts` and `model/createGalaxyModel.ts`
   switch their remaining local calls (device/pipeline construction, per-frame
   encode) to `createGalaxyFieldRenderer`'s public surface. This is the one
   commit that writes the new `createGalaxyFieldRenderer.ts` itself — its
   internals assemble the moved field/ismMap pieces exactly as
   `createGalaxyEngine.ts` does today (same construction order, same
   `own()`-ledger discipline), just behind the instance API. Own commit,
   separate from the move.
3. **Delete local copies.** Once the tool consumes the shared module, delete
   whatever became dead in `createGalaxyEngine.ts`/`model/createGalaxyModel.ts`
   (inline construction code the module now owns). Own commit — makes the
   diff of "what actually changed behaviorally" reviewable independent of the
   mechanical move.

Each commit keeps the tool buildable; the GPU probe (below) is the gate after
steps 2 and 3, not just at the end.

## Verification gates

- **Tool typecheck**: `npx tsc --noEmit -p tools/galaxy-renderer/tsconfig.json`
  — **not** `npm run typecheck` or `npm run build`, neither of which compiles
  `tools/galaxy-renderer` (`project_galaxy_tool_own_build`: its own
  `tsconfig.json` isn't included by the root program or `tsconfig.tools.json`).
  Never run plain `tsc -p` without `--noEmit` on this config — it has no
  `noEmit` of its own and will write ~1200 `.js`/`.d.ts` files next to their
  sources.
- **Tool build**: `npm run galaxy-renderer:build` — the only command that
  resolves `.wesl?static` imports for real; this is what catches a `?static`
  path the move left stale.
- **GPU probe**: `npm run galaxy-renderer:probe` — "the only automated gate
  reaching the engine" (memory `project_galaxy_gpu_error_probe`); run after
  each of the three commits above, not only at the end.
- **User visual pass**: side-by-side before/after in the tool's own dev
  server (`npm run galaxy-renderer`) — behaviour-neutral is the acceptance
  bar for this spec (unlike Track C's fresh calibration pass), so the look
  must be pixel-for-pixel unchanged. Required before merge; not a gate the
  probe or typecheck substitutes for.

## Ground preparation

This spec **is** the ground preparation — P3 in `decisions.md`'s numbered
list, feeding Track C (F1: land the field in the app). Track C's spec is
written against this move's post-refactor tree: it imports
`createGalaxyFieldRenderer` from `src/services/gpu/renderers/galaxyField/`
rather than sketching app-side field orchestration from scratch. No further
refactor-ground pass is needed before Track C's spec — the "ideal shape"
question (own one implementation, not two) is what this spec answers.

## Non-goals

- **Any app-side wiring** — frameProgram step, render target rows, settings
  surface, `SubsystemBundle` registration. That's Track C (F1-F3), sequenced
  to start after this spec's PR and Track A's both merge.
- **The bundle contract itself** (`SubsystemBundle`, engine-core walkers) —
  Track A (P1/P2/P4), independent and parallelizable.
- **Deleting the tool's bloom mirror** (`encodeBloomPyramid` vs. app
  `runBloom`) — spun off to backlog per `decisions.md`; natural to touch near
  this move but explicit scope creep the decision record already flagged.
- **Time-slicing the ISM-map generator** — `stepIsmMap()` exists as a seam in
  the contract; the fluid runner still settles in one call this spec. Real
  per-frame budgeting is fly-by-target follow-on work, not part of landing
  the module.
- **`HiiTier`/`data/hiiTiers.ts` unification** — stays tool-local for now;
  whether the app needs the same tiers or a subset is Track C's call.
- **Changing any pass's numeric output.** This move is behaviour-neutral by
  construction — no algorithm, RNG, or budget changes.

## Open questions

- **OPEN**: are `field/createArmRidgeDebugSample.ts` and
  `ismMap/createIsmMapDustCdfScanDebugSample.ts` correctly classified as
  "stays tool-side"? They're wired unconditionally in `createGalaxyEngine.ts`
  (not gated behind `probe/`), but their own headers describe them as
  numeric-validation fixtures with no production caller. If Track C ever
  wants the same validation path in-app, they'd need to move; deferred here
  since nothing in this spec's scope calls them.
- **OPEN**: `HiiTier`'s home. It's tool-local today (`data/hiiTiers.ts`, out
  of this move) but `GalaxyFieldRenderTargets` above references it as a
  shared type. Resolve when Track C's target-row shape is known, or promote
  it to `src/@types/galaxy/` as part of this spec's implementation if the
  contract needs it sooner.
- **PR packaging: RESOLVED** (user confirmation, 2026-08-17) — one PR per
  track; Track B ships as one PR with the three commits of §"Migration
  sequencing".
