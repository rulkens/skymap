# Files Inventory

Complete list of every document in this plan, with a one-line description of each. Use as a navigation aid.

## Top-level

- [`README.md`](README.md) — master index and "how to read this folder."
- [`SUMMARY.md`](SUMMARY.md) — two-page executive summary.
- [`INTEGRATION.md`](INTEGRATION.md) — module map, per-frame execution sequence, where the seams are.
- [`GLOSSARY.md`](GLOSSARY.md) — every term used across the plan, in plain language.
- [`FILES.md`](FILES.md) — this file.

## Vision (`vision/`)

The "what & why." Read before any other section.

- [`00-product-vision.md`](vision/00-product-vision.md) — the headline experience, target audiences, success criteria, design principles, non-goals.
- [`01-narrative-script.md`](vision/01-narrative-script.md) — the actual shooting script: 9 shells, 90 seconds, every camera beat and overlay line.
- [`02-aesthetic-references.md`](vision/02-aesthetic-references.md) — visual touchstones: Eames, Interstellar, Cosmos, KSP, Outer Wilds; color palette spec; typography; motion language.
- [`03-comparison-products.md`](vision/03-comparison-products.md) — survey of "scale of the universe" demos; what skymap takes from each; positioning.

## Shells (`shells/`)

One file per zoom level. The shell overview is the navigator.

- [`00-shell-overview.md`](shells/00-shell-overview.md) — table of all 9 shells with native units, camera origins, hero data, hero visuals, render passes.
- [`01-solar-system.md`](shells/01-solar-system.md) — Sun + 8 planets + Pluto in AU; ray-marched Sun, planet billboards on real orbits.
- [`02-stellar-neighborhood.md`](shells/02-stellar-neighborhood.md) — 7,500 Gaia DR3 stars within 50 pc; real BP-RP color, named bright stars labeled.
- [`03-milky-way.md`](shells/03-milky-way.md) — MW disk impostor + globular clusters + Sun marker + edge-on to top-down camera arc.
- [`04-local-group.md`](shells/04-local-group.md) — MW + M31 + M33 disks + Magellanic Clouds + ~80 dwarfs.
- [`05-local-sheet.md`](shells/05-local-sheet.md) — Tully 2GC group-colored galaxies showing the supergalactic-plane flatness.
- [`06-virgo-supercluster.md`](shells/06-virgo-supercluster.md) — galaxy point density at Virgo + ROSAT X-ray cluster halo + Great Attractor arrow.
- [`07-laniakea.md`](shells/07-laniakea.md) — CF-4 dark-matter density volume + flow vectors + Laniakea basin reveal. The hero shell.
- [`08-cosmic-web.md`](shells/08-cosmic-web.md) — full point cloud + DisPerSE filaments + Sloan Great Wall highlight.
- [`09-observable-universe.md`](shells/09-observable-universe.md) — Planck CMB sphere from inside; faint cosmic-web shell at center.

## Data (`data/`)

One file per dataset, plus the format spec. The catalog (`00-data-sources.md`) is the navigator.

- [`00-data-sources.md`](data/00-data-sources.md) — master catalog of every external dataset with sizes, licenses, risks.
- [`01-solar-system-ephemeris.md`](data/01-solar-system-ephemeris.md) — JPL Horizons / DE440 J2025.0 snapshot of 8 planets + Pluto.
- [`02-gaia-stars.md`](data/02-gaia-stars.md) — Gaia DR3 ADQL query, 50 pc cut, 32-byte/star binary.
- [`03-milky-way-model.md`](data/03-milky-way-model.md) — composite 2MASS + IRAS textures + Harris globular catalog.
- [`04-local-group-catalog.md`](data/04-local-group-catalog.md) — NED Local Volume Catalog + Karachentsev UNGC.
- [`05-tully-galaxy-groups.md`](data/05-tully-galaxy-groups.md) — Tully 2GC (2015) sidecar keyed by 2MRS ID.
- [`06-cluster-catalogs.md`](data/06-cluster-catalogs.md) — merged Abell + ACO + MCXC.
- [`07-cosmicflows.md`](data/07-cosmicflows.md) — CF-4 catalog + density grid + flow grid. CC BY-NC license caveat.
- [`08-rosat-xray.md`](data/08-rosat-xray.md) — ROSAT/MCXC L_X + R_500 per cluster (sidecar to clusters.bin).
- [`09-planck-cmb.md`](data/09-planck-cmb.md) — Planck PR4 SMICA equirectangular CMB texture.
- [`10-binary-formats.md`](data/10-binary-formats.md) — byte-level layout for every new `.bin` format.

## Rendering (`rendering/`)

GPU and math foundations.

- [`00-scale-architecture.md`](rendering/00-scale-architecture.md) — **foundational**: nested camera-relative frames, per-shell coordinates, render-pass orchestration.
- [`01-shell-transitions.md`](rendering/01-shell-transitions.md) — fadeAlphaAt math, per-boundary band tuning, camera-velocity-aware widening.
- [`02-camera-choreography.md`](rendering/02-camera-choreography.md) — TourEngine state machine, ShellBeat data, slerp orientation, pause/resume.
- [`03-volumetric-effects.md`](rendering/03-volumetric-effects.md) — shared raymarch framework for Sun corona, X-ray halos, DM density.
- [`04-text-overlay.md`](rendering/04-text-overlay.md) — two-layer text: MSDF world labels + DOM cinematic overlays.
- [`05-floating-origin.md`](rendering/05-floating-origin.md) — deep dive on f32-precision math, snap-once anchors, worked examples.
- [`06-depth-precision.md`](rendering/06-depth-precision.md) — per-shell near/far derivation, reverse-Z, depth-buffer format choice.
- [`07-performance.md`](rendering/07-performance.md) — per-shell budget, adaptive quality, GPU bandwidth, profiling tools.

## UX (`ux/`)

Interaction and copy.

- [`00-interaction-model.md`](ux/00-interaction-model.md) — entry modes, state machine, pause/resume, free-fly, exit semantics.
- [`01-information-overlays.md`](ux/01-information-overlays.md) — React TourOverlay component design, layout, animation, sync with tour engine.
- [`02-information-content.md`](ux/02-information-content.md) — voice & tone guide, every overlay's primary copy + secondary "more info" prose.
- [`03-controls.md`](ux/03-controls.md) — keyboard / mouse / touch / SpaceMouse mapping per tour state.
- [`04-accessibility.md`](ux/04-accessibility.md) — WCAG 2.1 AA, prefers-reduced-motion, screen-reader, motion-sickness mitigation.
- [`05-mobile.md`](ux/05-mobile.md) — touch interactions, layout reflow, per-shell mobile fallbacks, bandwidth strategy.
- [`06-onboarding.md`](ux/06-onboarding.md) — first-time-visitor "Take the tour" affordance discovery and post-tour hint.

## Implementation (`implementation/`)

Build order and execution.

- [`00-phasing.md`](implementation/00-phasing.md) — 6 phases from Phase 0 (prereqs) through Phase 5 (perf+polish) + Phase 6 (launch).
- [`01-mvp-definition.md`](implementation/01-mvp-definition.md) — what to cut to ship in half the time; recommended MVP shells.
- [`02-dependency-graph.md`](implementation/02-dependency-graph.md) — what blocks what; critical path analysis; parallelization opportunities.
- [`03-risk-register.md`](implementation/03-risk-register.md) — 15-25 risks with probability × impact × mitigation × contingency × owner.
- [`04-milestones.md`](implementation/04-milestones.md) — 9 demoable checkpoints (M0–M8) with exit criteria, calendar, decision points.
- [`05-test-plan.md`](implementation/05-test-plan.md) — unit / integration / visual regression / perf / manual / usability.

## Decisions (`decisions/`)

ADRs (Architecture Decision Records). Read when you want to question or change a load-bearing choice.

- [`0001-floating-origin.md`](decisions/0001-floating-origin.md) — per-shell floating origin with f64-on-CPU / f32-on-GPU.
- [`0002-shell-discrete-vs-continuous.md`](decisions/0002-shell-discrete-vs-continuous.md) — discrete named shells with crossfade, not continuous coords.
- [`0003-data-format-strategy.md`](decisions/0003-data-format-strategy.md) — bespoke per-dataset binaries with shared 16-byte header.
- [`0004-camera-rotation-during-tour.md`](decisions/0004-camera-rotation-during-tour.md) — slerp toward next waypoint per leg.
- [`0005-units-and-scale.md`](decisions/0005-units-and-scale.md) — per-shell native unit (AU/pc/kpc/Mpc/Gpc).
- [`0006-information-pacing.md`](decisions/0006-information-pacing.md) — max 3 sentences, max 8 s visible per overlay.
- [`0007-data-licensing.md`](decisions/0007-data-licensing.md) — accept CF-4 CC BY-NC; flag for future commercial pivot.
- [`0008-build-pipeline.md`](decisions/0008-build-pipeline.md) — per-shell datasets built at deploy time, hosted on R2, lazy-loaded at runtime.
- [`0009-existing-plan-coordination.md`](decisions/0009-existing-plan-coordination.md) — sequence cosmic zoom AFTER engine restructure / MSDF labels / asset-loader land.
