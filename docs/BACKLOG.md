# Skymap Backlog

Pickup-able work + surfaced issues. The git log is ground truth for _what shipped_; this file is ground truth for _what's next_. Shipped work is deleted from here and lives in `plans/completed/` + `specs/completed/`.

**Format.** Items are grouped by **subsystem area** and tagged by readiness:

- `ready` — design is done; pick it up now.
- `needs-design` — brainstorm/spec it first.
- `deferred` — paper-trailed, lower priority.
- `manual` — a human smoke-test, not code.
- `process` — awaiting a human action (review, write-up).
- `blocked` — external dependency.
- `needs-verification` — a data/API fact must be confirmed before it can be spec'd.
- `awaiting-decision` — a choice only a human can make blocks the next step.

Items with a **→ details** link have a full write-up in [`backlog/`](backlog/) — the problem, verified current state with `file:line` evidence, and options — ready to promote into a spec/plan.

**Lifecycle.** This file lists only _unstarted_ work.

- **Picking up an item removes it — same change.** The moment you start it, whether you implement it directly or write a spec/plan from it, delete its index line **and** its `docs/backlog/<date>-<slug>.md` detail file in that same commit/branch. The detail file's content seeds the spec; once it exists, the spec/plan is the source of truth, not the backlog.
- **Never strike through.** No `~~done~~` lines — delete the item. The completion record is the git log + `plans/completed/` + `specs/completed/`, never a crossed-out backlog entry.
- **Belt-and-suspenders:** `/feature-done` sweeps `BACKLOG.md` + `docs/backlog/` for the shipped feature when a plan completes, and a periodic verify-against-code audit (like 2026-06-29) catches anything the discipline missed.

---

## ADR status

| ADR                                                                                    | Status                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001 — Fade ownership](adrs/0001-fade-ownership.md)                                   | Accepted 2026-05-27 · **shipped** — fade is a subsystem; the visibility-seam plans (A/B/C, #309) landed and are in `*/completed/`.                                                                          |
| [0007 — Intent-centric state + effects](adrs/0007-intent-centric-state-and-effects.md) | Accepted 2026-06-17 · folding incrementally — selection (#350), settings→RTK (#345), camera (#357), engine slice (#380) shipped; effects vehicle decided in [ADR 0008](adrs/0008-effects-layer-vehicle.md). |
| [0008 — Effects-layer vehicle](adrs/0008-effects-layer-vehicle.md)                     | Accepted 2026-06-30 · records the shipped vehicle for ADR 0007's effects layer — `typed-redux-saga` over `redux-saga`.                                                                                      |

---

## Engine & State

- [ ] **Focusable-kind registry** `needs-design` — a focusable/selectable kind is smeared across ~10 per-kind dispatch tables (pick, selection row, framing, halo, URL); consolidate into one descriptor + registry, sibling to the subsystem-bundle work. → [details](backlog/2026-08-17-focusable-kind-registry.md)
- [ ] **`earthFlyout` stalls the recorder's virtual clock** `needs-debug` — intermittent; the page runs rAF on real time while the granted virtual budget never elapses, with zero requests in flight. → [details](backlog/2026-07-31-earthflyout-virtual-time-stall.md)
- [ ] **Source-registry factory** `needs-design` — auto-generate fetcher + slot + UI rows from a single `SOURCE_REGISTRY` entry; today each source is hand-wired across `slots/`, `assetWiring.ts`, `initGpu`. → [details](backlog/2026-06-29-source-registry-factory.md)
- [ ] **Point-source double registration** `needs-design` — every galaxy source is registered twice: real construction in `GALAXY_CATALOG_SOURCE_REGISTRY`, a second stub row in `ASSET_WIRING` purely for demand+req. → [details](backlog/2026-08-20-point-source-double-registration.md)
- [ ] **GPU-handle nullability follow-on** `deferred` — `EngineGpuHandles` fields are all `T | null` (a transient bootstrap fact as a perpetual null-check); narrow into a non-null "ready GPU" view and shed `PassDeps`' renderer fields. → [details](backlog/2026-06-29-gpu-handle-nullability.md)
- [ ] **`useStructureMemberCount` honest invalidation** `deferred` — the hook's `sourceCounts`/`tier` args are memo tripwires for live GPU catalog state; swap for a real catalog-generation signal. → [details](backlog/2026-06-29-usestructuremembercount-invalidation.md)
- [ ] **Asset-loading audit + debug UI sweep** `needs-design` — inventory what loads/stays resident (`release` exists for body textures only), add eviction where it pays; redesign the flat one-row-per-slot `AssetLoadingSection`. → [details](backlog/2026-07-22-asset-loading-audit.md)
- [ ] **Fold `hiResFamousSubsystem` into the shared streamed-asset LRU substrate** `needs-design` — it bypasses the shared streaming substrate and re-implements in-flight/failure/evict bookkeeping; two LRU implementations differing only in victim policy. → [details](backlog/2026-08-20-hires-famous-lru-substrate.md)
- [ ] **Derive `BULK_CATALOG_CATEGORIES` from a registry flag** `deferred` — add `hasBulkCatalog` to `SOURCE_REGISTRY` rows so the hand-listed `['cluster','supercluster','void']` in `assetWiring.ts` derives from it. Keep the three category lists (UI / marker / bulk-fetch) separate — membership genuinely differs. (`bearsMarker` + `DEFAULT_CATEGORY_VISIBILITY` already shipped.)
- [ ] **Scale-gated asset demand** `needs-design` — boot fetches catalogs invisible at the current camera distance, ~68 MB of ~101.7 MB drawing nothing at the Earth boot view. → [details](backlog/2026-07-24-scale-gated-asset-demand.md)
- [ ] **Near-field stars are bodies in the data layer, a star catalog in the registry** `needs-grill` — one source, three domains disagreeing; the Sun carries two source codes and only one of them can be picked. → [details](backlog/2026-07-29-near-field-stars-body-vs-star-domain.md)
- [ ] **`famous_stars_meta.json` demands unconditionally at boot** `ready` — 118 KB on every visit for a sidecar only the InfoCard reads; give the slot a lazy demand predicate like `pgcAlias`'s one-shot `paletteOpened`.
- [ ] **Bundle-declared fade rows — does union totality still force dead placeholders?** `needs-design` — forward-looking question for when `FadeLayer` rows become bundle-declared; today's totality requirement already forces no-consumer rows. → [details](backlog/2026-08-20-fade-row-totality-question.md)
- [ ] **`scaleFadeBands.ts` comment glued to the wrong constants** `ready` — the shared backdrop-band shape comment sits above the R₀ comment, while `BACKDROP_FULL_AT_EXTENT_MULTIPLE`/`BACKDROP_GONE_AT_EXTENT_MULTIPLE` below it are uncommented.
- [ ] **`LAYER_GROUPS.labels` totality is unchecked** `ready` — a new label layer must be hand-added or the `'labels'` aggregate silently skips it; near-missed twice while the body/star label layers landed.
- [ ] **Two `FocusBoundEffect` switches swallow new kinds** `ready` — `clipFociReady` and `stubResolveClipFoci` dispatch through a silent `default:` instead of `compileClip`'s `never` guard, so adding `spinToId` compiled clean while both ignored it (premature ready → crash; `tour-length` throw).
- [ ] **Font atlas load blocks `initGpu`** `needs-design` — the ~297 KB Cormorant fetch is awaited before every renderer + catalog fetch in `initGpu` starts; make label rendering tolerate a missing atlas instead. → [details](backlog/2026-07-24-font-atlas-blocks-initgpu.md)
- [ ] **Direct `slot.load()` sites bypass the asset queue** `needs-design` — five call sites fetch outside the bounded queue, so `ASSET_QUEUE_CONCURRENCY` is not the system-wide bound it reads as. → [details](backlog/2026-07-24-direct-loads-bypass-asset-queue.md)
- [ ] **Sidecar-meta getters sit on `EngineState`** `ready` — `famousGalaxiesMeta` is loaded data delegating from a top-level key; move it onto `GalaxyStore` (and the star twin onto the body store). → [details](backlog/2026-07-30-meta-getters-belong-on-the-data-stores.md)
- [ ] **Companion-asset relation has three homes** `needs-design` — "famousGalaxiesMeta rides Famous" is authored as a registry list, a demand predicate, and a rank integer. → [details](backlog/2026-07-24-companion-asset-relation-three-homes.md)
- [ ] **`?` query gates have no owner** `ready` — four gates read through five helpers at four moments, twice during render; collapse into a `URL_GATES` table seeded into `preloadedState`. → [details](backlog/2026-07-29-url-gates-registry.md)
- [ ] **Twin selection request sagas** `ready` — `watchRequestFocusSaga`/`watchRequestSelectSaga` are structurally identical; fold into one row-driven saga (keep `takeLatest` per row). → [details](backlog/2026-07-29-twin-request-selection-sagas.md)
- [ ] **Focusability double-encoded** `needs-design` — `ROW_FOCUSABLE` and `focusFraming`'s throwing arm both encode "no focus target", unchecked against each other; root cause is `SelectionRow` can't express "no position". → [details](backlog/2026-08-17-focusability-double-encoded.md)
- [ ] **`uiSlice` does boot I/O at module load** `needs-design` — `initialState = buildInitialUiState()` reads `window.location` + localStorage on import; make the fallback lazy. → [details](backlog/2026-07-29-uislice-module-load-boot-reads.md)
- [ ] **URL seam is a `window` singleton** `needs-design` — the whole test suite shares one address bar; make the URL port a registered capability. → [details](backlog/2026-07-30-url-seam-window-singleton.md)
- [ ] **`glade-points` throws "Maximum update depth exceeded"** `needs-repro` — React update loop seen once; the 500 ms heartbeat is the suspect but nothing on that branch touches the loading path. → [details](backlog/2026-07-30-glade-points-update-depth-exceeded.md)
- [ ] **Fades pop instead of ramping after the render loop idles** `ready` — `fadeRegistry.fadeTo` stamps the ramp's start from the stale last-_rendered_-frame time, not a live clock. → [details](backlog/2026-08-20-fade-pop-after-idle.md)
- [ ] **Liveness guards accept `undefined`; `NaN` alpha class in fixtures** `ready` — `zoneOfAvoidanceLiveness.ts`'s `=== null` guard lets `undefined` slip through, and `focusBlend`-omitting fixtures produce silent `NaN` alphas. → [details](backlog/2026-08-20-liveness-undefined-guards.md)
- [ ] **`createTieredScfdFetcher` factory** `ready` — the Edenhofer dust fetcher will be the third hand-copied tiered-SCFD fetcher (after `mcpmFetcher` and polyphorm's); collapse the three into one `createTieredScfdFetcher(baseName)` factory on next touch.

## Rendering

- [ ] **Layer blend is declared twice** `needs-design` — `ContentLayer.blend` and the pipeline's `GPUBlendState` restate each other with nothing tying them; parity wants `blendStateOf` threaded through every renderer. → [details](backlog/2026-07-31-layer-blend-declared-twice.md)
- [ ] **Frame-assembly walker needs blend-legality + target-format-parity validation** `needs-design` — `ContentLayer.blend` is advisory and render-target formats are hand-matched at construction; neither is checked against the baked pipeline. → [details](backlog/2026-08-20-frame-assembly-blend-format-validation.md)
- [ ] **`MilkyWayTuning` is one flat bag** `needs-design` — eight sprite knobs shared by consumers that ignore nearly all of them; a third radiance contributor is the second special case. → [details](backlog/2026-07-31-milkyway-tuning-is-one-flat-bag.md)
- [ ] **`CaptionKind` shadows the label-bearing registry** `deferred` — the union is still hand-typed, but it was never 1:1 with `bearsLabel`, so deriving it needs a new registry flag rather than a filter. → [details](backlog/2026-07-29-caption-kind-shadow-registry.md)
- [ ] **Multi-star sphere presence** `deferred` — the field-star sphere is one-at-a-time (nearest wins); a Gaia-resolved double a few AU apart would leave the companion sprite-retired with no body. → [details](backlog/2026-07-21-multi-star-sphere-presence.md)
- [ ] **Saturn ring brightness** `ready` — the ring reads too dim next to the new limb-darkened disc; retune ring albedo/exposure (surfaced in the planet-atmospherics per-body visual pass).
- [ ] **`AtmosphereParams.sunIrradiance` is a named pad** `ready` — byte 92 exists to fill `camPosLocal`'s tail; no fragment reads it, yet nine rows author it. → [details](backlog/2026-08-18-atmosphere-sun-irradiance-named-pad.md)
- [ ] **`foreground:0`'s alpha is doing three jobs** `needs-design` — the shell and ring write premultiplied rgb into a straight-alpha composite, and one alpha cannot dim the starfield chromatically. → [details](backlog/2026-08-18-foreground-alpha-overloaded.md)
- [ ] **Body seed albedos are authored, not measured** `needs-design` — one field serves surface reflectance and the atmosphere's ground bounce, which want different quantities; Pluto's is 0.49 vs a measured 0.72. → [details](backlog/2026-08-18-body-seed-albedos-vs-measured.md)
- [ ] **Titan's north/south albedo asymmetry** `needs-design` — its only large-scale visible structure reverses with the 29.5-year season, so no static texture can carry it. → [details](backlog/2026-08-18-titan-seasonal-albedo-asymmetry.md)
- [ ] **Packed instance-record layout is four hand-maintained conventions** `needs-design` — one field order encoded three ways per renderer, checked by nothing; one site already shipped stale. → [details](backlog/2026-08-01-instance-record-layout-conventions.md)
- [ ] **TS constants can reach WESL via a custom link extension** `needs-design` — the built-in `?static` extension passes none of `wesl`'s `constants`/`virtualLibs`; ~12 comments claim injection is impossible outright. → [details](backlog/2026-08-17-ts-constants-in-wesl.md)
- [ ] **`labels/vertex.wesl` mirrors `fonts.ts` with no parity test** `ready` — the one unguarded instance of the TS/WGSL duplication pattern above. → [details](backlog/2026-08-17-labels-vertex-wesl-fonts-parity.md)
- [ ] **Stale shader-tree doc comments misclaim fullscreen-tri/upsample ownership** `ready` — `bloom/io.wesl`'s header and `additiveUpsample.ts`'s "two subsystems" count both predate zone-of-avoidance's third instance. → [details](backlog/2026-08-20-stale-shader-tree-doc-comments.md)
- [ ] **`composeOrbitConic` braids three jobs; the ribbon measures pixels two ways** `deferred` — culled orbits pay an f64 inverse first, and two pixel conventions agree only by isometry. → [details](backlog/2026-08-01-orbit-trail-compose-and-pixel-conventions.md)
- [ ] **Body-texture colour calibration** `needs-design` — Mars reads over-saturated; the `sss` sources are enhanced, not colorimetric, and no target appearance is recorded. → [details](backlog/2026-07-24-mars-texture-colour-calibration.md)
- [ ] **Body-texture store consolidation** `needs-design` — four renderers (textured, Earth, ring, cloud-shell) each hand-roll map storage + placeholder fallback separately. → [details](backlog/2026-07-24-body-texture-store-consolidation.md)
- [ ] **Photoreal-Earth follow-ups** `deferred` — drift traps + fidelity gaps from plans A–E (equirect-uv mirror, setMap kind table, shared proxy-sphere idiom). → [details](backlog/2026-07-19-photoreal-earth-followups.md)
- [ ] **Earth tile polar refinement clamp** `deferred` — plate-carrée refinement over-selects near the poles (~17x vs equator in one simulation); masked until Phase E deepens the pyramid. → [details](backlog/2026-07-30-earth-tile-polar-refinement-clamp.md)
- [ ] **Earth tile uv-conversion functions have no production caller** `needs-design` — `earthTileXyForUv`/`earthTileCentreUv` are referenced only by each other's test; the flip and wrap are re-implemented inline at six live sites instead. → [details](backlog/2026-07-30-earth-tile-uv-conversion-dead-home.md)
- [ ] **`EarthTileKind`'s plumbing assumes there is only one kind** `needs-design` — bake, planner, decode and the uniform window all silently break or double up the moment a second kind (normal maps) is added. → [details](backlog/2026-07-30-earth-tile-kind-singularity.md)
- [ ] **`TextureAtlas` eviction is flat LRU** `needs-design` — van Waveren's finest-mip-first-then-LRU would let coarse, widely-depended-on pages survive over finer ones instead of evicting by recency alone.
- [ ] **Earth tile `tilePx` can only ever hold one value** `ready` — `derivePlannerParams` refuses any manifest value but the constant, yet it's threaded through six functions and three docstrings promise a re-bake at a different edge is "a data change."
- [ ] **Earth page table re-derives the atlas's slot-to-cell decode** `ready` — `TextureAtlas.slotsPerRow` is private; `buildEarthPageTable` and `earthTileSubsystem` each recompute it independently.
- [ ] **`EarthImagerySource` carries identity twice** `ready` — `id`/`attribution` duplicate `provenance.sourceId`/`provenance.attribution`; collapse to `provenance` only on next touch, `id` read as `provenance.sourceId` at its ~4 call sites.
- [ ] **GeoDanmark ortho deep band (z14–z19)** `needs-verification` — 10–12.5 cm CC BY Danish orthophoto as a Søndermarken band below EOX z13; apikey + CRS spike (EPSG:4326 WMS vs mercator WMTS) gates the spec. → [details](backlog/2026-08-20-geodanmark-ortho-band.md)
- [ ] **Cloud deck PBR + live coverage** `deferred` — deck is Lambert-lit with no thickness channel (alpha = luminance of RGB); analytic multiple-scattering phase term is cheap, real τ / live GIBS clouds are separable data-layer efforts. → [details](backlog/2026-07-19-cloud-deck-pbr.md)
- [ ] **Earth-sky extinction panorama** `needs-design` — bake Edenhofer's native HEALPix into a 2D all-sky integrated-extinction texture multiplied over the sky at planetary zoom; the crisp from-Earth dark-lane view the cartesian dust cube can't give. → [details](backlog/2026-08-19-earth-sky-extinction-panorama.md)
- [ ] **Perf-harness findings: measured hotspots** `needs-design` — large tier ≈ 3× medium (blows 60fps alone), small slower than medium (unexplained), solar-system 16.9 ms with vertex-bound hdr·NEAR0 at 60%. → [details](backlog/2026-07-21-perf-harness-findings.md)
- [ ] **Lower-res offscreen star-aggregate pass** `ready` — try `STAR_AGGREGATE_DIVISOR` 2 → 4 (`renderTargets.ts`); ~4× further fill cut if the upsampled glow field survives visually.
- [ ] **Bloom perf — instrument first** `needs-design` — bloom is ~5 ms / 23% on solar-system; THREE levers now measured-dead (5→3, bloom0 1/3, fold-into-tonemap — the last a wash on a clean interleaved A/B, spikes 2026-07-22), and the whole pyramid is one timing slot so the cost is unlocalised. Split the slot per-sub-pass before any more attempts. → [details](backlog/2026-07-21-bloom-mip-count-perf.md)
- [ ] **Fold star-upsample into hdr→swap** `needs-design` — delete the standalone fullscreen composite (~1.0 ms real) by sampling the aggregate target in the tonemap shader; bloom-ordering question open. → [details](backlog/2026-07-21-fold-star-upsample-into-tonemap.md)
- [ ] **Cross-layer brightness rebalance + HDR output** `needs-design` — six incompatible brightness "currencies" under one static exposure; established explorers use scene-adaptive auto-exposure on a shared magnitude scale. Seeded by the `?hdr` spike. → [details](backlog/2026-07-23-hdr-brightness-rebalance.md)
- [ ] **Real star apparent magnitudes from Earth** `needs-design` — relative photometry is already physical; calibrate the display mapping so the Earth vantage matches the real night sky (interacts with bloom + the brightness slider). → [details](backlog/2026-07-22-star-apparent-magnitude-realism.md)
- [ ] **Physically-honest galaxy surface brightness** `needs-design` — `galaxySbAmp` divides a catalog-relative luminosity by an absolute 30 kpc size reference; Famous is fudged with `sbBoost 0.45` and GLADE's SB is Tully-derived from its own B mag (no real information). → [details](backlog/2026-07-24-galaxy-surface-brightness-model.md)
- [ ] **Per-source colour-gradient spread** `needs-design` — the shared `DISK_TINT_SPREAD` ramp-space constant renders a different physical core-to-rim gradient per catalog (≈0.04–0.30 mag); derive it per source instead. → [details](backlog/2026-07-24-per-source-colour-gradient-spread.md)
- [ ] **Famous-seed redshift-distance fallback breaks on infall members** `needs-design` — M90 bakes at 1.47 Mpc via `v3k/70`, a class bug wherever peculiar velocity swamps Hubble flow. → [details](backlog/2026-07-24-famous-seed-redshift-distance-fallback.md)
- [ ] **Bright star clump at ~5.9 kpc** `deferred` — flux verified conserved; residual over-exposure is display policy (mid-anchor slider + summed knee shipped; retune or tone-map shoulder next). → [details](backlog/2026-07-17-star-clump-brightness-5-9kpc.md)
- [ ] **Foreground body draw/drawPick share a per-frame resolved set** `deferred` — mirrored partition/cull invocations can desync under future edits; star partition runs up to 4×/frame at deep zoom. → [details](backlog/2026-07-17-foreground-body-resolved-set.md)
- [ ] **Hoist the four per-call-site solar-system derivations onto the planner pattern** `ready` — `sceneBodyPartition`/`partitionStarsByResolution`/`atmosphereDrawList`/`drawableRings` recompute per call site instead of hoisted like `prepareStarCut`. → [details](backlog/2026-08-20-hoist-solar-system-derivations.md)
- [ ] **`starCatalogLayer` god-layer split (three owned concerns, layer-imports-layer)** `needs-design` — 983 LoC owns visibility, the shared octree walk, and stream SoA bookkeeping; two sibling layers import its `enabled`. → [details](backlog/2026-08-20-star-catalog-layer-god-layer-split.md)
- [ ] **Star drawBudget small-tier mobile cap + iOS device pass** `deferred` — lower `hardCap` for `tier === 'small'` in `gaia-stars.ts`, tuned on a real device; verify the new vertex-stage storage bindings under WebKit's stricter WebGPU in the same pass.
- [ ] **Celestial-sphere morph toggle** `needs-design` — morph stars (and constellation lines) between true 3D and a fixed celestial sphere; star-shader hot path + tour primitive. → [details](backlog/2026-07-22-celestial-sphere-morph.md)
- [ ] **Constellation interactivity** `deferred` — fly-to-figure via search + per-figure line highlight, once the constellations layer ships. → [details](backlog/2026-07-22-constellation-interactivity.md)
- [ ] **~24 naked-eye figure stars absent from star bins** `needs-design` — real Hp 3.9–5.1 stars dropped by noBailerJones and too dim for the Hp<4 patch; figures use override seed positions meanwhile. → [details](backlog/2026-07-22-naked-eye-stars-missing-from-bins.md)
- [ ] **Constellation names ignore focusedOnly** `deferred` — the foreground caption path has no focusedOnly concept; decide whether figure names should hide in focused mode like the director's labels.
- [ ] **Star field slab split — retired to cleanup** `needs-verification` — infinite-far reversed-Z (2026-07-20) removed the far-plane sweep that motivated a STARS slab; residual: clip-z clamp audit (they now guard the near side) + two slab-independent refactor knots. → [details](backlog/2026-07-13-star-field-own-slab.md)
- [ ] **Orbit-trail residual speckle (edge-on pose)** `deferred` — survives both the minors hoist (#448) and the screen-space-derivative gradient that replaced it; reads as dashed near-edge-on trails, suspects ranked. → [details](backlog/2026-07-18-orbit-trail-residual-speckle.md)
- [ ] **Star-picking deferred edges** `ready` — star deep link waits forever with Gaia disabled; ring collapses on a degenerate sizePx=0 frame; both small guards. → [details](backlog/2026-07-18-star-picking-deferred-edges.md)
- [ ] **Milliquas AGN colormap** `needs-design` — AGN reuse the galaxy B−R ramp and misread as blue star-forming; give them their own encoding. Only the kPerZ=0 clamp shipped (#282). → [details](backlog/2026-06-29-milliquas-agn-colormap.md)
- [ ] **Supercluster/wall shape in focus** `needs-design` — membership is a sphere, so sheets like the Hydra Wall get swallowed; try an ellipsoid fit or density-field membership. → [details](backlog/2026-06-29-supercluster-shape-focus.md)
- [ ] **In-scene thumbnail quality (SDSS/DSS)** `needs-design` — the auto-fetched atlas-quad path still uses fixed cutout sizes; mask / sky-sub / per-galaxy size / DESI / brightness-norm. (InfoCard path already got sizing + DSS color.) → [details](backlog/2026-06-29-thumbnail-quality-sdss-dss.md)
- [ ] **Half-res ↔ post-process resize type-safety** `deferred` — the offscreen-volume and post-process targets resize via two independent `?.resize()` calls in `runFrame.ts`; enforce the coupling in the type system.
- [ ] **Thumbnail-priority loop scaling** `deferred` — the per-frame priority scan (`texturedDiskSubsystem.ts`) is CPU-linear with stride decimation (#79); add a BVH or compute-shader pass for larger tiers. → [details](backlog/2026-06-29-thumbnail-loop-scaling.md)
- [ ] **Picking GPU resources → own subsystem** `deferred` — `galaxyPickRenderer.ts` owns its per-camera pick texture directly; migrate it (parallel to fade per ADR 0001). Pick texture is per-camera, so it needs its own ADR. → [details](backlog/2026-06-29-picking-gpu-subsystem.md)
- [ ] **galaxy-renderer `dispose()` skips GPU teardown** `ready` — RAF loop + DOM listeners are removed but buffers/pipelines/UBOs (incl. per-extra UBOs) are never `destroy()`ed; spike-era behavior, flagged in the GPU-generation final review.
- [ ] **`ismMap.generator='none'` throws GPU validation errors** `ready` — the disabled-generator clear path `writeTexture`s into three ISM-map textures lacking `COPY_DST`. → [details](backlog/2026-08-12-ism-generator-none-copy-dst-crash.md)
- [ ] **Arm ridge chain leaks flux at the cloud/spur share boundary** `needs-design` — non-negligible residual emission at `share` values 0/1 contradicts `pushArmRidges`' own flux-conservation doc comment. → [details](backlog/2026-08-12-ridge-share-boundary-residual.md)
- [ ] **Young-star mean-normalization is the last live CPU ISM-map readback consumer** `needs-design` — moving it GPU-side (via `ringReduce.wesl`'s reductions) would let the readback machinery finally demote to debug-only. → [details](backlog/2026-08-12-young-star-mean-norm-gpu-side.md)
- [ ] **Background-galaxy extras get no GPU-placed clouds** `needs-design` — dust/arm/spur/DIG placement tiers fill the central galaxy only; extras render without those layers. Dev-tool-only. → [details](backlog/2026-08-12-extras-gpu-placement.md)
- [ ] **`encodeBloomPyramid` (tool) hand-mirrors app `runBloom`** `needs-design` — no shared source; manually kept in sync between `galaxy-renderer` and the app's bloom pass. → [details](backlog/2026-08-20-encode-bloom-pyramid-tool-mirror.md)
- [ ] **MW point-cloud follow-ups** `ready` — five small knots from the T10 radar (orphaned WESL helpers, record-field offsets, billboard-basis mirror, tool↔app constants, pick bind-group injection). → [details](backlog/2026-07-08-mw-point-cloud-follow-ups.md)
- [ ] **Planet-rendering follow-ups** `ready` — four small knots from the final review (Saturn pole dual-source, runtime type-shape tests, uniform-size hardcode, stale plan comment). → [details](backlog/2026-07-17-planet-rendering-follow-ups.md)
- [ ] **starRenderer per-draw uniforms** `ready` — one shared uniform buffer rewritten per draw, from two call sites in one pass. → [details](backlog/2026-07-29-star-renderer-uniform-buffer-race.md)
- [ ] **starRenderer analytic + oblate gas giants** `needs-design` — the two renderers the analytic sphere left behind meet at one question: what the primitive owes a non-round body. → [details](backlog/2026-07-29-star-renderer-analytic-plus-oblate-giants.md)
- [ ] **No haze from inside an atmosphere** `needs-design` — a proxy shell has no geometry in front of the planet, so the over-disc haze branch gets no fragments. → [details](backlog/2026-07-29-in-atmosphere-haze.md)
- [ ] **Equirect texture quality at the poles** `deferred` — `|∇u|` diverges there, so isotropic mip selection over-blurs the polar cap. → [details](backlog/2026-07-29-analytic-equirect-pole-mip-quality.md)
- [ ] **Galaxy impostor LOD** `needs-design` — per-galaxy rgba16f impostors baked from the GPU generator (photo-thumbnail band retires; procedural disk stays as placeholder band), full star+dust geometry above ~128 px; band counts, churn, per-tier memory, and Hubble-type coverage all measured. → [details](backlog/2026-07-08-galaxy-impostor-lod.md)
- [ ] **`degToRad`/`addVec3` sweep + `data/<domain>/palette.ts` convention** `deferred` — migrate the ~5 remaining inline `Math.PI/180` sites and audit other data folders against the palette convention the bodies cleanup set. → [details](backlog/2026-07-14-scale-helpers-palette-convention-sweep.md)
- [ ] **`CatalogDrawEntry` bind-group coverage** `deferred` — a wrong-source `fadeBindGroup`/`sourceBindGroup` on a `catalogStore.entries()` entry would pass every test (the draw test only smoke-checks the command list). → [details](backlog/2026-07-14-catalog-draw-entry-coverage.md)
- [ ] **Tier-ladder single home** `ready` — one exported TIER_LADDER const (Tier type derived) replacing the copies in clampTier, emittedTiersForBody, tiersFittingSourceWidth, buildAllBins, buildStars.
- [ ] **Star-bin ↔ MW-cloud crossfade density calibration** `deferred` — calibrate the procedural cloud's inner density/colors to Gaia counts if the v1 hand-tuned crossfade band shows a seam; gated on the star bin shipping. → [details](backlog/2026-07-13-star-bin-crossfade-density-calibration.md)
- [ ] **Fluid ISM-map event CDF has no texel-area term** `deferred` — log-radial grid means uniform-per-texel sampling seeds the centre and starves the outer disc; fixing it recalibrates the whole tuned map. → [details](backlog/2026-08-10-ism-fluid-event-cdf-texel-area.md)
- [ ] **Galactic Center place labels** `needs-design` — four POI markers (central cluster, Arches, Quintuplet, CMZ) around the shipped Sgr A\*; category fit is the open question. → [details](backlog/2026-07-30-galactic-center-place-labels.md)
- [ ] **Filaments + flow field lack scale fade bands** `ready` — both layers gate on user intent alone, with no zoom-based fade like the survey point clouds. → [details](backlog/2026-07-24-filaments-flow-scale-bands.md)
- [ ] **NEAR0 distance gates mix two camera distances** `needs-design` — both are derived as camera-to-origin bounds and read against camera-to-target `ctx.cam.distance`. → [details](backlog/2026-07-30-camera-target-vs-origin-distance-gates.md)
- [ ] **MW approach fade is keyed on the Sun** `needs-design` — alpha stays 1.0 to the black hole, so the impostor is blown out at the Galactic Centre. → [details](backlog/2026-07-31-milky-way-approach-fade-keyed-on-the-sun.md)
- [ ] **Barycentric orbit pairs** `needs-design` — one-hop `focusId` pins Pluto (and Earth) instead of wobbling around the pair barycentre; needs an invisible focus-graph node. → [details](backlog/2026-08-16-barycentric-orbit-pairs.md)
- [ ] **Pluto's minor moons (Styx/Nix/Kerberos/Hydra)** `blocked` — they orbit the barycentre, so honest placement waits on barycentric pairs. → [details](backlog/2026-08-16-barycentric-orbit-pairs.md)
- [ ] **Zone-of-avoidance shape constants scattered + four positional args** `needs-design` — `bulgeDeg`/`anticenterDeg` are swappable with a plausible-looking wrong result; one re-narration of the numbers already drifted. → [details](backlog/2026-08-17-zone-of-avoidance-shape-constants.md)
- [ ] **Third copy of the reduced-res viewport formula** `ready` — `Math.max(1, Math.floor(size / scale))` in `renderTargets.ts`, `scalarVolumeLayer.ts`, `zoneOfAvoidanceLayer.ts`; consolidate into `renderTargets.sizeOf(target)`.
- [ ] **Consolidate the renderer hygiene-basket duplications** `ready` — grow-on-demand instance buffer (×7+), 16-byte fade-scratch (×4 + a dummy-fade redeclare), fullscreen-triangle (×5 + a second `.wesl` copy), sub-pixel cull (×3). → [details](backlog/2026-08-20-renderer-hygiene-basket.md)
- [ ] **Disabling a producer layer in the DebugPanel freezes its overlay** `ready` — `zone-of-avoidance`/`star-aggregates`/`mw-aggregate` stop re-clearing while their upsample consumers keep compositing, so the last frame smears in screen space as the camera moves. → [details](backlog/2026-08-17-debugpanel-producer-toggle-freezes-overlay.md)
- [ ] **mcpm-workbench: per-layer exposure** `awaiting-decision` — `EXPOSURE = 2` is a raymarch-only fork compensation applied to all five layers by the global tonemap; needs a look decision before touching it.
- [ ] **mcpm-workbench: histogram plot never redraws on resize or section expand** `ready` — blank canvas when the section opens while paused.
- [ ] **mcpm-workbench: `RenderGraph`'s blit pipeline still uses `layout: 'auto'`** `ready` — the tool's one banned-pattern site.
- [ ] **mcpm-workbench: collapse three duplicate bounds computations** `ready` — `worldBounds`/`manualBounds`/`worldToVoxel` each recompute `centre ± size/2`; fold into one `field/gridBoxBounds.ts`.
- [ ] **mcpm-workbench: `densities` allocated as a full agent lane** `ready` — only `nDataPoints` entries are ever used (~41 MB dead VRAM at 10M agents).
- [ ] **mcpm-workbench: pending-box preview recomputes `catalogBounds` every frame in auto-fit mode** `ready` — cheap fix: use `h.box` when auto-fit is on.
- [ ] **mcpm-workbench: unit-test `recordHistogramSample`** `ready` — against the CLI's `dataPointHistogram` on a shared fixture; the statistic Phase 3 rests on has no test.
- [ ] **mcpm-workbench: lift `Toggle.tsx`'s inline pill styling into a shared class** `ready` — `ToggleRow.statePill` can compose it instead of restating the recipe.
- [ ] **mcpm-workbench: promote `ToggleRow` to `src/components/common/`** `ready` — the galaxy tool hand-rolls the same row in four files.
- [ ] **mcpm-workbench: `boxLines.wesl` pushes a line endpoint to `z = 2.0`** `ready` — a line-list clips rather than discards, so a half-length line draws when a box corner is behind the eye plane.
- [ ] **mcpm-workbench: comparator `--bins` is unvalidated** `ready` — an all-out-of-grid `--points` set fails with an unrelated `RangeError` instead of a clear message.
- [ ] **mcpm-workbench: fold the one-shot command tokens into one table** `deferred` — `reset`/`clearTrace`/`export`/`scfd` each a 3-line reducer; table-ify once a fifth token arrives.
- [ ] **mcpm-workbench: `export_metadata.txt` vs packed-catalog point-count mismatch** `needs-verification` — 324,849 (fork export) vs 324,901 (packed catalog sidecar), not yet investigated.
- [ ] **mcpm-workbench: `attachTrace` rebuilds the whole pipeline on a palette change** `ready` — a cheap `setPalette(id)` would do if the palette becomes a live dropdown.
- [ ] **mcpm-workbench: `PathTracerSliderSpec` duplicates `RaymarchSliderSpec` field-for-field** `ready` — one shared spec type covers both tables.
- [ ] **mcpm-workbench: `compareTraceCubes.test.ts`'s hand-rolled `.npy` writer is supersedable by `writeNpy`** `ready` — pre-existing test-helper duplication.
- [ ] **mcpm-workbench: `HistogramSlice.d.ts` exports two types** `ready` — the only file in the tool's `@types/` that does; `HistogramSample` wants its own file.
- [ ] **Pick-debug overlay is off `frameProgram`** `deferred` — the target shape is pick execution as a parallel frame-program instance, a new ladder rung at the umbrella reassessment; audit found one blocker (`zoneOfAvoidanceRenderer`'s shared pick uniform). → [details](backlog/2026-08-20-pick-debug-overlay-off-program.md)

## UI & UX

- [ ] **InfoCard live phase + apparent-mag rows** `needs-design` — grow the engine time pub with phase angle + apparent magnitude for the focused body (distance row shipped in #472). → [details](backlog/2026-07-21-infocard-phase-apparent-mag-rows.md)
- [ ] **"You are here" label continuity** `needs-design` — the label fades out below 2 kpc (`surveyDeepZoom` band); decide whether it hands off toward the Sun/Earth instead of vanishing. → [details](backlog/2026-07-22-you-are-here-label-continuity.md)
- [ ] **Settings row order is source-code order** `deferred` — panel rows follow `Source` enum value ascending (codes are append-only), so a chosen order needs a display-order mechanism that does not exist.
- [ ] **Analytic pick fills the screen from inside a body** `needs-design` — camera can zoom inside a radius; the ray then hits the far wall everywhere. Decide with Earth deep zoom. → [details](backlog/2026-07-29-analytic-pick-inside-body.md)
- [ ] **Earth caption stamp out-picks occluders** `ready` — the forced-band 18 px Earth pick point punches through a transiting Moon. → [details](backlog/2026-07-29-earth-caption-stamp-outpicks-occluders.md)
- [ ] **Touch picking selects the wrong galaxy** `needs-design` — the pick pad is in device px, so the clickable disc halves on retina/phone. → [details](backlog/2026-07-29-touch-pick-accuracy.md)
- [ ] **Windows touchscreen pinch-zoom dead** `needs-repro` — works on mobile; gesture code is platform-uniform PointerEvents, so event delivery on Windows is the suspect; needs an on-device event log. → [details](backlog/2026-08-16-windows-touchscreen-pinch-zoom.md)
- [ ] **Autorotate + mouse-move jitter** `needs-repro` — intermittent frame jitter seen on `refactor/debug-derivation`, diff-clean per investigation; falsify against base commit from a second worktree. → [details](backlog/2026-08-20-autorotate-mousemove-jitter.md)
- [ ] **StatusBar mobile reflow** `ready` — reflow the StatusBar for narrow viewports (no media queries today). The InfoCard bottom-sheet + SettingsPanel collapse-launcher already shipped.
- [ ] **SettingsPanel polish** `needs-design` — visual cleanup + section re-ordering + per-section icons; 2.3k lines of hand-coded text-only rows today. → [details](backlog/2026-07-22-settings-panel-polish.md)
- [ ] **Schema-driven slider rows** `needs-design` — a scalar knob costs ~9 hand-edited sites (default, type, seed, reducer, export, selector, container ×3, props, JSX, fixtures); VolumeFieldRow has 7, Display 6. → [details](backlog/2026-07-29-schema-driven-slider-rows.md)
- [ ] **Label declutter toggle + hysteresis** `needs-design` — add `settings.labels.declutter` wired to `labelDirectorSubsystem` (replacing the `?nodeclutter` stopgap) and hysteresis-damp the cull so labels stop flickering under camera motion. → [details](backlog/2026-06-29-label-declutter-toggle.md)
- [ ] **Label fade opt-out ADR** `needs-design` — decide whether per-character MSDF label opacity opts out of the per-handle fade bind-group pattern; follow-up to ADR 0001.
- [ ] **Grand tour: Earth start + scale rungs** `needs-design` — open at Earth and climb solar system → local neighbourhood → Milky Way stars before the existing galactic beats. → [details](backlog/2026-07-22-grand-tour-earth-start.md)
- [ ] **Reusable structure-visit tour clip** `needs-design` — generalize the hardcoded Virgo/M87 tour beats into a parameterized `structureVisitClip`. Focus-isolation primitive already shipped. → [details](backlog/2026-06-29-structure-visit-tour-clip.md)
- [ ] **`cosmicFlows` beat D never plays** `ready` — its `fade()` cue lands exactly on the compiled clip duration and is wiped by the completion-tick reset one frame later. → [details](backlog/2026-08-20-cosmicflows-beat-d-unreachable.md)
- [ ] **`emphasize()` clip cue** `ready` — per-structure spotlight lift composing with `fade` dims (staggered group highlights in the tour's neighbourhood beat). → [details](backlog/2026-07-07-emphasize-clip-cue.md)
- [ ] **Greek letters in star labels** `needs-design` — font atlas lacks Greek glyphs, so Bayer names are spelled out ("Delta Velorum" vs δ Velorum); add the range + swap seed display names. → [details](backlog/2026-07-22-greek-letters-in-star-labels.md)
- [ ] **Star/body card row tooltips** `ready` — galaxy detail-card rows have hover tooltips explaining each field; the field-star and famous-star/body cards' rows have none — extend the same tooltips.tsx wiring to their row tables.
- [ ] **Tour-recorder follow-ups** `ready` — small post-merge items from the recorder's final review (observable settle discard, two test/diagnostic tidies). → [details](backlog/2026-07-08-tour-recorder-follow-ups.md)

## Docs & process

- [ ] **Cosmic-zoom plan review** `process` — 60-doc "Powers of Ten" walkthrough plan drafted in worktree `cosmic-zoom-plan` (2026-05-08), awaiting user review (memory `project_cosmic_zoom_plan`).
- [ ] **Famous-curator suite runtime cost** `deferred` — real sharp encodes + tmpdir I/O dominate suite wall-clock; cache fixtures, shrink images, or tag a slow-suite split. → [details](backlog/2026-07-10-famous-curator-suite-runtime-cost.md)
- [ ] **Deproject invariant consolidation** `deferred` — square-in/square-out tested 4× across the curator export surface; fold into one parameterized test if that surface is reworked. → [details](backlog/2026-07-10-deproject-invariant-consolidation.md)
- [ ] **move-files: untracked references** `ready` — ts-morph skips `?worker`/`?static` specifiers + `vi.mock` literals; a stale `?worker` is silent on BOTH tsc and vite build. Rewrite them, then fail loudly on anything still dangling. → [details](backlog/2026-07-14-move-files-untracked-references.md)
- [ ] **refactor CLI follow-ups** `deferred` — runOp dispatch table + extract closure gaps (dropped `//` comments, `export {}` form, import carry) + refusal/error-context polish. → [details](backlog/2026-07-21-refactor-cli-followups.md)
- [ ] **Default filament build silently drops GLADE** `awaiting-decision` — `ALL_SOURCE_FILES` names un-tiered `sdss.bin`/`glade.bin` the tiered pipeline no longer emits; missing-file skip ⇒ shipped `filaments.bin` is 2MRS-only. → [details](backlog/2026-08-10-buildfilaments-glade-skip.md)
- [ ] **"Task N" comment references — decide the convention** `needs-design` — ~269 plan-task refs repo-wide read as changelog noise once plans archive; either bless the idiom or add it to the comment convention's ban list and sweep.
- [ ] **Saga-context boot-ordering argument told nine times** `ready` — one causal chain restated across nine docblocks; keep it in `sagaContextRegistered.ts` and point the rest there. → [details](backlog/2026-07-30-boot-ordering-argument-nine-copies.md)
- [ ] **Plan `Needs:` lines for wave dispatch** `needs-design` — SDD serializes plans; mined dependency graphs from completed plans understate real depth, so the DAG must be authored, not mined. → [details](backlog/2026-07-31-plan-needs-lines-wave-dispatch.md)
- [ ] **CLAUDE.md compaction pass** `ready` — the file has grown; tighten it without losing load-bearing content.

## External / blocked

- [ ] **HyperLEDA cache backfill** `blocked` — R2 cache is intentionally partial (52k / ~1.5M PGCs); don't auto-refetch, promote only on concrete need (memory `project_hyperleda_partial_cache`).
- [ ] **DESI DR1 as a data source** `blocked` — viable + ~90% new data, but ~10× points (~9.75M) exceeds the interactive-render ceiling; revisit after the point ceiling lifts to ~25M+ ([research](research/2026-06-05-desi-dr1-as-a-data-source.md), memory `project_desi_deferred`). A scoped 2.5° patch shipped separately via the [deep-cone spec](superpowers/specs/completed/2026-07-07-desi-deep-cone-design.md).
- [ ] **DESI BGS real galaxy shapes** `needs-verification` — DR1 LSS clustering catalogs carry no shape columns; every DESI row renders at the default size + hashed fallback orientation. → [details](backlog/2026-07-09-desi-bgs-real-shapes.md)
- [ ] **Second DESI deep cone** `awaiting-decision` — Coma is DR2-blocked (zero LRG/ELG/QSO rows in DR1); Stripe 82 is a ready-now alternative target. → [details](backlog/2026-07-09-second-desi-deep-cone.md)

## Outreach (long-tail)

Per-task plan tree under [`superpowers/plans/2026-05-05-outreach-and-promotion/`](superpowers/plans/2026-05-05-outreach-and-promotion/); actionable items in [`TODO.md`](superpowers/plans/2026-05-05-outreach-and-promotion/TODO.md).

- [ ] **JOSS submission** `ready` — `paper/paper.md` + `paper/paper.bib` (Task 3).
- [ ] **RNAAS submission** `ready` — short note + PDF (Task 6).
- [ ] **Remaining Reddit posts** `ready` — r/Astronomy (video), r/WebGPU (video), reschedule r/MapPorn (Task 4).
- [ ] **Academic outreach emails** `ready` — SDSS, GLADE, AAS WWT, CDS, LVK EM (Task 5).

---

## Reference docs (not pickup-able)

Cite these from plans rather than turning them into work.

- [`backlog/`](backlog/) — per-item detail write-ups for the design-bearing entries above
- [`audits/`](audits/) — backward-looking codebase critiques (code reviews, renderer audits)
- [`research/`](research/) — forward-looking surveys (cluster/void viz, cosmic web)
- [`superpowers/conventions/`](superpowers/conventions/) — renderer + plan conventions
- `plans/completed/` + `specs/completed/` — shipped designs, cited by name from this file
