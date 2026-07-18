# Grill Session: Gaia Star Bin — 2026-07-13

Source: user prompt ("we should start thinking about a star bin") in the main-worktree session, following zoom-to-earth plans 02/03 introducing the SCENE_STARS anchors and star point/sphere layers.

Goal: decide the size, contents, format, and rendering/pipeline architecture of a real-catalog stellar `.bin` for skymap — the bulk-star counterpart to the galaxy catalog bins. Outcome: a full decision ledger for a (c)-regime Gaia bin; the a+b solar-neighborhood bin is explicitly a separate future project.

---

## Q1: Which rendering regime is the star bin for?

**The question:** A "star bin" can serve three very different visuals, with order-of-magnitude different catalog/size consequences. Which one is this?

**Considerations:**

- **Option A (night sky from Earth):** the recognizable constellations at the zoom-to-earth endpoint. Naked-eye complete ≈ 9,000 stars (mag ≤ 6.5, Yale BSC / HYG); < 1 MB. Positions matter mostly as directions.
- **Option B (3D solar-neighborhood flythrough):** flying out from Earth with visible depth parallax — the SCENE_STARS experience but dense. Gaia parallaxes within ~100–500 pc; 100k–10M stars, tens-to-hundreds of MB.
- **Option C (Milky Way from outside, real stars):** Gaia-scale structure. Initially assumed unservable, but Q1's follow-up (see below) established a ~75 MB bin holds 10–20M stars with aggressive compression.

Initial recommendation was A+B in one bin, explicitly not C (leaving C to the procedural MW cloud). The user countered by asking what C would look like at ~75 MB with maximum compression.

**Decision:** **Build the C bin now; A+B become a separate later project (separate bin).** The compression analysis (Q1a) showed C is feasible at 75 MB, and the user wants both eventually but C first.

## Q1a: Can a regime-C bin be compressed to ~75 MB, and what does that look like?

**The question:** (User-posed.) How aggressively can a stellar catalog be packed, how many stars fit in 75 MB, and how would it render?

**Considerations:**

- Galaxy-bin style (f32 fields, 64 B/record) is the wrong tool — a bulk star needs only position, luminosity, color; no IDs, no names, no per-star pick.
- **Cell-quantized layout:** Morton-ordered grid (~512³ cells); per star 10-bit in-cell position offsets (30 bits, ~0.08 pc resolution), 7-bit absolute magnitude (0.19-mag steps), 6-bit color (BP−RP LUT) → **~6 B/star packed**, which is also the GPU-resident size via shader-side unpacking.
- Counts at 75 MB: f32 ≈ 4M; naive 16-bit quantized (8 B) ≈ 9.5M; cell-quantized (6 B) ≈ 13M; + zstd/brotli over Morton-sorted cells → ~4–4.5 B effective transfer ≈ **17–19M stars** (store pre-compressed on R2, inflate with browser-native `DecompressionStream`). A Gaia cut at roughly G < 13.5 fits.
- Rendering: **vertex pulling** from a packed storage buffer (manual u32 unpack sidesteps vertex-format alignment; reuses the 3-vertex triangle-billboard trick from #428); per-cell origins for dequantization; the cells double as the culling/LOD structure; additive HDR accumulation through the existing tone-map path.
- Honesty caveat: a magnitude-limited Gaia sample does **not** show the galaxy from outside — dust extinction hides the disk beyond ~3–4 kpc and parallax distances smear past ~2 kpc. Real Gaia data from outside is a lopsided ~3 kpc bubble (Local Bubble, Orion-arm tendrils, clusters) — beautiful, but not the grand spiral. The outside view stays the procedural MW cloud's job.

**Decision:** Feasible and adopted: cell-quantized 6 B/star format, ~17M stars at 75 MB transfer, vertex-pulling renderer. The caveat reframed the bin's role, leading to Q2.

## Q1b: What would the same compression strategy do for the galaxy catalogs?

**The question:** (User-posed.) Apply cell quantization + packing to the existing galaxy bins — what falls out?

**Considerations:**

- Field-by-field quantization of the v6 record (position → 6 B cell offsets at ~60 pc resolution, 1-B mags/colors/ratios, 8-bit PA with shader cos/sin, log-quantized weights, 16-bit spectroscopicZ) gives **64 B → 16 B exactly (4×)**; ~10–11 B effective transfer with zstd. All-tier R2 footprint ~280 MB → ~75–90 MB; `glade-large` 130 MB → ~30 MB; GPU 52 B → ~16 B/galaxy.
- Identity survives: `sourceCode + instance_index` composition doesn't care about Morton re-sort as long as index assignment happens post-sort at build time.
- Strategic difference: the star bin **needs** this machinery to exist at all; the galaxy bins already ship — compression there buys load time, not feasibility.

**Decision:** Sequencing principle adopted: **prove the format on the greenfield star bin, then port to the galaxy bins as v7** once the encoder/shader path is battle-tested. Galaxy v7 is not part of this project.

## Q2: What is the bin's role relative to the procedural MW point cloud?

**The question:** Given real Gaia data can't be "the galaxy from outside," what job does the bin do?

**Considerations:**

- **Option i (crossfade middle):** the real-data regime between the future a+b neighborhood bin and the procedural cloud — flying out from Earth: neighborhood → Gaia bubble → crossfade into the procedural spiral as real data thins. Data-honest at every scale; gives the 75 MB a narrative job. Cost: a blending contract — the Gaia bubble's outer shell must hand off believably to the procedural cloud's inner region.
- **Option ii (standalone toggleable layer):** "the Gaia map" as an independent source, no crossfade contract. Simpler, but a checkbox rather than part of the continuous-zoom story.

**Decision:** **Option i.** The blending contract is accepted scope (mechanics resolved in Q5).

## Q3: Which stars go in the bin (the selection function)?

**The question:** "~17M Gaia stars" isn't a selection. What cut?

**Considerations:**

- **Option a (apparent-magnitude cut, G ≲ 13.5):** "what Gaia sees to depth X." Density falls off with distance naturally — exactly the shape the crossfade wants (real data fades as it genuinely runs out). Automatically contains every naked-eye star, so the bin doubles as the night-sky backdrop. One rule, no seams.
- **Option b (distance cut, e.g. < 2 kpc with parallax quality):** honest 3D volume, but spends millions of records on faint M dwarfs, explodes past budget before 2 kpc, and a hard spherical edge is the worst interface to crossfade against.
- **Option c (hybrid mag cut + giants extension):** more far-end structure, but two populations with different completeness stitched together — a classic remember-to-handle seam.

**Decision:** **Option a, pure.** The exact G limit is chosen by byte budget, not round number: sort by G, truncate at the record count that hits the size target (same philosophy as `subsampleByAbsMag`). Accepted consequence: radial "fingers" toward the Sun from parallax smearing past ~2–3 kpc; treatable later, doesn't drive selection. (Amended by Q6's near-Sun supplement.)

## Q4: Size budget semantics and tiering

**The question:** Is 75 MB transfer or decoded size, and one file or tiers?

**Considerations:**

- Transfer vs decoded differ ~25–35% with zstd-over-Morton. Transfer is what hurts users; GPU-resident is what hurts frame rate — and GPU pressure is managed by the LOD draw cut (Q9), not by shipping fewer stars.
- Tiers ride existing muscle for free: `state.sources.tier`, `cloudLoader`, R2 sync ALLOW list, `dataUrl()`. A single 75 MB file is rough on mobile.
- A single progressive-streaming file (range requests into the hierarchy) is the parked tier-system redesign — out of scope.

**Decision:** **75 MB = transfer size of the large tier; `stars-{small,medium,large}.bin` ≈ 10/30/75 MB transfer (≈ 2M/6M/17M stars).** Because selection is a pure G cut, tiers are nested truncations of the same sort. Flux-mipmap built per tier at encode time; each tier self-contained.

## Q5: How much of the crossfade blending contract is v1 scope?

**The question:** Option i (Q2) obligates a believable handoff to the procedural MW cloud. How much do we build now?

**Considerations:**

- **Option a (hand-tuned camera-distance crossfade band):** star bin fades out / procedural cloud fades in over ~2→5 kpc camera distance from the Sun, tuned by eye — same fade-band mechanism the MW cloud sprite shipped (`e04ec827`). Risk: real Gaia density/brightness won't exactly match the procedural cloud at the band; a careful eye may catch a step.
- **Option b (density-calibrated handoff):** additionally tune the procedural cloud's inner density / luminosity function / color mix to Gaia counts in the overlap shell. Near-invisible seam, but reaches into the galaxy-renderer tool's parameter surface, and the needed calibration is unknowable until (a) is seen to fail.

**Decision:** **Option a in v1; option b backlogged** (`docs/backlog/2026-07-13-star-bin-crossfade-density-calibration.md`, created during this session). Band endpoints must be named constants (and live-tunable during bring-up per Q9) so (b) stays cheap.

## Q6: Near-Sun supplement (user requirement) — and its radius

**The question:** (User-added requirement.) Like the galaxies' local-volume flux supplement, faint stars near the Sun should be included in **all** tiers so the solar neighborhood stays interesting. What radius?

**Considerations:**

- The pure G cut keeps Proxima (G ≈ 8.9) but drops most faint nearby M/L dwarfs. Selection becomes `(G < G_tier) ∪ (distance < R)`, supplement in every tier. This is a two-population union, but both serve one visual, the galaxy pipeline has the exact precedent, and tier nesting was a build convenience, not a format invariant.
- **25 pc:** a few thousand stars — flythrough-immediate bubble only.
- **50 pc:** tens of thousands.
- **100 pc = GCNS (Gaia Catalogue of Nearby Stars):** ~331k curated, vetted DR3 stars within 100 pc — someone else's careful quality cuts for the hardest regime (faint nearby stars). ~2 MB packed — affordable even in the small tier.

**Decision:** **100 pc via GCNS**, full supplement in all tiers. Flags carried forward: (1) the future a+b bin overlaps this volume — needs a dedup/handoff story when that project starts; (2) the Gaia bright-end gap (resolved in Q10).

## Q7: What is a stored distance (position source)?

**The question:** Position is the one field you can't patch without a rebuild, and the distance choice determines how bad the fingers-of-god artifact gets.

**Considerations:**

- **Option a (1/parallax):** simple; known-bad at the faint end — negative/near-zero parallaxes drop silently or blow up; maximal smearing.
- **Option b (Bailer-Jones geometric):** published posterior-median distances, joinable in the same ADQL query; prior tames the low-parallax tail.
- **Option c (Bailer-Jones photogeometric):** same table, additionally uses color+magnitude — tightest at the faint end; community default for 3D-map use. Falls back to geometric where photometry is unusable.

**Decision:** **Option c with b fallback.** GCNS supplement keeps its own vetted distances. Sources lacking any BJ distance are dropped — as a **counted, logged** drop, never silent. Table/column names are `needs-verification` facts to confirm against the live Gaia TAP service at spec time.

## Q8: Architecture — survey source vs singleton layer (and the corrected premise)

**The question:** Is the star bin a `SOURCE_REGISTRY` survey source or a filaments/milkyWay-style singleton overlay layer?

**Considerations:**

- Initial recommendation was "singleton overlay layer, not a registry row," on the assumption that `SOURCE_REGISTRY` is galaxy-survey-shaped. The user pushed back ("a — do your research"), and codebase research corrected the premise: **the registry is the universal source table** — a nine-way tagged union (`galaxyCatalog | structure | filament | volume | milkyWay | flow | star | planet | earth`) where the singleton overlays and non-pickable bodies all have rows. Rows exist "solely so every data source has one place to look"; only galaxyCatalog/structure codes are persisted/packed; the visibility bitmask operates on galaxyCatalog codes only. The layer-state convention (`settings.<layer>` + status-only store) is about state, not registry membership.
- Closest precedent: the **MCPM volume row** — singleton, tier-aware asset (`mcpm-<tier>.scfd` via `tierFilenameForSource`), presentation defaults in-row, own renderer.

**Decision:** **A `SOURCE_REGISTRY` row** (user was right; the false dichotomy dissolved). Composes with the layer-style state convention rather than competing with it.

## Q8b: Which row — extend the existing `star` row, or a new variant?

**The question:** `Source.Star` / `STAR_ENTRY` (`type: 'star'`) already exists as the seeded SCENE_STARS bodies row ("no on-disk asset stem, no per-record identity").

**Considerations:**

- **Option i (extend `STAR_ENTRY`):** one "star" concept, but the row would serve two contracts (seeded bodies AND asset-backed bulk catalog) with two renderers behind one discriminant — exactly the braiding the per-kind variants exist to avoid.
- **Option ii (new variant + row):** `type: 'starCatalog'`, appended `Source` code, `binBaseName: 'stars'`, tier-filename participation, look/crossfade defaults in-row the way `VolumeSourceEntry` carries palette/contrast.

**Decision:** **Option ii — new `starCatalog` variant.** Plus a user-added companion rename: **`Source.Star`/`STAR_ENTRY` → `Source.FamousStar`/`FAMOUS_STAR_ENTRY`**, mirroring the FamousGalaxy↔survey split. The rename also names the dedup story: famous stars are the curated overlay, the Gaia bin is the survey.

## Q9: Per-frame draw budget

**The question:** DESI DR1 is backlogged as `blocked` because ~9.75M points exceeds the interactive ceiling, and the survey renderer is fragment/blend-bound at 2.5M. What makes 17M resident stars viable?

**Considerations:**

- The in-bin octree flux-mipmap (parents ≈ 8 children merged: summed flux, flux-weighted color; ~14% storage overhead) lets the runtime select a cut through the hierarchy each frame — leaf cells near the camera, coarser parents farther out — refined nearest-first until a **drawn-point budget** is spent.
- Initial recommendation: ~1.5M typical / 2.5M hard cap (≈ one galaxy survey tier). Far view is naturally cheap (a few hundred k aggregates).
- Accepted consequence: deep in the bubble at the large tier, distant faint stars render as flux-preserving aggregates — visually correct (they're sub-pixel) and brightness-honest.

**Decision:** **Slightly tighter than recommended — start ~1M typical / 2M hard cap — and the budget must be easily live-tunable once rendering** (DebugPanel-slider style during bring-up, frozen into named constants after tuning by eye; same treatment for the crossfade band endpoints). The small tier can carry a lower cap for mobile.

## Q10: The bright end — stars Gaia can't see

**The question:** Gaia DR3 is unreliable-to-missing for the ~200–300 stars brighter than G ≈ 3 — Sirius, Canopus, Vega, Arcturus, α Cen. A pure Gaia build ships a night sky missing its most famous stars.

**Considerations:**

- **Option a (Hipparcos patch at build time):** merge Hipparcos-2 (or Yale BSC) rows for everything brighter than the reliability threshold, cross-matched so stars Gaia does have aren't doubled. ~300 records; one parser + one small raw file per the raw-data registry checklist. Structurally identical to the CF4-distance patching in `buildAllBins`.
- **Option b (lean on FamousStar):** fails on coverage — SCENE_STARS is ~60 flythrough anchors, not the naked-eye-bright set; the bin should be complete on its own terms.
- **Option c (ship without):** visibly wrong night sky; not an option given the from-Earth view is in scope (Q2/Q3).

**Decision:** **Option a — Hipparcos bright-end patch**, plus (user-added) **build-time dedup against the FamousStar layer**, same discipline as famous galaxies vs the survey bins. The exact reliability threshold (G ≈ 3?) is a `needs-verification` fact.

## Q11: Session outcome / sequencing

**The question:** Backlog-and-wait or straight to spec?

**Considerations:**

- **Option a (backlog entry now, spec later):** capture the ledger + verification checklist; wait for zoom-to-earth 03/04 to land (the NEAR0/star-layer machinery is mid-flight there).
- **Option b (straight to spec):** brainstorm/spec next with verification woven in; jumps the queue.

**Decision:** **Option b — straight to spec.** External-data verification (Gaia TAP/BJ/GCNS table names + columns, DR3 bright limit, counts at G cuts, real compression ratios) happens as the spec's first act per the verify-before-specing rule.

---

## Open items carried into the spec

- Verify against the live Gaia TAP service: BJ distance table + column names, GCNS table name/availability, actual source counts at candidate G cuts, DR3 bright-end reliability threshold.
- Measure, don't assume: real zstd ratios on Morton-sorted quantized data; exact stars-per-tier at the 10/30/75 MB transfer targets.
- Spec-time engineering: BP−RP → color LUT (relation to existing colourIndex spec), slab/pass placement (NEAR0 vs COSMO, cell-origin rendering vs `renderOrigin`), TAP fetch mechanics (paged by `random_index`, resume cache à la `fetchHyperLeda`), Sun exclusion, famous-star/Hipparcos cross-match keys.
- Boundary flags: a+b neighborhood bin (separate project) overlaps the GCNS supplement volume — dedup/handoff story needed when it starts; galaxy-bin v7 port of the format is its own future project.
- Deferred: crossfade density calibration → `docs/backlog/2026-07-13-star-bin-crossfade-density-calibration.md`.
