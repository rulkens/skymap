# Dissolve `RenderFrameSettings`: passes read from `state` + `ctx`

> **Spec:** [`docs/superpowers/specs/2026-06-21-dissolve-render-frame-settings-design.md`](../specs/2026-06-21-dissolve-render-frame-settings-design.md). This plan implements exactly that spec — read it first; it carries the rationale and the Definition of Done.
>
> **Status: SHIPPED.** All 11 tasks executed via subagent-driven development; `RenderFrameSettings` deleted, every pass reads from `state`/`ctx`/constants. Typecheck clean (both tsconfigs), full suite 2978 green, manual visual-parity confirmed, whole-branch review APPROVE_WITH_MINOR (both Minor findings fixed). Behaviour-neutral.

## Goal

Delete the per-frame `RenderFrameSettings` bag. Drop the `settings` parameter from `Pass.enabled` / `Pass.draw` and the four `encode*` functions. Every value re-sources from its real home: user settings off `state.settings.<path>`, selection off `state.selection.select`, the two genuinely-derived values (`visibleSourceMask`, `focus`) off `ctx`, the two fade thresholds from the constants that already own them. Also delete the vestigial `catalogs` / `famousMeta` fields from `RenderFrameInput` + `PassDeps`.

## Architecture

The dissolution is **behaviour-neutral**: every byte delivered to every renderer is identical; only the delivery path changes. The hard constraint is that `Pass.enabled`/`draw` is a **shared signature** — it cannot change one-pass-at-a-time without breaking the registry loop and every other pass. So the work is ordered to make the signature change LAST and purely mechanical, with the full suite green at every task boundary:

- **Phase 0 (Task 1)** — delete the dead `catalogs` / `famousMeta` fields. Independent; first because it's pure deletion and shrinks every fixture.
- **Phase 1 (Task 2)** — add the two derived values to `ReadyFrameContext` (`visibleSourceMask`, `focus`) and wire `runFrame` to populate them. Additive: `RenderFrameSettings` still carries them, nothing reads the new ctx fields yet.
- **Phase 2 (Tasks 3–10)** — flip every reader OFF the `settings` param onto `state` / `ctx` / constants, one small green task per consumer. The `settings` param **stays in the signature, unused**, so the suite stays green per task. Each task also rewrites that consumer's test to drive inputs via `state`/`ctx`.
- **Phase 3 (Task 11)** — drop the now-unused `settings` param from `Pass.enabled`/`draw`, the four `encode*` functions, and `RenderFrameInput`; delete `RenderFrameSettings.d.ts`; remove the `settings: { … }` literal from the `runFrame` assembly; update remaining test call sites. `npm run typecheck` is the safety net.

`flowFieldPass` + `diskRadiusRingPass` already read `state.settings` directly (`flowFieldPass.ts:44,61`, `diskRadiusRingPass.ts:44-46`) and only have `_settings` placeholders — they need no Phase-2 change, only the Phase-3 signature drop. The four no-settings passes (`markerLinesPass`, `labelsPass`, `horizonShellPass`, `structureMarkersPass`) likewise carry only `_settings` placeholders — Phase-3 signature drop only.

## Tech stack

TypeScript + Vitest. No new dependencies. The on-disk binary format is untouched. No WGSL changes (the renderer call signatures are unchanged — only how the JS args are sourced).

## Global Constraints

- **Behaviour-neutral.** No settings-shape change, no new toggle, no render-order change. The existing pass `enabled`/`draw` tests and `renderFrame` ordering tests are the safety net — they change only in *how they supply inputs*, never in *what they assert about output*.
- **Green at every task boundary.** The shared `Pass` signature stays intact through Phase 2; only Phase 3 changes it. Run the relevant tests at the end of every task; commit only on green.
- **Conventions.** Didactic comments (explain *why*); `type` aliases not `interface`; `Vec2`/`Vec3` aliases not raw tuples; one-type-per-file in `src/@types/`; typed `vi.fn<() => void>()` not bare `vi.fn()`. Stage specific paths — never `git add -A`. Prettier only touched files. (Execution-time: implementers run bash sequentially and use Read/Grep, not sed/awk/grep.)
- **Field → new-source mapping** (used by the Phase-2 tasks):

| `settings.<field>` | New source |
|---|---|
| `pointSizePx` | `state.settings.galaxyCatalogs.sizePx` |
| `brightness` | `state.settings.galaxyCatalogs.brightness` |
| `selected` | `state.selection.select` |
| `visibleSourceMask` | `ctx.visibleSourceMask` |
| `highlightFallback` | `state.settings.galaxyCatalogs.highlightFallback` |
| `realOnlyMode` | `state.settings.galaxyCatalogs.realOnly` |
| `biasMode` | `state.settings.bias.mode` |
| `absMagLimit` | `state.settings.bias.absMagLimit` |
| `depthFadeEnabled` | `state.settings.galaxyCatalogs.depthFade` |
| `pxFadeStartPoints` / `pxFadeEndPoints` | `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` (import from `services/engine/subsystems/proceduralDiskSubsystem`, `:50-51`) |
| `focus` | `ctx.focus` |
| `exposure` | `state.settings.tonemap.exposure` |
| `toneMapCurve` | `state.settings.tonemap.curve` |
| `galaxyTexturesEnabled` | `state.settings.thumbnails.enabled` |
| `milkyWayEnabled` | `state.settings.milkyWay.enabled` |
| `filamentsEnabled` | `state.settings.filaments.enabled` |
| `filamentIntensity` | `state.settings.filaments.intensity` |
| `volumesEnabled` | `state.settings.volumes.enabled` |

> **For agentic workers:** execute this plan with the `subagent-driven-development` workflow — a fresh implementer subagent per task, dispatched `run_in_background: true`. The main thread runs `npm test` / `npm run typecheck` and commits; implementers only edit. Tick each task's `- [x]` to `- [x]` in the same response as the TaskUpdate. Front-load constraints in each dispatch (sequential bash, Read/Grep not sed, absolute worktree paths, typed `vi.fn`). Implementers: if a clean implementation is blocked, STOP and report — don't hack around it.

---

## Phase 0 — delete dead fields

### Task 1: Remove vestigial `catalogs` / `famousMeta`

**Files:** `src/@types/engine/frame/RenderFrameInput.d.ts` (`:104-106`), `src/@types/engine/frame/PassDeps.d.ts` (`catalogs`/`famousMeta` fields + their imports), `src/services/engine/frame/renderFrame.ts` (`:117-128` deps assembly — drop `catalogs`, `famousMeta`), `src/services/engine/frame/runFrame.ts` (`:380-381` input assembly — drop `famousMeta`, `catalogs`), `tests/services/engine/frame/renderFrame.test.ts` (drop the `catalogs` / `famousMeta` keys from `makeInput`, `:373-374`, and the now-unused `catalogs` local at `:247` + its fixture-root mirror).

**Why pure deletion:** no pass or `encode*` reads `deps.catalogs` / `deps.famousMeta`. The thumbnail subsystem — the field's claimed consumer per the stale `PassDeps` docblock — reads `state.data.galaxies.catalogs` / `.famousMeta` **directly** at `runFrame.ts:303-308`. No consumer is re-pointed.

- [x] Remove the two fields + their now-unused `GalaxyCatalog` / `SourceType` / `FamousMetaEntry` imports from `RenderFrameInput.d.ts` and `PassDeps.d.ts` (check which imports go unused after removal; `RenderFrameInput` keeps `GalaxyCatalog`/`SourceType` only if something else uses them — verify).
- [x] Remove `catalogs` / `famousMeta` from the `deps` literal in `renderFrame.ts` and from the `renderFrame({ … })` call in `runFrame.ts`.
- [x] Drop the fixture keys + unused `catalogs` local from `renderFrame.test.ts`.
- [x] `npm run typecheck` clean; `npm test -- renderFrame` green. `grep -rn "catalogs\|famousMeta" src/@types/engine/frame/` shows neither.
- [x] Commit (`git add` the specific paths).

---

## Phase 1 — add the derived homes on `ctx`

### Task 2: `ReadyFrameContext` gains `visibleSourceMask` + `focus`

**Files:** `src/@types/engine/frame/ReadyFrameContext.d.ts` (modify), `src/services/engine/frame/frameContext.ts` (modify), `src/services/engine/frame/runFrame.ts` (modify), `tests/services/engine/frame/frameContext.test.ts` (modify).

**Type additions** (join the genuinely-derived half, alongside `vp` / `drawCamPos` / `focusBlend`):

```ts
// ReadyFrameContext.d.ts
/** Galaxy-catalog draw mask (deriveSourceMasks(state).draw), this frame. */
visibleSourceMask: number;
/** Full cluster-focus uniform value (produceFocusUniforms, ticked once/frame). */
focus: FocusUniformsValue;
```

Import `FocusUniformsValue` from `../../rendering/FocusUniformsValue`.

**`deriveFrameContext` signature** — add `visibleSourceMask` as a new trailing arg:

```ts
deriveFrameContext(state, canvas, pose, projection, visibleSourceMask: number): FrameContext
```

Set `visibleSourceMask` at construction (the ready-branch return literal, `frameContext.ts:152-164`). `focus` cannot be set here — `produceFocusUniforms` ticks the controller and must fire exactly once per frame in `runFrame`; seed `focus` to a placeholder in the return literal the same way `focusBlend: 0` is seeded (`:159`), with a didactic comment matching the existing `focusBlend` note (`:144-151`). Use the at-rest uniform value (a `blend: 0` shape) as the seed.

**`runFrame` wiring:**
- Pass `masks.draw` into the `deriveFrameContext` call (`runFrame.ts:240`).
- Set `ctx.focus = focusUniforms` at the existing `ctx.focusBlend = focusUniforms.blend` line (`runFrame.ts:273`) — same site, no new mutation point, still exactly one `produceFocusUniforms` call.

Nothing reads the new ctx fields yet; `RenderFrameSettings` still carries them. Suite stays green.

- [x] Add the two fields to `ReadyFrameContext.d.ts` with the `FocusUniformsValue` import.
- [x] Add the `visibleSourceMask` arg to `deriveFrameContext`; set it at construction; seed `focus` (placeholder, mirroring `focusBlend`).
- [x] Wire `runFrame`: `masks.draw` into the call; `ctx.focus = focusUniforms` at `:273`.
- [x] In `frameContext.test.ts`, add a test `deriveFrameContext exposes visibleSourceMask and a seeded focus on the ready context` asserting `ctx.visibleSourceMask` equals the passed mask and `ctx.focus.blend === 0`. Update the existing `deriveFrameContext` call sites in that file to pass the new arg.
- [x] `npm run typecheck` clean; `npm test -- frameContext runFrame` green.
- [x] Commit.

---

## Phase 2 — flip readers off the `settings` param

> Each task rewrites ONE consumer to read from its new source per the mapping table, and rewrites THAT consumer's test to drive inputs via `state`/`ctx` instead of the settings bag. The `settings` param stays in the signature (unused → rename to `_settings` where a pass no longer reads it, or keep the name if Phase 3 will drop it cleanly). Suite green per task.

### Task 3: `pointSpritesPass` rebuilds `PointDrawSettings` from `state` + `ctx` + selection + constants

**Files:** `src/services/engine/frame/passes/pointSpritesPass.ts` (modify), `tests/services/engine/frame/passes/passes.test.ts` (modify — `pointSpritesPass.draw` describe block, `:420-448`).

The heaviest consumer: every field of the `PointDrawSettings` record (`pointSpritesPass.ts:77-107`) currently reads `settings.<field>`. Re-source each per the mapping table:
- `settings.selected` → `state.selection.select` (the galaxy-ref → `packSelection` translation at `:67-70` is unchanged, only its input).
- `pointSizePx`, `brightness`, `highlightFallback`, `realOnlyMode`, `biasMode`, `absMagLimit`, `depthFadeEnabled` → `state.settings.{galaxyCatalogs,bias}.<…>`.
- `visibleSourceMask` → `ctx.visibleSourceMask`.
- `pxFadeStart` / `pxFadeEnd` → import `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX`.
- `focusBindGroup` (`state.gpu.focusUniform!.bindGroup`) and `fadeOpacityOf` are already off `state` — unchanged.

Update the module-header "What it reads" block (`:29-32`) to name the real sources instead of "the whole `RenderFrameSettings` block".

**Test:** the two `pointSpritesPass.draw` tests (`packs (source, index)…`, `translates null selection…`) currently set selection via `makeSettings({ selected })`. Drive selection via `state.selection.select` instead (extend `STATE_STUB` or pass an override-state). The `STATE_STUB` (`:137-149`) needs `selection`, `settings.{galaxyCatalogs,bias}`, and `ctx.visibleSourceMask` populated enough that the draw runs. Assertions on `drawSettings.selectedPacked` are unchanged.

- [x] Re-source every `PointDrawSettings` field per the mapping; import the two fade constants.
- [x] Update the module-header read-list comment.
- [x] Rewrite the two draw tests to drive selection via `state.selection.select`; extend the state stub with the needed settings/selection/ctx fields.
- [x] `npm test -- passes` green.
- [x] Commit.

### Task 4: `milkyWayPass.enabled` reads `state.settings.milkyWay.enabled`

**Files:** `src/services/engine/frame/passes/milkyWayPass.ts` (modify), `tests/services/engine/frame/passes/passes.test.ts` (modify — `milkyWayPass.enabled` block, `:323-363`).

`settings.milkyWayEnabled` → `state.settings.milkyWay.enabled` (`:61`). `draw` already ignores settings (`_settings`). Update the `### What it reads` note (`:35`).

- [x] Re-source the gate; update the comment.
- [x] Rewrite the three `milkyWayPass.enabled` tests + the `milkyWayPass.draw` test to set `state.settings.milkyWay.enabled` (extend the state stub) instead of `makeSettings({ milkyWayEnabled })`.
- [x] `npm test -- passes` green.
- [x] Commit.

### Task 5: `filamentsPass` reads `state.settings.filaments.{enabled,intensity}`

**Files:** `src/services/engine/frame/passes/filamentsPass.ts` (modify), `tests/services/engine/frame/passes/filamentsPass.test.ts` (modify), and the `filamentsPass` blocks in `tests/services/engine/frame/passes/passes.test.ts` (`:262-321`).

`enabled`: `settings.filamentsEnabled` → `state.settings.filaments.enabled` (`:74`). `draw`: `settings.filamentIntensity` → `state.settings.filaments.intensity` (`:96`).

- [x] Re-source both reads.
- [x] Rewrite `filamentsPass.test.ts` (drop its local `makeSettings`, drive `enabled`/`intensity` via state) and the `filamentsPass.enabled`/`.draw` blocks in `passes.test.ts`. The `forwards correct args` assertion on `args[4] === 0.7` now comes from `state.settings.filaments.intensity = 0.7`.
- [x] `npm test -- filamentsPass passes` green.
- [x] Commit.

### Task 6: `texturedDisksPass` + `proceduralDisksPass` read `state.settings.thumbnails.enabled`

**Files:** `src/services/engine/frame/passes/texturedDisksPass.ts` (`:20`), `src/services/engine/frame/passes/proceduralDisksPass.ts` (`:24`), `tests/services/engine/frame/passes/texturedDisksPass.test.ts`, `tests/services/engine/frame/passes/proceduralDisksPass.test.ts`, and the `proceduralDisksPass.enabled` block in `passes.test.ts` (`:219-255`).

Both `enabled` gates: `settings.galaxyTexturesEnabled` → `state.settings.thumbnails.enabled`.

- [x] Re-source both gates.
- [x] Rewrite the two per-pass tests + the `passes.test.ts` block to set `state.settings.thumbnails.enabled` (extend each test's state stub) instead of `makeSettings({ galaxyTexturesEnabled })`.
- [x] `npm test -- texturedDisksPass proceduralDisksPass passes` green.
- [x] Commit.

### Task 7: `volumeUpsamplePass.enabled` reads `state.settings.volumes.enabled`

**Files:** `src/services/engine/frame/passes/volumeUpsamplePass.ts` (`:50`), `tests/services/engine/frame/passes/volumeUpsamplePass.test.ts`.

`settings.volumesEnabled` → `state.settings.volumes.enabled`. (`draw` already `_settings`.)

- [x] Re-source the gate.
- [x] Rewrite the test to set `state.settings.volumes.enabled` instead of `makeSettings({ volumesEnabled })`.
- [x] `npm test -- volumeUpsamplePass` green.
- [x] Commit.

### Task 8: `selectionRingPass.draw` reads `state.settings.galaxyCatalogs.sizePx`

**Files:** `src/services/engine/frame/passes/selectionRingPass.ts` (`:62`), `tests/services/engine/frame/passes/selectionRingPass.test.ts`.

`settings.pointSizePx` → `state.settings.galaxyCatalogs.sizePx`. (`enabled` already `_settings`.)

- [x] Re-source the `selectionRingRadiusPx` arg.
- [x] Rewrite the draw tests to set `state.settings.galaxyCatalogs.sizePx = 4` instead of `makeSettings({ pointSizePx: 4 })`.
- [x] `npm test -- selectionRingPass` green.
- [x] Commit.

### Task 9: `encodeVolumePrepass` reads `state.settings.volumes.enabled`

**Files:** `src/services/engine/frame/encodeVolumePrepass.ts` (`:62` — `settings.volumesEnabled` → `state.settings.volumes.enabled`).

Update the gating-rationale comment (`:26`) that says "Master gate: `settings.volumesEnabled`". The `settings` param stays for now (Phase 3 drops it).

- [x] Re-source the master gate; update the comment.
- [x] No dedicated test file — covered by `renderFrame.test.ts`'s volume pre-pass tests (`:542-591`) and `encodeVolumes.test.ts`. Run `npm test -- renderFrame encodeVolumes` green.
- [x] Commit.

### Task 10: `renderFrame` reads `ctx.focus` + `state.settings.tonemap.{exposure,curve}`

**Files:** `src/services/engine/frame/renderFrame.ts` (modify), `tests/services/engine/frame/renderFrame.test.ts` + `tests/services/engine/frame/renderFrame.timing.test.ts` (modify).

- `state.gpu.focusUniform?.write(settings.focus)` (`:133`) → `…write(ctx.focus)`.
- `postProcess.draw(…, settings.exposure, settings.toneMapCurve, …)` (`:164,178`) → `ctx.…`? No — exposure/curve are user settings: `state.settings.tonemap.exposure` / `…curve`.

The four `encode*` calls still receive `settings` here (Phase 3 drops the param). This task only re-sources the three reads `renderFrame` itself makes; it does not yet remove `settings` from the input bag.

**Test:** `renderFrame.test.ts`'s `calls postProcess.draw … with exposure, curve…` (`:480-497`) asserts `args[2]/[3]` equal `fx.input.settings.exposure/toneMapCurve`. Move those values onto `state.settings.tonemap` in the fixture and assert against those. The fixture must populate `ctx.focus` (seed a `blend:0` value) and `state.settings.tonemap`. Mirror in `renderFrame.timing.test.ts`.

- [x] Re-source the three reads in `renderFrame.ts`.
- [x] Add `state.settings.tonemap` + `ctx.focus` to the `renderFrame.test.ts` / `renderFrame.timing.test.ts` fixtures; repoint the exposure/curve assertions.
- [x] `npm test -- renderFrame` green.
- [x] Commit.

---

## Phase 3 — drop the `settings` param + delete the type

### Task 11: Remove `settings` from `Pass`, the four `encode*`, and `RenderFrameInput`; delete `RenderFrameSettings.d.ts`

**Files:** `src/@types/engine/frame/Pass.d.ts`, `src/@types/engine/frame/RenderFrameInput.d.ts`, `src/services/engine/frame/{encodeHdrSingle,encodeHdrSplit,encodeUiOverlay,encodeVolumePrepass}.ts`, `src/services/engine/frame/renderFrame.ts`, `src/services/engine/frame/runFrame.ts`, all 13 pass files (drop the `settings`/`_settings` param), `src/@types/engine/frame/RenderFrameSettings.d.ts` (delete), and every test call site that still passes a settings arg (`passes.test.ts`, `renderFrame.test.ts`, `renderFrame.timing.test.ts`, and each per-pass test's `makeSettings`/`SETTINGS`).

**New `Pass` shape** (`Pass.d.ts`):

```ts
export type Pass = {
  readonly name: string;
  enabled(state: EngineState, ctx: ReadyFrameContext): boolean;
  draw(pass: GPURenderPassEncoder, ctx: ReadyFrameContext, state: EngineState, deps: PassDeps): void;
};
```

Remove the `RenderFrameSettings` import + the argument-order docblock mentions of `settings` (`:14,52,70-71,85,94`).

**`encode*` signatures:** drop the `settings: RenderFrameSettings` param and its import from all four. Update the loop calls `pass.enabled(state, ctx)` / `pass.draw(hdrPass, ctx, state, deps)` (`encodeHdrSingle.ts:95,97`; `encodeHdrSplit.ts:101,117`; `encodeUiOverlay.ts:76,97`).

**`renderFrame.ts`:** drop `settings` from the input destructure (`:106`) and from the four `encode*` call sites (`:158,177,179` + the `encodeVolumePrepass` arg is inside the encoders now). Drop `settings` from `RenderFrameInput` destructure.

**`RenderFrameInput.d.ts`:** remove the `settings: RenderFrameSettings` field (`:101-102`) + the import (`:33`).

**`runFrame.ts`:** delete the entire `settings: { … }` literal (`:352-379`) from the `renderFrame({ … })` call. The `PROCEDURAL_DISK_FADE_*` imports (`:66-69`) are now only used inside `pointSpritesPass` — check whether `runFrame` still references them (it won't); remove the now-dead import if unused.

**13 pass files:** drop the trailing `settings`/`_settings` param from `enabled`/`draw` signatures across all passes (point-sprites, procedural-disks, textured-disks, milky-way, filaments, flow, volume-upsample, horizon-shell, structure-markers, marker-lines, labels, selection-ring, disk-radius-ring).

**Tests:** delete every `makeSettings` / `SETTINGS` builder and the `RenderFrameSettings` import from each test file; update every `pass.enabled(state, ctx)` / `pass.draw(pass, ctx, state, deps)` call to drop the settings arg; drop `settings` from the `renderFrame` input fixtures.

`npm run typecheck` is the safety net — a missed call site is a tsc error, not a silent pass.

- [x] Drop the `settings` param from `Pass.d.ts` + remove the import + docblock mentions.
- [x] Drop `settings` from the four `encode*` functions and their `pass.enabled`/`pass.draw` calls.
- [x] Drop `settings` from `renderFrame.ts` (destructure + `encode*` calls) and `RenderFrameInput.d.ts` (field + import).
- [x] Delete the `settings: { … }` literal from `runFrame.ts`; remove the now-dead `PROCEDURAL_DISK_FADE_*` import if unused there.
- [x] Drop the `settings`/`_settings` param from all 13 pass files.
- [x] Delete `src/@types/engine/frame/RenderFrameSettings.d.ts`.
- [x] Update every test call site to drop the settings arg; remove the `makeSettings`/`SETTINGS` builders + `RenderFrameSettings` imports.
- [x] `npm run typecheck` clean (both tsconfigs); `npm test` full suite green, no pass-count reduction, output pristine.
- [x] `grep -rn RenderFrameSettings src tests` is empty; `grep -rn "settings" src/services/engine/frame/passes/` shows no `Pass`-param references (only `state.settings.…` reads).
- [x] Commit.

---

## Definition of Done

Per the spec's DoD:

- `RenderFrameSettings.d.ts` deleted; `grep -rn RenderFrameSettings src tests` empty.
- `Pass.enabled`/`draw` + the four `encode*` carry no `settings` param; no pass references a `settings` argument.
- `RenderFrameInput` + `PassDeps` carry no `catalogs` / `famousMeta`; `grep -rn "catalogs\|famousMeta" src/@types/engine/frame/` shows neither.
- `npm run typecheck` clean (src + tools).
- `npm test` green — full suite, no pass-count reduction, output pristine.
- Manual visual parity on the running dev server: points, thumbnails, filaments, Milky Way, volume, flow, selection ring, labels, pick-buffer debug overlay all render as before.

## Plan-style self-review

- Contract code only (type signatures + the new `Pass`/`ctx` shapes + test names); no function bodies. ✓
- Existing code cited by `file.ts:line`, not pasted. ✓
- One independently-testable deliverable per task; each ends green + committed. ✓
- The shared-signature constraint is solved by ordering (signature change last, mechanical), stated in Architecture. ✓
