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

- [ ] **Source-registry factory** `needs-design` — auto-generate fetcher + slot + UI rows from a single `SOURCE_REGISTRY` entry; today each source is hand-wired across `slots/`, `assetWiring.ts`, `initGpu`. → [details](backlog/2026-06-29-source-registry-factory.md)
- [ ] **GPU-handle nullability follow-on** `deferred` — `EngineGpuHandles` fields are all `T | null` (a transient bootstrap fact as a perpetual null-check); narrow into a non-null "ready GPU" view and shed `PassDeps`' renderer fields. → [details](backlog/2026-06-29-gpu-handle-nullability.md)
- [ ] **`useStructureMemberCount` honest invalidation** `deferred` — the hook's `sourceCounts`/`tier` args are memo tripwires for live GPU catalog state; swap for a real catalog-generation signal. → [details](backlog/2026-06-29-usestructuremembercount-invalidation.md)
- [ ] **Asset-loading audit + debug UI sweep** `needs-design` — inventory what loads/stays resident (`release` exists for body textures only), add eviction where it pays; redesign the flat one-row-per-slot `AssetLoadingSection`. → [details](backlog/2026-07-22-asset-loading-audit.md)
- [ ] **Derive `BULK_CATALOG_CATEGORIES` from a registry flag** `deferred` — add `hasBulkCatalog` to `SOURCE_REGISTRY` rows so the hand-listed `['cluster','supercluster','void']` in `assetWiring.ts` derives from it. Keep the three category lists (UI / marker / bulk-fetch) separate — membership genuinely differs. (`bearsMarker` + `DEFAULT_CATEGORY_VISIBILITY` already shipped.)
- [ ] **Scale-gated asset demand** `needs-design` — boot fetches catalogs invisible at the current camera distance, ~68 MB of ~101.7 MB drawing nothing at the Earth boot view. → [details](backlog/2026-07-24-scale-gated-asset-demand.md)
- [ ] **`famous_stars_meta.json` fetches unconditionally at boot** `ready` — bypasses slot wiring entirely (`useFamousStarsMeta.ts`); give it a lazy demand predicate like `pgcAlias`'s one-shot `paletteOpened`, so it loads on first star InfoCard open instead.
- [ ] **Font atlas load blocks `initGpu`** `needs-design` — the ~297 KB Cormorant fetch is awaited before every renderer + catalog fetch in `initGpu` starts; make label rendering tolerate a missing atlas instead. → [details](backlog/2026-07-24-font-atlas-blocks-initgpu.md)
- [ ] **Direct `slot.load()` sites bypass the asset queue** `needs-design` — five call sites fetch outside the bounded queue, so `ASSET_QUEUE_CONCURRENCY` is not the system-wide bound it reads as. → [details](backlog/2026-07-24-direct-loads-bypass-asset-queue.md)
- [ ] **Companion-asset relation has three homes** `needs-design` — "famousMeta rides Famous" is authored as a registry list, a demand predicate, and a rank integer. → [details](backlog/2026-07-24-companion-asset-relation-three-homes.md)

## Rendering

- [ ] **Multi-star sphere presence** `deferred` — the field-star sphere is one-at-a-time (nearest wins); a Gaia-resolved double a few AU apart would leave the companion sprite-retired with no body. → [details](backlog/2026-07-21-multi-star-sphere-presence.md)
- [ ] **Saturn ring brightness** `ready` — the ring reads too dim next to the new limb-darkened disc; retune ring albedo/exposure (surfaced in the planet-atmospherics per-body visual pass).
- [ ] **Atmosphere limb transparent seam** `needs-investigation` — thin fully-transparent ring between a body's surface and its atmosphere shell (seen on Mars). → [details](backlog/2026-07-24-atmosphere-limb-transparent-seam.md)
- [ ] **Body-texture colour calibration** `needs-design` — Mars reads over-saturated; the `sss` sources are enhanced, not colorimetric, and no target appearance is recorded. → [details](backlog/2026-07-24-mars-texture-colour-calibration.md)
- [ ] **Body-texture store consolidation** `needs-design` — four renderers (textured, Earth, ring, cloud-shell) each hand-roll map storage + placeholder fallback separately. → [details](backlog/2026-07-24-body-texture-store-consolidation.md)
- [ ] **Photoreal-Earth follow-ups** `deferred` — drift traps + fidelity gaps from plans A–E (equirect-uv mirror, setMap kind table, shared proxy-sphere idiom). → [details](backlog/2026-07-19-photoreal-earth-followups.md)
- [ ] **Titan atmosphere** `needs-design` — minimal params-row-over-flat-sphere vs full Venus-style cloud-as-surface + limb treatment (needs a texture through the fetch/build pipeline). → [details](backlog/2026-07-19-titan-atmosphere.md)
- [ ] **Cloud deck PBR + live coverage** `deferred` — deck is Lambert-lit with no thickness channel (alpha = luminance of RGB); analytic multiple-scattering phase term is cheap, real τ / live GIBS clouds are separable data-layer efforts. → [details](backlog/2026-07-19-cloud-deck-pbr.md)
- [ ] **Local interstellar-dust volume (Edenhofer 2024)** `needs-design` — Sun-centered per-parsec extinction cube as an SCFD field (MCPM-clone, ~3.2 GB one-time via `dustmaps`); blocked on a sub-kpc render slab (COSMO near-clip = 10 kpc) + emissive-vs-absorptive compositing choice. → [details](backlog/2026-07-18-local-dust-volume.md)
- [ ] **Perf-harness findings: measured hotspots** `needs-design` — large tier ≈ 3× medium (blows 60fps alone), small slower than medium (unexplained), solar-system 16.9 ms with vertex-bound hdr·NEAR0 at 60%. → [details](backlog/2026-07-21-perf-harness-findings.md)
- [ ] **Lower-res offscreen star-aggregate pass** `ready` — try `STAR_AGGREGATE_DIVISOR` 2 → 4 (`renderTargets.ts`); ~4× further fill cut if the upsampled glow field survives visually.
- [ ] **Bloom perf — instrument first** `needs-design` — bloom is ~5 ms / 23% on solar-system; THREE levers now measured-dead (5→3, bloom0 1/3, fold-into-tonemap — the last a wash on a clean interleaved A/B, spikes 2026-07-22), and the whole pyramid is one timing slot so the cost is unlocalised. Split the slot per-sub-pass before any more attempts. → [details](backlog/2026-07-21-bloom-mip-count-perf.md)
- [ ] **Fold star-upsample into hdr→swap** `needs-design` — delete the standalone fullscreen composite (~1.0 ms real) by sampling the aggregate target in the tonemap shader; bloom-ordering question open. → [details](backlog/2026-07-21-fold-star-upsample-into-tonemap.md)
- [ ] **Real star apparent magnitudes from Earth** `needs-design` — relative photometry is already physical; calibrate the display mapping so the Earth vantage matches the real night sky (interacts with bloom + the brightness slider). → [details](backlog/2026-07-22-star-apparent-magnitude-realism.md)
- [ ] **Physically-honest galaxy surface brightness** `needs-design` — `galaxySbAmp` divides a catalog-relative luminosity by an absolute 30 kpc size reference; Famous is fudged with `sbBoost 0.45` and GLADE's SB is Tully-derived from its own B mag (no real information). → [details](backlog/2026-07-24-galaxy-surface-brightness-model.md)
- [ ] **Per-source colour-gradient spread** `needs-design` — the shared `DISK_TINT_SPREAD` ramp-space constant renders a different physical core-to-rim gradient per catalog (≈0.04–0.30 mag); derive it per source instead. → [details](backlog/2026-07-24-per-source-colour-gradient-spread.md)
- [ ] **Famous-seed redshift-distance fallback breaks on infall members** `needs-design` — M90 bakes at 1.47 Mpc via `v3k/70`, a class bug wherever peculiar velocity swamps Hubble flow. → [details](backlog/2026-07-24-famous-seed-redshift-distance-fallback.md)
- [ ] **Bright star clump at ~5.9 kpc** `deferred` — flux verified conserved; residual over-exposure is display policy (mid-anchor slider + summed knee shipped; retune or tone-map shoulder next). → [details](backlog/2026-07-17-star-clump-brightness-5-9kpc.md)
- [ ] **Foreground body draw/drawPick share a per-frame resolved set** `deferred` — mirrored partition/cull invocations can desync under future edits; star partition runs up to 4×/frame at deep zoom. → [details](backlog/2026-07-17-foreground-body-resolved-set.md)
- [ ] **Star drawBudget small-tier mobile cap + iOS device pass** `deferred` — lower `hardCap` for `tier === 'small'` in `gaia-stars.ts`, tuned on a real device; verify the new vertex-stage storage bindings under WebKit's stricter WebGPU in the same pass.
- [ ] **Celestial-sphere morph toggle** `needs-design` — morph stars (and constellation lines) between true 3D and a fixed celestial sphere; star-shader hot path + tour primitive. → [details](backlog/2026-07-22-celestial-sphere-morph.md)
- [ ] **Constellation interactivity** `deferred` — fly-to-figure via search + per-figure line highlight, once the constellations layer ships. → [details](backlog/2026-07-22-constellation-interactivity.md)
- [ ] **~24 naked-eye figure stars absent from star bins** `needs-design` — real Hp 3.9–5.1 stars dropped by noBailerJones and too dim for the Hp<4 patch; figures use override seed positions meanwhile. → [details](backlog/2026-07-22-naked-eye-stars-missing-from-bins.md)
- [ ] **Constellation names ignore focusedOnly** `deferred` — the foreground caption path has no focusedOnly concept; decide whether figure names should hide in focused mode like the director's labels.
- [ ] **Star field → own slab** `needs-design` — the depthless star map (points/captions/connectors) inherits NEAR0's Earth-scale depth bracket; a STARS slab row deletes the three clip-z clamps + far-plane coupling. → [details](backlog/2026-07-13-star-field-own-slab.md)
- [ ] **Orbit-trail residual speckle (edge-on pose)** `deferred` — gradient-minors hoist shipped (#448) but per-pixel stipple survives on hardware; remaining suspects ranked (q.z horizon noise, Newton-refine flicker, hard-discard binarization). → [details](backlog/2026-07-18-orbit-trail-residual-speckle.md)
- [ ] **Star-picking deferred edges** `ready` — star deep link waits forever with Gaia disabled; ring collapses on a degenerate sizePx=0 frame; both small guards. → [details](backlog/2026-07-18-star-picking-deferred-edges.md)
- [ ] **bodyTextureFetcher content-type guard** `ready` — Vite's SPA fallback serves index.html for missing texture files; the fetcher hands it to createImageBitmap and fails as "source image could not be decoded" — check the response content-type and fail loudly with the real 404 path instead.
- [ ] **Jupiter/Saturn 404 on the `large` texture tier** `ready` — `bodyTextureRegistry.ts` declares `surface: 'large'` for both but no 8192px texture exists on disk; fails silently into the slot's error state. Generate the textures or lower the registry ceiling to `medium`.
- [ ] **Milliquas AGN colormap** `needs-design` — AGN reuse the galaxy B−R ramp and misread as blue star-forming; give them their own encoding. Only the kPerZ=0 clamp shipped (#282). → [details](backlog/2026-06-29-milliquas-agn-colormap.md)
- [ ] **Supercluster/wall shape in focus** `needs-design` — membership is a sphere, so sheets like the Hydra Wall get swallowed; try an ellipsoid fit or density-field membership. → [details](backlog/2026-06-29-supercluster-shape-focus.md)
- [ ] **In-scene thumbnail quality (SDSS/DSS)** `needs-design` — the auto-fetched atlas-quad path still uses fixed cutout sizes; mask / sky-sub / per-galaxy size / DESI / brightness-norm. (InfoCard path already got sizing + DSS color.) → [details](backlog/2026-06-29-thumbnail-quality-sdss-dss.md)
- [ ] **Half-res ↔ post-process resize type-safety** `deferred` — the offscreen-volume and post-process targets resize via two independent `?.resize()` calls in `runFrame.ts`; enforce the coupling in the type system.
- [ ] **Thumbnail-priority loop scaling** `deferred` — the per-frame priority scan (`texturedDiskSubsystem.ts`) is CPU-linear with stride decimation (#79); add a BVH or compute-shader pass for larger tiers. → [details](backlog/2026-06-29-thumbnail-loop-scaling.md)
- [ ] **Picking GPU resources → own subsystem** `deferred` — `pickRenderer.ts` owns its per-camera pick texture directly; migrate it (parallel to fade per ADR 0001). Pick texture is per-camera, so it needs its own ADR. → [details](backlog/2026-06-29-picking-gpu-subsystem.md)
- [ ] **galaxy-renderer `dispose()` skips GPU teardown** `ready` — RAF loop + DOM listeners are removed but buffers/pipelines/UBOs (incl. per-extra UBOs) are never `destroy()`ed; spike-era behavior, flagged in the GPU-generation final review.
- [ ] **MW point-cloud follow-ups** `ready` — five small knots from the T10 radar (orphaned WESL helpers, record-field offsets, billboard-basis mirror, tool↔app constants, pick bind-group injection). → [details](backlog/2026-07-08-mw-point-cloud-follow-ups.md)
- [ ] **Planet-rendering follow-ups** `ready` — four small knots from the final review (Saturn pole dual-source, runtime type-shape tests, uniform-size hardcode, stale plan comment). → [details](backlog/2026-07-17-planet-rendering-follow-ups.md)
- [ ] **starRenderer per-instance uniforms** `ready` — the star-sphere renderer's single non-dynamic uniform means two same-frame resolved stars share the last-written MVP (benign with today's seeds, documented in `starSpheresLayer`); upgrade to the `planetRenderer` instanced shape, natural fold candidate for the renderers reorg.
- [ ] **Galaxy impostor LOD** `needs-design` — per-galaxy rgba16f impostors baked from the GPU generator (photo-thumbnail band retires; procedural disk stays as placeholder band), full star+dust geometry above ~128 px; band counts, churn, per-tier memory, and Hubble-type coverage all measured. → [details](backlog/2026-07-08-galaxy-impostor-lod.md)
- [ ] **`degToRad`/`addVec3` sweep + `data/<domain>/palette.ts` convention** `deferred` — migrate the ~5 remaining inline `Math.PI/180` sites and audit other data folders against the palette convention the bodies cleanup set. → [details](backlog/2026-07-14-scale-helpers-palette-convention-sweep.md)
- [ ] **`CatalogDrawEntry` bind-group coverage** `deferred` — a wrong-source `fadeBindGroup`/`sourceBindGroup` on a `catalogStore.entries()` entry would pass every test (the draw test only smoke-checks the command list). → [details](backlog/2026-07-14-catalog-draw-entry-coverage.md)
- [ ] **Tier-ladder single home** `ready` — one exported TIER_LADDER const (Tier type derived) replacing the copies in clampTier, emittedTiersForBody, tiersFittingSourceWidth, buildAllBins, buildStars.
- [ ] **Star-bin ↔ MW-cloud crossfade density calibration** `deferred` — calibrate the procedural cloud's inner density/colors to Gaia counts if the v1 hand-tuned crossfade band shows a seam; gated on the star bin shipping. → [details](backlog/2026-07-13-star-bin-crossfade-density-calibration.md)
- [ ] **Zone of Avoidance visualization + tour beat** `needs-design` — make the galactic-plane galaxy-density gap legible and explain it as dust extinction, not a real void; feature the NIR-only ZoA dwarfs. → [details](backlog/2026-07-21-zone-of-avoidance-visualization.md)
- [ ] **Filaments + flow field lack scale fade bands** `ready` — both layers gate on user intent alone, with no zoom-based fade like the survey point clouds. → [details](backlog/2026-07-24-filaments-flow-scale-bands.md)

## UI & UX

- [ ] **InfoCard live phase + apparent-mag rows** `needs-design` — grow the engine time pub with phase angle + apparent magnitude for the focused body (distance row shipped in #472). → [details](backlog/2026-07-21-infocard-phase-apparent-mag-rows.md)
- [ ] **"You are here" label continuity** `needs-design` — the label fades out below 2 kpc (`surveyDeepZoom` band); decide whether it hands off toward the Sun/Earth instead of vanishing. → [details](backlog/2026-07-22-you-are-here-label-continuity.md)
- [ ] **StatusBar mobile reflow** `ready` — reflow the StatusBar for narrow viewports (no media queries today). The InfoCard bottom-sheet + SettingsPanel collapse-launcher already shipped.
- [ ] **SettingsPanel polish** `needs-design` — visual cleanup + section re-ordering + per-section icons; 2.3k lines of hand-coded text-only rows today. → [details](backlog/2026-07-22-settings-panel-polish.md)
- [ ] **VolumeFieldRow schema-driven UI** `needs-design` — replace the seven hand-coded sliders with a settings-schema-generated UI.
- [ ] **Label declutter toggle + hysteresis** `needs-design` — add `settings.labels.declutter` wired to `labelDirectorSubsystem` (replacing the `?nodeclutter` stopgap) and hysteresis-damp the cull so labels stop flickering under camera motion. → [details](backlog/2026-06-29-label-declutter-toggle.md)
- [ ] **Label fade opt-out ADR** `needs-design` — decide whether per-character MSDF label opacity opts out of the per-handle fade bind-group pattern; follow-up to ADR 0001.
- [ ] **Grand tour: Earth start + scale rungs** `needs-design` — open at Earth and climb solar system → local neighbourhood → Milky Way stars before the existing galactic beats. → [details](backlog/2026-07-22-grand-tour-earth-start.md)
- [ ] **Reusable structure-visit tour clip** `needs-design` — generalize the hardcoded Virgo/M87 tour beats into a parameterized `structureVisitClip`. Focus-isolation primitive already shipped. → [details](backlog/2026-06-29-structure-visit-tour-clip.md)
- [ ] **`emphasize()` clip cue** `ready` — per-structure spotlight lift composing with `fade` dims (staggered group highlights in the tour's neighbourhood beat). → [details](backlog/2026-07-07-emphasize-clip-cue.md)
- [ ] **Sun constellation chip renders 'None'** `ready` — the Sun's palette-row / compact-card constellation chip prints its literal seed value 'None'; suppress the chip when constellation is absent.
- [ ] **Greek letters in star labels** `needs-design` — font atlas lacks Greek glyphs, so Bayer names are spelled out ("Delta Velorum" vs δ Velorum); add the range + swap seed display names. → [details](backlog/2026-07-22-greek-letters-in-star-labels.md)
- [ ] **Star/body card row tooltips** `ready` — galaxy detail-card rows have hover tooltips explaining each field; the field-star and famous-star/body cards' rows have none — extend the same tooltips.tsx wiring to their row tables.
- [ ] **Tour-recorder follow-ups** `ready` — small post-merge items from the recorder's final review (observable settle discard, two test/diagnostic tidies). → [details](backlog/2026-07-08-tour-recorder-follow-ups.md)

## Docs & process

- [ ] **Cosmic-zoom plan review** `process` — 60-doc "Powers of Ten" walkthrough plan drafted in worktree `cosmic-zoom-plan` (2026-05-08), awaiting user review (memory `project_cosmic_zoom_plan`).
- [ ] **Famous-curator suite runtime cost** `deferred` — real sharp encodes + tmpdir I/O dominate suite wall-clock; cache fixtures, shrink images, or tag a slow-suite split. → [details](backlog/2026-07-10-famous-curator-suite-runtime-cost.md)
- [ ] **Deproject invariant consolidation** `deferred` — square-in/square-out tested 4× across the curator export surface; fold into one parameterized test if that surface is reworked. → [details](backlog/2026-07-10-deproject-invariant-consolidation.md)
- [ ] **move-files: untracked references** `ready` — ts-morph skips `?worker`/`?static` specifiers + `vi.mock` literals; a stale `?worker` is silent on BOTH tsc and vite build. Rewrite them, then fail loudly on anything still dangling. → [details](backlog/2026-07-14-move-files-untracked-references.md)
- [ ] **refactor CLI follow-ups** `deferred` — runOp dispatch table + extract closure gaps (dropped `//` comments, `export {}` form, import carry) + refusal/error-context polish. → [details](backlog/2026-07-21-refactor-cli-followups.md)
- [ ] **Dead files in `public/data/`** `ready` — unreachable `desi-deep-NEW.bin`/`desi-deep-OLD.bin` + superseded `clusters.ccat`/`clusters_meta.json` (structures.ccat replaced them); delete all four. `filaments-sdss.bin` is build-input only (`package.json:49`), not runtime-fetchable — keep it.

## External / blocked

- [ ] **Rhizome SDSS calibration** `blocked` — in flight in the PolyPhy fork (branch `rhizome-spec`, PR #114); skymap is read-only until it lands (memory `project_rhizome_handoff_in_flight`).
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
