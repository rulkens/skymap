# The `milkyWay` Layer — design spec

Parent: [`2026-09-09-layer-composition-design.md`](../2026-09-09-layer-composition-design.md) §10, the
`milkyWay` settings-only stub. Everything the parent says about the `Layer` contract,
`createLayers`, fades and selection rows holds unless this spec says otherwise. The shape
follows the precedents set by
[zoneOfAvoidance](2026-08-13-zone-of-avoidance-guide-layer.md) and
[starCatalog](2026-09-21-star-catalog-layer-design.md).

## 1. What this is

`src/layers/milkyWay/` grows from a settings-only stub into a Layer that owns the **v1
sprite Milky Way**. That means:

- its GPU handles, its three passes and their liveness gate;
- the `mw-aggregate` render target;
- the star-count reconcile;
- both fade rows, the label, the selection row and the detail cards;
- the DebugPanel tuning section, the tier re-seed saga and the source row.

Core stops naming the Milky Way everywhere except the closed unions and per-kind tables
listed in §4, which stay in core just as they did for zoneOfAvoidance and blackHoles.

**This change is behaviour-neutral** apart from one accepted difference (§5): the image, the
tuning, the fades, picking, the InfoCard and the tier re-seed all stay the same.

**Out of scope:** the v2 analytic field. The brainstorm first covered v1 and v2 side by side,
and the user cut the scope on 2026-09-25 to "v1 to a layer, pick up v2 later". The rulings and
the joints that v2 needs are parked in
[`docs/backlog/2026-09-25-milky-way-v2-field-in-layer.md`](../../../backlog/2026-09-25-milky-way-v2-field-in-layer.md).
This spec must not pre-build any v2 seam.

## 2. Ground preparation

**None is needed, because every v1 touchpoint already has a Layer seam.** Refactor-ground ran
on 2026-09-25. It sent two Explore traces over the v1 core ties and the frame program, and ran a
greenfield cross-check. Its verdicts:

| Touchpoint | Verdict | Seam and precedent |
|---|---|---|
| 4 GPU handles (`gpuHandleRegistry.ts:180-213`, `engine.ts:161,188-192`) | growth | Runtime via `create`/`destroy` (starCatalog `aggregateUpsample`) |
| `runFrame.ts:101` `milkyWayCloud?.reconcile(starCount)` | growth | a `once` planner (flow's `flowPlanner`) plus a `{kind:'plan'}` line |
| `milky-way-aggregate`, `milky-way-upsample`, `milky-way` passes and pick | growth | `passes`; `pickProgram` takes composed passes (starCatalog `drawPick`) |
| `mw-aggregate` row (`renderTargets.ts:150-156`) | growth | `targets`, with `scale: (state) => state.settings.milkyWay.aggregateDivisor` |
| 2 fade rows (`fadeLayers.ts:27-31,46-50`) | growth | `fades` (ZoA `zoneOfAvoidanceFadeRows`) |
| label producer (`engine.ts:330-333`) | growth | `guides.screenLabels` on COSMO (galaxyCatalog `famousLabels`) |
| selection row (`coreSelectionRows.ts:15`) | growth | `selection` |
| detail cards (`detailCardTable.ts:75`) | growth | `ui` `detailCard` slot (ZoA, #811) |
| DebugPanel section (`DebugPanel.tsx:27,76`) | growth | `ui` `debug` slot |
| `watchTierSaga.ts:42-44,71` starCount re-seed | growth | a Layer saga. The saga carries no per-layer list; this is its only MW term |
| source row `data/sources/milky-way.ts` | growth | `sources` (ZoA, starCatalog) |

**One hidden joint is handled inside the PR, not as prep.** The tool imports
`MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE` from `milkyWayCloudRenderer.ts`
(`tools/galaxy-renderer/src/engine/sprites/{createCloudPipelines,packCloudUniforms}.ts`).
That constant moves to `src/data/milkyWay/` in the PR's first commit, so the renderer can move
into the Layer without the tool importing from `src/layers/`.

## 3. The Layer folder

The file names come from what core calls these files today. Each move uses
`npm run move-files`, and tests follow along into the mirror under `tests/layers/milkyWay/`.

```
src/layers/milkyWay/
  layer.ts                 defineLayer({ name:'milkyWay', settings, sources, targets:[MW_AGGREGATE_TARGET],
                           create, destroy, planners, passes, fades, guides, selection, sagas, ui })
  create.ts / destroy.ts   the 4 handles: pickRenderer, cloud, cloudRenderer, aggregateUpsample
  frame.ts                 milkyWayPlanner: runtime.cloud.reconcile(settings.milkyWay.starCount)
  @types/MilkyWayRuntime.d.ts  MilkyWayPickRenderer.d.ts  MilkyWayCloudDrawArgs.d.ts
  passes/  milkyWayAggregatePass.ts  milkyWayUpsamplePass.ts  milkyWayPass.ts
  present/ milkyWayCloudLiveness.ts  milkyWayFadeRows.ts  produceMilkyWayLabel.ts
           milkyWaySelectionRow.ts
  render/  milkyWayAggregateTarget.ts  milkyWayCloudRenderer.ts  milkyWayPickRenderer.ts
  sagas/   reseedMilkyWayStarCountSaga.ts   (setTier → setMilkyWayTuning({ starCount }))
  sources/ milky-way.ts  milkyWaySourceRows.ts
  state/   (as today)
  ui/      MilkyWayTuningSection.tsx  MilkyWayTuningSectionContainer.tsx
           formatMilkyWayTuningDefaults.ts  MilkyWayDetailCard/  CompactMilkyWayCard/
```

Where a file ends up follows one rule: **it moves only if every remaining importer is inside
the Layer or in `tests/`.** The plan confirms this per file with `npm run refactor -- refs`.
Files that still have a core or tool reader stay where they are:

- `milkyWayFadeAlpha`, which `horizonShellFadeAlpha` and the tool also read;
- `milkyWayInfo`, because core's `buildFocusable` imports it;
- `milkyWayLabelStyle`, if a core reader remains;
- the whole of `galaxyGenerator/v1/`, which the tool shares and whose README pins it;
- shaders, by the Layer rule.

## 4. What stays in core

Each of these is an existing per-kind arm, the same kind zoneOfAvoidance and blackHoles left
behind. None of them is a new special case:

- **Fade and visibility unions:** `FadeId`, `fadeRegistry.ts:72`, `VisibilityLayerKey`,
  `LabelLayerId`, `visibilityLayerRows.ts`, `visibilityActionRow.ts`,
  `scopedVisibilityActions.ts` and `fadeIdToVisibilityKey.ts`. The keys `{kind:'milkyWay'}`,
  `milkyWayDisk` and `milkyWayLabel` are unchanged, because tours and clips script them.
- **Selection per-kind records:** `refOf`, `buildFocusable`, `targetIdentityKey`,
  `selectionHaloTable`, `rowFocusable`, `urlHashFor`, `focusFraming`, `selectionKinds`, and the
  palette's `paletteRows`, `actionForRow` and `rankPaletteMatches`.
- **The label toggle.** `LABEL_HOME_BY_SOURCE_TYPE.milkyWay` and
  `LabelHomes.milkyWayLabelEnabled` stay in the label-category registry, the same as
  starCatalog's.
- **Hand-authored frame tables:** the `FRAME_ORDER` lines in `frameSections.ts` (`:138`,
  `:175-176`, plus the new `{kind:'plan', name:'milky-way'}`) and `passGroupTitles.ts:22`.
- **Settings types:** `MilkyWaySettings.d.ts` and `MilkyWayTuning.d.ts` stay under
  `src/@types/settings/`, because core's settings root reads them.

## 5. Behaviour changes (accepted)

1. **Label tiebreak (user-accepted 2026-09-25).** Layer screen-label producers register after
   core's (`engine.ts:324-326`). When prominence is equal, the Milky Way label now loses the tie
   to `structureLabels` and to every earlier label producer, including the galaxyCatalog Layer's
   `famousLabels`. This is checked by eye at the Milky Way scale.
2. **Reconcile timing.** The star-count reconcile moves from `runFrame.ts:101` (before
   `deriveFrameContext`) to plan time. The cloud regenerates on the same frame either way,
   because once-plan rows run before any encode. `runFrame.test.ts:~880-910` moves with it.

## 6. Deletions

- **From the core registries:** the three names in `CONTENT_PASSES`
  (`passes/index.ts:9-11,44-46`), four `GPU_HANDLE_ROWS`, four `EngineGpuHandles` fields and
  their null seeds, the `mw-aggregate` core target row, two `FADE_LAYERS` rows,
  `coreSelectionRows` `milkyWay`, `CORE_DETAIL_CARDS.milkyWay`, the `DebugPanel.tsx` section,
  and the `cosmoLabelDirector` registration.
- **Allow-rows:** `layerImportBoundary.test.ts`'s `state/tier/watchTierSaga` row, which the test
  itself says to delete once the Layer forms, and the two `frameFilePurity.test.ts` budget rows,
  which re-key to `layers/milkyWay/passes` as needed.
- **Stale text:** the `src/layers/README.md` Status line and `slices.ts`'s "settings-only" header.

## 7. Testing

- **Tests that pin core locations move with the files:** `milkyWayPass`,
  `milkyWayCloudLiveness`, `produceMilkyWayLabel`, `InfoCard.milkyWay`, `watchTierSaga` (its
  re-seed half becomes the Layer saga's test), `coreSelectionRows`, `fadeLayers`,
  `renderTargets` and `gpuHandleRegistry`.
- **Fixtures that poke `state.gpu.milkyWay*`** change to the Layer runtime:
  `renderFrame.test.ts`, `renderFrame.timing.test.ts`, `runFrame.test.ts`, `passes.test.ts`,
  `bootstrap.test.ts` (whose sample handle becomes a different core handle),
  `initGpu.hdrCapabilityWiring.test.ts`, `wireInput.test.ts`, `renderFrameSplitBaseline.test.ts`
  and `makeCameraSimHarness.ts`.
- **No new tests beyond the moves.** Boot-time uniqueness (`createLayers` pass names) and the
  frame-order walker already catch a half-migrated row, and this port adds no logic. The one
  exception is the Layer saga: it gets the re-seed assertions that `watchTierSaga.test.ts:123-133`
  carries today.
- **Gates:** `npm test`, `npm run typecheck`, `npm run build` (for the `?static` shader
  specifiers), and a `grep` for the old paths.
- **Eye-check (user):** the Milky Way at boot, the approach fade on the way in to the Galactic
  Centre, pick → InfoCard, the DebugPanel tuning sliders, a tier change re-seeding the star count,
  and the label tiebreak.
- **`npm run perf` is not run.** Nothing about the draw changes. Per `measurement.md`, the MW
  frame noise (±3 ms) is too large to read a neutral move from.

## 8. Docs to update in the PR

- `src/layers/README.md` Status: `milkyWay` becomes formed.
- `docs/RENDERER.md`: fix any path it gives for the three passes, the target or the renderers.
- `galaxyGenerator/v1/README.md` "Flow (app side)": the handle construction now lives in
  `src/layers/milkyWay/create.ts`.

## 9. Definition of done

- Every row in §6 is deleted and every file in §3 is placed.
- The suite is green, typecheck and build are clean, and CI is green.
- The user's eye-check has passed.
- `/feature-done` has run: the deletion audit, plus the plan and spec moved to `completed/`.
