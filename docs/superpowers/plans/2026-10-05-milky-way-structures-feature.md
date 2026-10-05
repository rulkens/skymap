# Milky Way structures — PR 2 feature

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four in-Galaxy structure categories (`open-cluster`, `globular-cluster`, `nebula`, `galactic-centre`) with 71 seed rows, drawn as rings and labels on the NEAR0 slab, focusable, pickable, searchable, with two new card rows.

**Architecture:** PR 1 (#844) built the joints, so this PR is rows at existing seams plus one renderer change:

- Four source codes, four registry rows, four style rows, four record arms, one fade band.
- Two optional seed fields (`nebulaKind`, `lineOfSightAssumed`) and one required one for the new categories (`source`).
- The near marker pass clamps its instances inside NEAR0's moving far plane.
- Two card rows.

**Tech stack:** TS, Vitest, WESL, raw WebGPU, React.

**Spec:** [`docs/superpowers/specs/2026-10-05-milky-way-structures-design.md`](../specs/2026-10-05-milky-way-structures-design.md), §4–§10.

## Global constraints

- The four existing categories (cluster, supercluster, void, group) keep their behaviour: no existing test changes an expected value.
- `type` aliases, never `interface`. One type per `@types/` file, one function per `utils/` file, filename = symbol. No barrels.
- Frame files (`src/services/engine/frame/**`) export only their named symbol; constants go to `src/data/`, helpers to `src/utils/`.
- File moves use `npm run move-files -- <from> <to>`, never `git mv`.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. Comments are timeless: rewrite a comment the task makes untrue, do not narrate the change. Several headers enumerate "cluster / supercluster / void / group"; where a task touches such a file, reword the header so it no longer lists categories.
- Each task is its own commit. Format with `npx prettier --write <files>`, never `npm run format`. Stage files by path, never `git add -A`.
- No `Co-Authored-By` lines in commits.
- Never run `npm run build-structures`, `build-all` or any other bake: this worktree's `public/data` is a symlink to the main checkout's, so a bake writes into main. The app reads the seed through a JSON import, so no bake is needed.
- Run the full `npm test` before the last commit of a dispatch, not only the targeted files.
- Read `docs/RENDERER.md` before Task 3, and `docs/DATA.md` before Tasks 2 and 4–7.

## Review focus

1. **Clamped rings keep their angular size and their pick (Task 3).** Pulling an instance inward by a factor must scale its radius by the same factor, and draw and pick must read the same clamped buffer.
2. **Seed values are sourced (Tasks 4–7).** Every new row's distance and radii come from the named catalogue or paper, in the unit it publishes. A value recalled from memory is a defect even when it is close.
3. **Existing categories did not move (Tasks 1, 3).** The cosmo pass, its renderer instance and the four old style rows are untouched in behaviour.

---

### Task 1: Four categories exist, with no rows

**Files:**
- `src/data/source.ts` (modify), `src/data/sourceEntries.ts` or wherever `SOURCE_ENTRIES` lists rows (modify)
- `src/data/sources/openCluster.ts`, `globularCluster.ts`, `nebula.ts`, `galacticCentrePlace.ts` (create)
- `src/@types/data/structure/NebulaKind.d.ts` (create), `src/@types/data/structure/StructureInfo.d.ts` (modify)
- `src/services/engine/presentation/scaleFadeBands.ts`, `structureMarkerStyles.ts` (modify)
- `src/data/structure/buildStaticAnchorStructures.ts` (modify)
- `tests/services/engine/selection/structureSelectionRow.test.ts`, `tests/services/engine/presentation/structureVisibleBands.test.ts` (modify or create)

**Contract:**

```ts
// src/data/source.ts — append-only; never renumber
OpenCluster: 33, GlobularCluster: 34, Nebula: 35, GalacticCentrePlace: 36

// registry rows (shape of src/data/sources/cluster.ts)
{ id: 'open-cluster',     label: 'Open cluster',          shortLabel: 'Open cluster',     detailLabel: 'Open Cluster',          plural: 'Open clusters' }
{ id: 'globular-cluster', label: 'Globular cluster',      shortLabel: 'Globular',         detailLabel: 'Globular Cluster',      plural: 'Globular clusters' }
{ id: 'nebula',           label: 'Nebula',                shortLabel: 'Nebula',           detailLabel: 'Nebula',                plural: 'Nebulae' }
{ id: 'galactic-centre',  label: 'Galactic Centre place', shortLabel: 'Galactic Centre',  detailLabel: 'Galactic Centre Place', plural: 'Galactic Centre' }
// all four: type 'structure', allSky true, bearsLabel true, bearsMarker true,
// labelLayer 'structure', slab 'near0', galaxyMembers false

// NebulaKind.d.ts
export type NebulaKind = 'emission' | 'reflection' | 'planetary' | 'supernova-remnant' | 'dark';

// StructureInfo arms
OpenClusterRecord         = StructureBase & { readonly category: 'open-cluster' };
GlobularClusterRecord     = StructureBase & { readonly category: 'globular-cluster' };
NebulaRecord              = StructureBase & { readonly category: 'nebula'; readonly nebulaKind: NebulaKind };
GalacticCentrePlaceRecord = StructureBase & { readonly category: 'galactic-centre'; readonly lineOfSightAssumed: boolean };

// scaleFadeBands.ts — keyed on camera distance from the render origin, Mpc
galacticStructures: { fullAt: MILKY_WAY_RADIUS_MPC * 2, goneAt: FOREGROUND_MAX_DISTANCE_MPC }

// buildStaticAnchorStructures.ts SeedEntry gains
readonly nebulaKind?: NebulaKind; readonly lineOfSightAssumed?: boolean;
```

Style rows (all `visibleBand: SCALE_FADE_BANDS.galacticStructures`; every value here is a starting point that Task 9 tunes on screen):

| id | label / ring / halo colour | `worldEmMpc` | min apparent px / band | max apparent px / band |
|---|---|---|---|---|
| `open-cluster` | `#A9C4FF` / `#7F9BD9` / `#7F9BD942` | `2e-6` | 5 / 4 | 700 / 400 |
| `globular-cluster` | `#C9A8FF` / `#9A7FD9` / `#9A7FD942` | `8e-6` | 5 / 4 | 700 / 400 |
| `nebula` | `#FF8FA3` / `#D96F84` / `#D96F8442` | `2e-6` | 5 / 4 | 700 / 400 |
| `galactic-centre` | `#E8E8F0` / `#B8B8C8` / `#B8B8C842` | `2e-6` | 5 / 4 | 700 / 400 |

Other style fields copy the `cluster` row.

- [ ] Add the codes, rows, type, arms, band and style rows. `buildAnchorStructure`'s switch gains four arms: the nebula arm carries `nebulaKind`, the Galactic Centre arm carries `lineOfSightAssumed ?? false`.
- [ ] Test `open-cluster and globular-cluster ids are not claimed as cluster`: the structure row's `claims` (`structureSelectionRow.ts:42`) resolves `open-cluster-pleiades` to category `open-cluster` and `globular-cluster-m13` to `globular-cluster`; the place id `galactic-centre` (no suffix) is not claimed, `galactic-centre-arches` is.
- [ ] Test `a near0 category is full at the Sun and gone at the foreground gate; a cosmo category is the reverse`: `fadeBand` over each slab's bands at camera distance 0 and at `FOREGROUND_MAX_DISTANCE_MPC`.
- [ ] No other new test: the registry, style table and record union are compiler-checked, and toggles, counts, pick codes and search chips derive from `STRUCTURE_IDS`.
- [ ] `npm run typecheck` and `npm test` green. Commit.

### Task 2: Seed parser knows the new fields

**review: yes** (parser)

**Files:** `tools/parsers/parseStructureSeed.ts` (modify), `tests/tools/parsers/parseStructureSeed.test.ts` (modify), `docs/DATA.md` (modify)

**Contract:**

```ts
type StructureSeedEntry = { …;
  nebulaKind?: NebulaKind;        // required on a nebula, rejected elsewhere
  lineOfSightAssumed?: boolean;   // accepted only on galactic-centre
  source?: string;                // required, non-empty, on the four new categories
};
```

`source` names where the row's distance and radii come from ("Hunt & Reffert 2024", "Harris 2010", a paper's bibcode). It is build-time documentation; the runtime never reads it.

- [ ] Tests, one per rule: `rejects a nebula without nebulaKind`, `rejects nebulaKind on a non-nebula`, `rejects an unknown nebulaKind`, `rejects lineOfSightAssumed outside galactic-centre`, `rejects a Milky Way row without source`.
- [ ] Implement beside the existing checks (`parseStructureSeed.ts:76-122`). The set of categories that require `source` is derived from the registry (`slab === 'near0'`), not a second hand-written list.
- [ ] `docs/DATA.md`: document the three fields in the seed section.
- [ ] Commit.

### Task 3: The near marker pass clamps inside NEAR0's far plane

**review: yes** (renderer, pick, camera maths; landmine: NEAR0's far plane is 100× the orbit distance)

**Files:**
- `src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts` (modify) and its type under `src/@types/`
- `src/services/engine/frame/passes/structureMarkersNearPass.ts` (modify)
- `src/data/rendering/frameSections.ts` (modify: comment only)
- `tests/services/gpu/renderers/structureMarker/` (modify or create)

**Contract:**

```ts
// maxDistanceMpc defaults to Infinity; the cosmo pass does not pass it
setMarkers(descriptors, camPos: Vec3, maxDistanceMpc?: number): void
```

An instance whose camera-relative length `d` exceeds `maxDistanceMpc` is packed at `worldPos − camPos` scaled by `k = maxDistanceMpc / d`, with its radius scaled by the same `k`. Position and radius scale together, so the ring's direction and angular size are unchanged; only depth moves. The near pass passes `view.slab.far * NEAR0_FAR_CLAMP_FRACTION`, the same bound `near0SelectionRingPass.ts:163` uses.

- [ ] Read how `near0SelectionRingPass.ts:152-166` reasons about both planes. Confirm from `ring.wesl` that the instance radius is a world length multiplied into the quad (if the radius reaches the shader in pixels instead, stop and report: the contract above would be wrong).
- [ ] Test `an instance beyond maxDistanceMpc keeps its direction and its radius-to-distance ratio`, on the packed instance data.
- [ ] Test `an instance inside maxDistanceMpc is packed unchanged`.
- [ ] Implement in the f64 packing step, before narrowing. Pick reads the same buffer, so it needs no change; say so in the commit body after checking `pickRing`.
- [ ] `frameSections.ts`: the `(hdr, NEAR0)` roster comment near line 168 says the remaining rows are "additive and so a listing choice". Near rings blend premultiplied-over, so their position matters. Reword the comment to say which rows that holds for.
- [ ] Commit.

### Tasks 4–7: Seed rows

**Files (each task):** `data/seeds/structure_anchors.seed.json` (modify)

Rules for all four:

- Every distance and radius is read from the named source during this task (fetch it; do not recall it), in the unit the source publishes, and the row's `source` field names it. Where the preferred source lacks an object, use a peer-reviewed measurement and cite that.
- `raHours` / `decDeg` are J2000, from SIMBAD or the same catalogue.
- `physicalRadius` is the compact radius, `apparentRadius` the full extent that the ring draws. Both are physical lengths: an angular size becomes a length through the row's own distance.
- `id` is lower-kebab and unique in the file; `names[0]` is the label ("Pleiades"), with catalogue designations after it ("M45", "Melotte 22").
- `description`: one or two sentences saying what the object is and why it is notable. Plain prose, no superlatives without a fact behind them.
- If a value cannot be sourced, leave the row out and list it in the task report. Do not estimate.

### Task 4: Open clusters (25 rows)

Pleiades, Hyades, Praesepe, Coma Star Cluster, α Persei, h Persei (NGC 869), χ Persei (NGC 884), Jewel Box, Wild Duck, Butterfly, Ptolemy, M35, M36, M37, M38, M41, M46, M47, M50, M67, NGC 752, IC 2602, IC 2391, Trumpler 14, Westerlund 1.

Preferred source: Hunt & Reffert (2023, 2024) Gaia DR3 cluster catalogue, via VizieR. `physicalRadius` = the radius containing half the members (r50), `apparentRadius` = the tidal or total radius. Westerlund 1 is heavily reddened and may need its own paper.

- [ ] Add the rows; `npm test -- structureAnchors parseStructureSeed buildStaticAnchorStructures` passes. Commit.

### Task 5: Globular clusters (21 rows)

ω Centauri, 47 Tucanae, M2, M3, M4, M5, M10, M12, M13, M15, M22, M30, M53, M54, M55, M71, M79, M80, M92, NGC 6397, NGC 2419.

Preferred source: Harris (1996, 2010 edition) for half-light and tidal radii; Baumgardt & Vasiliev (2021) for distances. `physicalRadius` = half-light radius, `apparentRadius` = tidal radius.

- [ ] Add the rows; the same three test files pass. Commit.

### Task 6: Nebulae (22 rows)

- Emission: Orion, Carina, Lagoon, Trifid, Eagle, Omega, Rosette, North America, California.
- Dark: Horsehead, Coalsack.
- Planetary: Ring, Dumbbell, Helix, Cat's Eye, Owl.
- Supernova remnant: Crab, Veil, Vela, Cassiopeia A, Tycho, Kepler.

No single catalogue covers these: each row cites the paper its distance comes from (Gaia-based where one exists). `physicalRadius` = `apparentRadius` = half the catalogued angular extent at that distance, unless a bright core is separately measured. Each row carries `nebulaKind`. The Tarantula is out: it is in the Large Magellanic Cloud.

- [ ] Add the rows; the same three test files pass. Commit.

### Task 7: Galactic Centre places (3 rows) and seed sanity

**Files:** the seed, `tests/data/structureAnchors.test.ts` (modify)

Central cluster (the nuclear star cluster around Sgr A\*), Arches, Quintuplet. Arches and Quintuplet carry `lineOfSightAssumed: true` and `distance: { value: 8178, unit: 'pc' }`, the value `src/data/places/galacticCentre.ts:29` uses, with their own published RA/Dec. The central cluster sits at Sgr A\*'s coordinates (`galacticCentre.ts:20-21`) and the same distance, without the flag.

- [ ] Add the rows.
- [ ] Test `every Milky Way row lies within 0.1 Mpc of the origin`, over the four new categories.
- [ ] Test `every Galactic Centre place lies within 50 pc of GALACTIC_CENTRE_ANCHOR`.
- [ ] Test `the central cluster sits on the anchor` (within 1 pc), which catches a transcribed coordinate drifting from the place seed.
- [ ] Commit.

### Task 8: Card rows

**Files:**
- `src/components/InfoCard/StructureDetailCard/StructureDetailCard.tsx` (modify), `src/components/InfoCard/tooltips.tsx` (modify if a tip is added)
- `src/data/structure/nebulaKindLabels.ts` (create)
- `tests/components/InfoCard/` (modify the structure card test, or create one)

**Contract:**

```ts
// nebulaKindLabels.ts
export const NEBULA_KIND_LABELS: Readonly<Record<NebulaKind, string>> = {
  emission: 'Emission nebula', reflection: 'Reflection nebula', planetary: 'Planetary nebula',
  'supernova-remnant': 'Supernova remnant', dark: 'Dark nebula',
};
```

- A nebula's card shows a "Type" row with the label.
- A record with `lineOfSightAssumed` shows a "Line of sight" row reading "assumed at the Galactic Centre's distance".
- The "Galaxies" row is already absent when `memberCount` is null. Check that a `galaxyMembers: false` category reaches the card with a null count (PR 1 made the publisher read the registry); change nothing if so.
- The "r" line formats the radius for a parsec-scale object in pc, not as `0.00 Mpc`. Check what the card prints for the Pleiades and route it through the existing distance formatter if it does not already adapt its unit.

- [ ] Test `a nebula card shows its kind; a cluster card has no Type row`.
- [ ] Test `the Line of sight row appears only when lineOfSightAssumed`.
- [ ] Implement. Commit.

### Task 9: On-screen tuning (controller with the user)

Not a subagent task. With the dev server up and all rows in, tune and commit:

- `galacticStructures.fullAt`; the four style rows' colours, `worldEmMpc`, pixel clamps and apparent-radius thresholds.
- Label crowding near the Sun against constellation captions and star names; whether any category starts switched off.
- The central cluster's label against the existing Sgr A\* caption.

### Task 10: Docs and perf

**Files:** `.claude/skills/add-data-source/SKILL.md` (modify), `docs/DATA.md` (modify if Task 2 left gaps)

- [ ] Rewrite the skill's Path B table against the files this PR actually touched for a new structure category (Task 1's file list is the truth), and fix the sentinel width (6-bit, sentinel 63).
- [ ] Perf: `npm run perf -- --url http://localhost:<this worktree's port>` on the `local-group` and a Sun-neighbourhood scenario, before (main) and after. The `local-group` total is bimodal on this machine (about 9.9 or 10.9 ms run to run), so compare several runs each side before reading a 1 ms difference as real.
- [ ] Commit.

---

## Dispatch grouping

1. Tasks 1–2 (registry, types, parser).
2. Task 3 (near clamp) and Task 8 (card): disjoint files.
3. Tasks 4–7 (seed rows): one dispatch per category if run in parallel with dispatch 2, since they only touch the seed file and its test; otherwise one after another.
4. Task 10, after Task 9.

Mid-branch reviews: Tasks 2 and 3. One whole-branch review at the end; deletion audit at `/feature-done`, where these PR 1 leftovers are judged: the fade bind group in the marker shaders that now carries a constant 1, the near pass being a near-copy of the cosmo pass, and `LENGTH_UNITS` as a third list of units.

## Definition of Done

Deliverables:

- Four registry rows, four style rows, four record arms, `NebulaKind`, the `galacticStructures` band.
- 71 seed rows, each with a `source`.
- `setMarkers`'s clamp, used by the near pass.
- "Type" and "Line of sight" card rows.
- The `add-data-source` skill's Path B table matches the code.

Smoke pass, one link each on this worktree's dev server (`http://localhost:<port>/`):

- `#focus=open-cluster-pleiades`: the ring frames the cluster from tens of parsecs, the label reads "Pleiades", the card says "Open Cluster" with a radius in pc and no "Galaxies" row.
- `#focus=globular-cluster-omega-centauri`: ring and label hold steady while orbiting; no jitter on approach.
- `#focus=nebula-orion`: the card shows "Type: Emission nebula".
- `#focus=galactic-centre-arches`: the card shows the "Line of sight" row; the ring is visible near Sgr A\* and hidden from the Sun.
- From about 50 kpc with all four categories on: rings sit on the Galaxy and fade out together as the camera leaves; none pops at the foreground gate.
- Orbit the Pleiades at about 10 pc and look toward a globular: its ring is still drawn at the right place and size (the far-plane clamp), and clicking it selects it.
- `#focus=cluster-virgo-m87`: framing, ring and label as on main.
- Settings shows the four toggles with counts 25 / 21 / 22 / 3; search finds "Pleiades" and "M13".

Out of scope: published catalogues as bulk rows (Hunt & Reffert, Harris), molecular clouds, OB associations, spiral-arm labels, the Central Molecular Zone, path-based object links, a `structure` Layer, and the hand-listed `SOURCE_CODE_*` constants in `selectionEncoding.wesl`.
