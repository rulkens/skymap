# Body content out of core, PR B: corrections and stars ride body rows

> **For agentic workers:** execute with `superpowers:subagent-driven-development` under
> [`sdd-execution.md`](../../conventions/sdd-execution.md). Steps use checkbox (`- [ ]`) syntax.

**Goal:** always-loaded core no longer imports the ephemeris corrections, the barycentric pair
table or any star table by value. They are values on the body Layer's and the star Layer's body
rows. No behaviour change in the app.

**Spec:** [`2026-11-24-body-content-out-of-core-design.md`](../../specs/completed/2026-11-24-body-content-out-of-core-design.md)
§4.1, §5 prep 4–5. Second of four PRs (§6). Closes leftovers J1 and J3.

**Why it is safe to land alone:** the app composition holds every row it held before, so each fold
yields today's values. The galaxies-only payoff is PR D's to claim.

**Not in this PR:** meshes (PR C); the survey fade-edge fallback, the empty-registry import test
and the `EARTH_HOME` fold (PR D). With an empty registry the fade edge still inverts until D.

## Global constraints

- Never run `npm run build-famous-stars` or `npm run build-data-manifest` here: `public/data` is a
  symlink to the main checkout and both write into it.
- `tools/reference-engine/`, `src/compositions/galaxiesOnly.ts`, `.payoff-dist*/` are an
  uncommitted measuring kit. Never stage them. Stage by path, never `git add -A`.
- Files move with `npm run move-files -- --manifest <moves.json>` (`--dry` first). Exit 1 means
  the moves are written: fix each finding, do not re-run.
- No Layer file imports `src/compositions`. No core file imports `src/layers` (the one allow-list
  entry is removed in Task 4).
- Pick ids must not change: the order of rows inside each `SEEDED_STAR_CATALOGS` table and the
  relative order of planet rows stay as they are.

## Rulings made while planning (controller, 2026-11-24)

- The body Layer attaches corrections with one join in `bodyBodyRows.ts`, not 29 row edits. The
  generated file stays the single statement of which bodies are corrected.
- The orbit `PositionDriver` carries a resolved `reflex` (secondary's elements and mass fraction)
  rather than the row's `pair`, so `orbitRowPlacement` reads no table. The row itself carries
  `pair` as the spec says.
- The corrections tool keeps reading elements through `elementsById`, so it loads the generated
  file it rewrites. Accepted: the file is committed, and `git checkout` recovers a broken one.
- `sStarOrbitInfo`'s focus label comes from a core constant beside `sgrAStarMassSolar.ts`, read by
  both the black-hole source row and the star Layer.

---

### Task 1: Orbit rows carry their correction and pair

**review: yes** (per-frame solver, shared placement path)

**Files:** `src/@types/engine/layer/BodyPosition.d.ts`, `src/@types/scene/BarycentricPair.d.ts`,
`src/@types/scene/PositionDriver.d.ts`, `src/@types/scene/BarycentricReflex.d.ts` (create),
`src/layers/body/bodies/bodyBodyRows.ts`, `src/layers/body/bodies/planets/earth.ts`,
`src/data/bodies/positionDrivers.ts`, `src/utils/orbit/orbitRowPlacement.ts`,
`src/services/engine/frame/deriveBodyStates.ts`,
`src/utils/exhibits/mission/bodyPositionMpcAt.ts`, `src/data/bodies/barycentricPairs.ts`
(delete), `tests/services/engine/frame/deriveBodyStates.test.ts`,
`tests/layers/body/bodies/bodyBodyRows.test.ts` (create or extend)

**Contract:**

```ts
// BodyPosition.d.ts — the orbit arm, and the new anchor arm (used in Task 3)
| { readonly kind: 'orbit'; readonly elements: OrbitalElements;
    /** The row's fitted Horizons correction; absent = pure Kepler. */
    readonly correction?: EphemerisCorrection;
    /** Set when `elements` describe a pair barycentre; the body sits the other way from `secondaryId`. */
    readonly pair?: BarycentricPair }
| { readonly kind: 'anchor'; readonly positionMpc: Vec3 }

// BarycentricPair.d.ts — the row is the primary
export type BarycentricPair = {
  readonly secondaryId: SceneBodyId;
  readonly secondaryMassFraction: number;
};

// BarycentricReflex.d.ts — a pair with its secondary resolved once
export type BarycentricReflex = { readonly secondary: OrbitalElements; readonly k: number };

// PositionDriver.d.ts — orbit arm
| { readonly kind: 'orbit'; readonly id: SceneBodyId; readonly elements: OrbitalElements;
    readonly correction?: EphemerisCorrection; readonly reflex?: BarycentricReflex }

// orbitRowPlacement.ts
export function orbitRowPlacement(
  driver: Extract<PositionDriver, { kind: 'orbit' }>,
  focusMpc: Vec3,
  simDays: number,
): { positionMpc: Vec3; orbit: OrbitalElements };
```

- `BODY_BODY_ROWS` is the authored rows with `EPHEMERIS_CORRECTIONS[row.body.id]` joined onto the
  orbit position where one exists. The import still points at
  `src/data/bodies/ephemerisCorrections.generated.ts` (it moves in Task 2).
- Earth's row carries `pair: { secondaryId: 'moon', secondaryMassFraction: 1 / 82.30057 }` with
  the DE440 note from `barycentricPairs.ts:2-4`.
- `positionDrivers.ts` builds orbit drivers from `APP_BODY_REGISTRY` orbit rows, resolving each
  `pair` to a `reflex` once at module load (a misspelt secondary throws there, as today). The
  S-star elements, not yet rows, get plain drivers until Task 3.
- `orbitRowPlacement` imports no data table. `deriveBodyStates` maps `FOCUS_ORDER` to orbit
  drivers once at module load; `bodyPositionMpcAt` passes the driver it already holds.
- `barycentricPairs.ts` is deleted; nothing in core imports `ephemerisCorrections.generated`.

**Stop and report if:** any reader of `BodyPosition['kind']` or `PositionDriver` is an exhaustive
switch that the `anchor` arm breaks in a way that needs a decision.

- [x] Before editing, record positions for every id from `deriveBodyStates` at two instants
      (J2000 + 300 d, J2000 + 9000 d) to a scratch file; not committed.
- [x] Add the test `every corrected id carries its correction on its row` (each key of
      `EPHEMERIS_CORRECTIONS` is a `BODY_BODY_ROWS` orbit row whose `correction` is that entry).
- [x] Rewrite the reflex test in `deriveBodyStates.test.ts:154` to read the mass fraction off
      Earth's row instead of `BARYCENTRIC_REFLEX_BY_PRIMARY`.
- [x] Implement.
- [x] Positions at both instants equal the recorded ones exactly, id for id.
- [x] `npm test -- deriveBodyStates bodyPositionMpcAt ephemerisCorrections bodyBodyRows positionDrivers missionFrame`
      and `npm run typecheck:fast` pass.
- [x] Commit.

### Task 2: The corrections file lives in the body Layer

**Files:** `src/data/bodies/ephemerisCorrections.generated.ts` →
`src/layers/body/bodies/ephemerisCorrections.generated.ts` (move),
`tests/data/bodies/ephemerisCorrections.test.ts` →
`tests/layers/body/bodies/ephemerisCorrections.test.ts` (move),
`tools/bodies/buildEphemerisCorrections.ts`, `packages/website/src/data/scienceFacts.ts`,
`docs/DATA.md`

- Move both with one `move-files` manifest (the test does not follow on its own: its name lacks
  `.generated`).
- The tool's `GENERATED_PATH` (`:33`) and the `import type` string it emits (`:175`) match the new
  location and depth. The generated file's own header line and import are edited to what the tool
  would now emit.
- If `data/raw/horizons/` holds the CSVs, run `npm run build-ephemeris-corrections` and confirm a
  zero diff. If it does not, say so in the report; do not fetch.
- Repoint `scienceFacts.ts:333` and `docs/DATA.md:217`.

- [x] Move, fix findings, `grep -rn "data/bodies/ephemerisCorrections" src tools tests packages docs/DATA.md` is empty.
- [x] `npm test -- ephemerisCorrections facts layerImportBoundary` passes.
- [x] Commit.

### Task 3: Sun, famous stars and S-stars are star-Layer body rows

**review: yes** (focus graph roots, selection registry)

**Files:** `src/layers/starCatalog/bodies/starCatalogBodyRows.ts` (create),
`src/compositions/appBodies.ts`, `src/compositions/README.md`,
`src/data/bodies/sceneAnchors.ts`, `src/data/bodies/orbitalElements.ts`,
`src/data/bodies/sceneBodies.ts`, `src/data/bodies/positionDrivers.ts`,
`src/data/bodies/makers/starAnchor.ts` (delete),
`tests/layers/starCatalog/bodies/starCatalogBodyRows.test.ts` (create)

**Contract:**

```ts
// src/layers/starCatalog/bodies/starCatalogBodyRows.ts
/** Sun, then the famous stars, then the S-stars: the order `SCENE_ANCHORS` had. */
export const STAR_CATALOG_BODY_ROWS: readonly LayerBody[];
```

- Sun and famous-star rows: `{ body: <the StarBody from SCENE_SUN / SCENE_STARS>, position:
  { kind: 'anchor', positionMpc } }`. S-star rows: `{ body: <SCENE_S_STARS entry>, position:
  { kind: 'orbit', elements: <its S_STAR_ORBITAL_ELEMENTS entry> } }`. The rows reuse the
  existing objects, so `SEEDED_STAR_CATALOGS` and the registry hold the same references.
- `APP_BODY_REGISTRY` gains `...STAR_CATALOG_BODY_ROWS`.
- `SCENE_ANCHORS` = the registry's `anchor` rows as `{ id, positionMpc }`, then
  `GALACTIC_CENTRE_ANCHOR`. `ORBITAL_ELEMENTS` = the registry's orbit rows only.
  `SCENE_BODIES` = `APP_BODY_REGISTRY.map((row) => row.body)`.
- After this task no core file imports `sceneStars`, `sceneSun`, `sceneSStars`,
  `sStarOrbitalElements`, `famousStars.generated`, `sun.generated`, `makers/star` or
  `makers/sStar` by value, except the J1 files themselves and `famousStarsIndex` (Task 4).
- README ledger: the `SCENE_ANCHORS` row flips to DONE; the `APP_BODY_REGISTRY` reader count is
  recounted.

**Stop and report if:** anything depends on the position of an entry in `SCENE_BODIES`,
`SCENE_ANCHORS` or `ORBITAL_ELEMENTS` (the ground map found none), or the id set of any of the
three changes.

- [x] Before editing, record the id lists of `SCENE_BODIES`, `SCENE_ANCHORS`, `ORBITAL_ELEMENTS`
      and the two-instant positions as in Task 1; not committed.
- [x] Add the test `every seeded star is a body row, once` (the ids of `STAR_CATALOG_BODY_ROWS`
      equal the ids across `SEEDED_STAR_CATALOGS`, no duplicates).
- [x] Implement.
- [x] Same id sets, and positions equal at both instants.
- [x] `npm test -- sceneAnchors sceneBodies orbitalElements bodyRegions deriveBodyStates composeSelectionRows starPointsPass starSpheresPass decodeStarFocusId encodeStarFocusId layerImportBoundary`
      passes.
- [x] Commit.

### Task 4: The star files move into the star Layer

**review: yes** (large mechanical move with three hand fixes)

**Files:** the J1 list (below), `src/utils/scene/constellationOfBody.ts`,
`src/components/InfoCard/CompactBodyCard/CompactBodyCard.tsx`, `src/data/bodies/sgrAStarLabel.ts`
(create), `src/layers/blackHoles/sources/sgrAStar.ts`, `tools/famous/buildFamousStars.ts`,
`tests/tools/famous/buildFamousStars.test.ts`, `tests/helpers/conventions/inlineTypeFiles.ts`,
`tests/conventions/layerImportBoundary.test.ts`, `src/compositions/README.md`, website facts,
docs

Three hand fixes first, each so the move is legal:

1. **Sgr A\* label.** `export const SGR_A_STAR_LABEL` in `src/data/bodies/sgrAStarLabel.ts`, the
   value today's `layers/blackHoles/sources/sgrAStar.ts` row carries. That row and
   `sStarOrbitInfo` both read it; `sStarOrbitInfo` drops its `compositions/appSources` import.
2. **Constellation chip.** `CompactBodyCard` renders bodies, craft and Earth scenes; a seeded star
   goes through the star Layer's own card. Confirm no `star-*` or Sun id reaches
   `CompactBodyCard`, then delete its constellation row and its `constellationOfBody` import.
   `constellationOfBody` then has one reader (`seededStarChip`) and moves with the list.
   **Stop and report if** a star can reach `CompactBodyCard`.
3. **Inline-type ratchet.** `inlineTypeFiles.ts:16` names `sStarAppearance.ts` by path; repoint it
   in the same commit as the move.

Then one `move-files` manifest:

| From                                                                 | To                                        |
| -------------------------------------------------------------------- | ----------------------------------------- |
| `src/data/bodies/{famousStars.generated,sun.generated,sStarElements,sStarAppearance,sStarOrbitInfo,sStarOrbitalElements,sceneStars,sceneSun,sceneSStars,famousStarsIndex,starResolvePx,bodySearchNames}.ts` | `src/layers/starCatalog/bodies/`          |
| `src/data/bodies/makers/{star,sStar}.ts`                             | `src/layers/starCatalog/bodies/makers/`   |
| `src/data/bodies/seededStarCatalogs.ts`                              | `src/layers/starCatalog/seededStars/data/` |
| `src/utils/scene/constellationOfBody.ts`                             | `src/layers/starCatalog/selection/utils/` |
| `src/utils/**/{pericentreSpeedKmS,skyInclinationToFrameInclination,skyPositionAngleToFrameAngle,meanAnomalyAtJ2000,temperatureToLinearRgb,absMagFromGalacticCentreK}.ts` | `src/layers/starCatalog/bodies/utils/`    |
| `src/@types/scene/SStarSeed.d.ts`, `src/@types/data/FamousStarRow.d.ts`, `src/@types/engine/StarOrbitInfo.d.ts`, `src/@types/data/starCatalog/SeededStarCatalogId.d.ts` | `src/layers/starCatalog/@types/`          |

- A helper on that list with a reader outside the star Layer stays where it is; say which.
- `tests/data/bodies/sStarAstrometry.test.ts` mirrors no file: move it by hand into
  `tests/layers/starCatalog/bodies/`.
- `tools/famous/buildFamousStars.ts`: both `generatedPath`s (`:36`, `:41`) and the emitted
  `import type` string (`:130`) match the new location; the test's literals (`:145`, `:149`)
  follow. The two generated files' header lines are edited to what the tool would now emit. Do
  not run the tool (global constraints).
- `layerImportBoundary.test.ts`: `CORE_ALLOWED` loses its one entry; README row `:33` goes.
- No folder under `src/layers/starCatalog` exceeds 15 direct files.
- Repoint the path strings `move-files` does not rewrite: `docsStartFacts.ts:103`,
  `docsGuideFacts.ts:178,363,772`, `docs/DATA.md:151`, `docs/science.md:20,69`,
  `.claude/skills/add-famous/SKILL.md:336`, spec `:28-31,101`. Leave `docs/research/`,
  `docs/audits/`, `docs/grill-sessions/` and completed plans as history.
- Backlog: delete J1 and J3 from `docs/backlog/2026-10-29-layer-migration-leftovers.md` and the
  J1 line at `docs/BACKLOG.md:62`; `:63` reads "J4–J12"; `:249` and
  `docs/backlog/2026-08-16-barycentric-orbit-pairs.md:14` say the pair is a field on the
  primary's row.

- [x] Hand fixes 1–2, with `npm test -- CompactBodyCard sStarOrbitInfo starDetail` green. Commit.
- [x] `--dry`, then the move with fix 3; resolve every finding.
- [x] `grep -rn "data/bodies/\(famousStars\|sun\.generated\|sStar\|sceneStars\|sceneSun\|sceneSStars\|seededStarCatalogs\|starResolvePx\|bodySearchNames\|famousStarsIndex\)" src tools tests packages .claude/skills docs/DATA.md docs/science.md`
      is empty.
- [x] `npm test` (whole suite), `npm run typecheck`, `npm run format` pass.
- [x] Commit the move; docs and backlog went in the same commit (ae7107d8f), not separately.

### Task 5: Verify the app is unchanged

**Files:** none

- [x] Before Task 1 and after Task 4, shoot on this worktree's dev server: Earth home (bare link),
      `#focus=body-mars`, the Moon, a mission focus, a famous star, an S-star, the Sun, each with
      a fixed `t`. Pairs go to the owner as dash checks.
- [x] `npm run perf` (`earth-surface`, `solar-system`, `full-survey` as control) and
      `npm run perf:cpu` before and after, `--url` this worktree's server. A difference beyond
      noise is settled by a paired A-B-A-B, not by one read.
- [x] Payoff build (`tools/reference-engine/vite.payoff.config.ts`): `attribute.mts` no longer
      lists `ephemerisCorrections.generated`, `famousStars.generated` or `sStarElements`. Report
      the gzip size beside 279 kB. Informative, not a gate: rendering is PR D's.

---

## Definition of Done

**Deliverables**

- `BodyPosition` has `anchor`, and `correction?` / `pair?` on `orbit`; `BarycentricPair` has no
  `primaryId`.
- `src/data/bodies/barycentricPairs.ts` and `makers/starAnchor.ts` are gone.
- `STAR_CATALOG_BODY_ROWS` is in `APP_BODY_REGISTRY`; the J1 files live under
  `src/layers/starCatalog/`.
- `CORE_ALLOWED` in `layerImportBoundary.test.ts` is empty.
- Leftovers J1 and J3 are deleted from the backlog.

**Observable behaviours**

- Every body sits where it did, to the bit, at the two recorded instants.
- Famous stars, the Sun and S-stars still pick, focus, deep-link and show their cards; S-star
  trails still draw.
- The hover card for a planet or craft shows its name as before.

**Deferral boundary**

- Core still throws or misbehaves with an empty registry: the shape-model list (PR C) and the
  survey fade edge (PR D).
- Star-only helpers that kept a non-star reader stay in core.
- `data/bodies/bodyRegions.ts` still imports `deriveBodyStates` from services (adjacent finding,
  raised with the owner, not fixed here).
