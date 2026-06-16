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
| [0001 — Fade ownership](adrs/0001-fade-ownership.md) | Accepted 2026-05-27 | Original executor ([renderer-interface-extraction plan](superpowers/plans/archive/2026-05-27-renderer-interface-extraction.md)) **archived/superseded**; the `bindGroupFor`/`flushGpu` mechanism is reworked by the live [fade-ownership merged design](superpowers/specs/2026-06-15-fade-ownership-visibility-seam-merged-design.md) (designed, awaiting plan) |

---

## Plans ready to pick up

Plans live in `docs/superpowers/plans/`. All have TDD task lists with checkboxes; pick one and run it via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

- **Fade ownership + visibility seam** — three sequenced plans off the [2026-06-15 merged design](superpowers/specs/2026-06-15-fade-ownership-visibility-seam-merged-design.md) (braid #1 already shipped, #309). The visibility seam is the **#39 cinematic-tour prerequisite** — it gives the tour a single capture/restore surface. Order: **A → B**, **C anytime**. **A + B shipped; C now pickable.** (Spec stays live until C lands.)
  - **A — manifest seed** — ✅ **shipped** ([completed plan](superpowers/plans/completed/2026-06-16-fade-ownership-A-manifest-seed.md)). `FADE_LAYERS` + `seedFades` gave fade-handle registration one home; the four out-of-band register sites are gone.
  - **B — intent bridge + #38 seam** — ✅ **shipped** ([completed plan](superpowers/plans/completed/2026-06-16-fade-ownership-B-intent-bridge-seam.md)). `syncVisibilityFades`/`applyIntent` gave intent→fade one home; `captureSettings`/`restoreSettings`/`applyEffect` snapshot seam built; flow drive-guard deleted; `surveyLabel`/`galaxyNames` seam resolved (producers are now pure readers).
  - **[C — renderer mirrors](superpowers/plans/2026-06-16-fade-ownership-C-renderer-mirrors.md)** — drop `flowFieldRenderer.hasField` + `selectionRingRenderer.currentSelection`. Independent, anytime.
- **[2026-05-20 Splash screen — Part 2 (tour)](superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md)** — replaces Part 1's no-op Tour button with a six-beat camera tour. Re-architected 2026-06-04 from a throwaway React stub into an **engine-side seed**: `engine.tour` handle + `tourSubsystem` (frame-driven, in the RoD gate) + `TourBeat`/`TourFocus`/`TourEffect` data model, so the cinematic tour extends it. Part 1 shipped (PR #178); Tour CTA currently dismisses without running. Resolves the cinematic spec's decision 4.

---

## Specs awaiting plans

Design is captured; an implementer or `superpowers:writing-plans` needs to turn each into a task list before pickup.

- **[2026-05-07 Tour animation](superpowers/specs/2026-05-07-tour-animation-design.md)** — brainstorm, re-grounded 2026-06-04. The decisions that were open now resolve: MSDF labels + Milky Way impostor shipped, and the tour-engine API shape is settled by the Part-2 engine-side seed (`engine.tour` + `tourSubsystem` + the `TourBeat` model). The cinematic palette (focusable clusters/SC/voids/groups, MCPM volume, filaments, milliquas, horizon shell) is documented. Remaining open: rotation-toward-target slerp, per-beat caption producer, beat list/timing. Finish those, then promote to a plan. The cinematic tour extends the Part-2 seed.

---

## Deferred from existing plans / ADRs

Scoped out of a parent plan or ADR with explicit rationale; needs its own ADR or plan when picked up.

From [renderer-interface-extraction plan §Out of scope](superpowers/plans/archive/2026-05-27-renderer-interface-extraction.md) (plan archived/superseded; these deferred items remain independently valid):
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

- **Verify structure-ring click after the `poiIndex`→`structureIndex` WESL rename** — surfaced 2026-06-08 in the poi-free refactor (#288). The structureMarker pick varying was renamed `poiIndex`→`structureIndex` across `structureMarker/{io,ring,halo,ringPick}.wesl` + the renderer/decode TS. Covered by `ringPick.test.ts` + a clean WESL build, but it never got a *visual* check this session — clicking a cluster/supercluster/void/group ring on the dev server and confirming the right structure selects. Quick manual smoke test; if a ring stops responding to clicks, the renamed pick varying is the first place to look.
- **Mobile layout reflow** — hover-on-touch is handled (`disable hover on touch input`, #226: hover-only affordances now route through tap). What remains is the general responsive layout pass: reflow the InfoCard / SettingsPanel / StatusBar for narrow viewports so the UI is usable on a phone, not just non-broken. **Update 2026-06-07:** the InfoCard half is specced — [2026-06-07 mobile bottom-sheet design](superpowers/specs/2026-06-07-mobile-info-card-bottom-sheet-design.md) (awaiting plan); the SettingsPanel launcher is a gated fast-follow pending an `entanglement-radar` pass over `SettingsPanel`.
- **Lower-tier "close to home" weighting** — retune the small/medium tier subsampling so more galaxies survive near the camera's home position for maximum visual density on first load, while keeping the on-screen count fast. Distinct from the deliberate SDSS far-shell sample (memory `project_sdss_medium_intentionally_far`).
- **Densely seed the Local Volume across all tiers (group explorability)** — surfaced 2026-06-04 with the `group` category. The 16 Local Volume groups are only interesting to fly into if their *member* galaxies are present, but `subsampleByAbsMag` (`tools/catalog/`) thins the nearby volume by absolute-magnitude cut, so faint dwarfs in the Local Group / M81 / Cen A / Sculptor etc. get culled — a group ring you focus into can be nearly empty at small/medium tier. Bias the subsampling to **keep galaxies inside (or near) the featured group spheres** regardless of `M_abs`, across small + medium and ideally large tiers, so each group has as many members as possible. Related to but distinct from the "close to home" weighting above: that's camera-home density; this is per-group membership density keyed off the structure seed. Implementation hooks: the group seed positions/radii (`data/structure_anchors.seed.json`) are available to the build, so the subsampler can spare points within `apparentRadiusMpc` of each group centre. Keep an eye on the on-screen count budget. Pairs with the cluster-focus member count (`PoiDetailCard` "Galaxies" row) — denser seeding makes that number meaningful at lower tiers.
- **Milliquas needs its own colormap (AGN ≠ galaxy)** — Milliquas points render overwhelmingly blue. The *clamp* half shipped (#282): the redshift K-correction (`kPerZ`) was subtracting more than the whole `[0,2]` ramp span for high-z quasars and pinning every row to the blue floor; `kPerZ` is now 0 so the real B−R spread survives. What remains is the **semantic mismatch**: quasars genuinely have small B−R, so on the galaxy star-forming↔elliptical ramp they legitimately land in the blue third, but "blue" there means "star-forming galaxy" — the wrong reading for a non-thermal AGN continuum. The fix is to give AGN their own visual encoding instead of reusing the galaxy ramp. Directions to weigh in the brainstorm: (a) a distinct AGN ramp (violet/amber) keyed on B−R so quasars read as a different object class; (b) encode **redshift** instead of colour (z is the meaningful axis for objects spanning the observable universe); (c) tint by the Milliquas **class byte** (Q/A/B/K/N/S) or parent-survey byte — both already on the `.bin`. Likely needs a `colourMode` discriminant on `SOURCE_REGISTRY` + a shader ramp branch; brainstorm → spec → plan, not a drop-in.
- **Tour feature (full)** — finish the camera tour beyond the Part-2 seed. Tracked design: [splash-screen Part 2 plan](superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md) (ready to execute; engine-side `engine.tour` seed, verified current 2026-06-04) and [2026-05-07 tour-animation spec](superpowers/specs/2026-05-07-tour-animation-design.md) (re-grounded 2026-06-04; labels + MW impostor + engine-API decisions resolved, cinematic palette documented). Execute Part 2 first, then resolve the spec's remaining open decisions (rotation slerp, caption producer, beat list/timing), promote to a plan, and extend the seed into the real waypoint tour.
- **Thumbnail quality (SDSS / DSS branches)** — the auto-fetched SDSS-cutout and CDS-DSS thumbnails still have the original quality issues: ranked fix options are mask, sky-sub, per-galaxy size, DESI source, brightness norm (see memory `project_thumbnail_quality`). The *famous-galaxy* branch is now fully addressed — procedural-disk fade-out, high-res LOD (#214), and thumbnail calibration + square deproject + disk-plane unification (#229/#234/#235/#240) all shipped — so this item is scoped to the non-curated SDSS/DSS path only.
- **Supercluster/wall shape accuracy (focus mode)** — cluster-focus mode (PR #242) renders membership as a sphere of radius `apparentRadiusMpc ?? physicalRadiusMpc` centred on the catalog centroid. For superclusters/walls (MSCC) this is crude: the structure is a flattened sheet, so the sphere swallows foreground/background voids and clips the wall's arms (e.g. Hydra Wall reads ~847 galaxies at medium tier). No all-sky per-galaxy membership catalog exists to replace it — redMaPPer/WHL give cluster member galaxies but only in the SDSS footprint; Liivamägi+2012 gives galaxy→supercluster IDs but is also SDSS-limited and threshold-dependent. Investigate a better proxy: (a) **ellipsoid fit** from MSCC member-cluster positions (`memCl` column — data we already have); (b) **density-field membership** reusing the rhizome/MCPM cosmic-web field or DisPerSE filaments (all-sky, same method the literature uses). Option (a) is cheap and immediate; (b) is more principled and reuses existing plumbing.
- **GLADE shell artifact at ~400 Mpc** — hard depth boundary created by Task 7 abs-mag filter; 3 fix options deferred 2026-05-04. See memory `project_glade_shell_artifact`.
- **Per-frame thumbnail-priority loop CPU cost** — RoD + stride decimation (PR #79) addressed panning case; BVH or compute-shader pass needed if scaling to larger tiers. See memory `project_thumbnail_loop_perf`.
- **`state.bias` output bag has no writer — vestigial frame plumbing** — surfaced 2026-06-16 while auditing what `runFrame` derives. `EngineState.bias` (`EngineBiasState` = `{ apparentMagLimit, schechterMStar, schechterAlpha }`, distinct from the user knobs on `settings.bias` = `{ mode, absMagLimit }`) is documented as "worker bake outputs," but **nothing writes its three fields**: they're initialised to `0,0,0` (`engine.ts:359-361`) and never reassigned. `biasCorrectionSubsystem` (the claimed producer) instead caches per-source ratios in maps and **splices them into the renderer's per-source vertex buffers** (`spliceSchechterRatios`/`spliceAngularWeights`) + the per-vertex `schechterRatio` slot — it never touches `state.bias`. The three fields are read in exactly one place (`runFrame.ts:294-296` → `renderFrame` → the points `Uniforms`). **Not trivially dead, though:** the shader uniform fields of the same name (`io.wesl:160-162`) *are* declared, and the io.wesl comment says the `schechter*` uniforms are "written **PER SOURCE** between draw calls" — `pointRenderer` writes those same `f32[34..36]` slots per source at draw time. So the live values come from the renderer's per-source write; the `state.bias → renderFrame` path looks like a base-write that's always overwritten (or a write to a slot the shader ignores in favour of the per-vertex `schechterRatio`). **Needs a trace** of the renderFrame uniform write vs the pointRenderer per-source write (same byte offset? same draw?) to confirm `state.bias` is genuinely inert before deleting. If confirmed: drop the three `EngineBiasState` fields + the `runFrame`/`renderFrame` global-uniform plumbing, and **either way fix the misleading docstrings** (`EngineBiasState.d.ts`, `engine.ts:301`) that describe a `subsystem → state.bias → shader` dataflow that doesn't exist — the correction reaches the GPU per-source, not through this bag. Isolated cleanup; not entangled with the fade work.
- **Galaxy-catalog slot commit infers "tier-swap dissolve" from a leaky `isFirstLoad` proxy** — surfaced 2026-06-16. `wireGalaxyCatalogSourceSlot`'s commit fades the layer OUT (`fadeTo(id, 0)`) before upload whenever `!isFirstLoad` (the catalog is already in the store). It's the *only* slot commit that fades out — `filamentSlot`/`flowFieldSlot`/the volume slots just upload + fade in — and `isFirstLoad` is a proxy for "is this a tier swap." Leaky: ANY second commit (tier swap, but also a re-enable reload, `forceReload`, or a dev double-bootstrap) triggers a spurious dissolve. The dissolve belongs to the only operation that *means* it — `setTier` — not to the generic commit. Fix: either (a) `setTier` fades each source out before issuing the reload and the commit drops the fade-out, or (b) add an explicit `tierSwap: boolean` to the reload request (set only by `setTier`) and gate the commit's fade-out on that — (b) keeps the dissolve→upload→fade-in choreography (the upload lives in the commit, and the dissolve must finish before the old buffer is destroyed). NOT the cause of the "galaxies dim on first input" bug (that was the bias render-wake, #326) — a separate latent wart. Lower priority; the per-item fade-in scope fix already shipped on the fade-ownership branch.
- **Structure-category identity is spelled out in N parallel places (DRY)** — surfaced while adding the `group` category (2026-06-04). Mostly resolved by PR #276, which made `SOURCE_REGISTRY` the single source of truth: every source gained a readable `id`; the structure discriminator is `type: 'structure'`; `StructureCategory` / `STRUCTURE_CATEGORIES` / `STRUCTURE_CATEGORY_CODES` derive from the registry's structure rows; `unpackPick` decodes straight off the registry (no inverse `code → category` table); the renderer's marker buckets and `clickHandler`'s guard read the derived category set. Resolved sub-items:
  - ✅ **Bidirectional `category ↔ Source-code` map** — was two hand-maintained inverses (`SOURCE_CODE_BY_CATEGORY` forward + the `if (sourceCode === 5) → 'cluster'` inverse in `unpackPick`). Now one direction derived from the registry; decode reads the registry directly.
  - ✅ **`PickResult.kind` re-spelling `StructureCategory`** — now `kind: StructureCategory`, not longhand `'galaxy' | <each category>`.
  - ✅ **Untotality-checked disjunctions / arrays** — `clickHandler`'s POI guard is `!== 'galaxy'`; the renderer's per-category `Record` literals come from a `byCategory()` helper seeded off `STRUCTURE_CATEGORIES`.

  **Still open (follow-ups):**
  - **Pure copy-paste:** the `{ cluster: true, supercluster: true, void: true, famousGalaxy: true }` visibility default appears **8×** (`useEngineSettings.ts` ×2, `engine.ts` ×2, 4 test fixtures) — should be one `DEFAULT_CATEGORY_VISIBILITY` const.
  - **`meta`-flag derivations:** add `hasBulkCatalog` / `markerBearing` to each registry row so `BULK_CATALOG_CATEGORIES` and `POI_CATEGORIES_WITH_MARKERS` *derive* from flags rather than being hand-listed. **Do not** merge the three category *lists* (UI / marker / bulk-fetch) — membership genuinely differs (`group` ∈ UI+marker, ∉ bulk-fetch). **Keep** the totality-checked per-attribute `Record<StructureCategory, …>` tables (`STRUCTURE_POI_STYLES`, `POI_CATEGORY_INFO`, `CATEGORY_MULTIPLIER`) — their compile errors are a *feature* (a checklist).
- ~~**Promote the Milky Way to a first-class `Source` (streamline its identity)**~~ — **DONE.** Specced + planned 2026-06-15 (docs PR #315), shipped across three sequenced plans: Part 0 selection/target unification (PR #316), Part 1 fade/source naming consistency + `StructureCategory`→`StructureId` (PR #317), Part 2 MW selectable (pick-only galactic-centre billboard + `MilkyWayInfo` + standard select→focus, retiring the `__milky-way__` sentinel, the `App.tsx` onSelect special-case, and `focusOnMilkyWay`). The earlier label half landed in PR #313 (first-class `milkyWay` label category, `youAreHereSubsystem` deleted) + PR #312 (`milkyWay` registry row, code 16). The procedural-disk **renderer** stays bespoke by design. Spec + plans archived under `*/completed/`.
  - **Still open (deferred):** MW URL deep-linking (`#focus=milkyway` round-trip) — needs the `FocusTarget` parser to grow a milkyWay kind (see the spec's out-of-scope). `URL_HASH_FOR['milkyWay']` currently returns null (clears the focus hash).
- ~~**`cluster*` → `structure*` naming migration**~~ — **DONE (PR #280).** The featured-structure seam was named after one of the four categories it holds (cluster / supercluster / void / group); the rest of the codebase had already moved to `Structure*` vocabulary in #253/#254. The whole holdout set is now renamed: the catalog family (`StructureCatalog*`, `structureCatalogFormat`, `structureCatalogSlot`, `structureCatalogFetcher`, `structureCatalogToStructures`), the focus subsystem (`structureFocusSubsystem`), the seed parser (`parseStructureSeed` / `StructureSeedEntry`) + seed file (`data/structure_anchors.seed.json`) + registry key (`structures.seed`), the membership util (`structureMembership`), the build tool (`tools/structures/buildStructures.ts`) and fetcher (`fetchStructureCatalogs`), and the served artifacts (`structures.ccat` / `structures_meta.json`) + their npm scripts (`build-structures` / `fetch-structures`). The cluster CATEGORY (`Source.Cluster`, the `'cluster'` id, X-ray clusters/MCXC, member clusters/MSCC) and the `.ccat` extension / `CCAT` magic stay verbatim. **Deploy:** the artifact rename means a `npm run build-structures` + `npm run sync-r2-secure` re-publish from the main worktree is required so R2 serves `structures.ccat` / `structures_meta.json` under the new names.
- **Cosmic zoom plan** — 60-doc "Powers of Ten" walkthrough plan drafted in worktree `cosmic-zoom-plan` (2026-05-08), awaiting user review. See memory `project_cosmic_zoom_plan`.
- **Structure search (cluster / supercluster / void)** — the command palette (`CommandPalette.tsx`) only indexes the famous-galaxy atlas (~75) and the PGC alias index (~48k GLADE+2MRS rows). Structure POIs — clusters, superclusters, and voids (MCXC + MSCC, names + Abell numbers + descriptions already in `public/data/structures_meta.json`) — aren't searchable, so there's no way to look up "Coma", "A2703", "MSCC 216", a named void, etc. and fly to them. Add a third search index over the structure catalog (all three categories) + a select handler that selects the structure POI and frames the camera. Naturally pairs with naming large-scale structures (e.g. a "Sloan Great Wall" / "CfA Great Wall" entry) so they become navigable by name.
- **No general `add-data-source` skill (+ its checklist)** — surfaced 2026-06-04 while adding `group`. Skills exist for the *narrow* cases (`add-famous` for the famous-galaxy pipeline, `link-data` for symlinking real catalogs into a worktree) but there's no skill that walks the full "add a new data source / featured category" path, so steps get missed piecemeal. Concrete checklist items discovered the hard way, each of which should live in such a skill:
  - **Settings-panel per-category count.** A new structure category must be added to the `onStructureCountsChange` emission (`wireStructureProjection.ts` `emitCounts`) — the SettingsPanel only renders a count when `structureCounts?.[cat] !== undefined`, so a missing category shows a toggle with no number (the `group` bug, fixed 2026-06-04 + guarded by a test). Any per-source/per-category count surfaced in the UI has this shape.
  - **Seed the real data early** (memory `feedback_seed_data_early`): wire real data right after the parser, not as a late task, so the rest of the work has something to look at.
  - Plus the structure-category-identity sites enumerated in the DRY item above (source code, pick decode, marker buckets, visibility defaults, focus framing, marker style, `POI_CATEGORY_INFO`).

  The checklist is the deliverable; the skill is the home for it. Pairs with the `STRUCTURE_CATEGORY_META` consolidation (a `meta`-derived category set would let several of these checklist items become compile-time-enforced rather than prose).

---

## External / blocked

Tracked here so the dependency is visible; no skymap-side work until unblocked.

- **Rhizome SDSS calibration** — in flight in the PolyPhy fork (branch `rhizome-spec`, PR #114). Skymap is read-only on this surface until calibration lands. See memory `project_rhizome_handoff_in_flight`.
- **HyperLEDA cache backfill** — R2 cache is intentionally partial (52k / ~1.5M PGCs). Do not auto-trigger a re-fetch; promote only if a concrete need surfaces. See memory `project_hyperleda_partial_cache`.
- **DESI DR1 as a data source** — verified viable and ~90% new data (extends the map in depth), but blocked on rendering capacity: DESI adds ~10× points (~9.75M from LSS alone) and skymap is already at the interactive-render limit. Revisit only after a major engine improvement lifts the point ceiling (~25M+). Full facts + overlap analysis in [`research/2026-06-05-desi-dr1-as-a-data-source.md`](research/2026-06-05-desi-dr1-as-a-data-source.md). See memory `project_desi_deferred`.

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
