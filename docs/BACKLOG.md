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
- [ ] **Derive `BULK_CATALOG_CATEGORIES` from a registry flag** `deferred` — add `hasBulkCatalog` to `SOURCE_REGISTRY` rows so the hand-listed `['cluster','supercluster','void']` in `assetWiring.ts` derives from it. Keep the three category lists (UI / marker / bulk-fetch) separate — membership genuinely differs. (`bearsMarker` + `DEFAULT_CATEGORY_VISIBILITY` already shipped.)

## Rendering

- [ ] **Milliquas AGN colormap** `needs-design` — AGN reuse the galaxy B−R ramp and misread as blue star-forming; give them their own encoding. Only the kPerZ=0 clamp shipped (#282). → [details](backlog/2026-06-29-milliquas-agn-colormap.md)
- [ ] **Supercluster/wall shape in focus** `needs-design` — membership is a sphere, so sheets like the Hydra Wall get swallowed; try an ellipsoid fit or density-field membership. → [details](backlog/2026-06-29-supercluster-shape-focus.md)
- [ ] **In-scene thumbnail quality (SDSS/DSS)** `needs-design` — the auto-fetched atlas-quad path still uses fixed cutout sizes; mask / sky-sub / per-galaxy size / DESI / brightness-norm. (InfoCard path already got sizing + DSS color.) → [details](backlog/2026-06-29-thumbnail-quality-sdss-dss.md)
- [ ] **Half-res ↔ post-process resize type-safety** `deferred` — the offscreen-volume and post-process targets resize via two independent `?.resize()` calls in `runFrame.ts`; enforce the coupling in the type system.
- [ ] **Unify the two disk-planner catalog walks** `ready` — procedural + textured planners walk the catalogs twice per frame, computing each row's geometry twice (~4.2 ms of a 5.1 ms frame, M1 Max); merge into one shared walk feeding two row-reducers. Prerequisite pure helpers shipped in `src/utils/render/disk/`. → [details](backlog/2026-06-30-unify-disk-planner-walks.md)
- [ ] **Thumbnail-priority loop scaling** `deferred` — the per-frame priority scan (`texturedDiskSubsystem.ts`) is CPU-linear with stride decimation (#79); add a BVH or compute-shader pass for larger tiers. → [details](backlog/2026-06-29-thumbnail-loop-scaling.md)
- [ ] **Picking GPU resources → own subsystem** `deferred` — `pickRenderer.ts` owns its per-camera pick texture directly; migrate it (parallel to fade per ADR 0001). Pick texture is per-camera, so it needs its own ADR. → [details](backlog/2026-06-29-picking-gpu-subsystem.md)
- [ ] **galaxy-renderer `dispose()` skips GPU teardown** `ready` — RAF loop + DOM listeners are removed but buffers/pipelines/UBOs (incl. per-extra UBOs) are never `destroy()`ed; spike-era behavior, flagged in the GPU-generation final review.
- [ ] **MW point-cloud follow-ups** `ready` — five small knots from the T10 radar (orphaned WESL helpers, record-field offsets, billboard-basis mirror, tool↔app constants, pick bind-group injection). → [details](backlog/2026-07-08-mw-point-cloud-follow-ups.md)
- [ ] **Galaxy impostor LOD** `needs-design` — per-galaxy rgba16f impostors baked from the GPU generator (photo-thumbnail band retires; procedural disk stays as placeholder band), full star+dust geometry above ~128 px; band counts, churn, per-tier memory, and Hubble-type coverage all measured. → [details](backlog/2026-07-08-galaxy-impostor-lod.md)
- [ ] **Conic orbit trails (real elements)** `needs-design` — replace the circle debug rings with exact Keplerian ellipses projected to a screen-space conic (f64 CPU compose, Sampson-distance stroke); approach user-ratified. → [details](backlog/2026-07-10-conic-orbit-trails.md)

## UI & UX

- [ ] **Palette pick should pin the InfoCard** `ready` — palette + deep-link navigate but don't pin the card; add a `requestSelect` command mirroring `requestFocus` (shared resolve loop) and compose both. → [details](backlog/2026-06-30-palette-pick-pins-infocard.md)
- [ ] **StatusBar mobile reflow** `ready` — reflow the StatusBar for narrow viewports (no media queries today). The InfoCard bottom-sheet + SettingsPanel collapse-launcher already shipped.
- [ ] **VolumeFieldRow schema-driven UI** `needs-design` — replace the seven hand-coded sliders with a settings-schema-generated UI.
- [ ] **Global shortcuts → keyboard saga** `needs-design` — migrate the non-tour keys (Cmd+K, /, Esc, f, h, l, Tab, d) from the `useKeyboardShortcuts` hook to a declarative map + a shared `watchKeyboardEventsSaga`. → [details](backlog/2026-06-29-keyboard-shortcuts-saga.md)
- [ ] **Label declutter toggle + hysteresis** `needs-design` — add `settings.labels.declutter` wired to `labelDirectorSubsystem` (replacing the `?nodeclutter` stopgap) and hysteresis-damp the cull so labels stop flickering under camera motion. → [details](backlog/2026-06-29-label-declutter-toggle.md)
- [ ] **Label fade opt-out ADR** `needs-design` — decide whether per-character MSDF label opacity opts out of the per-handle fade bind-group pattern; follow-up to ADR 0001.
- [ ] **Reusable structure-visit tour clip** `needs-design` — generalize the hardcoded Virgo/M87 tour beats into a parameterized `structureVisitClip`. Focus-isolation primitive already shipped. → [details](backlog/2026-06-29-structure-visit-tour-clip.md)
- [ ] **`emphasize()` clip cue** `ready` — per-structure spotlight lift composing with `fade` dims (staggered group highlights in the tour's neighbourhood beat). → [details](backlog/2026-07-07-emphasize-clip-cue.md)
- [ ] **DebugPanel sections → modules + containers** `ready` — migrate the remaining DebugPanel sections to CSS modules + per-section containers, like the two clip sections. → [details](backlog/2026-06-30-debugpanel-sections-modules-containers.md)
- [ ] **Tour-recorder follow-ups** `ready` — small post-merge items from the recorder's final review (observable settle discard, two test/diagnostic tidies). → [details](backlog/2026-07-08-tour-recorder-follow-ups.md)

## Docs & process

- [ ] **Cosmic-zoom plan review** `process` — 60-doc "Powers of Ten" walkthrough plan drafted in worktree `cosmic-zoom-plan` (2026-05-08), awaiting user review (memory `project_cosmic_zoom_plan`).

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
