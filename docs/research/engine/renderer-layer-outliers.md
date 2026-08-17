# Renderer & layer outliers — consolidation map

Snapshot 2026-08-17, from three exhaustive sweeps (39 `state.gpu` renderers, all
34 `ContentLayer`s, cross-cutting mechanism mining). Companion to
[current-contracts-map.md](current-contracts-map.md); this file ranks the odd
ones out and assigns each to a ladder rung per decisions.md #9/#10. Rule #10
applied throughout: an outlier is either evidence the family's row shape must
change for everyone, or an underlying-contract refactor that lands **before**
its family's rung so the row fits without a per-row exception.

## 1. Renderer families and their outliers

Four constructor families exist; the outliers are misfits per #10, not styles:

| family | norm (members) | outliers |
| --- | --- | --- |
| A. point-cloud/overlay `(device, targetFormat[, fadeBgl])` positional | filament, constellation, volumeField, starPoint, bodyGlint, starCatalog, orbitTrail, the 3 upsamples, bloomPyramid | `pointRenderer` (options-object + 3 BGLs + injectable buildRunner; handle named bare `renderer`); `flowField`/`horizonShell`/`milkyWayCloudRenderer` (object-init); `milkyWayCloudRenderer` (bespoke type, `drawStars`/`drawDust` instead of `draw`, the repo's only `layout:'auto'`) |
| B. swap-format overlays `(ctx: GpuContext, format, …)`, rebuilt by `buildSwapRenderers` | label, foregroundLabel, markerLine, foregroundMarkerLine, debugLine, selectionRing | `structureMarker` (ctx-shaped but rgba16float + not swap-coupled); `milkyWayPick` (ctx-shaped, no format param); `pickDebugOverlay`/`diskRadiusRing` (in the swap list but bare `(device, format)`); **`compositor` takes `swapFormat` at construction but is NOT rebuilt on swap change** — suspect, see §5 |
| C. foreground bodies `(device, format, depthFormat, reversedZ)` | star, planet, earth, texturedBody, ring, cloudShell | `atmosphereShell` (5th param table + compute entry point); `bodyPick` (formats hard-coded, 2 params); `earth` (third non-slot ingest: `setTileResources` from runFrame) |
| D. multi-item `upload(id, x)` / `unload(id)` | pointRenderer, volumeFieldRenderer | `starCatalogRenderer` (`upload` **no `unload`** — eviction path absent); `texturedBodyRenderer` (`setMap`/`clearMap` verbs, id repeated in `draw`); `atmosphereShell` (item set baked at construction) |

Construction-order dependencies (rung 1's risk register): everything hangs off
five engine-core prerequisites (`fadeBgl`, `sourceBgl`, `focusBgl`,
`focusUniform`, `uiCtx`+`fontAtlases`); exactly **one** renderer→renderer edge
(`starCatalogPickRenderer ← starCatalogRenderer.pickResources()`, initGpu:499);
two post-construction attachments (`biasCorrection.attachRenderer`,
`labelDirector.attachRenderers` — the latter re-runs on every swap rebuild).

Teardown anomalies (rung 1 inputs): `fadeBgl`/`sourceBgl`/`focusBgl` are never
destroyed or nulled; `timingService` is the only handle **re-assigned** (to a
disabled stub) instead of nulled; the 8 swap renderers have a **second**
teardown site inside `buildSwapRenderers`; 6 handles lack the `label` field the
`Renderer` type family carries.

## 2. Layer norms and their outliers

Norms (majority behaviour): pure `enabled()` gate; `draw()` records only;
uploads happen in runFrame planners or slot commits; shared liveness derivation
where ≥2 layers share a gate.

- **`enabled()` purity violations (2)**: `fieldStarSphereLayer` runs the
  nearest-star query in `enabled()` and stores it for `draw`/`drawPick`
  (`:217-238`); `foregroundLabelsLayer` inverts it — `draw` writes caption
  envelope state its own `enabled` reads back (`:597-634` → `:275`), plus
  calls `scheduler.requestRender()` from inside `draw` (`:810`).
- **Uploads inside `draw` (4)**: starPoints (`setStars` per frame, justified by
  rebasing header), foregroundLabels (`setLabels` + `setLines`),
  clipPathDebug (`setLines`), starCatalog (`prepareStarCut` mutates fade state
  + streams — memoised per ctx, pick path deliberately re-advances ramps).
- **God-layers**: `starCatalogLayer` 983 LoC (owns `starCatalogVisible`,
  `prepareStarCut`, stream SoA; two sibling layers import their `enabled` from
  it — a layer importing a layer); `foregroundLabelsLayer` 812 LoC (a private
  re-implementation of the label director: production, declutter, envelope,
  wake, two renderers). Median layer ≈ 100 LoC.
- **Copied gates**: the `foreground:0` triple (handle ∧ `FOREGROUND_MAX` ∧
  non-empty) hand-repeated in ~8 layers — confirming decisions.md #7's
  step-level-gate ruling; sub-pixel cull recomputed ×3; origin-distance
  `Math.hypot(ctx.drawCamPos…)` inline in ≥10 layers.
- **Pick divergences (all deliberate, now inventoried)**: milkyWay narrower
  (min-distance floor); planets/bodyGlints/starPoints wider (caption stamps,
  flat∪textured); pointSprites re-implements its gate inside `drawPick`;
  texturedBodies delegates pick to a sibling row.

## 3. Fade consumption — the canonical path lost

`resolveLayerOpacity` (opacity × recession × clip) has **3** users in the whole
repo (filaments, orbitTrails, volumeLiveness). Five more call
`fades.opacityOf` raw — skipping recession and the clip channel — including
`flowFieldLayer`, which is a structural copy of `filamentsLayer` *minus* the
canonical call. Registered handles with **no consumer**: `proceduralDisks`,
`texturedDisks`, `structureRing` (structureMarkersLayer admits it in a
comment), `starCatalogLabel`, `bodyLabel` — meaning those layers are invisible
to tour/clip hide-intents that scripts against their keys. A dozen layers have
no fade handle where one plausibly applies (horizon shell, both selection
rings, rings, cloud/atmosphere shells, bodies).

## 4. Recurring mechanisms (the patterns)

1. **Reduced-res accumulate → upsample, ×3 — copy-paste confirmed.** The three
   upsample layers' `draw` bodies are the same two statements; a shared
   primitive needs exactly `{name, slab, sourceTargetId, handleKey, enabled}`.
   The two pass factories differ only in shader-import path, labels, and type
   name (`additiveUpsample` already serves two instances). The
   downscaled-viewport derivation is a **verbatim triplicate** including its
   rationale comment. Registration cost per instance today: ~10 hand-edit
   sites.
2. **Fullscreen triangle, ×5 + a second implementation.** Byte-identical
   vertex bodies in additiveUpsample/starAggregateUpsample/compositor/bloom,
   plus `lib/fullscreenTri.wesl` implementing the same primitive differently;
   `bloom/io.wesl`'s header claiming the shared one "is the tool's" is stale.
   `VSOut` duplicated ×5.
3. **Composite vs upsample = two mechanisms for one job.** The compositor
   already models additive-into-hdr and its header claims this unification;
   the upsamples can't ride it because of the nearest-sampler assumption and
   the documented single-uniform-buffer race (`compositor.ts:44-53`) — both
   named, fixable blockers if unification is ever wanted.
4. **Grow-on-demand instance buffer, ×7+ copies** — while
   `instancedQuadRenderer`'s parameterized `capacity` config already exists.
   Varies: stride, label, usage, count unit, overflow policy. Classic
   extract-one-helper.
5. **Uniform packing**: `writeCameraPrefix` is the success story (16
   consumers); the 16-byte fade scratch is duplicated ×4 (one comment admits
   "same shape as filamentRenderer's"); `structureMarkerRenderer` re-declares
   the dummy-fade pair the shared `createDummyFadeBindGroup` provides.
6. **Compute→renderer**: the `COMPUTE` record is a working primitive (2 rows,
   uniform shape, gates inside the encoder). Odd ones out: MW v1 cloud
   generation (own encoder/submit + the hand staleness `if` — rung 3's
   canonical case); v2 placement is **not wired in src at all** (tool-only —
   Track B territory, as expected).
7. **Streaming/LRU**: substrate is shared, but `hiResFamousSubsystem`
   **bypassed it** and re-implements in-flight/failure/evict bookkeeping
   (header admits it), and there are two LRU implementations differing only in
   victim policy.
8. **Per-draw bind-group rebuild** (resize safety): 5 copies of the same
   comment + code; genuinely fine as an idiom, but the copies would collapse
   with the upsample scaffold (item 1).

## 5. Bug-suspects surfaced (verify before or during the relevant rung)

- **`compositor` not rebuilt on swap-format change** — takes `swapFormat` at
  construction, absent from `buildSwapRenderers`; `applySwapFormat` rebuilds
  targets + 8 overlays and leaves the compositor's baked blend→dstFormat
  table untouched. Either dead parameter or a real HDR-toggle bug.
- **`fieldStarSphereLayer` has no `FOREGROUND_MAX` gate** — the one
  `foreground:0` row without it; looks like omission, not choice.
- **Dead ingest surfaces**: `PointRenderer.unload`, `FilamentRenderer.clear`,
  `handle.volumes.add` — zero production callers each.
- Stale shader-tree docs (bloom/io header; `additiveUpsample.ts` "two
  subsystems" comment).

## 6. Ladder assignments

| finding | #10 classification | lands in |
| --- | --- | --- |
| Constructor family divergence (§1 A–C) + teardown anomalies + order edges | underlying-contract normalization feeding the row shape: uniform `construct(deps)`, shared prerequisites stay engine-core | **rung 1** (the plan must include ctor normalization or the rows inherit the grab-bag) |
| Aggregate→upsample scaffold ×3 + fullscreen-tri ×5 + per-draw-BG copies | underlying contract: one "derived target + upsample pair" primitive; shapes the target row | **rung 2** (grows: target contribution + paired upsample primitive + shader dedup) |
| MW cloud generation staleness `if`; earth `setTileResources` third ingest | the canonical `generated` / `streamed` artifact cases | **rung 3** |
| Multi-item ingest divergence (§1 D: no-unload, set/clear verbs) + volume ingest ×3 | underlying ingest-API normalization (`upload/unload` as the family verb pair) | **rung 4** (widened from volumes-only to ingest normalization) |
| Fade consumption (§3): canonical path, raw `opacityOf` users, dead handles, missing handles | underlying-contract refactor of the *consumption* side, beyond the FADE_ROW derivation question | **rung 7** (widened: "fade path canonicalization") |
| foregroundLabels private director + structureMarkers shadow path + clipPathDebug bypass | underlying contract for `markerProducers` / director unification | **new rung 8** (not needed for Track C; sequence after) |
| `foreground:0` gate ×8 | already ruled: step-level gate (decisions #7) | rides rung 2 or the eventual frame-step work |
| Grow-buffer helper ×7, fade-scratch ×4, dummy-fade copy, hypot ×10, sub-pixel ×3 | pure hygiene, no contract change | **hygiene basket** — one small PR anytime, or opportunistic within rungs that touch the files |
| `starCatalogLayer` / `foregroundLabelsLayer` god-layer splits | worthwhile but not contract-blocking | backlog; foregroundLabels split falls out of rung 8 |
| hiResFamous substrate bypass + dual LRU | streamed-substrate consolidation | backlog (or ride rung 3's streamed work if cheap) |
| §5 bug-suspects | verify-first (multiple-sufficient-causes rule) | attach to the rung touching each area; compositor check is cheap and early |
