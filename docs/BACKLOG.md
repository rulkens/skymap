# Skymap Backlog

Curated list of pickup-able work and surfaced issues. Living document — update when a plan starts, completes, or a new issue is captured. The git log is the ground truth for *what shipped*; this file is the ground truth for *what's next*.

> **Conventions**
> - Anything in `docs/superpowers/plans/completed/` or `docs/superpowers/specs/completed/` is shipped and intentionally absent from this file.
> - "Pickup-able" = the writing is done (or done enough) that an implementer could start without re-doing design.
> - "Deferred" = scoped out of an existing plan or ADR with a paper trail; needs its own plan when prioritised.
> - "Surfaced issue" = a known wart with a diagnosis but no plan or spec yet. May graduate to either.
>
> **Process**
> - When a plan ships, `/feature-done` audits and (on READY) moves the plan + matching spec to `completed/`.
> - When a spec graduates to a plan, leave the spec where it is; the plan links back to it. Both move together once the plan ships.
> - When an issue here gets a plan, delete its line; the plan link replaces it.

---

## ADRs

| ADR | Status | Executed by |
|---|---|---|
| [0001 — Fade ownership](adrs/0001-fade-ownership.md) | Accepted 2026-05-27 | [renderer-interface-extraction plan](superpowers/plans/2026-05-27-renderer-interface-extraction.md) — not started |

---

## Plans ready to pick up

Plans live in `docs/superpowers/plans/`. All have TDD task lists with checkboxes; pick one and run it via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

- **[2026-05-27 Renderer interface extraction](superpowers/plans/2026-05-27-renderer-interface-extraction.md)** — executes ADR 0001 + closes the "Option C" outlier in the renderer conventions doc. 14 tasks. `FieldEntry` 12 → 5 props; per-slot setter cascade collapses to one `applySettings`; fade GPU resources move to `FadeRegistry`.
- **[2026-05-20 Splash screen — Part 2 (tour)](superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md)** — replaces Part 1's no-op Tour button with a six-beat camera tour. Re-architected 2026-06-04 from a throwaway React stub into an **engine-side seed**: `engine.tour` handle + `tourSubsystem` (frame-driven, in the RoD gate) + `TourBeat`/`TourFocus`/`TourEffect` data model, so the cinematic tour extends it. Part 1 shipped (PR #178); Tour CTA currently dismisses without running. Resolves the cinematic spec's decision 4.

---

## Specs awaiting plans

Design is captured; an implementer or `superpowers:writing-plans` needs to turn each into a task list before pickup.

- **[2026-06-01 Engine data stores](superpowers/specs/2026-06-01-engine-data-stores-design.md)** — per-type data stores + demand-driven loading, the next stage of the engine data-layer redesign. The prerequisite wireSlots refactor shipped (#237); this spec and the POI realignment below are the remaining two stages and need plans.
- **[2026-05-07 Tour animation](superpowers/specs/2026-05-07-tour-animation-design.md)** — brainstorm, re-grounded 2026-06-04. Two of six open decisions are now resolved by shipped code (MSDF labels + Milky Way impostor); the cinematic palette (focusable clusters/SC/voids, MCPM volume, filaments, milliquas, horizon shell) is documented. Remaining open: rotation-toward-target slerp, per-beat caption producer, beat list/timing, tour-engine API shape. Finish those, then promote to a plan. The cinematic successor to the Part-2 stub tour.

---

## Deferred from existing plans / ADRs

Scoped out of a parent plan or ADR with explicit rationale; needs its own ADR or plan when picked up.

From [renderer-interface-extraction plan §Out of scope](superpowers/plans/2026-05-27-renderer-interface-extraction.md):
- **Source-registry factory** — auto-generate fetcher + slot + UI rows from a single `SOURCE_REGISTRY` entry.
- **Render-graph / frame-graph restructuring** of `runFrame.ts` and the pass DAG.
- **Settings schema with auto-generated UI** for `VolumeFieldRow`'s seven sliders.
- **Half-res offscreen ↔ post-process resize coupling** type-enforcement.
- **Selection / picking GPU resource migration** to its subsystem (parallel to fade per ADR 0001; needs its own ADR — pick texture is per-camera, not per-handle).

From [ADR 0001 §"explicitly not deciding"](adrs/0001-fade-ownership.md):
- **Label fade opt-in / opt-out decision** — per-character MSDF opacity may not fit the per-handle bind-group pattern; needs a follow-up ADR if labels opt out.

---

## Surfaced issues

Diagnosed but unplanned. Captured here so they don't get lost; promote to a spec or plan when prioritised. Most have richer notes in agent memory (`~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/`).

- **Mobile layout reflow** — hover-on-touch is handled (`disable hover on touch input`, #226: hover-only affordances now route through tap). What remains is the general responsive layout pass: reflow the InfoCard / SettingsPanel / StatusBar for narrow viewports so the UI is usable on a phone, not just non-broken.
- **Lower-tier "close to home" weighting** — retune the small/medium tier subsampling so more galaxies survive near the camera's home position for maximum visual density on first load, while keeping the on-screen count fast. Distinct from the deliberate SDSS far-shell sample (memory `project_sdss_medium_intentionally_far`).
- **Milliquas colour check** — Milliquas points currently all render blue; verify the colour-index / colour mapping for the quasar source isn't collapsing to a single hue.
- **Tour feature (full)** — finish the camera tour beyond the Part-2 seed. Tracked design: [splash-screen Part 2 plan](superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md) (ready to execute; engine-side `engine.tour` seed, verified current 2026-06-04) and [2026-05-07 tour-animation spec](superpowers/specs/2026-05-07-tour-animation-design.md) (re-grounded 2026-06-04; labels + MW impostor + engine-API decisions resolved, cinematic palette documented). Execute Part 2 first, then resolve the spec's remaining open decisions (rotation slerp, caption producer, beat list/timing), promote to a plan, and extend the seed into the real waypoint tour.
- **Thumbnail quality (SDSS / DSS branches)** — the auto-fetched SDSS-cutout and CDS-DSS thumbnails still have the original quality issues: ranked fix options are mask, sky-sub, per-galaxy size, DESI source, brightness norm (see memory `project_thumbnail_quality`). The *famous-galaxy* branch is now fully addressed — procedural-disk fade-out, high-res LOD (#214), and thumbnail calibration + square deproject + disk-plane unification (#229/#234/#235/#240) all shipped — so this item is scoped to the non-curated SDSS/DSS path only.
- **Supercluster/wall shape accuracy (focus mode)** — cluster-focus mode (PR #242) renders membership as a sphere of radius `apparentRadiusMpc ?? physicalRadiusMpc` centred on the catalog centroid. For superclusters/walls (MSCC) this is crude: the structure is a flattened sheet, so the sphere swallows foreground/background voids and clips the wall's arms (e.g. Hydra Wall reads ~847 galaxies at medium tier). No all-sky per-galaxy membership catalog exists to replace it — redMaPPer/WHL give cluster member galaxies but only in the SDSS footprint; Liivamägi+2012 gives galaxy→supercluster IDs but is also SDSS-limited and threshold-dependent. Investigate a better proxy: (a) **ellipsoid fit** from MSCC member-cluster positions (`memCl` column — data we already have); (b) **density-field membership** reusing the rhizome/MCPM cosmic-web field or DisPerSE filaments (all-sky, same method the literature uses). Option (a) is cheap and immediate; (b) is more principled and reuses existing plumbing.
- **GLADE shell artifact at ~400 Mpc** — hard depth boundary created by Task 7 abs-mag filter; 3 fix options deferred 2026-05-04. See memory `project_glade_shell_artifact`.
- **Per-frame thumbnail-priority loop CPU cost** — RoD + stride decimation (PR #79) addressed panning case; BVH or compute-shader pass needed if scaling to larger tiers. See memory `project_thumbnail_loop_perf`.
- **Cosmic zoom plan** — 60-doc "Powers of Ten" walkthrough plan drafted in worktree `cosmic-zoom-plan` (2026-05-08), awaiting user review. See memory `project_cosmic_zoom_plan`.
- **Cluster / supercluster search** — the command palette (`CommandPalette.tsx`) only indexes the famous-galaxy atlas (~75) and the PGC alias index (~48k GLADE+2MRS rows). Clusters and superclusters (MCXC + MSCC, names + Abell numbers + descriptions already in `public/data/clusters_meta.json`) aren't searchable, so there's no way to look up "Coma", "A2703", "MSCC 216", etc. and fly to them. Add a third search index over the cluster catalog + a select handler that selects the cluster POI and frames the camera. Naturally pairs with naming large-scale structures (e.g. a "Sloan Great Wall" / "CfA Great Wall" entry) so they become navigable by name.

---

## External / blocked

Tracked here so the dependency is visible; no skymap-side work until unblocked.

- **Rhizome SDSS calibration** — in flight in the PolyPhy fork (branch `rhizome-spec`, PR #114). Skymap is read-only on this surface until calibration lands. See memory `project_rhizome_handoff_in_flight`.
- **HyperLEDA cache backfill** — R2 cache is intentionally partial (52k / ~1.5M PGCs). Do not auto-trigger a re-fetch; promote only if a concrete need surfaces. See memory `project_hyperleda_partial_cache`.

---

## Outreach (long-tail)

The outreach push has its own per-task plan tree under [`superpowers/plans/2026-05-05-outreach-and-promotion/`](superpowers/plans/2026-05-05-outreach-and-promotion/). The actionable open items live in [`TODO.md`](superpowers/plans/2026-05-05-outreach-and-promotion/TODO.md). Top-level outstanding:

- JOSS submission (Task 3) — `paper/paper.md` + `paper/paper.bib`.
- RNAAS submission (Task 6) — short note + PDF.
- Remaining Reddit posts (Task 4) — r/Astronomy (video), r/WebGPU (video), reschedule r/MapPorn.
- 5 academic outreach emails (Task 5) — SDSS, GLADE, AAS WWT, CDS, LVK EM.

---

## Reference docs (not pickup-able)

Living context docs; cite them from plans rather than turning them into work.

- [`audits/`](audits/) — backward-looking codebase critiques (code reviews, renderer audits)
- [`research/`](research/) — forward-looking surveys (cluster/void viz, cosmic web)
- [`superpowers/conventions/`](superpowers/conventions/) — renderer + plan conventions
