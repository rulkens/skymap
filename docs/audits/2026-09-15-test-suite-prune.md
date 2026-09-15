# Test-suite prune — 2026-09-15

Deletion record for PR #715: every deleted or trimmed test file with its one-line reason, per subsystem slice and audit pass. Criterion: `docs/superpowers/conventions/testing.md`. Pass-1 "Kept-but-suspicious" lists were re-judged in pass 2.

<details><summary>Slice A_engine — pass 1</summary>

# Slice A_engine — deletions

Scope: `tests/services/**` except `tests/services/gpu/**`. Baseline 313 files / 2236 tests.

## Whole files

- `tests/services/biasCorrection/galaxyCatalogConstants.test.ts` — DELETED FILE — 1 test asserting an eager-built const table is the same object across calls; module-identity restatement.
- `tests/services/engine/camera/noStoredRegimeFlag.test.ts` — DELETED FILE — ts-morph declaration sweep over `src/` banning any boolean named surface/regime/engaged; a naming/convention detector, not a bug catcher, and 1.77 s of the suite.
- `tests/services/engine/camera/oneMpcSeam.test.ts` — DELETED FILE — same shape: a directory sweep asserting no file re-derives the Mpc↔metre constant; rename-detector over source text.
- `tests/services/engine/frame/cameraRuntimeSingleWriter.test.ts` — DELETED FILE — allow-listed source sweep for writes to the camera runtime; 1.35 s for a grep no real bug fails. (`frameFilePurity.test.ts`, the same shape, is KEPT: CLAUDE.md declares it the standing ratchet.)
- `tests/services/engine/data/forbiddenPaths.test.ts` — DELETED FILE — literal `readFileSync(src) + includes(needle)`: the source-text grep the convention names first.
- `tests/services/engine/data/createBodyStore.test.ts` — DELETED FILE — getter/setter round-trips on a typed 20-line store; the compiler already proves the shape.
- `tests/services/engine/data/createGalaxyStore.test.ts` — DELETED FILE — same: "starts empty" + set/get/remove round-trip on a Map wrapper.
- `tests/services/engine/data/createEngineData.test.ts` — DELETED FILE — constructor restatement ("still exposes X", "seeds Y at construction", "has no store for types whose state lives elsewhere").
- `tests/services/engine/helpers/engineReady.test.ts` — DELETED FILE — one test per clause of a 5-way `&&`, plus an explicit type-narrowing assertion; fails only when someone deliberately edits `isEngineReady`, and would not catch the real bug (a NEW handle omitted from the guard).
- `tests/services/engine/helpers/refOf.test.ts` — DELETED FILE — three one-line restatements of a tagged-union constructor.
- `tests/services/engine/helpers/structureIdOf.test.ts` — DELETED FILE — four restatements of a discriminant switch the type already enforces.
- `tests/services/engine/presentation/fadeIdToVisibilityKey.test.ts` — DELETED FILE — 16 tests mirroring two `satisfies Record<…>` tables row by row; the header itself argues against mechanical mirrors while being one.
- `tests/services/engine/frame/resolveStrategy.test.ts` — DELETED FILE — the 2×2 truth table of `explicit ?? (timing ? 'perLayerTimed' : 'merged')`.
- `tests/services/engine/frame/timing/timedSlotGroups.test.ts` — DELETED FILE — one test restating the exact grouping of the TIMED_SLOT_GROUPS literal.
- `tests/services/engine/frame/runMarkerProducers.test.ts` — DELETED FILE — a `flatMap` walker checked against a mocked producer table; its one real claim (alpha-0 descriptors survive, for pick-index alignment) is already pinned in `produceStructureMarkers.test.ts`.
- `tests/services/engine/integrationMarkerWire.test.ts` — DELETED FILE — "the renderer reports the same marker count the producer emitted"; a count echoed across a mock.
- `tests/services/engine/wiring/catalogLoadedDispatch.test.ts` — DELETED FILE — two tests that a one-line dispatcher dispatches.
- `tests/services/engine/wiring/assetWiringRequestShape.test.ts` — DELETED FILE — "every row's req is stable across two calls"; determinism of a pure builder, and `assetWiring.test.ts` already covers every req builder.
- `tests/services/engine/wiring/wireImpostorSubsystems.test.ts` — DELETED FILE — assignment restatement, redundant with `wireSlots.test.ts` ("assigns all five impostor subsystems onto state.subsystems").
- `tests/services/loading/consoleAdapter.test.ts` — DELETED FILE — five tests asserting a logging adapter logs.
- `tests/services/engine/registerReconcile.test.ts` — DELETED FILE — boots the whole engine under jsdom to assert `ctx.reconcile` is `toBeDefined()` — a typed field.

## Partial files

- `tests/services/engine/wiring/fadeLayers.test.ts` — 4 of 28 tests + 1 `expectTypeOf` block — dropped the banned `expectTypeOf<RowKeys>().toEqualTypeOf<VisibilityLayerKey>()` drift guard and the pure-constant seeds ("proceduralDisks and texturedDisks at 1", "galaxy and scaleBar at 1", "filament and flow at 0" — the seed-0 rule stays pinned by the galaxy-catalog and volume-field rows), plus the duplicate "surveyLabel seed follows famousGalaxy.labelEnabled" (the `seedFades`-level twin has more teeth).
- `tests/services/engine/frame/volumeLiveness.test.ts` — 1 of 13 tests — "returns settingsOf/fadeOpacityOf closures when a field is live" was `expect(typeof …).toBe('function')` on typed fields.
- `tests/services/engine/wiring/demandTable.test.ts` — 3 of 7 tests — the "boot set + filaments / + pgcAlias / + cf4Density" exact-`Set` restatements: one mechanism three times, each already pinned per row in `assetWiring.test.ts` demand predicates. Kept the boot-default set (catches an accidental default-on download), the structures-hidden bug-fix pin and the single-pass Famous+meta join.

### The pre-bootstrap null-guard sweep

`state.gpu.*` handles are typed nullable, so the compiler already forces the guard: `renderer.draw()` on a possibly-null handle does not compile. These tests can only fail if someone replaces the guard with a `!` assertion — a deliberate edit, plainly visible in a diff. The `enabled`-side twins are KEPT (they pin that the gate short-circuits on a bare ctx before touching `state.data`).

- `tests/services/engine/frame/passes/atmosphereShellPass.test.ts` — 1 of 6 — "is a no-op when the atmosphereShellRenderer handle is null".
- `tests/services/engine/frame/passes/bodyGlintsPass.test.ts` — 2 of 20 — the glint- and pick-renderer null no-ops.
- `tests/services/engine/frame/passes/earthPass.test.ts` — 3 of 24 — earthRenderer / earthSurfaceTileRenderer / bodyPickRenderer null no-ops.
- `tests/services/engine/frame/passes/filamentsPass.test.ts` — 1 of 4 — the renderer-null guard describe.
- `tests/services/engine/frame/passes/flowFieldPass.test.ts` — 1 of 6 — "does not throw when flowFieldRenderer is null".
- `tests/services/engine/frame/passes/foregroundLabelsPass.test.ts` — 1 of 6.
- `tests/services/engine/frame/passes/orbitTrailsPass.test.ts` — 1 of 15.
- `tests/services/engine/frame/passes/passes.test.ts` — 3 of 25 — two renderer-null no-ops plus "exactly the fifteen pickables expose drawPick, in registry order" (an exact registry-order list that breaks on every legitimate pickable added).
- `tests/services/engine/frame/passes/planetsPass.test.ts` — 2 of 14.
- `tests/services/engine/frame/passes/proceduralDisksPass.test.ts` — 2 of 7 — draw + drawPick null no-ops.
- `tests/services/engine/frame/passes/ringsPass.test.ts` — 1 of 9.
- `tests/services/engine/frame/passes/scalarVolumePass.test.ts` — 2 of 6 — the `typeof …toBe('function')` closure-forwarding test and the "defensive — executor gates first" re-gate.
- `tests/services/engine/frame/passes/starAggregateUpsamplePass.test.ts` — 1 of 3.
- `tests/services/engine/frame/passes/starAggregatesPass.test.ts` — 1 of 6.
- `tests/services/engine/frame/passes/starCatalogPass.test.ts` — 1 of 5 — the draw-side null no-op only.
- `tests/services/engine/frame/passes/starPointsPass.test.ts` — 1 of 18.
- `tests/services/engine/frame/passes/starSpheresPass.test.ts` — 1 of 8.
- `tests/services/engine/frame/passes/texturedBodiesPass.test.ts` — 1 of 9.
- `tests/services/engine/frame/passes/texturedDisksPass.test.ts` — 1 of 8.
- `tests/services/engine/frame/passes/volumeUpsamplePass.test.ts` — 1 of 7.
- `tests/services/engine/frame/passes/zoneOfAvoidancePass.test.ts` — 4 of 9 — two renderer-null no-ops plus the two "defensive — executor gates first" re-gates.
- `tests/services/engine/frame/passes/zoneOfAvoidanceUpsamplePass.test.ts` — 1 of 8.
- `tests/services/engine/frame/encodeAtmosphereSkyView.test.ts` — 1 of 4.
- `tests/services/engine/frame/encodeFlowCompute.test.ts` — 1 of 4.
- `tests/services/engine/frame/runBloom.test.ts` — 1 of 4.
- `tests/services/engine/frame/drawPickDebugOverlay.test.ts` — 2 of 9 — pickProgram / pickDebugOverlay null no-ops (the `overlays['pick-buffer']` gate stays).
- `tests/services/engine/volume/uploadVolumeField.test.ts` — 1 of 3.

### Restatements and redundant siblings

- `tests/services/engine/wiring/makeReconcileEffects.test.ts` — 3 of 9 — a null-tolerance no-throw plus two one-line passthrough restatements (`requestRender`, `bakeBias`).
- `tests/services/engine/frame/timing/timedSlots.test.ts` — 1 of 5 — the exact slot-name list ("is scalar-volume, nine hdr, …"); the structural invariants (one slot per registry row, names unique) stay.
- `tests/services/engine/wiring/galaxyCatalogSourceRegistry.test.ts` — 2 of 10 — "declares exactly the 9 expected sources in Source enum order" and the per-source fetcher-assignment list; both break on every legitimate catalog added.
- `tests/services/engine/wiring/buildDemandCtx.test.ts` — 1 of 6 — "settings is the engine settings passthrough".
- `tests/services/engine/frame/partitionBodiesByPresentation.test.ts` — 1 of 8 — "keeps the four branches disjoint and covering" duplicated its sibling verbatim.
- `tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts` — 1 of 9 — "lastOutput mirrors the most recent frame result".
- `tests/services/engine/subsystems/hiResFamousSubsystem.test.ts` — 3 of 12 — the same `lastOutput` mirror plus the two smoothstep band-edge pinpoints (α≈0 at the lower edge, α≈1 at the upper), where `<` and `<=` are observationally identical; the midpoint stays.
- `tests/services/loading/fetchers/syntheticPointFetcher.test.ts` — 1 of 2 — "ignores tier" restates "deterministic regardless of request fields".
- `tests/services/engine/phases/bootstrap.test.ts` — 2 of 5 — three copies of one short-circuit over a phase loop; the first survives.
- `tests/services/engine/animation/channelSpace.test.ts` — 7 of 8 — the CHANNEL_SPACE table restatement and the t=0 / t=1 endpoint identities of `lerpInSpace`; the hand-computed geometric midpoint stays.
- `tests/services/engine/animation/effectHelpers.test.ts` — 6 of 22 — three "defaults space from CHANNEL_SPACE" mirrors of the table tested next door, the default-ease constant, and two duplicate "forwards an explicit ease".
- `tests/services/animation/fadeRegistry.test.ts` — 3 of 20 — the three "serializeFadeId keys X by Y" restatements; the structural key-distinctness invariants stay.
- `tests/services/animation/applySceneEffect.test.ts` — 2 of 23 — the VISIBILITY_ACTION_ROW total-record shape assertions (gate-backed rows non-empty, registration-only rows `[]`).
- `tests/services/engine/camera/assembleOrbitCamera.test.ts` — 1 of 5 — "calling twice with the same inputs yields equivalent cameras" (determinism of a pure function).
- `tests/services/engine/camera/spinAutoRotate.test.ts` — 3 of 6 — linear-scaling and elapsed-0 restatements of the one hand-computed yaw test, plus one of two purity assertions (the aliasing one stays).
- `tests/services/engine/bake/computeAngularWeights.test.ts` — 1 of 5 — "returns a Float32Array of length cloud.count" (a type fact).
- `tests/services/engine/bake/computeSchechterRatios.test.ts` — 1 of 4 — same.
- `tests/services/engine/animation/ease.test.ts` — 1 of 4 — "covers exactly the same 31 names as the reference table"; the per-curve easings.net formula check, the clamp guard and the Back-overshoot test stay.
- `tests/services/engine/presentation/focusRecession.test.ts` — 5 of 13 — the whole `recessionTargetFor` describe (a tag-table restatement) plus one trivial blend-1 identity; the `resolveLayerOpacity` composition tests stay.

## Kept-but-suspicious

- `tests/services/engine/frame/driverGoldenTrace.test.ts`, `settleGoldenTrace.test.ts` — recorded golden traces ("matches the recorded trace"). Deliberate byte-bars for camera arbitration, but they re-bless on any legitimate feel change.
- `tests/services/engine/frame/frameFilePurity.test.ts` — the same source-sweep shape as the three sweeps I deleted, and the slowest file in the slice; kept ONLY because CLAUDE.md declares it the standing ratchet.
- `tests/services/engine/galaxyGenerator/v1/carveDustLayout.test.ts`, `carveStarLayout.test.ts`, `splitStarBudget.test.ts` — restate the budget literals (30000 / 34000 / 16000) back at the source; kept because they pin GPU buffer capacity + stride, and v1 is slated for deletion wholesale anyway.
- `tests/services/engine/gpuHandles/gpuHandleRegistry.test.ts` — "destroys every one of the 44 rows exactly once" carries a hardcoded count that breaks on every legitimate handle added; the invariant around it is worth keeping.
- `tests/services/engine/helpers/targetEq.test.ts` — 9 tests for a union equality helper; the three milkyWay-vs-X cases are one branch thrice.
- `tests/services/engine/wiring/installLoadProgress.test.ts` — 2 wiring restatements ("populates allSlots", "builds the emitter against the same Map").
- `tests/services/engine/frame/foregroundMaxDistance.test.ts` — three constant-vs-constant inequalities.
- `tests/services/engine/presentation/cameraGizmoLines.test.ts`, `zoneOfAvoidanceLayerOpacity.test.ts`, `buildClipPathLines.test.ts` — debug-only geometry with line-count restatements.
- `tests/services/loading/fetchers/famousStarsMetaFetcher.test.ts` — a near-verbatim twin of `famousGalaxiesMetaFetcher.test.ts`; the non-2xx / malformed-JSON / aborted-signal trio tests generic `fetch` mechanics already covered in `fetchWithProgress.test.ts`.
- The `enabled`-side "renderer is null (pre-bootstrap)" tests left standing in every pass file — kept for the bare-ctx short-circuit, but a reviewer could reasonably cut them alongside their draw-side twins.

## Slow

- `tests/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing.test.ts` (3806 ms) — STAYS. The cost is "the windowed inner loop matches the full unwindowed sweep to within 1e-4", which is the entire justification for the windowed optimisation; there is no cheaper form of that check.
- `tests/services/engine/frame/frameFilePurity.test.ts` (3541 ms) — STAYS by CLAUDE.md fiat (the pass-file purity ratchet). It is the best remaining candidate if the convention is ever revisited.
- `tests/services/engine/camera/noStoredRegimeFlag.test.ts` (1769 ms) — DELETED (ts-morph sweep of four src directories).
- `tests/services/engine/camera/frameAlignedRoll.test.ts` (1667 ms) — STAYS. Six distinct round-5/6/7 continuity rulings, each a multi-notch convergence sweep; the runtime is the sweeps, not fat.
- `tests/services/engine/galaxyGenerator/v2/galaxyFieldTierInvariance.test.ts` (1571 ms) — STAYS. Flux invariance to the sprite budget needs two full field bakes by construction.
- `tests/services/engine/frame/cameraRuntimeSingleWriter.test.ts` (1346 ms) — DELETED (allow-listed source sweep).
- `tests/services/loading/AssetSlot.test.ts` (1305 ms) — STAYS. The four race windows are why the module exists; the time is retry-policy backoff, not test count.

## Verification

- `npx tsgo --noEmit -p tsconfig.json` — zero errors under `tests/services/`.
- `npx vitest run tests/services --exclude 'tests/services/gpu/**'` — 292 files / 2390 tests passed (was 313 files).

</details>

<details><summary>Slice A_engine — pass 2</summary>

# Slice A_engine — second-pass deletions

Scope: `tests/services/**` except `tests/services/gpu/**`. Start of pass: 296 files / 2083 `it`s.
End: 259 files / 1728 `it`s — **37 files and 355 tests removed (17.0 %)**.

## Whole files

- `tests/services/url/focusIdOf.test.ts` — DELETED FILE — 9 encoder-ladder cases the `focusIdOf ∘ resolveFocusId` round-trip describe in `resolveFocusId.test.ts` already asserts verbatim (same strings, same deps); the rest are one-line structure/milkyWay passthroughs.
- `tests/services/url/readHashBody.test.ts` — DELETED FILE — "strips the leading #" on a two-line string helper; `hashSeamWithoutWindow.test.ts` covers the no-window arm.
- `tests/services/loading/slotReady.test.ts` — DELETED FILE — four restatements of a one-line predicate over a typed discriminated union.
- `tests/services/loading/aggregateRegistry.test.ts` — DELETED FILE — sum-and-count over a Map; the same in-flight rule is pinned behaviourally in `loadProgressAggregator.test.ts`.
- `tests/services/loading/fetchers/syntheticPointFetcher.test.ts` — DELETED FILE — determinism of a synthetic fixture generator.
- `tests/services/loading/fetchers/syntheticVolumeFetcher.test.ts` — DELETED FILE — defaults trivia on a test-fixture fetcher (`respects defaults`, `defaults to gaussian`).
- `tests/services/loading/fetchers/famousStarsMetaFetcher.test.ts` — DELETED FILE — near-verbatim twin of `famousGalaxiesMetaFetcher.test.ts`; its non-2xx / malformed-JSON / aborted-signal trio tests generic `fetch` mechanics owned by `fetchWithProgress.test.ts`.
- `tests/services/loading/slots/constellationsSlot.test.ts`, `filamentSlot.test.ts`, `flowFieldSlot.test.ts`, `structureCatalogSlot.test.ts`, `famousGalaxiesMetaSlot.test.ts`, `famousStarsMetaSlot.test.ts` — DELETED FILES (6) — one or two tests each asserting "the factory forwards its fetched payload to the renderer and reaches ready"; mock choreography over slot factories whose machinery is `AssetSlot.test.ts`'s job.
- `tests/services/engine/gpuHandles/constructGpuHandles.test.ts`, `destroyGpuHandles.test.ts` — DELETED FILES — spy choreography over two `for` loops; `gpuHandleRegistry.test.ts` runs both walkers against the REAL row table and keeps the order constraints.
- `tests/services/engine/interaction/clickHandler.test.ts` — DELETED FILE — its own header says `resolvePick` is covered exhaustively next door; what is left is "the wrapper forwards (x, y) verbatim".
- `tests/services/engine/frame/passSlabOf.test.ts` — DELETED FILE — four `FRAME_ORDER` rows restated as a lookup table.
- `tests/services/engine/frame/bodyTextureLoadRadius.test.ts` — DELETED FILE — "scales with body radius" on a one-line multiply.
- `tests/services/engine/frame/foregroundMaxDistance.test.ts` — DELETED FILE — three constant-vs-constant inequalities (flagged kept-but-suspicious by pass 1).
- `tests/services/engine/frame/timing/groupPassNames.test.ts` — DELETED FILE — grouping of debug-panel titles.
- `tests/services/engine/frame/passes/markerLinesPass.test.ts` — DELETED FILE — byte-for-byte twin of `labelsPass.test.ts` (same four titles, different renderer handle).
- `tests/services/engine/frame/passes/foregroundLabelsOcclusion.test.ts` — DELETED FILE — third copy of the same colour-view-vs-depth-view thread-through; `labelsPass.test.ts` keeps the one home.
- `tests/services/engine/presentation/cameraGizmoLines.test.ts`, `buildClipPathLines.test.ts` — DELETED FILES — debug-overlay geometry asserted by line count (9 lines, N−1 segments).
- `tests/services/engine/presentation/zoneOfAvoidanceLayerOpacity.test.ts` — DELETED FILE — the band × toggle product, already the subject of `zoneOfAvoidanceLiveness.test.ts`.
- `tests/services/engine/presentation/produceZoneOfAvoidanceLettering.test.ts` — DELETED FILE — two-line producer whose fade is the liveness value it forwards.
- `tests/services/engine/presentation/constellationCaptions.test.ts` — DELETED FILE — "one caption per figure at its anchor", subsumed by `produceConstellationCaptions.test.ts`.
- `tests/services/engine/helpers/famousDisplayName.test.ts` — DELETED FILE — five walks of one `??` chain.
- `tests/services/engine/helpers/selectionRingRadiusPx.test.ts` — DELETED FILE — floor-vs-apparent on a two-line max(); the sibling `near0RingRadiusPx.test.ts` keeps that shape once.
- `tests/services/engine/helpers/targetEq.test.ts` — DELETED FILE — nine cases of a union equality helper (three of them milkyWay-vs-X, one branch thrice); flagged by pass 1.
- `tests/services/engine/wiring/installLoadProgress.test.ts`, `installSlotReadyWake.test.ts`, `installSlots.test.ts`, `buildSlotsFromRegistry.test.ts` — DELETED FILES (4) — "the installer installs": Map population and subscribe counts on four-line wiring functions, each already exercised end-to-end by `wireSlots.test.ts`.
- `tests/services/engine/galaxyGenerator/v1/carveDustLayout.test.ts`, `carveStarLayout.test.ts`, `splitStarBudget.test.ts` — DELETED FILES (3, 18 tests) — the budget literals (30000 / 34000 / 16000 / 20000) and `capacity === Σ iterations·stride` restated with the source's own formula; GPU buffer sizing is independently pinned by `milkyWayCloud.test.ts` ("capacity × GEN_RECORD_BYTES") and v1 is slated for wholesale deletion.

## Partial files

### Second copies of one mechanism

- `tests/services/url/resolveFocusId.test.ts` — 12 of 34 — the supercluster/void/group rows of the one `cluster-` branch, three separate "cloud not loaded → null" arms, four regex-reject arms, and the milkyWay/body literals their own round-trip tests already close.
- `tests/services/url/focusUrl.test.ts` — 2 of 7 — the 2MRS repeat of the PGC arm and the second pos@-rounding case.
- `tests/services/animation/fadeRegistry.test.ts` — 5 of 17 — two register-default seeds, a third key-distinctness copy, and the `setImmediate` / argless-read delegations to `fadeController`.
- `tests/services/animation/fadeController.test.ts` — 3 of 11 — two initial-opacity restatements plus the past-end clamp the boundary test already owns.
- `tests/services/animation/clipOpacityChannel.test.ts` — 4 of 8 — smoothstep ramp, mid-ramp `isAnimating`, argless read and mid-flight retarget: all four are `fadeController` behaviour reached through a per-layer Map.
- `tests/services/animation/applySceneEffect.test.ts` — 6 of 21 — verbatim-payload twin, focus(null) twin, the duplicated `animate:true` bridge assertion, the hide-side `over:0` twin, the scoped-hide twin, and "returns [] when items is empty".
- `tests/services/animation/scopedVisibilityActions.test.ts` — 2 of 6 — two more rows of the one scoped-fan-out mechanism.
- `tests/services/engine/animation/effectHelpers.test.ts` — 10 of 16 — `kind:`/`over:` restatements of one-line object constructors for show/hide/aimAlong/spinToId plus two default-constant stamps.
- `tests/services/engine/animation/applyPathTuning.test.ts` — 3 of 6 — empty-tuning no-op, flyPath-free passthrough and the overwrite case the "overrides only the present knobs" test subsumes.
- `tests/services/engine/animation/resolveClipFoci.test.ts` — 4 of 24 — two more recursion containers (`all`, `fork`), a metadata passthrough, a second throw-on-unresolved arm.
- `tests/services/engine/animation/compileClip.test.ts` — 4 of 18 — the loop-undefined twin, two more throw-on-unresolved arms, and the second leading-wait shift.
- `tests/services/engine/animation/buildPathTrack.test.ts` — 4 of 31 — a second dwell no-op guard and three default/monotone-knob restatements (default spline, default look-ahead, "larger knob leads sooner").
- `tests/services/engine/animation/buildDwellWarp.test.ts` — 1 of 8 · `playClip.test.ts` — 1 of 4 — the second identity guard; the fixed-start passthrough.
- `tests/services/engine/camera/evaluateClip.test.ts` — 1 of 15 · `assembleOrbitCamera.test.ts` — 1 of 4 · `cameraEpochs.test.ts` — 1 of 11 · `pivotRadiusMpc.test.ts` — 1 of 9 · `spinAutoRotate.test.ts` — 1 of 3 — determinism-of-a-pure-function, the second purity assertion, unstarted-epoch-is-0, a repeated null arm, a pass-through-fields restatement.
- `tests/services/engine/camera/structureFocusDistance.test.ts` — 3 of 5 — the FOV test recomputes the source formula (MIRROR) and both clamp tests are re-asserted by the non-finite case.
- `tests/services/engine/helpers/shouldKeepTicking.test.ts` — 6 of 19 — three cases for the one `selectCameraActive` disjunct, two more anim-vote-bag members, the other half of the flow AND, and an arg-forwarding mock assertion.
- `tests/services/engine/helpers/buildGalaxyInfoBySource.test.ts` — 7 of 25 — per-source prefix/thumbnail and diameter-provenance rows (GLADE, Synthetic, 2MRS Riso, GLADE Tully), a second objID-0 fallback, the Aladin half of a ternary.
- `tests/services/engine/helpers/scaleBar.test.ts` — 4 of 10 — two of three degenerate-input guards, one of three unit-ladder rows, and the pxPerMpc-scaling restatement.
- `tests/services/engine/helpers/extractSelectionRow.test.ts` — 2 of 12 · `resolvePick.test.ts` — 2 of 7 · `resolvePickTable.test.ts` — 2 of 5 · `resolveStructureFromPick.test.ts` — 2 of 5 · `selectionHaloTable.test.ts` — 1 of 7 · `buildFocusable.test.ts` — 1 of 7 · `logCameraState.test.ts` — 1 of 6 — `null → null` trivia and repeated "recover the seed id / index N" arms of one indexing mechanism.
- `tests/services/engine/galaxyGenerator/shared/classifyHubbleType.test.ts` — 3 of 6 — E / Irr / S rows of one prefix switch; the SB-before-S ordering case and the fallback stay.
- `tests/services/engine/galaxyGenerator/v1/milkyWayFadeAlpha.test.ts` — 1 of 6 — the monotonicity sweep the three band points already fix.
- `tests/services/engine/data/createStructureStore.test.ts` — 1 of 6 — "setGroup replaces only its own group" (the clearGroup test is the same isolation claim).
- `tests/services/loading/retryPolicy.test.ts` — 4 of 9 — 400 (same arm as 404), 408 and 429 (same arm as the 502 attempt-0 backoff), and the defensive AbortError.
- `tests/services/loading/reduceLoadState.test.ts` — 3 of 11 — the ready→loading repeat of idle→loading, the "fetch-succeeded keeps shape" no-op, one of two identical bytes-no-op guards.
- `tests/services/loading/fetchWithProgress.test.ts` — 3 of 8 — `HttpError` field restatement and the trailing-slash case of the dataUrl helper.
- `tests/services/loading/fetchers/pgcAliasFetcher.test.ts` — 3 of 7 — empty-object trivia, the second throw-on-bad-root arm, and the fetch+parse wrapper.
- `tests/services/loading/awaitSlotReady.test.ts` — 2 of 6 — null-slot fallback and the transient-transitions case the ready-transition test covers.
- `tests/services/loading/AssetSlot.test.ts` — 2 of 22 — `committed() is null until first commit` and the plain happy path the commit-ordering trio already walks.
- `tests/services/loading/slots/volumeSlotIngest.test.ts` — 3 of 5 — three more rows of one shared ingest path (the cf4 row and the synthetic id-from-request row stay).

### Wiring / registry restatements

- `tests/services/engine/wiring/assetWiring.test.ts` — 10 of 27 — the hand-listed membership set and its negative twin, the external-rows key list, three more volume-field demand rows, the flow demand row, and three literal `req` restatements (`{tier}`, `{}`, `undefined`).
- `tests/services/engine/wiring/fadeLayers.test.ts` — 8 of 24 — the on-half of three settings-derived seed pairs, the structure default-1 loop, the orbitTrails seed (its row test asserts the same seed), and two of three identical demand-loaded guard tests.
- `tests/services/engine/wiring/bodyTextureSlotRegistry.test.ts` — 3 of 7 — the mint-per-key mirror and two commit rows of the routing the `moon:normal` / `earth:clouds` cases already pin (also the slice's 338 ms wiring file).
- `tests/services/engine/wiring/reevaluateDemand.test.ts` — 3 of 23 — two more already-settled idempotence arms and the second caught-throw arm.
- `tests/services/engine/wiring/structureCatalogToStructures.test.ts` — 4 of 12 — `featured === false`, the empty-catalog case and two field passthroughs (name, description).
- `tests/services/engine/wiring/syncVisibilityFades.test.ts` — 2 of 13 · `buildDemandCtx.test.ts` — 2 of 5 · `engineSliceDispatches.test.ts` — 2 of 8 · `createSyntheticFallback.test.ts` — 1 of 7 · `galaxyCatalogSourceRegistry.test.ts` — 2 of 8 · `wireHiResFamousSlot.test.ts` — 1 of 3 — FADE_IN/OUT constant restatement, a "writes no settings" negative, absent-slot/flag-read accessors, the null twin of a dispatch, a repeat of the error-arm, the "no cross-talk" repeat, a registry derivation, an assignment restatement.
- `tests/services/engine/phases/applySwapFormat.test.ts` — 2 of 8 — a second no-throw boot guard and the render-not-requested half of the already-matching branch.

### Frame / pass files

- `tests/services/engine/frame/frameContext.test.ts` — 6 of 18 — two more clauses of the isReady `&&` and four field-copy assertions (`fovYRad`, canvasSize, handle references, nowMs).
- `tests/services/engine/frame/renderFrame.test.ts` — 4 of 14 — one-encoder / one-submit (the canonical-order test asserts both) and the `disabledPasses` pair `executeFrame.test.ts` owns.
- `tests/services/engine/frame/slabs.test.ts` — 1 of 30 · `deriveSourceMasks.test.ts` — 1 of 4 · `zoneOfAvoidanceLiveness.test.ts` — 1 of 4 · `timing/timedSlots.test.ts` — 2 of 4 — a viewportPx passthrough, an all-bits-set restatement, a pre-bootstrap null, and two registry-loop mirrors (the uniqueness precondition stays).
- pre-bootstrap `renderer === null` gates, one each from `clipPathDebugPass`, `labelsPass`, `selectionRingPass`, `near0SelectionRingPass`, `scalarVolumePass`, `starCatalogPass`, `foregroundLabelsPass`, `volumeUpsamplePass`, `zoneOfAvoidancePass`, `zoneOfAvoidanceUpsamplePass` — the handles are typed nullable, so the guard is compiler-forced; pass 1 cut the draw-side twins and flagged these as the reviewer's next cut.
- `tests/services/engine/frame/passes/texturedDisksPass.test.ts` — 4 of 7 · `proceduralDisksPass.test.ts` — 2 of 5 · `volumeUpsamplePass.test.ts` — +1 · `zoneOfAvoidanceUpsamplePass.test.ts` — +2 · `createUpsamplePass.test.ts` — 1 of 4 · `passes.test.ts` — 2 of 22 — empty-vs-non-empty gate pairs, draw-forwarding duplicated by the viewSlot test, liveness assertions owned by `volumeLiveness.test.ts` / `zoneOfAvoidanceLiveness.test.ts`, the second null-handle blit arm, an "always returns true" constant and one fade-tail trio row.

### Subsystems / presentation

- `tests/services/engine/subsystems/renderScheduler.test.ts` — 4 of 11 — nothing-scheduled-at-construction, single-rAF (the coalesce test asserts it), the idle-after-frame repeat, and the `isScheduled()` accessor.
- `tests/services/engine/subsystems/structureFocusSubsystem.test.ts` — 2 of 10 — blend-0 init trivia and the void row of the cluster branch (the code carries no per-category bit).
- `tests/services/engine/subsystems/texturedDiskSubsystem.test.ts` — 4 of 11 — the NaN-orientation defensive guard (production bins are always finite per its own comment), two sentinel-default repeats, and the not-yet-loaded-meta case its successor test re-asserts.
- `tests/services/engine/subsystems/loadProgressAggregator.test.ts` — 4 of 9 — empty-emit trivia, the single-slot snapshot the multi-slot sum subsumes, the attach-wires-a-subscriber restatement, and destroy idempotence.
- `tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts` — 2 of 8 · `label2DDirector.test.ts` — 3 of 32 · `interaction/inputBindings.test.ts` — 3 of 9 — two more procFadeOut-stays-1 defaults; prominence-0 trivia, a "no longer fires" negative and a once-per-frame projection count; three DOM-forwarding restatements (the teardown and the pointerup/pointercancel pair stay).
- `tests/services/engine/presentation/produceFamousGalaxyLabels.test.ts` — 3 of 18 · `produceStructureLabels.test.ts` — 2 of 18 · `produceStructureMarkers.test.ts` — 2 of 10 · `produceMilkyWayLabel.test.ts` — 1 of 12 · `focusRecession.test.ts` — 3 of 8 — the "at-rest output is unchanged" regression snapshots (three copies of one convention), two more rows of the pixel-ceiling ramp, a second band-edge fade, the recession-exempt repeat, a prominence-constant, two blend-0 identities and a `lerp`-mirrored interpolation.

## Kept: 1728 tests in 259 files

The heavy files that keep their size are the ones whose cost IS the claim. `surfaceStep.test.ts` (36 tests, 1236 lines) and `runFrame.test.ts` (24) encode named camera rulings (12, 13, 14, 17, B1, rounds 5–8) as multi-notch convergence sweeps — each is a distinct arbitration branch with a hand-computed landing, and the feel bugs they catch are invisible to every other test. `label2DDirector.test.ts` (29) is the only home of declutter geometry and the appear/disappear envelope; `pickProgram.test.ts` (24), `executeFrame.test.ts` (25) and `slabs.test.ts` (29) pin slab fold order, per-frame target allocation and f64 near/far bracketing — pure geometry with real regressions cited in the titles. `wireSlots.test.ts` (13) and `AssetSlot.test.ts` (20) are integration/race files where the four race windows are the reason the module exists. `bodyGlintsPass.test.ts`, `earthPass.test.ts`, `starPointsPass.test.ts` and `texturedBodiesPass.test.ts` stay large because each assertion is a packed-uniform slot index or a pick-class stamp — byte-layout facts in the KEEP list. The four restored ratchets and `frameFilePurity.test.ts` were left untouched, as instructed; `driverGoldenTrace` / `settleGoldenTrace` stay as declared golden traces.

## Verification

- `npx tsgo --noEmit -p tsconfig.json` — exit 0.
- `npx vitest run tests/services --exclude 'tests/services/gpu/**'` — 259 files / 2460 tests passed (dynamic count; `it.each` rows expand).
- `npx prettier --write` over the slice; no commits made.

</details>

<details><summary>Slice B_state_ui_data — pass 1</summary>

# Deletions — slice B_state_ui_data

41 files touched: 21 deleted outright, 20 trimmed. 161 tests removed (51 in deleted files, 110 in trimmed ones).

## Deleted files

- `tests/data/structureMarkerStyles.test.ts` — DELETED FILE — both tests assert typed fields exist (`toHaveLength(4)` on a Vec4, `> 0` on numbers): type facts restated at runtime.
- `tests/data/fonts.test.ts` — DELETED FILE — constant restatement (ATLAS_PX/charset length/TTF name); the "bake and runtime must agree" goal is not tested since both sides import the same registry.
- `tests/data/structure/labelCategories.test.ts` — DELETED FILE — LABEL_CATEGORIES is derived (`SOURCE_ENTRIES.filter(bearsLabel)`), so superset/exclusion are derivation restatements.
- `tests/data/structure/categoryDisplayInfo.test.ts` — DELETED FILE — "a row per LabelCategory" over a table derived from the same registry rows and typed `Record<LabelCategory, …>`.
- `tests/data/milkyWay/milkyWayInfo.test.ts` — DELETED FILE — union-discriminant type fact plus a mirror of the constant the object is built from.
- `tests/data/galaxyCatalog/galaxyCatalogFluxLimits.test.ts` — DELETED FILE — one test asserting Synthetic's limit equals SDSS's, computed from the same table.
- `tests/data/bodies/sceneStars.test.ts` — DELETED FILE — solar-radius literal restated back, plus a `length >= 20` count lower-bound on a static registry.
- `tests/data/bodies/sceneBodies.test.ts` — DELETED FILE — registry membership restatement; real SCENE_BODIES invariants live in orbitalElements.meshBodies / sceneSStars.
- `tests/store/rootReducer.test.ts` — DELETED FILE — exact route-key list + `toBeDefined()` per slice.
- `tests/store/rootSaga.test.ts` — DELETED FILE — "mainSaga runs without throwing" is already asserted in createAppStore.test.ts.
- `tests/components/SettingsPanel/SettingsPanel.test.ts` — DELETED FILE — exact list of six section headings; each container has its own store-backed mount test (also 410 ms, the slowest component file in the slice).
- `tests/components/SettingsPanel/TierChip.test.ts` — DELETED FILE — TierChipContainer.test.ts renders the real TierChip and covers both value-reflect and change-dispatch (saves 309 ms).
- `tests/components/SettingsPanel/FlowSection.test.ts` — DELETED FILE — FlowSectionContainer.test.ts drives the same master checkbox through the store in both directions.
- `tests/components/InfoCard/detailCardTable.test.tsx` — DELETED FILE — dispatch-table restatement; the same six arms render through InfoCard.milkyWay / InfoCard.structureHover / Compact\*Card tests.
- `tests/state/ui/selectors.test.ts` — DELETED FILE — seven one-line field lifts, including a "all selectors read from the same store" smoke.
- `tests/state/engine/selectors.test.ts` — DELETED FILE — six one-line field lifts that re-test the reducers they dispatch.
- `tests/state/selection/selectionWriteBySlot.test.ts` — DELETED FILE — compares each table entry's action type to the action creator the table is built from.
- `tests/state/selectionRows/selectionRowsSlice.test.ts` — DELETED FILE — trivial Immer slot writes; watchSelectionRowsSaga covers the real slot semantics.
- `tests/state/tier/tierSlice.test.ts` — DELETED FILE — `reducer('medium', setTier('large')) === 'large'`; watchTierSaga covers the request→write path.
- `tests/state/tour/flyAndFocusOnClip.test.ts` — DELETED FILE — builder-shape restatement; webShowcase + webShowcaseDive.integration assert the same focus-cue presence on the resolved clip.
- `tests/state/tour/flyToClip.test.ts` — DELETED FILE — same, for the no-focus-cue arm.

## Trimmed files

- `tests/data/sources.test.ts` — 26 of 30 tests — kept the persisted/pickable source codes (FamousGalaxy=4, Cluster/Supercluster/Void=5/6/7), registry id uniqueness and the ALL_VISIBLE_MASK bit check; removed display-label / allSky / maxDist / bandLabel restatements, the exact STRUCTURE_IDS list, the four "keeps X OUT of GALAXY_CATALOG_SOURCES" restatements of a hand-written list, the bearsLabel/bearsMarker flag echoes, the HI_RES_LAYER constants, the DEFAULT_FLOW-mirrors-registry check, and the enum values their own comments mark "registry-key-only, not persisted".
- `tests/sources.test.ts` — 2 of 4 tests — maxDistMpc constant restatement and an ALL_VISIBLE_MASK bit check subsumed by tests/data/sources.test.ts.
- `tests/data/tierTargets.test.ts` — 10 of 15 tests — per-source cap numbers restated back (Milliquas 60k/200k, SDSS 156k/500k, GLADE 400k) and three DESI filename describes identical in form to the kept tier-agnostic one; kept one test per encoding (0 / N / undefined) and both filename shapes.
- `tests/data/superGalacticTransform.test.ts` — 6 of 11 tests — `toHaveLength(9/16)` type facts, "maps origin to origin" (vacuous for a linear map), and the mat4 construction echoes (upper-3x3 equals the mat3, zero translation column, zero w-row); kept unit-norm, orthonormality, the Virgo/Coma external anchors and the mat4-vs-mat3 layout cross-check.
- `tests/data/volume/volumeFieldDefaults.test.ts` — 5 of 6 tests — default-object restatements (contrast 1.0, densityScale > 0, envelope inner/outer per field); kept the buildVolumeFieldSettings band-defaulting behaviour.
- `tests/data/galaxyCatalog/sourceClass.test.ts` — 4 of 9 tests — the three byte→display-label lookup-table restatements and the "null for sources with no class semantics" table echo; kept the unknown/sentinel-byte degradation branches.
- `tests/data/galaxyCatalog/galaxyCatalogFormat.test.ts` — 1 of 21 tests — the single-v8 rejection test, subsumed by the v1–v8 loop and the typed FormatVersionError test alongside it.
- `tests/data/structure/buildStaticAnchorStructures.test.ts` — 3 of 10 tests — three "carries <field> through from the seed" field-copy restatements (physicalRadiusMpc, apparentRadiusMpc, description).
- `tests/data/volume/syntheticScalarField.test.ts` — 3 of 12 tests — the three "produces the requested dims" echoes of the input argument.
- `tests/components/SettingsPanel/StarsSection.test.ts` — 16 of 25 tests — eight sliders × (prop echo, stepped callback), all driven end-to-end by StarsSectionContainer.test.ts which renders this same section behind the store.
- `tests/components/DebugPanel/Sparkline.test.ts` — 1 of 5 tests — "single sample renders one character" is subsumed by the 0..7 ramp test.
- `tests/components/NavigationPanel/NavigationPanel.test.ts` — 1 of 3 tests — "renders the NAVIGATION header" queries the same button the aria-expanded test already asserts on.
- `tests/components/SearchTrigger/SearchTrigger.test.ts` — 2 of 5 tests — a header-render smoke subsumed by the other queries, and Enter-activates-a-`<button>` (platform behaviour).
- `tests/components/common/Panel/Panel.test.ts` — 2 of 7 tests — "renders the supplied title" (every other test queries that button) and "omits aria-label when not provided" (negative of a pass-through prop).
- `tests/state/engine/engineSlice.test.ts` — 7 of 13 tests — one-line field writes (status, sourceCount, structureCounts, loadProgress set/clear, hdrCapable) and a duplicate scale-changed branch; kept the two DEDUP-ON-WRITE referential-stability guards and the two merge tests.
- `tests/state/camera/cameraSlice.test.ts` — 5 of 16 tests — commitCameraPose/beginDrag/endDrag one-line writes, a vacuous "cancel is a no-op when already null", and a duplicate setAutoRotate assertion; kept serialisability, clip lifecycle and resolveClipStart.
- `tests/state/camera/selectors.test.ts` — 3 of 12 tests — selectCameraBase and selectAutoRotate one-line lifts; kept the whole selectCameraActive driver matrix and selectClipActive.
- `tests/state/selection/selectors.test.ts` — 6 of 21 tests — selectHover/Selected/Focus Ref and Row one-line lifts (and the now-orphaned stubState helper); kept the focusable builders, memoization and intent selectors.
- `tests/state/ui/uiSlice.test.ts` — 5 of 7 tests — three trivial setter writes plus the splash arms, which useSplash.test.ts already drives through the store; kept both toggles.
- `tests/state/tour/tourSlice.test.ts` — 2 of 13 tests — the full initial-state object literal and "runtime selectors read the slice fields".

Kept-but-suspicious:

- `tests/data/scaleUnits.test.ts` — four ratio checks between unit constants; arguably constant restatement, kept because a typo'd exponent in a unit conversion is silent and catastrophic.
- `tests/data/mcpmAnchors.test.ts` (DEFAULT_RESTATE flag) — literals pinned against `export_metadata.txt`; kept under the external-contract keep-rule, but a reviewer could call it a constant test.
- `tests/data/structureAnchors.test.ts` — "every entry has a positive distance / finite physicalRadiusMpc" repeated once per category (6 near-identical tests over different seed lists).
- `tests/data/flow/flowFields.test.ts`, `milkyWaySliderFields.test.ts`, `zoneOfAvoidanceSliderFields.test.ts` — three near-identical slider-table parity files; kept as structural invariants that catch a knob added without a slider.
- `tests/components/containers/StarsSectionContainer.test.ts` — 19 tests, 8 sliders × read/write; the surviving half of the Stars duplication, kept because it is the integration layer.
- `tests/data/milkyWay/milkyWayGalaxyParams.test.ts` — one constant-ish test, kept because `type` is a free string and a typo silently unbars the galaxy.
- `tests/state/perf/installPerfHook.test.ts` / `tests/state/recorder/installRecorderHook.test.ts` (TYPEOF_ASSERT flags) — opened; the gate branches and promise resolve/reject paths are real behaviour, kept.

Slow:

- No file from `slowest20.tsv` falls in this slice (the two slowest are `tests/conventions/*`, off limits). Largest in-slice costs were `SettingsPanel.test.ts` (410 ms) and `TierChip.test.ts` (309 ms), both deleted outright; `CosmicWebSection` (408 ms) and `DisplaySection` (376 ms) stay — their branch derivations are not covered by their thinner containers.

</details>

<details><summary>Slice B_state_ui_data — pass 2</summary>

# Deletions — second pass, slice B_state_ui_data

97 files touched: 1 deleted outright, 96 trimmed. 221 `it` blocks removed (2 in the deleted
file, 219 in trimmed ones). Slice now runs 851 tests in 205 files, all green.

## Deleted files

- `tests/unsupportedPage.test.ts` — DELETED FILE — both tests assert fixed substrings of a static HTML string ("mentions WebGPU", "links to caniuse"); a rename-detector on copy no reviewer can break accidentally.

## Trimmed files — the big cuts

- `tests/state/settings/settingsSlice.test.ts` — 23 of 35 tests — eighteen `setX writes the one field it names` reducer echoes (orientation, fovDeg, two galaxy-catalog rows, two structure rows, passDisabled, flowEnabled, hdrEnabled, three earth knobs, six star-catalog knobs), the `clipPathInspect.active` initial-object restatement, two clip-path knobs that walk the same drag-to-activate branch as the three kept ones, and the whole `mergeSnapshot` describe (a verbatim second copy of `mergeSettingsSnapshot.test.ts`); kept the two sub-knobs that ride _another_ knob's override, the volume-field trio, `setFlow` partial-merge, the composed-action-namespace invariant and Immer structural sharing.
- `tests/components/containers/StarsSectionContainer.test.ts` — 14 of 19 tests — seven of the eight slider read/write pairs; every one drives the identical `Slider`→dispatch path with a different `aria-label` and literal. Kept the brightness pair (off-grid step, the one non-obvious expected value) and the three checkbox tests, including the famous-star/gaia isolation guard.
- `tests/state/selection/selectors.test.ts` — 6 of 15 tests — `selectSelectedFocusable` and `selectFocusedFocusable` are the hover selector with a different slot key: their null / galaxy-row / structure-row arms are three literal copies each. Kept the hover set, the memoization guard and both intent selectors.
- `tests/components/CommandPalette/CommandPalette.test.ts` — 5 of 10 tests — two empty-query browse assertions already made by `rankPaletteMatches.test.ts`, the "milky way" query ditto, and two onSelect-routing variants that only re-assert `focusIdForRow`'s output through a 545 ms render.
- `tests/components/CommandPalette/utils/rankPaletteMatches.test.ts` — 5 of 17 tests — the structure 50-cap (sibling of the alias cap), two more empty-query restatements, the body no-match arm (sibling of the Milky-Way no-match arm), and the Sgr A\* focus-id resolution (`focusIdForRow`'s job).
- `tests/components/SettingsPanel/GalaxiesSection.test.ts` / `StructuresSection.test.ts` / `LabelsAndGuidesSection.test.ts` / `StarsSection.test.ts` — 5 / 3 / 4 / 4 tests — each section pins its tri-state master three times (allOn / mixed / noneOn) and its master fan-out twice (from-noneOn / from-allOn); kept the indeterminate arm and one fan-out per section, since only the mixed case is observationally distinct. Also dropped a DESI-row static render assertion and two prop-echo reflections their containers already drive.
- `tests/state/camera/cameraSlice.test.ts` — 5 of 11 tests — `startCameraTween` / `cancelCameraTween` / `clipStarted` / `clipEnded` / `setAutoRotate` one-line Immer writes; kept "clipEnded also clears a dormant tween", serialisability and all three `resolveClipStart` arms.
- `tests/state/input/keyboardShortcuts.test.ts` — 5 of 11 tests — five table restatements (Esc's action list, tab, d, h/e, shift+n) that read the entry's own literals back; kept the six entries whose `run` actually branches (palette-open guard, focus-or-null, rate clamp, pause/resume, comma-split key resolution, tour-inactive nulls).
- `tests/store/createAppStore.test.ts` — 5 of 7 tests — RTK `configureStore` plumbing and init-state trivia ("seeded with initialState", "dispatching a slice action updates state", three preloaded-slice echoes); kept one `preloadedState` honour and the mainSaga smoke the rest of the slice relies on.

## Trimmed files — sibling / branch collapses

One line per file; in every case the removed `it`s walk a branch a surviving sibling already walks.

- `tests/components/containers/TimeBarContainer.test.tsx` — 4 of 16 — both ladder-end disable tests (`TimeBar.test.tsx` asserts the same ends) and two Esc / mousedown-reopen arms duplicated across the two popovers.
- `tests/state/ui/buildInitialUiState.test.ts` — 4 of 11 — three "defaults to false" boolean flags and the null-seed half of dismissedVersion.
- `tests/data/structureAnchors.test.ts` — 4 of 9 — the positive-distance / finite-radius loop repeated verbatim for supercluster and void seeds; kept it once over the cluster seeds plus the Boötes CF-4 bound.
- `tests/components/CommandPalette/utils/focusIdForRow.test.ts` — 3 of 5 — dispatch-table restatement (one arm per row kind); kept the structure verbatim-id and alias pgc- ladder arms.
- `tests/components/InfoCard/DescriptionBlock.test.ts` — 3 of 4 — "renders the prose text", a CSS-class assertion and the collapsed half of the toggle the expand test already round-trips (617 ms file).
- `tests/components/InfoTip/InfoTip.test.ts` — 3 of 5 — keyboard-focusable and title/body static renders, plus "accepts JSX bodies" (a type fact).
- `tests/components/TourOverlay/TourOverlay.test.tsx` — 3 of 14 — the glyph-icon inventory, the play/pause glyph swap (the aria-label flip covers it) and the no-chrome×no-label combination of two separately-tested branches.
- `tests/data/volume/scalarFieldPalettes.test.ts` — 3 of 6 — per-palette colour sanity repeated four times over the same LUT builder; kept one ramp, the 256×4 shape and the unknown-id throw.
- `tests/hooks/useSplash.test.ts` — 3 of 14 — two static store-seed reflections and the dismissTour twin of dismissExplore.
- `tests/state/tour/clipFociReady.test.ts` — 3 of 12 — two more "true" arms and the fork-block recursion (identical to the seq-block one).
- `tests/state/tour/guidedTourSaga.test.ts` — 3 of 16 — three further beat-range clamp permutations (reversed out-of-range, reversed in-bounds, empty tour) over the one clamp the kept tests already exercise.
- `tests/components/CommandPalette/utils/scoreAliasMatch.test.ts` — 2 of 7 · `scoreFamousMatch.test.ts` — 1 of 5 — exact-match and prefix-substring cases subsumed by the ranking tests.
- `tests/components/CommandPalette/utils/wrapIndex.test.ts` — 2 of 4 — a 22-line helper earns one wrap plus the modulo-by-zero edge.
- `tests/components/CommandPalette/utils/pickProperName.test.ts` — 1 of 3 · `resolveFeaturedEntries.test.ts` — 1 of 3 — empty-input arms.
- `tests/components/DebugPanel/DebugPanel.test.ts` — 2 of 6 — the pass-toggle dispatch (`RenderTogglesSection` owns it) and the tour-button twin of the clip-button test.
- `tests/components/DebugPanel/RenderTogglesSection.test.ts` — 2 of 6 — "all boxes checked when the record is empty" and a re-render prop echo.
- `tests/components/DebugPanel/Sparkline.test.ts` — 2 of 4 — all-zero and max-sample rows of the 0..7 ramp the kept test walks end to end.
- `tests/components/DebugPanel/DebugTuningSection.test.ts` — 1 of 2 — children-render-last ordering assertion.
- `tests/components/InfoCard/MobileSheet.test.tsx` — 2 of 4 — child-content static render and a does-not-throw.
- `tests/components/LoadingBar/LoadingBar.test.ts` — 2 of 7 — a modifier-class negative and an aria-label presence check.
- `tests/components/SettingsPanel/CosmicWebSection.test.ts` — 2 of 13 — the filaments-only arm of the boolean-OR master and the positive half of the filament-slider conditional (the callback test already needs it present).
- `tests/components/SettingsPanel/DisplaySection.test.ts` — 2 of 10 — the second tone-map value in each of the reflect and change pairs.
- `tests/components/SettingsPanel/CollapsibleSection.test.ts` — 1 of 6 — initial aria-expanded echo of `defaultOpen`.
- `tests/components/TimeBar/TimeBar.test.tsx` — 2 of 7 — a paused prop echo and the rate-label click twin of the readout click.
- `tests/components/TimeBar/DateEntryPopover.test.tsx` — 1 of 6 — "commits on Enter" (same commit path as the Set button).
- `tests/components/common/Panel/Panel.test.ts` — 2 of 5 — mounts-open default (the toggle test asserts it) and an aria-label pass-through (850 ms file).
- `tests/components/common/CopyButton/CopyButton.test.ts` — 1 of 5 — unmount timer cleanup with no asserted outcome.
- `tests/components/common/CollapsibleSection/CollapsibleSection.test.tsx` — 1 of 3 — the negative of the nested-marker test.
- `tests/components/containers/LabelsAndGuidesSectionContainer.test.ts` — 2 of 7 — a second indeterminate case and a prop reflection its dispatch test round-trips (770 ms file).
- `tests/components/containers/StructuresSectionContainer.test.ts` — 1 of 4 — default-store allOn render.
- `tests/components/InfoCard/BodyDetailCard.test.tsx` — 1 of 6 · `StructureDetailCard.test.ts` — 1 of 6 · `CompactStructureCard.test.ts` — 1 of 3 · `InfoCard.mobile.test.tsx` — 1 of 5 — one duplicate omission arm each (undefined vs null count, absent optionals, a static name/label render, a second mobile-body assertion).
- `tests/components/NavigationPanel/NavigationPanel.test.ts` — 1 of 2 · `SearchTrigger/SearchTrigger.test.ts` — 1 of 3 · `TourBeatRail.test.tsx` — 1 of 4 — a `Panel` default already tested in `Panel.test.ts`, an aria-keyshortcuts presence check, and a "no buttons, no links" negative.
- `tests/data/scaleUnits.test.ts` — 2 of 4 — two more ×1000 ratio pairs; kept one ladder rung and the AU_IN_KM anchor.
- `tests/data/selectionEncoding.test.ts` — 2 of 10 — the constants-exposed test and the (0,0)→0 pack (sibling of the documented bit-layout test); the format and WESL-parity tests all stay.
- `tests/data/structure/buildStaticAnchorStructures.test.ts` — 2 of 7 — "returns a fresh array per call" and the group-category repeat of the id/category/featured mapping.
- `tests/data/volume/syntheticScalarField.test.ts` — 2 of 9 — a centred-by-construction echo and a second spoke-brightness sample.
- `tests/data/bodies/sceneAnchors.test.ts` — 2 of 6 — "every anchor position is finite" and the Proxima distance (the named-stars test covers catalogued distances).
- `tests/data/bodies/orbitalElements.test.ts` — 1 of 5 · `sStarElements.test.ts` — 1 of 3 — a focus-presence check subsumed by focus-resolution, and a range check on typed positive fields.
- `tests/data/galaxyCatalog/galaxyCatalogTransfer.test.ts` — 1 of 5 — the count=0 does-not-crash case.
- `tests/data/starCatalog/starCatalogRecord.test.ts` — 1 of 4 — the colour clamp twin of the magnitude clamp.
- `tests/data/flow/flowFields.test.ts` · `milkyWaySliderFields.test.ts` · `zoneOfAvoidanceSliderFields.test.ts` — 1 of 3 each — "declares no duplicate keys"; the kept exact-key-coverage test is the one that catches a knob shipped without a slider.
- `tests/data/animation/clips/flyout.test.ts` — 1 of 4 (the 22-second duration literal) · `flowOrbit.test.ts` — 1 of 4 ("starts live") · `flyPathDemo.test.ts` — 1 of 3 (waypoint compile, subsumed by the fly-through test) · `earthFlyout.test.ts` — 1 of 2 (id + non-empty timeline, already a `clipRegistry` invariant).
- `tests/crossMatch.test.ts` — 1 of 9 — "passes a DESI-only sky region through untouched" (the cone↔wedge and within-patch tests carry the DESI semantics).
- `tests/famousImageProcessor.test.ts` — 2 of 7 — the radial-fade arm asserted twice through `applyTransparency` and again through `applyRadialFade`.
- `tests/hooks/useIsMobile.test.ts` — 1 of 4 — the false half of a `matchMedia` boolean.
- `tests/state/camera/selectors.test.ts` — 1 of 9 — `selectClipActive` false-at-rest (the lifecycle test covers both ends); the whole `selectCameraActive` OR-term matrix stays.
- `tests/state/engine/engineSlice.test.ts` — 1 of 6 — the provenance-counts merge (identical to the source-counts merge).
- `tests/state/selection/selectionSlice.test.ts` — 2 of 8 — a one-line ref write and a pending-id record subsumed by the hold-across-write test.
- `tests/state/selection/captureGalaxyFocusIds.test.ts` — 2 of 10 — two more "does NOT capture" arms of the same filter.
- `tests/state/selection/watchSelectionWakeSaga.test.ts` — 1 of 4 — focus-wakes (twin of select-wakes); the hover negative stays.
- `tests/state/settings/initialSettings.test.ts` — 1 of 3 · `selectors.test.ts` — 1 of 4 · `mergeSettingsSnapshot.test.ts` — 1 of 4 — a second registry-derivation row, the one-disabled mask variant, and a ten-cluster count restatement.
- `tests/state/perf/installPerfHook.test.ts` — 1 of 6 · `recorder/installRecorderHook.test.ts` — 1 of 9 — a store field lift and a duplicate already-active rejection.
- `tests/state/tier/watchTierSaga.test.ts` — 1 of 8 — single-slot re-anchor subsumed by the both-slots test.
- `tests/state/time/enterManualPausedAt.test.ts` — 1 of 2 — dispatch-order mock choreography; kept the one-nowMs-sample continuity claim.
- `tests/state/tour/captureSettings.test.ts` — 1 of 4 · `dwellDrift.test.ts` — 1 of 8 · `waitUntil.test.ts` — 1 of 3 · `tourSlice.test.ts` — 2 of 11 · `visitBeatSaga.test.ts` — 2 of 12 · `watchTourSaga.test.ts` — 2 of 5 — a second detachment check, "starts live", a poll-count restatement, a flag setter plus a registry-derived count, both `'prev'` mirrors of the `'next'` race tests, and two baseline restores `guidedTourSaga.test.ts` already asserts.
- `tests/state/ui/splashStorage.test.ts` — 1 of 5 — the second write case (no coercion loss).
- `tests/state/url/hashBodyFor.test.ts` — 1 of 4 · `hashHistoryIntegrity.test.ts` — 2 of 6 — a single-param composition twin and two two-param variants of already-tested one-param paths.
- `tests/store/SagaContextProvider.test.tsx` — 1 of 2 · `effects/watchBiasBakeSaga.test.ts` — 1 of 2 · `watchFlowReseedSaga.test.ts` — 1 of 3 · `watchFadesSaga.test.ts` — 2 of 8 · `watchWakeSaga.test.ts` — 2 of 6 — pass-through invocation, a bake assertion the requestRender test repeats, a second reseed-triggering key, two more per-layer fade rows (the FADE_ROW structural test covers the mapping), and two wake sources from slices already represented.

Kept: 851 tests in 205 files.

Largest survivors and why they keep their size: `tests/data/galaxyCatalog/galaxyCatalogFormat.test.ts` (20) and `tests/data/volume/scalarFieldFormat.test.ts` (18) are untouched — every `it` pins a byte offset, stride or version-rejection message against `.bin`/`.scfd` files already shipped on R2, which is the explicit KEEP rule; `structureCatalogFormat`, `filamentBinaryFormat`, `starCatalogFormat` and `meshBinaryFormat` stay for the same reason. `tests/state/tour/guidedTourSaga.test.ts` (13) and `visitBeatSaga.test.ts` (10) stay large because each surviving test is a distinct cancellation or race arm of a saga with no other coverage. `tests/state/selection/watchFocusTweenSaga.test.ts` (13) is untouched: every test names a different deferral or gate (camera-not-ready, star bin not loaded, body follow-driver, clip active, zoneOfAvoidance) and several cite past bugs. `tests/components/containers/TimeBarContainer.test.tsx` (12) and `tests/state/url/hashParamSources.test.ts` (14) keep one test per read/write row of a param or control table where a missing arm is a silent behaviour loss.

Verification: `npm run typecheck:fast` clean; `npx vitest run tests/components tests/state tests/store tests/hooks tests/data tests/crossMatch.test.ts tests/sources.test.ts tests/famousImageProcessor.test.ts` → 205 files / 851 tests passed. Prettier ran over the slice's test globs, so seven files I did not otherwise touch carry formatting-only reflows.

</details>

<details><summary>Slice C_gpu_render — pass 1</summary>

# Slice C_gpu_render — deletions

3 files deleted, 46 individual tests removed from 26 files (54 tests total).

Governing rule applied to the renderer suites: an `it` whose assertions are **only**
`typeof x === 'function'` / `x.length === N` / `label.length > 0` / `not.toThrow()` is a
compile-time fact restated at runtime — deleted. An `it` that additionally asserts a recorded
GPU call (`drawIndexed`/`draw`/`writeBuffer`) was kept.

## Whole files

- `tests/services/gpu/renderers/labels/occlusionCoverageGroup.test.ts` — DELETED FILE — asserts a TS descriptor constant back at itself (group index 1, one entry, FRAGMENT, unfilterable-float); despite the header it never reads `sceneDepth.wesl`, so it is a constant restatement, not WGSL/TS parity.
- `tests/services/gpu/shaders/structureMarker/ringPick.test.ts` — DELETED FILE — source-text greps of `ringPick.wesl` (`toContain('import package::…')`, a packing-expression substring) plus `expect(PICK_SENTINEL_OFFSET).toBe(1)` / `toBe(26)` constant restatements; rename-detectors, and the real lib↔TS parity is already pinned by `tests/data/selectionEncoding.test.ts`.
- `tests/utils/tonemap/clampExposure.test.ts` — DELETED FILE — 3 clamp tests restating the 16 / 0.05 literals plus an identity pass-through.

## Partial files

- `tests/services/gpu/renderers/bodies/bodyGlintRenderer.test.ts` — 3 of 6 — construct-no-throw smoke, `satisfies Renderer` type restatement, `draw.length === 5` arity.
- `tests/services/gpu/renderers/bodies/starRenderer.test.ts` — 2 of 4 — construct-no-throw, `satisfies Renderer`.
- `tests/services/gpu/renderers/bodies/earthRenderer.test.ts` — 2 of 5 — construct-no-throw, `satisfies Renderer`.
- `tests/services/gpu/renderers/bodies/ringRenderer.test.ts` — 2 of 7 — construct-no-throw, `satisfies Renderer` (the `packRingUniforms` byte-layout keep-rule test stays).
- `tests/services/gpu/renderers/bodies/starPointRenderer.test.ts` — 3 of 9 — construct-no-throw, `satisfies Renderer`, `setStars`/`draw` arity-only test.
- `tests/services/gpu/renderers/bodies/planetRenderer.test.ts` — 2 of 11 — construct-no-throw, `satisfies Renderer`.
- `tests/services/gpu/renderers/bodies/texturedBodyRenderer.test.ts` — 3 of 16 — construct-no-throw, `satisfies Renderer`, `setMap/setRingTexture/draw` arity-only test.
- `tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts` — 3 of 13 — construct-no-throw, `satisfies Renderer`, `draw.length === 4` arity-only test (the full instance-attribute layout test stays).
- `tests/services/gpu/renderers/bodies/bodyPickRenderer.test.ts` — 1 of 11 — `satisfies Renderer and destroys cleanly`.
- `tests/services/gpu/passes/compositor.test.ts` — 1 of 11 — `exposes label, draw, destroy`.
- `tests/services/gpu/passes/additiveUpsample.test.ts` — 1 of 4 — `destroy() does not throw`.
- `tests/services/gpu/passes/starAggregateUpsample.test.ts` — 1 of 4 — `destroy() does not throw`.
- `tests/services/gpu/renderers/horizonShell/horizonShellRenderer.test.ts` — 1 of 2 — construct-no-throw (the surviving targetFormat test constructs the renderer anyway).
- `tests/services/gpu/renderers/flowField/flowFieldRenderer.test.ts` — 1 of 5 — construct-no-throw smoke, redundant with the four siblings that construct it.
- `tests/services/gpu/renderers/galaxyCatalog/galaxyPickRenderer.test.ts` — 1 of 3 — `constructs … exposing the draw surface` (`toBeDefined` + two `typeof === 'function'`).
- `tests/services/gpu/renderers/galaxyCatalog/galaxyPointRenderer.test.ts` — 1 of 8 — `accepts a single GalaxyPointDrawSettings record`: the record shape is a compiler fact and "draw records a draw" is covered by the fade-skip sibling.
- `tests/services/gpu/renderers/galaxyCatalog/catalogStore.test.ts` — 2 of 20 — `totalCount returns 0 before any upload` (init trivia) and `clearBiasOverlays is a no-op when no sources are loaded` (no-throw over an empty map).
- `tests/services/gpu/renderers/devTools/debugLineRenderer.test.ts` — 2 of 6 — `starts with zero lines` (init trivia) and `counts lines after setLines` (subsumed by the replace-not-append sibling).
- `tests/services/gpu/renderers/labels/markerLineRenderer.test.ts` — 2 of 7 — same pair: `starts with zero lines`, `counts lines after setLines`.
- `tests/services/gpu/renderers/labels/labelRenderer.test.ts` — 2 of 8 — `starts with zero glyphs to draw`, and the whole `fontIndex resolution` describe whose own comment says it only asserts "does not throw" until a second font exists.
- `tests/services/gpu/renderers/labels3d/label3DRenderer.test.ts` — 1 of 8 — `starts with zero glyphs to draw`.
- `tests/services/gpu/renderers/structureMarker/structureMarkerRenderer.test.ts` — 2 of 8 — `starts with zero markers`, `counts markers after setMarkers` (subsumed by replace/grow siblings).
- `tests/services/gpu/timing/buildTimingSlotMap.test.ts` — 2 of 4 — `returns an empty map for an empty list` and `size equals input length`, both subsumed by the `[2i, 2i+1]` allocation test.
- `tests/utils/camera/clampDistance.test.ts` — 3 of 6 — `floors at MIN_DISTANCE_MPC` / `caps at MAX_DISTANCE_MPC` (expectation is the module's own exported constant — mirror + clamp restatement) and `returns an in-bounds value unchanged`.
- `tests/utils/render/disk/galaxyCacheKey.test.ts` — 1 of 3 — `is stable for the same position`: `f(x) === f(x)` tautology plus a format restatement the rounding test already covers.
- `tests/utils/galaxy/ismMapDustRingEdges.test.ts` — 1 of 4 — `an arithmetic-mean regression would fail the same case`: a test about the test, strictly implied by the hand-computed geometric-mean assertion above it.

No `tests/helpers|fixtures|support` file was orphaned. Unused imports (`Renderer`, `MAX_DISTANCE_MPC`) removed from the edited files.

## Kept-but-suspicious

- `tests/utils/gpu/packGalaxyPointUniforms.test.ts` — 29 one-assertion tests over byte offsets; reads as change-detection, but it is squarely the uniform-byte-layout keep-rule (iOS drops the frame on a mislaid uniform).
- ~15 `bakes the given targetFormat into the pipeline colour target` tests, one per renderer — near-identical text, but each pins a different renderer against the real `ctx.format`-instead-of-`targetFormat` regression.
- The `viewSlot` family (`createViewSlotUniformRing`, `starPointRenderer`, `starCatalogRenderer.viewSlot`, `instancedQuadRenderer`, `texturedDiskRenderer`, `galaxyPointRenderer`) — six near-identical "different slot → different physical buffer" tests; kept because each proves a _different_ renderer is wired to the ring, and the writeBuffer/submit race they close is untestable otherwise.
- `tests/utils/camera/clampCameraTuning.test.ts` `leaves the shipped defaults untouched` — looks like a defaults restatement; kept because it is the invariant that replaced a load-time `throw` (shipped tuning must satisfy the edge ordering).
- `tests/services/gpu/renderers/galaxyField/ismMap/createIsmMapPlaceDust.test.ts` `computePlaceDustBudget — budget math parity with buildDustParticleCloud's own gates` — the clamp/floor half restates MAX_PARTICLE_COUNT / SIZE_MIN_PC; the `packPlaceDustParams ↔ placeDust.wesl` half is keep-rule, so the file stays.
- `tests/services/gpu/renderTargets.test.ts` — 21 tests, several overlapping destroy/reconcile paths; all behavioural, left intact.
- `tests/utils/scene/isAlphaTextureKind.test.ts` / `isLinearTextureKind.test.ts` — classification-table restatements, kept because linear-vs-sRGB misclassification is a shipped-bug class (normal maps).

## Slow

- `tests/services/gpu/renderers/galaxyCatalog/catalogStore.test.ts` (2208 ms, #11 repo-wide) — STAYS SLOW. Nearly all of it is the `parallel-upload rebake race` regression test: 250 ms of real `setTimeout` bake delays plus `buildPointInterleavedBuffer` over ~3 M synthetic points (498 k + 1.995 M + 156 k + 400 k). It reproduces a shipped bug (a tier swap's rebake resurrecting the previous tier's GLADE cloud), so it is a keep. The counts are decorative — the same race reproduces with a few hundred points per cloud — but that is a rewrite, which this pass is not allowed to do; worth a follow-up ticket to shrink the fixtures.

</details>

<details><summary>Slice C_gpu_render — pass 2</summary>

# Slice C_gpu_render — second-pass deletions

19 files deleted, 75 individual tests removed from 23 files (107 tests total).
Targeted vitest on the 23 edited files: 23 files / 126 tests passed. `npm run typecheck:fast`: clean.

Governing rules this pass added on top of pass 1: (a) **one home per convention** — the
~15 near-identical `bakes the given targetFormat into the pipeline colour target` tests
were a convention asserted 15 times; the two that carry extra information
(`compositor`'s dstFormat-not-derived-from-blend, `structureMarker`'s pick-stays-r32uint)
are the home, the rest are gone; (b) **one test per branch** — sibling `it`s walking the
same path with different literals collapse to the one with the least obvious expected
value; (c) **mock choreography** (assert the forwarded arg reached the spy) proves nothing.

## Whole files

- `tests/services/gpu/device.hdrCapability.test.ts` — DELETED FILE — mock choreography: asserts `addEventListener`/`removeEventListener` were called on a stub `MediaQueryList`.
- `tests/services/gpu/device.timestampQuery.test.ts` — DELETED FILE — mock choreography: stubs `navigator.gpu` end-to-end to assert a ternary's own output reached `requestDevice`.
- `tests/services/gpu/renderers/horizonShell/horizonShellRenderer.test.ts` — DELETED FILE — its one surviving test was a targetFormat copy.
- `tests/services/gpu/renderers/devTools/debugLineRenderer.test.ts` — DELETED FILE — targetFormat copy plus three restatements of `lines = input.slice(0, maxLines)` (replace / clear / cap).
- `tests/utils/gpu/hdrActiveOf.test.ts` — DELETED FILE — 45 lines of `RenderTargets` stub to assert `specOf('swap').format === 'rgba16float'`.
- `tests/utils/gpu/gpuTextureFormatForChannels.test.ts` — DELETED FILE — 2-row lookup table asserted back at itself, plus a throw guard.
- `tests/utils/gpu/depthClearValueFor.test.ts` — DELETED FILE — a ternary restated.
- `tests/utils/gpu/resolveDepthCompare.test.ts` — DELETED FILE — 4-cell mapping table restated; the reversed-Z flip it names is a constant a reviewer reads in the diff.
- `tests/utils/gpu/alignedBytesPerRow.test.ts` — DELETED FILE — `ceil(w/256)*256` mirrored twice.
- `tests/utils/scene/bodyTextureSlotKey.test.ts` — DELETED FILE — a string join.
- `tests/utils/scene/innerBoundRadiusM.test.ts` — DELETED FILE — one-line add, one assertion.
- `tests/utils/scene/outerBoundRadiusM.test.ts` — DELETED FILE — the same file with `max` instead of `min`.
- `tests/utils/scene/bodyStandoffRadii.test.ts` — DELETED FILE — registry lookup with a fallback, both arms asserting the module's own exported constant.
- `tests/utils/scene/isAlphaTextureKind.test.ts` — DELETED FILE — classification-table restatement; the linear-vs-sRGB bug class keeps its one home in `isLinearTextureKind.test.ts`.
- `tests/utils/picking/seedIndexOfBody.test.ts` — DELETED FILE — `findIndex` tested against itself over the real seed tables; the file's own header states the real regression lives in `starSpheresPass.test.ts`.
- `tests/utils/render/disk/galaxyCacheKey.test.ts` — DELETED FILE — `toFixed(5)` restated, plus a sibling implied by it.
- `tests/utils/camera/isInsideAtmosphereShell.test.ts` — DELETED FILE — clamp-boundary straddle, `<` and `<=` observationally identical at the bound.
- `tests/utils/camera/surfaceFloorM.test.ts` — DELETED FILE — MIRROR: expected value computed by `pivotFraming`, the other half of the same derivation.
- `tests/utils/camera/bodySlabCamLocal.test.ts` — DELETED FILE — one division by a radius, asserted twice.

## Partial files

- `tests/services/gpu/passes/toneMap.test.ts` — 7 of 14 — `maps 0 to 0` and `clamps inputs above 1` are inside the common `[0,1]` sweep; three per-curve `asymptotes toward 1` are the same claim as the saturation table; `linearClamp passes through then clamps` and the `acesFilmic` S-curve are qualitative smoke; reinhard's exposure test is `f(0.5,2)===f(1,1)`, a mirror.
- `tests/services/gpu/resources/textureAtlas.test.ts` — 5 of 13 — `allocates sequential slots` (asserted again in the over-budget test), `records the frame last seen` (a setter), the two `onEvict` fires/does-not-fire tests (both re-asserted by the frame-boundary and over-budget tests), `setEvictHandler(undefined)`.
- `tests/services/gpu/resources/hiResFamousTexture.test.ts` — 6 of 15 — `sequential layers` (restated by the eviction test), `markFailed + isFailed` and `uploadBitmap marks loaded` (flag set/get), `getTextureView dimension "2d-array"` (descriptor constant), `mutators throw after destroy` (the same guard six times, and `destroy()` already asserts one), `setEvictHandler(undefined)`.
- `tests/services/gpu/renderTargets.test.ts` — 6 of 21 — `fixedSizePx allocates at its declared size` and `reconcile does not reallocate a fixedSizePx row` (both re-asserted by the resolve-against-live-state test and the 13/25 texture counts), `depthViewOf` + `specOf` throws (third and fourth copy of the unknown-id-throws convention), `sizeOf clamps to 1 px` (its own comment says the allocation path covers the clamp), `destroy destroys depth textures` (the sibling loops over every created texture).
- `tests/services/gpu/renderers/galaxyCatalog/instancedQuadRenderer.test.ts` — 8 of 26 — targetFormat; `defaults uniformVisibility to VERTEX` and `defaults to a single @group(0) buffer` (default restatements); `exposes bindAtlas` / `exposes bindHiResArray` (`typeof x === 'function'`); `keeps the BGL at 3 entries` (duplicate of the 3-binding test); `lazy-allocates the instance buffer` (the regrow test's first draw asserts the identical two lines); `destroys uniform + lazily-allocated buffer` (same `[0,1]` as the fixed-capacity case).
- `tests/services/gpu/renderers/galaxyCatalog/galaxyPointRenderer.test.ts` — 3 of 7 — targetFormat; `releases the renderer's uniform ring` (the per-source test asserts every tracked buffer including the ring); `is idempotent` (not-throw with no outcome).
- `tests/services/gpu/renderers/labels/labelRenderer.test.ts` — 3 of 6 — targetFormat (+ its now-orphaned capturing-device helper) and `counts glyphs after setLabels` (the replace-not-appends sibling asserts both counters).
- `tests/services/gpu/renderers/labels/markerLineRenderer.test.ts` — 2 of 5 — targetFormat (+ helper) and `replaces (not appends)`; the two occlusion-blend tests, which name a device-only premultiplied-alpha bug, stay.
- `tests/services/gpu/renderers/selectionRing/selectionRingRenderer.test.ts` — 2 of 5 — targetFormat and `is a no-op on a null device (no throw…)`, which asserts no outcome.
- `tests/services/gpu/renderers/filaments/filamentRenderer.test.ts` — 1 of 3 — targetFormat.
- `tests/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.test.ts` — 1 of 2 — `constructs under a null device` (not-throw; the surviving pick-pipeline test constructs it anyway).
- `tests/services/gpu/renderers/constellations/constellationRenderer.test.ts` — 2 of 7 — targetFormat, and `the camera prefix write never collides with the scalar slots`, which is implied by the offset test two lines up.
- `tests/services/gpu/renderers/flowField/flowFieldRenderer.test.ts` — 2 of 4 — targetFormat, and `upload builds a model matrix…` whose own comment concedes it only asserts not-throw + the `fieldLoaded` flag its sibling already covers.
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` — 2 of 10 — targetFormat, and `draw on a disabled, fully-faded field does not draw` (opacity 0 is the sole gate; the ENABLED-at-opacity-0 sibling is the same branch and the stronger case).
- `tests/services/gpu/renderers/starCatalog/starExposureRamp.test.ts` — 4 of 11 — the far-anchor clamp (re-asserted by `reads the far end back as farX/…`), the monotone sweep, `reproduces the old look … (visually indistinguishable)` (a 0.02-tolerance weakening of the bit-identical test above it), and `dips the 3 kpc value` (a monotonicity restatement over anchors already pinned).
- `tests/utils/structure/structureMembership.test.ts` — 3 of 5 — `uses strict less-than` (the first test already includes a boundary galaxy at exactly r) and both `{count: 0, packedIds: []}` empty-input tests.
- `tests/utils/structure/structureMemberCount.test.ts` — 2 of 7 — `returns null when no visible catalog is loaded` (init trivia, and the Synthetic test asserts the same null) and `drops a single hidden catalog` (duplicate of the visibility-mask test).
- `tests/utils/labels/labelScreenRect.test.ts` — 2 of 7 — the `minPixelSize` clamp (same scale 0.5, same expected rect as the `maxPixelSize` clamp) and `composes padPx and the outline fringe additively`.
- `tests/utils/camera/sphereOutsideFrustum.test.ts` — 3 of 8 — far right / above / below, three more literals through the lateral-plane branch the `far to the left` test already walks.
- `tests/utils/camera/yawPitchToDir.test.ts` — 3 of 5 — two of the three cardinal bearings (the round-trip against `orbitAnglesLookingAlong` is the independent check) and `writes into out when provided`.
- `tests/utils/camera/zoomedPose.test.ts` — 3 of 7 — `zooming in reduces distance` (same branch as `scales by the factor`), `clamps to the minimum` (clamp pair), `carries target/yaw/pitch over unchanged` (a spread restated).
- `tests/utils/camera/foregroundFrustum.test.ts` — 2 of 4 — `returns near < far` and `near scales with distance`, property smoke over a two-line ratio.
- `tests/utils/render/disk/maybeEmitProceduralDisk.test.ts` — 3 of 9 — `returns null below the fade start` (the at-the-edge sibling is the load-bearing half of the pair), the second NaN guard (same branch, other arg), `defaults procFadeOut to 1.0`.

No `tests/helpers|fixtures|support` file was orphaned. Unused imports/helpers removed from the
edited files (`newCapturingDevice` ×2, `newRenderer`, `newNullDeviceRenderer`, `writeCameraPrefix`,
`RAMP_FAR_SCALE`, `maskWithout`, `Vec3`).

## Kept: 998 of 1105

The biggest files left in the slice keep their size for three reasons, all on the KEEP list.
`packGalaxyPointUniforms.test.ts` (29 tests) and the `packIsmMap*` / `packPlace*` /
`*Layout.parity` family (~60 tests across 15 files) are uniform byte-layout and WGSL↔TS
parity tests — most of them parse the real `.wesl` struct and assert the packer writes each
field at the offset the shader declares, which is exactly what the brief protects; the one
place I applied the convention rule inside that family was the constellation prefix-collision
test. `cutSurfaceTiles.test.ts` (24 tests, 935 lines, 265 ms) is untouched: each `it` walks a
distinct tile-planner branch (horizon cull, ancestor-fallback residency, level/lodBias ladder,
antimeridian, metres-vs-radii, low-altitude f64) with hand-computed expectations, and its length
is the planner's branch count, not restatement. `catalogStore.test.ts` (18 tests, 558 lines) is
almost entirely named upload regressions (replace-not-append, empty-cloud unload, parallel-upload
rebake race) plus slot-index splice assertions. `instancedQuadRenderer` and `renderTargets`, the
two heaviest renderer files, are now 18 and 15 tests and every survivor is a distinct config
branch or allocation-lifecycle path.

## Slow

- `tests/services/gpu/renderers/galaxyCatalog/catalogStore.test.ts` (1458 ms) — STAYS SLOW, unchanged verdict from pass 1: the cost is the parallel-upload rebake-race regression (250 ms of real `setTimeout` bake delay over ~3 M synthetic points). Shrinking the fixtures is a rewrite, not a deletion.
- `tests/utils/lensing/lensQuadPlaneRadiusRs.test.ts` (571 ms) / `buildSchwarzschildDeflectionLut.test.ts` (230 ms) — STAY: numerical LUT construction against independently computed references; the runtime is the integrator, not the test count.
- `tests/utils/scene/cutSurfaceTiles.test.ts` (265 ms) — STAYS: real planner walks at z19, see above.

</details>

<details><summary>Slice D_utils_parsers — pass 1</summary>

# Slice D_utils_parsers — deletions

7 files deleted, 30 files edited, **86 tests removed** (766 → 680, 11.2%).

## Whole files

- `tests/utils/galaxyCatalogIdOf.test.ts` — DELETED FILE — MIRROR: expectation built from `SOURCE_REGISTRY[source].id`, the same registry the helper reads.
- `tests/fetch/fetchCosmicflows4.test.ts` — DELETED FILE — 3 tests of one-line `node:fs`/`node:crypto` wrappers (`existsSync?statSync.size:0`, sha256); tests the standard library.
- `tests/utils/animation/captionAnchor.test.ts` — DELETED FILE — enumerates the 5 `CaptionPosition` literals against `position.split('-')`; constant restatement of a type the compiler already pins.
- `tests/catalog/buildAllBins.desiDeep.test.ts` — DELETED FILE — self-described "mirrors buildAllBins.milliquas.test.ts's rationale"; same `recordsToCloud` paths with a different Source constant, and the axisRatio-range claim is already `fallbackOrientation.test.ts`'s.
- `tests/utils/url/isCinemaMode.test.ts` — DELETED FILE — 40 lines of jsdom `window.location` scaffolding to assert one wrapper around `isCinemaSearch`, whose own parse is `searchHasGate`'s.
- `tests/utils/url/isCinemaSearch.test.ts` — DELETED FILE — one-line binding; the test's only content is the string `'cinema'` asserted against `'?cinema'`.
- `tests/utils/url/isPerfSearch.test.ts` — DELETED FILE — 5 tests, 4 of them verbatim re-runs of `searchHasGate.test.ts`'s parse semantics through a one-line binding; the 5th is the flag spelling restated at itself.

## Partial files

- `tests/utils/clampVolume.test.ts` — 12 of 24 — the 5 "passes through a mid-range value unchanged" identities, the 6 ±Infinity twins of the NaN test (same `isFinite` branch), and "collapses 0 to 0 (> 0 boundary)" (vacuous at the bound). Kept one ceiling + one floor + the NaN mapping per helper.
- `tests/utils/clampVolumeFieldSettings.test.ts` — 4 of 6 — two "passes X through unmodified" identities, the "present bands array passes through" identity, and the duplicate no-mutation fixture (low-side). Kept no-mutation + the stale-persisted-row `bands` fallback; the now-unused `rawLow` fixture went with them.
- `tests/utils/clampFilamentIntensity.test.ts` — 1 of 3 — "passes an in-range value through".
- `tests/utils/clampFlowParams.test.ts` — 1 of 7 — "passes enabled and mode through unchanged" (spread identity).
- `tests/catalog/desiPatches.test.ts` — 1 of 5 — "each row's makeFilter builds a callable 3-arg predicate" (`typeof x === 'boolean'` on a typed return).
- `tests/catalog/dropFamousMatches.test.ts` — 1 of 5 — "handles multiple famous positions correctly": same branch as "drops records within the threshold", just more rows.
- `tests/catalog/buildAllBins.stellarMass.test.ts` — 2 of 3 — the SDSS case computed its expectation by calling `estimateLog10StellarMass` on the source's own baked position (textbook MIRROR, admitted in the header); "a Milliquas row gets NaN" duplicates `estimateLog10StellarMass.test.ts`'s quasar case. Kept the encoded flags-byte bit (format contract).
- `tests/utils/math/iauRaDecSuffix.test.ts` — 1 of 2 — "agrees with iauName(SDSS, …)" is a tautology: `iauName` is `` `${prefix} ${iauRaDecSuffix(...)}` ``.
- `tests/utils/math/iauName.test.ts` — 4 of 12 — the GLADE/Synth/Famous prefix tests (`SOURCE_REGISTRY.iauPrefix` literals restated; kept 2MASX so the registry lookup is still proven non-hardcoded) and "wraps RA above 360" (same `((x%360)+360)%360` as the negative-wrap case).
- `tests/utils/math/_sexagesimal.test.ts` — 8 of 12 — the whole `pad` describe (5 tests of `String.padStart`, already pinned through every formatter's output string), the trunc variant's "same as rounding variant for exact values" duplicate, and both zero-input trivia.
- `tests/utils/arcsecToKpc.test.ts` — 1 of 5 — "returns 0 when arcsec is 0" (no branch; plain multiplication).
- `tests/utils/asArray.test.ts` — 1 of 4 — "collapses undefined" is the same `value == null` branch as the null case.
- `tests/utils/url/hasUrlGate.test.ts` — 2 of 3 — present/absent duplicate `searchHasGate.test.ts`; kept "tracks the live search string across changes", the only assertion about the wrapper's own live read.
- `tests/utils/object/shallowEqualRef.test.ts` — 3 of 9 — the structure-ref and milkyWay-ref cases re-walk the same generic `Object.keys` loop as the galaxyCatalog cases.
- `tests/utils/math/healpixNest.test.ts` — 3 of 11 — "returns a value in the valid pixel range" (range restatement), "different sky regions land in different pixels" (vacuous), and the `Math.random()` "near-uniform population" test whose own comment admits it only checks idempotence and range.
- `tests/utils/math/expectedNumberDensity.test.ts` — 3 of 11 — "well-defined and positive at 100 Mpc" (subsumed by the monotonicity and magnitude tests), "integration window is exactly empty" (same early guard as the M_brightCut case), and the defensive finite-sweep.
- `tests/utils/math/minOf.test.ts` — 2 of 5 — "handles negative values" and "returns the sole element" re-run the same reduce.
- `tests/utils/math/makeMinMaxNormaliser.test.ts` — 1 of 6 — "single-sample set" is the same `max === min` guard as the equal-samples case.
- `tests/utils/math/absoluteMagnitude.test.ts` — 2 of 5 — "returns m − 5 at 100 Mpc" (same anchor as the 1 Mpc case plus the 10× property) and the vague "sensible value … (sanity check)" range assertion.
- `tests/utils/color/speedRamp.test.ts` — 1 of 4 — "returns premultiplied RGBA with alpha 1" (length-4 type restatement + constant).
- `tests/utils/color/hexToGl.test.ts` — 2 of 10 — "parses pure black" (dup of the white case) and "#RRGGBBFF is fully opaque" (dup of the two alpha tests).
- `tests/utils/math/sdssThumbnailUrl.test.ts` — 4 of 7 — the 2048/32 clamp pair, "passes through valid sizes unchanged", and "accepts dec = 0 exactly" — clamp-constant and boundary vacuity; the canonical-URL test still pins the endpoint contract.
- `tests/utils/math/uvSphereMesh.test.ts` — 2 of 7 — "vertex count is (segments+1)*(rings+1)" and "index count is segments*rings\*6" recompute the expectation with the source's own formula.
- `tests/utils/math/raDecZRoundTrip.test.ts` — 3 of 9 — the +x/+y/+z axis-convention trio, already asserted in `eqRaDecToUnitCart.test.ts` and again in `raDecDistToEqCart.test.ts`; the round-trips and degenerate cases stay.
- `tests/utils/concurrency/priorityQueue.test.ts` — 2 of 8 — "runs at most MAX_CONCURRENT_FETCHES" (a `<=` bound over 12 × 20 ms sleeps; the sibling asserts an exact bound with deterministic gates, and this was most of the file's 73 ms) and "processes higher-priority entries first" (same `['high','mid','low']` assertion as the slot-frees test).
- `tests/utils/math/mortonEncode3.test.ts` — 1 of 6 — "interleaves all three low bits into 0b111" is the composition of the three single-axis pins.
- `tests/utils/math/galaxyDiameterKpc.test.ts` — 1 of 6 — "returns the default when no input is supplied" is the same NaN guard as the explicit-NaN case.
- `tests/utils/time/formatSimClock.test.ts` — 1 of 3 — "renders a UTC date-time" asserts the exact string the UTC-getters test already asserts for the same instant.
- `tests/parsers/ndskl.test.ts` — 1 of 12 — the 0-vertex strip case duplicates the 1-vertex case on the same `< 2` branch (the 1-vertex one is the off-by-one that matters). Everything against fixture bytes kept.
- `tests/utils/createReseedLatch.test.ts` — 1 of 3 — "arming twice still yields a single true" is the same boolean set as arming once.

No `tests/helpers|fixtures|support` file was orphaned. `tests/types/` holds only `tools-shims.d.ts` (no tests).

## Kept-but-suspicious

- `tests/utils/math/sdssName.test.ts` (6) — `sdssName` is a **copy-paste duplicate** of `iauRaDecSuffix` plus a hardcoded `"SDSS "`, so all 6 tests shadow `iauName.test.ts`. Kept because they are the only coverage of that duplicated body; the real fix is deleting the duplicate source and re-pointing its build-time callers, which is out of scope for a delete-only pass.
- `tests/utils/math/raDecDistToEqCart.test.ts` (3) — third copy of the RA/Dec axis convention; survives only because it also pins the hours→degrees ×15 conversion.
- `tests/utils/format/formatMilkyWayTuningDefaults.test.ts` (2) + `formatZoneOfAvoidanceTuningDefaults.test.ts` (3) — dev-tool codegen formatters; "every knob present" edges toward a golden snapshot.
- `tests/utils/astro/deriveStarProperties.test.ts` (4) — composite of `starTeffK` / `starLuminositySolar` / `starRadiusSolar` / `isGiantStar`, each separately tested; kept for the extrapolated-flag branches only.
- `tests/utils/math/fadeBand.test.ts` (8) — the approach and recede directions are near-mirror halves; a reviewer could fold them to 5.
- `tests/utils/math/f16ToFloatLut.test.ts` (1, 360 ms) — sweeps all 65 536 bit patterns against the scalar reference. Genuine LUT-vs-scalar parity, not a mirror; kept despite being the slowest file in the slice.
- `tests/utils/math/distance3.test.ts` + `distanceMpc.test.ts` — identical bodies, identical 3-4-5 case, in two files; both headers argue the units differ.

## Slow

None of the repo-wide slowest-20 files fall in this slice. The slice's own worst were `f16ToFloatLut.test.ts` (360 ms — kept, see above) and `priorityQueue.test.ts` (73 ms — cut to gated, sleep-free tests by the two deletions above).

</details>

<details><summary>Slice D_utils_parsers — pass 2</summary>

# Slice D_utils_parsers — second-pass deletions

6 files deleted, 108 files edited, **194 tests removed** (680 → 486, 28.5 %).
`npm run typecheck:fast` clean; `npx vitest run` over the 108 edited files: 339 passed.

## Whole files

- `tests/utils/math/f16ToFloatLut.test.ts` — DELETED FILE — textbook MIRROR: the test's own comment says the LUT is built by calling `f16ToFloat`, so the 65 536-pattern sweep asserts the code equals itself (also the slice's slowest file at 509 ms).
- `tests/utils/math/combinedBrightness.test.ts` — DELETED FILE — 3 tests of a one-line weighted sum; two re-derive the expectation with the source's own formula, the third is a vacuous `>= 0` sweep.
- `tests/utils/math/distanceMpc.test.ts` — DELETED FILE — byte-identical body and 3-4-5 case to `distance3.test.ts`; the headers argue about units, the assertions don't.
- `tests/utils/clampFilamentIntensity.test.ts` — DELETED FILE — 2 clamp-bound restatements of `Math.min(1, Math.max(0, x))`; a wrong bound is visible in the diff.
- `tests/utils/format/wikipediaUrl.test.ts` — DELETED FILE — one test of `'…/wiki/' + encodeURIComponent(t.replace(/ /g,'_'))`; what it actually pins is that `encodeURIComponent` leaves parens alone — the standard library.
- `tests/utils/url/isOrientationFrameId.test.ts` — DELETED FILE — a `.includes()` guard list restated; it asserts only the ids that already exist, so the real bug (a new frame id added to the union but not the guard) slips straight past it.

## Partial files — `tests/utils/math/`

- `sdssName.test.ts` — 5 of 6 — `sdssName` is `iauRaDecSuffix` plus a hardcoded `"SDSS "`; the sign, RA-wrap, truncation and Dec-clamp tests are verbatim shadows of `iauName.test.ts`. Kept the canonical designation.
- `formatRaSexagesimal.test.ts` — 4 of 6 — 0°/180°/15° are the same divide-by-15 path with rounder literals than the 188.7365° case, and the 370° wrap duplicates the −10° wrap.
- `formatDecSexagesimal.test.ts` — 3 of 5 — 0°/−45°/+90° walk the same formatter as the ±1.396° pair, which carries the only non-trivial sub-unit arithmetic.
- `lerp.test.ts` — 3 of 5 — t=0, t=1 and "negative ranges" are the midpoint case with different literals on a one-line helper.
- `lerpAngleShortest.test.ts` — 3 of 5 — t=0/t=1 endpoints, plus "does NOT take the long way" which asserts the same short-arc choice as the test above it.
- `niceRound.test.ts` — 3 of 7 — three of the four mantissa rows are the same `log10`/`pow` bucket at different decades; "returns 0 for negative" is the same `x <= 0` guard as "returns 0 for 0".
- `healpixNest.test.ts` — 3 of 8 — the south-pole and southern-cap tests mirror their northern twins; "matching pixels for nearby points" passes for any coarse-enough hash.
- `expectedNumberDensity.test.ts` — 3 of 8 — the non-positive-distance guard, the φ\*-linearity mirror, and the SDSS-vs-2MRS ordering (subsumed by the mLim-monotonicity test); the now-unused `twoMrs` fixture went with it.
- `redshiftToDistanceMpc.test.ts` — 3 of 7 — z=0 trivia, "approaches linear Hubble at small z" (the negative-z test already pins the linear fallback), and the [0,7] monotonic sweep implied by the two hand-computed anchors plus the strictly-below-linear sweep.
- `fadeBand.test.ts` — 3 of 8 — the recede direction's two edge tests mirror the approach direction's, and "strictly fractional mid-band" is the weak form of the approach midpoint pin.
- `raDecDistToEqCart.test.ts` — 2 of 3 — the +X and +Z cases are the third copy of the RA/Dec axis convention (`eqRaDecToUnitCart.test.ts` is its home); kept the 6h case, the only one pinning the hours→degrees ×15.
- `easeOutCubic.test.ts` — 2 of 5 — the t=0/t=1 endpoints; the clamp tests already pin 0 and 1 as outputs.
- `smoothstep.test.ts` — 2 of 5 — "returns 0/1 at and below/above the edge": clamp-boundary vacuity, and the zero-width-band test already asserts a hard 0/1.
- `matrixToQuaternion.test.ts` — 2 of 4 — identity→identity and "returns a unit quaternion"; the two branch tests carry the real coverage.
- `rotateVec3ByTightMat3.test.ts` — 2 of 5 — "combines columns for a general vector" recomputes the expectation as the source's own linear combination; the caller-owned-`out` test is subsumed by the in-place test.
- `galaxyDiameterKpc.test.ts` — 2 of 5 — fainter-is-smaller and brighter-is-larger are the Tully power law restated on either side of the hand-computed anchor.
- `galaxyThumbnailFovArcmin.test.ts` — 2 of 5 — "scales with angular size" is subsumed by the hand-computed margin case; the floor clamp mirrors the ceiling clamp.
- `galaxyTypeFromBminusJ.test.ts` / `galaxyTypeFromJminusK.test.ts` — 2 of 6 each — the green and red band samples are subsumed by the two exact-boundary tests, which are the ones testing.md says to keep.
- `iauName.test.ts` — 2 of 8 — "always emits a leading +" (the canonical designation already contains it) and the −90 Dec clamp, mirror of the +90 clamp.
- `aladinLiteUrl.test.ts` — 2 of 5 — negative-dec interpolation and the DSS2 survey constant, both already inside the canonical-URL string.
- `catmullRom.test.ts` — 2 of 4 — the p2/t=1 endpoint (twin of p1/t=0) and the vague "stays within neighbour bounds".
- `bulgeBrightness.test.ts` / `diskBrightness.test.ts` — 2 of 3 each — "peaks at the centre" is `exp(0)`; the disk's 1/e test used `Math.exp(-1)`, the source's own expression. Kept one hand-computed off-centre value each.
- `lookbackTimeGyr.test.ts` — 2 of 4 — z=0 trivia and the monotonic sweep implied by the z=1 and z→∞ anchors.
- `raDecZRoundTrip.test.ts` — 2 of 6 — the southern round-trip duplicates the SDSS-ish one; "produces the origin for z=0" duplicates the origin-sentinel test.
- `floatToF16.test.ts` — 2 of 5 — zero and +Inf overflow, both already in `f32ToF16Bits.test.ts` and in this file's own round-trip.
- `minOf` 1/3, `multiply3x3` 1/2, `reorthonormalise` 1/3, `rotateVec3ByQuat` 1/4, `clampVec3Length` 1/2, `eqRaDecToUnitCart` 1/4, `galacticToCartesian` 1/4, `mortonEncode3` 1/5, `f16ToFloat` 1/6, `f32ToF16Bits` 1/5, `makeMinMaxNormaliser` 1/5, `_sexagesimal` 1/4, `trapezoidEase` 1/5, `absoluteMagnitude` 1/3, `dMaxFromAbsolute` 1/2, `apparentDiameterPx` 1/3, `apparentSizePx` 1/3, `horizonShellFadeAlpha` 1/4, `hubbleVelocityKmS` 1/4, `earthEraForLookback` 1/3, `vMaxWeight` 1/4, `galaxyType` 1/6, `raySphereRoots` 1/7, `causalHermiteNonUniform` 1/5, `dssThumbnailUrl` 1/3, `sdssExplorerUrl` 1/3, `sdssNavigateUrl` 1/3, `sdssThumbnailUrl` 1/3 — one each: identity/no-op cases, range restatements ("returns a unit vector", "a finite weight in (0,1]"), a mirrored second axis or second clamp edge, a degenerate-input not-throw with no outcome assertion, or a template re-assert with a negative declination.

## Partial files — rest of `tests/utils/`

- `clampVolume.test.ts` — 9 of 12 — every plain ceiling/floor test across the five helpers: the bounds are literals a reviewer sees in the diff, and `Math.min`/`Math.max` can't be half-wrong. Kept the three NaN fallbacks (0, 1.0, 0.0), which differ per knob and are not inferable from the range; header re-scoped to match.
- `url/hasDeepLink.test.ts` — 4 of 10 — the structure `#focus=` case is the same branch as the galaxy one, "both hash and search" is a composition of two covered branches, the leading-`?` variant is `searchHasGate`'s semantics, and the all-empty case is trivia.
- `clampFlowParams.test.ts` — 3 of 6 — the flowSpeed/wander, intensity/densityBias and boundaryFadeWidth bound restatements. Kept the count cap (it also pins rounding) and the no-mutation test.
- `color/hexToGl.test.ts` — 3 of 8 — pure white (twin of pure red), "normalises each channel" (same parse), and "is case-insensitive" (a `parseInt` property).
- `random/fallbackOrientation.test.ts` — 3 of 6 — "different inputs differ" is vacuous, and the two 1000-iteration range sweeps restate the source's own scale constants (they were most of the file's 61 ms). Kept determinism, objID 0n, and the cited oob-race regression.
- `object/shallowEqualRef.test.ts` — 3 of 6 — the same-reference fast path and the differing-`type` case land on the same key walk as the differing-`index` case; both-null is trivia.
- `animation/expandVisibilityLayers.test.ts` — 2 of 3 and `animation/splitVisibilityArgs.test.ts` — 2 of 3 — the atomic-passthrough identities, plus the `'labels'` expansion asserted three times across the two files. One test each survives, carrying the full expansion.
- `random/mulberry32.test.ts` — 2 of 4 — "floats in [0,1)" (range restatement over 1000 draws) and "different seeds differ" (vacuous).
- `random/uniformInSphere.test.ts` — 2 of 3 — determinism is `mulberry32`'s job; the 20 000-sample mean-near-origin test passes for a cube too, so it can't catch the distribution bug it looks like it's guarding.
- `arcsecToKpc.test.ts` — 2 of 4 — the second multiplication case and the mirrored half of the same `isFinite` guard.
- `format/wrapLabelName.test.ts` — 2 of 5 — "breaks at its only space" is subsumed by the balance test; "honours an explicit maxChars" is a parameter passthrough.
- `url/searchHasGate.test.ts` — 2 of 7, `url/parseHashParams.test.ts` — 2 of 5, `url/composeHashParams.test.ts` — 2 of 4 — empty-input trivia, a second present/absent case, a single-pair case already inside the multi-pair one, and the second direction of the same round-trip.
- `astro/deriveStarProperties.test.ts` — 2 of 4 — the Sun-like-dwarf and red-giant cases assert the exact numbers (5683.94, 4720.95, …) that `starTeffK` / `starLuminositySolar` / `starRadiusSolar` already own. Kept the two extrapolated-flag branches, which is all this composite adds.
- `color/temperatureToLinearRgb.test.ts` — 2 of 4 — the per-channel range restatement and "cooler is redder", mirror of "hotter is bluer"; the now-unused `M_DWARF_K` fixture went with them.
- `concurrency/priorityQueue.test.ts` — 2 of 6 — "calls onResult with the fetcher result" (pass-through) and "inFlightCount reports the number of running fetches" (a getter the concurrency-limit test already depends on).
- `network/fetchGalaxyBitmap.test.ts` — 1 of 4 — "passes a non-undefined signal to fetch" is mock choreography: it asserts the forwarded arg, never the deadline behaviour its own comment says it can't reach.
- `format/formatDistance` 1/8 (the exactly-1-km boundary), `format/famousWikipediaTitle` 1/4, `format/formatDiameterKpc` 1/2, `format/formatMorphology` 1/6, `format/starWikipediaTitle` 1/2 (the passthrough half), `format/formatZoneOfAvoidanceTuningDefaults` 1/3 (the every-knob-present key-set assertion, a golden snapshot in disguise), `analytics/injectAnalytics` 1/4, `astro/bolometricCorrectionG` 1/4, `astro/starTeffK` 1/4, `loading/sameRequest` 1/3, `initialTierFromViewport` 1/4, `asArray` 1/3, `createReseedLatch` 1/2, `flowFrameDeltaSec` 1/4, `sumProvenanceCounts` 1/2, `settings/composeInitialSettings` 1/3, `time/deriveSimDays` 1/4, `time/julianDaysToUnixMs` 1/2, `time/stepRate` 1/3, `worker/runDisposableWorker` 1/4 — one each: an init-state/"starts empty"/"returns all-zeros" trivium, a second guard producing the identical negative outcome, a mirrored clamp edge, or a sign-flip of an already-pinned multiplier.

## Partial files — `tests/catalog/` and `tests/parsers/`

- `parsers/famousSeed.test.ts` — 4 of 11 — the axisRatio, positionAngleDeg and magnitude range rejections restate the schema's own bounds for cosmetic optional fields; the minimal-seed parse is subsumed by the enrichment-fields parse and the real-seed-file parse. Kept duplicate-id, RA, Dec, distance/diameter and empty-names (each a rejection with a real consequence) plus the shipped-file parse.
- `catalog/catalogDistanceFor.test.ts` — 2 of 10 — the CF4-happy-path test is subsumed by "prefers CF4 over HyperLEDA" (same distance, same source tag); "returns null when both miss" is the same null as the NaN-mod0 and no-PGC cases.
- `catalog/dropFamousMatches.test.ts` — 2 of 4 — the empty-famous early return, and "keeps records just outside the threshold" (the cos(dec) test asserts both sides of the same threshold).
- `catalog/estimateLog10StellarMass.test.ts` — 2 of 10 — the non-positive-distance NaN guard (same family as the missing-magnitude one) and the GLADE K-band case, whose own comment says it must equal the 2MRS case exactly.
- `parsers/glade.test.ts` — 2 of 15 — "keeps a row whose only parent is HyperLEDA" is the same keep branch as the SDSS+HyperLEDA row; the 2MASX-`---` sentinel test re-slices the byte range the populated-pair test already pins. All real-fixture-byte rows kept.
- `catalog/desiPatches.test.ts` — 1 of 4 — "the cone predicate accepts its own center" is true by construction. Kept the two structural registry invariants and the sgw rejection.
- `catalog/buildAllBins.localVolumeOverride.test.ts` — 1 of 6 — "null overrides: legacy behaviour" drives the same cz path as the unmatched-inside-cutoff test one line up.
- `parsers/npyReader.test.ts` — 1 of 6 — the 3-D f64 read is the composition of the 3-D f32 shape test and the 1-D f64 dtype test.
- `parsers/sdssCsv.test.ts` — 1 of 7 — "empty petroR50_r cell" and "absent petroR50_r column" are two guards with one outcome.
- `parsers/cosmicflows4.test.ts` — 1 of 7 — the NGC 4258 row is a second trip through the same fixed-width parse as the M31 row.

No `tests/helpers|fixtures|support` file was orphaned. `tests/fetch/` is now empty of tests (first pass removed its only file); `tests/types/` holds only `tools-shims.d.ts`. Untouched by design: `tests/parsers/{milliquas,ndskl,twoMrs,npyWriter,hyperledaModExtension}.test.ts` and `tests/catalog/buildAllBins.{milliquas,stellarMass}.test.ts` — fixture-byte and encoded-format contracts.

**Kept: 486.**

The largest survivors are the parser suites — `glade` (13 tests, 356 lines), `twoMrs` (10), `ndskl` (11), `milliquas` (7), `sdssCsv` (6), `cosmicflows4` (6) — and they keep their size legitimately: every assertion is a decoded value read back from real or ReadMe-accurate fixed-width bytes, so each one is a contract with an upstream catalog that no compiler check and no sibling covers, and a ±1 byte slip in any field is exactly the failure they exist to catch. Next largest is `catalogDistanceFor` (8) — a four-source precedence ladder (seed > CF4 > HyperLEDA > null) where every test is a distinct rung — followed by `estimateLog10StellarMass` (8), one hand-computed relation per source band, and `famousSeed` (7) and `raySphereRoots` (6), the latter six hand-derived ray/sphere geometries with their arithmetic in the comments. `cubeSphereMesh` (5 tests, 172 ms) stays the slice's slowest file: its five geometric invariants (unit length, outward winding, tangent orthogonality, prime-meridian registration, seam continuity) each sweep every face, and a wrong one is a silently mis-textured planet.

</details>

<details><summary>Slice E_tools — pass 1</summary>

# Slice E_tools — deletions

11 files deleted outright, 17 files trimmed; 42 tests removed; ~1.45 s of baseline runtime.

- `tests/tools/famous-curator/viteConfig.smoke.test.ts` — DELETED FILE — "exports a config with port 5200 + a react plugin": exports-check plus a port-constant restatement; a broken config fails on the first `npm run curate-famous`.
- `tests/tools/flow-workbench/viteConfig.smoke.test.ts` — DELETED FILE — same port/plugin-list restatement (5300).
- `tests/tools/galaxy-renderer/viteConfig.smoke.test.ts` — DELETED FILE — same port/plugin-list restatement (5400).
- `tests/tools/mcpm-workbench/viteConfig.smoke.test.ts` — DELETED FILE — same port/plugin-list restatement (5500).
- `tests/tools/scene-workbench/viteConfig.smoke.test.ts` — DELETED FILE — same port/plugin-list restatement (5600).
- `tests/tools/famous-curator/paths.test.ts` — DELETED FILE — both tests assert a literal path string back at the one-line `join()` helper that built it.
- `tests/tools/famous-curator/apiPlugin.health.test.ts` — DELETED FILE — `{ok:true}` is a constant restatement, and the non-`/api` pass-through breaks the dev server on first load; `apiPlugin.routing.test.ts` already drives the middleware chain.
- `tests/tools/famous-curator/ui/components/PreviewPane.test.tsx` — DELETED FILE — both tests are render restatements of a presentational component (placeholder text present; `img.src` equals the prop).
- `tests/tools/utils/async/delay.test.ts` — DELETED FILE — drives fake timers to prove a promisified `setTimeout` resolves after its timeout; tests the platform.
- `tests/tools/utils/data/contentHash8.test.ts` — DELETED FILE — "is a pure function of the bytes" restates `createHash`; the `/^[0-9a-f]{8}$/` check is a format restatement.
- `tests/tools/utils/refactor/renderRefReport.test.ts` — DELETED FILE — a hand-built report asserted back field-by-field (golden shape of a dev-CLI serializer) plus a `typeof === 'string'` check.
- `tests/tools/galaxy-renderer/state/slices/appSlices.test.ts` — 5 of 14 tests — `fitProgressed`/`fitReportSet`/`fitStopRequested`/`extrasCountSet`/`autoRotateSet` are single-field RTK setters asserted back at themselves; the nonce bumps, the multi-field `fitStarted` reset and `sectionToggled`'s neighbour check stay.
- `tests/tools/utils/perf/formatReport.test.ts` — 3 of 22 tests — per-layer row duplicates the merged-row assertion, the `█` glyph is `shareBar`'s own test, and the floor-caveat case is the same floors-empty branch as "omits any floor line".
- `tests/tools/structures/buildStructures.test.ts` — 3 of 26 tests — four leading-zero `extractAbell` cases for one regex branch; kept A0007 and the S-prefix case, dropped A0013 / S0026 / "A 0085".
- `tests/tools/parsers/parseMcxc.test.ts` — 2 of 10 tests — second southern-dec row and "only blanks and comments" duplicate branches already covered by their siblings (fixture-byte coverage untouched).
- `tests/tools/parsers/parseMscc.test.ts` — 2 of 8 tests — same two duplicate branches (third positive-dec row, blanks-only input).
- `tests/tools/famous/buildFamousStars.test.ts` — 1 of 6 tests — `serializeGeneratedTable` asserted the banner literal, the import line and the typed-export line; the generated file is compiled by `tsc`, and the row shape is already pinned by the `seedToGeneratedRows` test.
- `tests/tools/galaxy-renderer/data/referenceGalaxies.test.ts` — 1 of 5 tests — "the Milky Way is imageless" restates a literal `null` in the table.
- `tests/tools/textures/colourMatchedImagerySource.test.ts` — 1 of 7 tests — "keeps identity fields and coverage from the primary" is a wrapper passthrough restated field-by-field.
- `tests/tools/famous-curator/ui/state.test.ts` — 1 of 18 tests — "initial state has nothing selected, default sliders" is a default-object restatement.
- `tests/tools/famous-curator/ui/components/GalaxyList.test.tsx` — 1 of 5 tests — "renders every entry with its primary name" is a render restatement; the curated/active/disk branches and the click handler stay.
- `tests/tools/famous-curator/ui/components/ParamSliders.test.tsx` — 1 of 6 tests — "renders all 5 controls + the Commit button" asserts that a form renders its own fields.
- `tests/tools/famous-curator/ui/components/MetadataForm.test.tsx` — 1 of 2 tests — "renders the three fields prefilled" restates the three `value` props.
- `tests/tools/famous-curator/ui/components/DiskOverlay.test.tsx` — 1 of 7 tests — "renders the SVG with the correct viewBox" restates `source.width/height` back as a string.
- `tests/tools/famous-curator/tmpSession.test.ts` — 1 of 2 tests — "sessionPath resolves under the OS tmpdir + famous-curator/" restates the literal the helper joins.
- `tests/tools/buildFontAtlas.test.ts` — 1 of 4 tests — "mentions both expected and actual dimensions" is an error-message restatement on top of two sibling throw-tests.
- `tests/tools/utils/cli/args.test.ts` — 1 of 4 tests — "returns true for each flag independently" duplicates "returns true for a flag present in argv".
- `tests/tools/utils/cli/ansiPalette.test.ts` — 1 of 3 tests — "exposes every colorizer the report needs" is an exports check that re-runs the enabled-wrapping assertion five times.

No `tests/helpers|fixtures|support` file was orphaned. Nothing under `tests/setup/`, `tests/conventions/`, `tests/visual/` touched.

## Kept-but-suspicious

- `tests/tools/mcpm-workbench/state/gridShapeOf.test.ts` — an exact four-key list, i.e. the classic registry restatement; kept only because its header names a drift no sibling catches (a field dropping OUT of the projection leaves `gridShapeKeyFor`/`watchSceneSaga` green).
- `tests/tools/galaxy-renderer/matcher/fitPlan.numericKeys.test.ts` — a runtime `typeof === 'number'` sweep, kept because the comment cites the real `dust`/`spriteDust` mixup that compiled fine under `keyof GalaxyParams`.
- `tests/tools/mcpm-workbench/gizmo/encodeGizmoHandleId.test.ts` — five tests whose titles spell out the `kind*100 + axis*10 + sign` arithmetic; kept as one case per tagged-union branch, but a reviewer could call it a constant table.
- `tests/tools/mcpm-workbench/state/gridSlice.test.ts` — seven near-identical "setter X clears importedBox" tests; kept because each setter is separate code that can forget, but it is an enumeration.
- `tests/tools/utils/perf/format{Report,RunSummary,Sweep,TierCompare,PageErrors}.test.ts` — 43 tests over a dev-only terminal report. Targeted rather than snapshotted, and each formatter repeats "emits no ANSI escapes" / "aligns the ms columns"; defensible per-function, heavy as a block.
- `tests/tools/flow-workbench/state/slices.test.ts` — "flips the flag immutably" three times over a hand-rolled reducer.
- `tests/tools/galaxy-renderer/data/buildExtraSpecs.test.ts` — "star counts are in [40000, 200000]" / "distances are in [26, 96]" restate the source's literal ranges; the determinism test is the load-bearing one.
- `tests/tools/galaxy-renderer/data/referenceGalaxies.test.ts` — "has eight entries with unique ids" still pins the count; only the unique-id half is structural, but the file forbids rewrites.
- `tests/tools/famous-curator/ui/components/ParamSliders.test.tsx` — the disables/enables-Commit pair is a `disabled={!canCommit}` passthrough split across two tests; kept as a real commit gate.
- `tests/tools/famous-curator/apiPlugin.routing.test.ts` — the `it.each` over five routes is a dispatch-table restatement; kept because "handler registered under a typo'd path" is exactly the copy-paste bug it names.

## Slow (slowest-20 members in this slice)

- `tests/tools/textures/colourMatchedImagerySource.test.ts` (5185 ms) — cut 1 test; still slow because two cases build real level-8 colour-offset canvases through sharp with per-pixel reference rasters. That cost IS the registration/seam behaviour being tested — the remaining six cases are each a distinct load-bearing branch, so the only way to make it fast is to stop testing the transfer.
- `tests/tools/galaxy-renderer/ui/sliderStatePaths.test.tsx` (4582 ms) — nothing cut. One test, and the cost is inherent: it mounts the whole ControlsPanel once per Hubble category and drives every slider, which is the only thing that catches a tip's declared store path drifting off its field.
- `tests/tools/utils/refactor/loadRefactorProject.test.ts` (3877 ms) — nothing cut. Deliberately loads the real src/tests/tools trees through ts-morph; the regression it names (the loader silently missing a whole tree) cannot be reproduced on an in-memory fixture, and every other refactor test uses in-memory projects precisely to stay fast.
- `tests/tools/utils/refactor/planExtract.test.ts` (2429 ms), `planDelete.test.ts` (2347 ms), `collectRefs.test.ts` (2248 ms), `detectPassthrough.test.ts` (1970 ms), `planRename.test.ts` (1375 ms), `resolveSymbol.test.ts` (1191 ms) — nothing cut across the seven. Their `SRC_GREP2`/`EXPORTS_TITLE` flags are false positives: the `toContain` calls read generated in-memory project text, not source files on disk. Each test drives a repo-mutating CLI on a seeded module graph and asserts the resulting files, so a wrong plan here silently corrupts the working tree. The cost is one `new Project()` per case (ts-morph's lib load), not the assertions.
- `tests/tools/famous-curator/routes/export.test.ts` (2104 ms) — nothing cut. Seven end-to-end export cases writing four real WebPs through sharp per run; each pins a different published artefact (both runtime tiers, recipe.source dims, the override index, re-export replacement, the square-deproject pair). The `EXPORTS_TITLE` flag is a false positive — "publishes BOTH runtime tiers" is a behaviour title, not an exports check.

</details>

<details><summary>Slice E_tools — pass 2</summary>

# Slice E_tools — second-pass deletions

13 files deleted outright, 53 files trimmed; **275 tests removed** (1585 → 1310 by the digest's
count; `vitest run tests/tools` now reports 320 files / 1334 tests, all green).

## Whole files

- `tests/tools/utils/perf/formatSweep.test.ts` — DELETED FILE — 6 layout assertions over a dev-only terminal table; the numbers it renders come from `median`/`percentile`/`scalingExponent`, which keep their own tests.
- `tests/tools/utils/perf/formatTierCompare.test.ts` — DELETED FILE — same: per-tier column alignment and a `—` placeholder, restated back at the formatter.
- `tests/tools/utils/perf/formatRunSummary.test.ts` — DELETED FILE — same: one row per scenario, verdict glyph, column alignment.
- `tests/tools/utils/perf/formatPageErrors.test.ts` — DELETED FILE — de-dup + "no ANSI escapes"; the de-dup is also asserted in `formatReport`.
- `tests/tools/famous-curator/ui/api.test.ts` — DELETED FILE — 8 mock-choreography tests on a `fetch` wrapper: stub `fetch`, assert it was called with the forwarded URL/method/body. `App.test.tsx` drives the real flow.
- `tests/tools/galaxy-renderer/state/createStore.test.ts` — DELETED FILE — "stores are isolated" / "seeds from preloadedState" restate `configureStore`.
- `tests/tools/scene-workbench/scene/resolveAssetUrl.test.ts` — DELETED FILE — a one-line wrapper over `dataUrl`; both tests are its two `if` arms spelled back.
- `tests/tools/mcpm-workbench/state/gridShapeOf.test.ts` — DELETED FILE — exact four-key projection list, i.e. the registry restatement the first pass flagged and kept.
- `tests/tools/mcpm-workbench/field/boxHalfExtentMpc.test.ts` — DELETED FILE — "halves each axis", one test for a one-expression helper.
- `tests/tools/utils/cli/args.test.ts` — DELETED FILE — `parseFlags` over `argv.includes`; all-false / one-true / ignores-unrelated.
- `tests/tools/utils/cli/ansiPalette.test.ts` — DELETED FILE — wraps-when-enabled / identity-when-disabled; the disabled arm is re-asserted by every formatter test that survives.
- `tests/tools/utils/math/sgToEq.test.ts` — DELETED FILE — second copy of a convention: `eqToSg.test.ts` already round-trips the pair and asserts length preservation.
- `tests/tools/utils/io/textureSources.test.ts` — DELETED FILE — "every family key has a surface source" is an is-defined sweep over a literal table; `rawDataRegistry.test.ts` holds the real path contract.

## Trimmed

- `tests/tools/utils/perf/formatReport.test.ts` — 17 of 19 — kept only the fps-ceiling/headroom arithmetic and the zero-median `n/a` guard; the other 17 pin header text, row order, share %, column alignment and glyphs.
- `tests/tools/parsers/parseStructureSeed.test.ts` — 14 of 19 — one-`it`-per-field validator enumeration on a hand-edited seed (empty id, empty names, non-string abell, non-string/empty commonName, each range bound); kept the bundled-file parse, one range check, duplicate-id, unknown-category and not-an-array.
- `tests/tools/parsers/famousStarsSeed.test.ts` — 14 of 28 — kept the null-vs-missing `gaiaDr3`/`hip` invariants, the HIP-alias agreement, the companion↔hip coupling, `names[0] === commonName`, the single-name regression and both real-seed sweeps; dropped the range/type enumerations (ra/dec/distancePc/temperatureK, magV/absMag, non-digit gaiaDr3, non-integer hip/companion, empty/duplicate companions, the `variable` quartet) and the array-passthrough test.
- `tests/tools/famous-curator/ui/cropMath.test.ts` — 17 of 34 — four corner helpers and four edge helpers walked the same anchored-square path with mirrored literals (kept SE+NW, E+N); also dropped rotateDelta's identity/−90/round-trip siblings, setRotation's in-range + field-passthrough, translateCrop's free-move/bottom-clamp/rotation-passthrough, `rescaleCrop` identity, `seedDeprojectCrop` at aspect 1 and `fitCropToSource`'s already-fits no-op.
- `tests/tools/buildPgcAliases.test.ts` — 10 of 24 — `normalizeDesignation` had 15 cases for ~5 branches; kept NGC (zero-strip), UGCA (prefix precedence), MESSIER (special case), PGC→null, 2MASX→null, MCG (sub-fields), empty→null and dropped IC/UGC/ARP/MRK/ESO/MESSIER001/PGC002789/IRAS. Also dropped `sortAliasNames` dedup (a Set restatement) and the body-less CSV case.
- `tests/tools/mcpm-workbench/state/gridSlice.test.ts` — 7 of 16 — six of the seven "setter X clears importedBox" tests (kept `fitBoxToCatalog`, the least obvious) and two of the three `setAutoFitPercent` clamp literals.
- `tests/tools/famous-curator/recipe.test.ts` — 9 of 18 — kept the round-trip, the version guard, the disk/source/margin round-trips and the tuple-shape reject; dropped the two-space-indent format check, `JSON.parse` restatement, per-field rejects (crop, alpha.gamma, radiusPx/paDeg, deproject) and three "absent field stays undefined" cases.
- `tests/tools/famous-curator/ui/state.test.ts` — 8 of 17 — dirty-flag and clear-on-select enumerations (`setGalaxies` populates, setCrop/setStarnet dirty, clearDisk, two more `selectGalaxy clears …`, `markProcessed clears disk dirty`, the markCurated clear-branch).
- `tests/tools/buildFilaments.test.ts` — 7 of 12 — `parseArgs` defaults and single-flag cases; kept both-orders (the `++i` off-by-one), the sorted cache prefix, all-four-flags, unknown-source and missing-value.
- `tests/tools/structures/buildStructures.test.ts` — 6 of 23 — `extractAbell` aName-when-present and both-blank siblings, the MSCC mirror of the z>Z_MAX drop, "abell is always null for MSCC" and the two category-byte restatements (every other test filters on `category`).
- `tests/tools/deploy/r2/allowDataFile.test.ts` — 5 of 15 — the five plain "accepts <name>" allow-list recitals; kept every reject/regex-branch case (tier suffixes, hashed names, `images/`, `meshes/` path scoping).
- `tests/tools/galaxy-renderer/state/engineBridge.test.ts` — 5 of 12 — pure forwarding cases (initial sync, galaxy→setParams, lod→setRender, compare insets 390/0, extras count); kept the nonce gate, the enable/disable asymmetry, the fitting-window forward, the fieldTuning reference gate, the DUST-pill outgoing-copy split and disconnect.
- `tests/tools/galaxy-renderer/state/slices/appSlices.test.ts` — 5 of 9 — single-field toggles/setters (`comparePanelToggled`, `extrasToggled`, `copyFeedbackSet`), `fitFinished`, and the second nonce-bump test.
- `tests/tools/curation/dedupeByProximity.test.ts` — 5 of 8 — inside/outside cases subsumed by the exclusive-threshold pair, plus input-order, empty-featured and empty-candidates.
- `tests/tools/parsers/wikipediaSummary.test.ts` — 5 of 11 — absent-image/missing-extract/missing-title defaults, the `JSON.parse` throw and the no-op URL encode.
- `tests/tools/utils/perf/shareBar.test.ts` — 4 of 6 — half/full/empty/NaN bars; kept the hand-computed eighth-block and the exact-width sweep (which covers NaN, negative and >1).
- `tests/tools/utils/math/makeConeFilter.test.ts` — 4 of 7 — centre/1°/3°/antipode, all subsumed by the 2.49-vs-2.51 boundary; kept the boundary, RA wrap and the polar-centre trap.
- `tests/tools/utils/math/makeDecBandFilter.test.ts` — 4 of 6 — inside-the-band, corners and the two single-axis rejects; the two edge tests already assert in-and-out on both axes.
- `tests/tools/utils/math/percentileOf.test.ts` — 4 of 6 — smallest/largest/median/above-max; kept the non-obvious "largest value ≤ query" rank and the below-min clamp.
- `tests/tools/deploy/r2/etagMatches.test.ts` — 4 of 8 — bare and quoted ETags (the `W/` case subsumes both), a different digest, and the empty-string twin of the null case.
- `tests/tools/flow-workbench/state/slices.test.ts` — 4 of 7 — "flips the flag immutably" ×2 and two field-replacement setters; kept the surgical param write and both clamps.
- `tests/tools/galaxy-renderer/data/buildExtraSpecs.test.ts` — 3 of 4 — `count` length and the two source-literal ranges; the determinism test is the load-bearing one.
- `tests/tools/utils/math/f16BitsToFloat.test.ts` — 3 of 5 — −Inf/NaN/zero patterns; `decodeIsmMapTexels` already pins that set against a scalar reference.
- `tests/tools/flow-workbench/state/store.test.ts` — 3 of 5 — initial snapshot, setState-replaces, subscribe-fires; kept the same-reference gate and unsubscribe.
- `tests/tools/utils/io/readIdSet.test.ts` — 3 of 6 — trim, CRLF and header-only.
- `tests/tools/mcpm-workbench/field/cullPointsToBox.test.ts` — 3 of 5 — the plain inside/outside case (subsumed by the dims−1 boundary), the passthrough fields, and the all-outside empty result.
- `tests/tools/mcpm-workbench/gizmo/encodeGizmoHandleId.test.ts` — 3 of 5 — translate/rotate/sign+1 rows of the `kind*100 + axis*10 + sign` table; kept the all-fields-nonzero case and `null → -1`.
- `tests/tools/parsers/common.test.ts` — 3 of 9 — `slot` mid-line and all-spaces cases, and the `--` comment sibling of `#`.
- `tests/tools/mcpm-workbench/ui/frameNeedsRender.test.ts` — 3 of 10 — two of the four sample-cap comparisons and a "path tracer OFF" case whose input is byte-identical to the all-quiet base case.
- `tests/tools/utils/perf/heatColor.test.ts` — 3 of 5 — three of the four band→SGR-escape literals.
- `tests/tools/parsers/famousSeed.test.ts` — 3 of 5 — accepts-present / accepts-omitted / non-string commonName.
- `tests/tools/famous-curator/starnet.test.ts` — 3 of 9 — env passthrough, the `starnet2` default, and mock-mode copyFile; kept the relative-weights-resolve landmine, the missing-weights throw, the mock branch and the argv contract.
- `tests/tools/mcpm-workbench/field/deriveGridBox.test.ts` — 4 of 10 — boot-default dims/voxel restatement, the rotation passthrough, the plain importedBox short-circuit (the V2 variant is stronger) and the above-the-floor no-clamp.
- `tests/tools/parsers/planetFactsSeed.test.ts` — 4 of 6 — not-an-array, missing id, missing wikiTitle, non-string field.
- `tests/tools/utils/perf/percentile.test.ts` — 2 of 6 — the odd-length and 90th-percentile siblings of the type-7 interpolation case.
- `tests/tools/utils/perf/budgetTone.test.ts` — 2 of 5 — the two in-band literals; the strict-`<` boundary pair is the load-bearing part.
- `tests/tools/mcpm-workbench/field/deriveAgentWeights.test.ts` — 2 of 7 — the odd-count median sibling and "median fill reaches the weights" (the normalisation test already covers the scale).
- `tests/tools/mcpm-workbench/field/renormalizeWeightMass.test.ts` — 2 of 4 — sums-to-TOTAL and preserves-proportions, both re-asserted inside the overlay-invariant regression test.
- `tests/tools/mcpm-workbench/render/effectiveVolpathDivisor.test.ts` — 2 of 5 — well-above-threshold and the already-at-floor no-op.
- `tests/tools/mcpm-workbench/sim/specializeGridElement.test.ts` — 2 of 5 — both f32 no-op arms (the same early return twice).
- `tests/tools/mcpm-workbench/gizmo/gizmoHandleGeometry.test.ts` — 2 of 6 — the ring-radius twin of the translate "box doubles" test and the axisDir passthrough.
- `tests/tools/mcpm-workbench/state/storeWriteIsDirty.test.ts` — 2 of 7 — identical-snapshot trivia and the generic "some other slice changed" fallthrough.
- `tests/tools/galaxy-renderer/engine/camera/orbitEye.test.ts` — 2 of 4 — the az=el=0 axis case and the rigid-translation passthrough.
- `tests/tools/galaxy-renderer/engine/camera/panAxes.test.ts` — 2 of 4 — unit-length and perpendicularity sweeps; kept the horizontal-right convention and the el=0 up vector.
- `tests/tools/galaxy-renderer/data/referenceGalaxies.test.ts` — 2 of 4 — the eight-entry count and the `Number.isFinite`/not-throw sweep; kept the on-disk image check and the viewLabel regression.
- `tests/tools/galaxy-renderer/data/randomGalaxyParams.test.ts` — 2 of 6 — the dust-ring absence restatement and "all four seeds are integers".
- `tests/tools/galaxy-renderer/matcher/dominantArmsAndElevation.test.ts` — 2 of 6 — the two `elevationFromQ` clamp-constant tests.
- `tests/tools/flow-workbench/engine/disposable.test.ts` — 2 of 4 — `track` returns its argument, and the dispose-branch case the idempotency test already drives.
- `tests/tools/utils/math/eqCartToRaDecDist.test.ts` — 1 of 3 — the +x axis (RA 0, Dec 0) case.
- `tests/tools/utils/math/applyMat3.test.ts` — 1 of 2 — the identity case.
- `tests/tools/utils/math/transpose3.test.ts` — 1 of 2 — the involution (true for any swap-based implementation); kept the column-major layout.
- `tests/tools/mcpm-workbench/sim/meanLogTraceAtPoints.test.ts` — 1 of 4 — "accepts a typed array the same way".
- `tests/tools/mcpm-workbench/state/catalogSlice.test.ts` — 1 of 5 — one of the two "a load clears statusMessage" tests.

No `tests/helpers|fixtures|support` file was orphaned. Nothing under `tests/setup/`, `tests/conventions/`,
`tests/visual/` touched; the four restored ratchets and `frameFilePurity` untouched.

**Note:** `npx prettier --write` over the slice glob reformatted 22 files I had not edited (pre-existing
drift); those were restored with `git checkout --` so the diff contains only intended deletions.

## Verification

- `npm run typecheck:fast` — clean (both projects).
- `npx vitest run tests/tools` — 320 files, 1334 tests, all passing, 13.5 s.

## Kept: 1310 tests in 320 files

The largest survivors keep their size because they are the KEEP categories. `tests/tools/parsers/desiFits.test.ts`
(20) and `famousStarsSeed.test.ts` (14) decode real fixture bytes / the committed seed — the contract with
upstream data. `tests/tools/fetch/fetchGaia.test.ts` (18), `fetchDesi.test.ts` (17) and `fetchTextures.test.ts`
(11) each drive a resumable multi-GB downloader: partial `.part` files, sha256 sidecar mismatches, retry/abort
and resume-against-a-different-partition are separate failure modes that silently corrupt a fetched catalog.
`tests/tools/galaxy-renderer/presets/presets.test.ts` (27) is one case per legacy preset shape on the wire —
every row is a distinct migration branch against files already committed to disk. `tests/tools/textures/
buildEarthTiles.test.ts` (14) and `tests/tools/meshes/buildMeshes.test.ts` (13) each pin a separate bake-output
invariant (underfill, band clamping, TILE_PREFIX drift; winding, pivot recentre, tangent handling), and the
mcpm/scene-workbench `*.parity.test.ts` files stay in full — they are the WGSL↔TS byte-layout home.

</details>
