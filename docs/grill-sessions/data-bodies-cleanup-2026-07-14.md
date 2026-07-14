# Grill Session: `data/bodies/` cleanup + reorg — 2026-07-14

Source: `docs/backlog/2026-07-14-data-bodies-cleanup.md`, surfaced by the
zoom-to-earth plan-04 entanglement-radar pass (PR #432). The folder grew fast —
Earth/Jupiter/Moon → all 8 planets → 13 moons + per-planet equatorial frames —
and accumulated duplicated helpers, inline maker functions, and scattered
palette constants.

Goal: a behaviour-preserving decomplection pass so each `data/bodies/` file is
one table (or one derivation), with generic primitives in `utils/` and one home
per shared palette. Full test suite (3922) is the gate; no format/bin impact.

---

## Q1: Scope boundary

**The question:** How far does the cleanup reach? The `DEG_TO_RAD` duplication
the backlog names is actually ~6 sites repo-wide (`raDecDistToCartesian`,
`eqRaDecToUnitCart`, `galacticToCartesian`, `cameraFraming`, `eclipticBasis`,
plus the two `data/bodies/` copies), and the "no vec3-add helper" apology
appears at 4 component-wise-add sites.

**Considerations:**

- **Option A (bodies-internal only):** reshuffle within `data/bodies/`, no new
  `utils/` files. Leaves the documented duplication in place — the backlog
  item's own trigger unaddressed.
- **Option B (bodies + targeted utils extraction):** extract `degToRad` and
  `addVec3` into `src/utils/math/`, consume them from `data/bodies/`, but do
  NOT touch the other repo sites that inline `Math.PI/180` — they migrate
  opportunistically when next touched. Keeps the diff a reviewable
  bodies-cleanup.
- **Option C (repo-wide sweep):** also migrate the ~6 other inline sites onto
  the new helpers. ~6 extra files + tests churned for zero behaviour gain;
  dilutes the PR.

**Decision:** **B**, with **C captured as a follow-up backlog item**. The
helpers existing satisfies the generalize-repeated-fixes convention; the other
sites are single-line idioms that aren't lying to anyone and can migrate when
touched.

## Q2: Where do the maker functions live?

**The question:** `satellite()` sits inside `orbitalElements.ts`;
`star()`/`heliocentricPlanet()`/`satelliteBody()` inside `sceneBodies.ts` —
each with a docblock apologizing for being module-local. Where should row
constructors live so the table files read as data?

**Considerations:**

- **Option A (`data/bodies/makers/` subfolder, one maker per file):**
  `makers/star.ts`, `makers/satellite.ts`, `makers/heliocentricPlanet.ts`,
  `makers/satelliteBody.ts`. Tables become pure data + an import block.
  Consequences: `elementsById` exported from `orbitalElements.ts` (the lookup
  over a table belongs with the table; two makers need it); `BodySpec` moves to
  `@types/scene/BodySpec.d.ts` (now shared across files — one-type-per-file).
- **Option B (single `data/bodies/bodyMakers.ts`):** one file, four exports —
  the multi-export grab-bag the house style avoids; braids star-row logic with
  orbit-body logic that vary independently.
- **Option C (keep module-local):** smallest diff but leaves the mixed
  data+logic files that motivated the backlog item.
- **Option D (move makers to `utils/`):** investigated at the user's request.
  No layering rule blocks it — 11 `utils/` files already import from `data/`
  (e.g. `utils/orbit/keplerianEllipse.ts` pulls `ECLIPTIC_FRAME`). But every
  precedent differs in kind: existing `utils/` files (incl. `utils/scene/`) are
  generic computations called at runtime with varying inputs by multiple
  consumers, pulling registry _constants_ to parameterize themselves. The
  makers are authoring-policy row constructors (Ω/ω/M=0 for moons, the
  one-solar-radius placeholder, focus addition) that run once at module load
  and have exactly one consumer each — their own table. The clincher is
  cohesion: a maker and its table change together (add a field to `StarBody` →
  edit `star()` and the rows in one motion); splitting them across two
  top-level trees puts the two halves of one edit apart. CLAUDE.md's own
  extraction rule is scoped to "a _generic_ pure helper" — the generic bits
  inside the makers (deg→rad, vec3 add, find-by-id) are exactly what Q1's
  ring-B sends to `utils/`; what remains is pure domain authoring.

**Decision:** **A** — ratified after the Option-D investigation confirmed
`utils/` is the wrong home. `data/bodies/makers/`, one maker per file;
`elementsById` exported from `orbitalElements.ts`; `BodySpec` →
`@types/scene/BodySpec.d.ts`; only the generic primitives go to `utils/`.

## Q3: One home for the colours

**The question:** 13 trail-tint consts live in `orbitalElements.ts` (9
single-use per-planet tints + 4 genuinely shared satellite palette entries), 4
star spectral-class consts in `sceneBodies.ts`, and 21 per-row albedo literals
inline in `SCENE_PLANETS`. Where do the named colours live?

**Considerations:**

- **Option A (single palette file):** all _named_ colour constants move to one
  file, sectioned with their didactic comments (the "max channel ≲ 0.5 for
  additive HDR" constraint, the spectral-class table). Albedos stay inline
  per-row — per-body data with 21 distinct values, not a shared palette.
- **Option B (two palette files):** `trailTints.ts` + `starPalette.ts`. Honors
  that the palettes serve different draws, but doubles file-hops for what is
  one activity ("retune the foreground look").
- **Option C (inline single-use tints, move only shared palettes):** smallest
  palette file, but loses named-tint legibility and scatters the ≲0.5
  additive-HDR constraint across 9 rows.

**Decision:** **A**, named **`data/bodies/palette.ts`** (user: folder-scoped
name, not `bodyPalette.ts`). Precedent exists: `data/volume/scalarFieldPalettes.ts`.
The user also proposed adopting `data/<domain>/palette.ts` as a convention —
auditing other data folders (`structure/categoryDisplayInfo.ts`,
`milkyWay/galacticCenter.ts`, per-source files) and possibly renaming
`scalarFieldPalettes.ts` — folded into the same follow-up backlog item as Q1's
ring C.

## Q4: The find-by-id-or-throw duplicate

**The question:** `elementsById()` (over `ORBITAL_ELEMENTS`) and the find
inside `parentWorldMpc()` (over `SCENE_BODIES`) are the same shape: find by
`.id`, throw loudly with context on a miss. Consolidate?

**Considerations:**

- **Option A (generic `utils/object/findByIdOrThrow.ts`):**
  `findByIdOrThrow<T extends { id: string }>(list, id, context): T`.
  `elementsById` stays a one-line domain wrapper exported from
  `orbitalElements.ts`; `parentWorldMpc` keeps its null→`RENDER_ORIGIN_MPC`
  branch and calls the generic. Earns a small test — the throw path is real
  behaviour a refactor could break.
- **Option B (keep two domain lookups):** 4 lines each, domain-specific error
  messages. But it's exactly the "second hardcoded copy" the
  generalize-repeated-fixes feedback flags, and a third table makes a third
  copy.

**Decision:** **A.** Also settled without contest: `utils/math/degToRad.ts`
and `utils/math/addVec3.ts` ship **without tests** — any test for them is a
constant restatement that can never fail on a real bug (testing.md's one
question), while `findByIdOrThrow` gets one for its throw path.

## Q5: Fold `eclipticBasis.ts` into `orbitPlaneFrames.ts`?

**The question:** The ecliptic exists as two exported representations of the
same plane: `ECLIPTIC_BASIS` (`obliquityRad`/`yAxis`/`normal`) and
`ECLIPTIC_FRAME` (`xAxis`/`yAxis`/`normal`, wrapping the former). Facts
gathered: `obliquityRad` has zero src readers outside the file itself;
`ECLIPTIC_BASIS`'s only src consumer is `orbitPlaneFrames.ts`; and
`orbitPlaneFrames.ts` has NO test while `planeFrameFromPole`'s cross-product
math is silently-botchable.

**Considerations:**

- **Option A (fold):** delete `eclipticBasis.ts`; `orbitPlaneFrames.ts`
  derives `ECLIPTIC_FRAME` directly from `OBLIQUITY_DEG = 23.44` (its docblock
  already notes the pole-derivation reproduces it). The didactic
  equinox/obliquity prose moves into `orbitPlaneFrames`' header. Tests: retire
  `eclipticBasis.test.ts`; write the missing `orbitPlaneFrames.test.ts`
  asserting every exported frame is right-handed orthonormal + the ecliptic
  normal sits at 23.44° from +z — strictly better coverage (the planet frames
  were untested). `keplerianEllipse.test.ts` switches its reference to
  `ECLIPTIC_FRAME.normal`.
- **Option B (keep both):** `eclipticBasis.ts` is small with good teaching,
  but one concept keeps two exported shapes and a field nobody reads.

**Decision:** **A** — the one place this cleanup deletes a concept-duplicate
rather than relocating code, and it converts an untested file into a tested
one.

## Q6: Split `sceneBodies.ts` into per-table files?

**The question:** After maker/palette extraction `sceneBodies.ts` still holds
four exports: `SCENE_EARTH`, `SCENE_STARS` (25 rows), `SCENE_PLANETS` (21
rows), `SCENE_BODIES` (registry).

**Considerations:**

- **Option A (per-table files):** `sceneEarth.ts`, `sceneStars.ts`,
  `scenePlanets.ts`; `sceneBodies.ts` keeps only the flat registry + its
  docblock. Each table sits beside its provenance/selection-rule prose;
  matches the one-table-per-file shape `orbitalElements`/`sceneOrbitConics`
  already have.
- **Option B (keep one file):** ~180 lines of pure data is scannable, but the
  50-line module docblock stays a mixed essay over three unrelated tables.

**Decision:** **A** — completes the "each file is one table" shape and is the
re-org the backlog title asked for.

## Q7: Execution mechanics

**The question:** Who edits, and when does the PR open?

**Considerations:**

- **Option A (one opus implementer subagent):** single dispatch with the full
  design sketch; main thread runs typecheck + full suite + commits + pushes
  (background subagents can't run npm). Draft PR opens when the first commit
  lands. Matches the delegate-all-edits and draft-PR-at-start feedback.
- **Option B (main thread edits inline):** fewer moving parts for a
  mechanical reshuffle, but deviates from standing feedback.

**Decision:** **A.** Transcript, backlog pickup (delete index line + detail
file), and the ring-C follow-up item all land in the same PR.

---

## Resulting target layout

```
src/data/bodies/
  orbitalElements.ts     table only + exported elementsById (wraps findByIdOrThrow)
  sceneOrbitConics.ts    derived table + slimmed parentWorldMpc (uses findByIdOrThrow, addVec3)
  orbitPlaneFrames.ts    planeFrameFromPole + ECLIPTIC_FRAME (obliquity folded in) + 3 planet frames
  palette.ts             trail tints + satellite palette + star spectral classes (colours only)
  sceneEarth.ts          SCENE_EARTH
  sceneStars.ts          SCENE_STARS (+ selection-rule/provenance prose)
  scenePlanets.ts        SCENE_PLANETS (+ albedos inline per-row)
  sceneBodies.ts         SCENE_BODIES registry only
  makers/
    satellite.ts         OrbitalElements row maker (uses degToRad)
    star.ts              StarBody row maker (+ SOLAR_RADIUS_KM — star() is its only
                         reader; keeping it in sceneStars.ts would be a circular import)
    heliocentricPlanet.ts PlanetBody row maker (heliocentric focus)
    satelliteBody.ts     PlanetBody row maker (parent-hop focus)
src/utils/math/degToRad.ts   (no test — constant restatement)
src/utils/math/addVec3.ts    (no test — constant restatement)
src/utils/object/findByIdOrThrow.ts  (+ test: found + throw paths)
src/@types/scene/BodySpec.d.ts
DELETED: src/data/bodies/eclipticBasis.ts (+ its test; orbitPlaneFrames.test.ts replaces with better coverage)
```

Behaviour-preserving throughout; `npm run typecheck` + full suite (3922) gate
every step. Follow-up backlog item (new): repo-wide `degToRad`/`addVec3`
migration (~6 sites) + `data/<domain>/palette.ts` convention audit.
