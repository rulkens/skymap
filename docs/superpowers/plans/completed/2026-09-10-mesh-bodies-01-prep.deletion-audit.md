# Deletion audit — `mesh-bodies-prep` (PR #677), 89d716438..09be1f119

Read-only sweep of the four-commit prep branch (P1 rotation-row gate, P2 one pick-row
table) **and** the live state of every file the diff touches. Stance: five-year legacy —
reachability verified by grep/tests here, not taken from the prose.

## Headline

**The branch's executable code is already minimal.** No dead code, no unused export, no
orphaned helper, no speculative knob, no parallel table left behind. Verified:

- `PICK_SEEDS_BY_BODY_ID` and `rotationById` survive nowhere in `src/`/`tests/` (only in
  dated plan/spec/research docs).
- `findByIdOrThrow` did **not** become an orphan — `orbitalElements.ts:39` and
  `bodyTextureLoadRadius.ts:63` still call it.
- `bodyTextureSpec` did **not** become an orphan — `partitionBodiesByPresentation.ts:106`
  and `bodyTextureSlotRegistry.ts:31` still call it.
- `BODY_PICK_ROWS` has exactly two readers (pack + unpack), as designed.
- Touched suite green: 8 files / 26 tests pass.

Everything removable is **comment prose in the swept files** plus **two tests the
compiler already guarantees** and **one test the bit layout already guarantees**. Net
realistic: **−53 src lines (100% comments, 0 statements)** and **−24 test lines**
(+ −12 more if the constant-restatement ruling goes that way).

---

## SAFE-NOW (pure deletion, no behaviour change)

Ranked by LOC-saved × confidence.

### 1. `src/services/engine/frame/deriveBodyStates.ts:1-55` — header is 55 lines for 36 code lines (ratio 1.94, budget ≤10 header / ≤0.5 ratio)

Touched by the branch (comment edit at :85-89), so it is in the sweep. Four sections;
only fragments are landmine-grade:

| Lines | Section                                       | Verdict                                                                                                                                                                                                                            | LOC |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 7-21  | "### Why a derive, not baked records"         | **Delete.** Pure migration history ("used to bake…", "the prep zero-change proof"). Plan content; the completed plan + git log hold it. The one durable fact (at J2000 `propagateElements` is the identity) is restated at :27-29. | −15 |
| 22-33 | "### `simDays` drives both…"                  | **Compress to ~3.** Most of it narrates the two expressions below it. Keep only the `meanAnomalyRad` = PROPAGATED M / trail-anchor line — that one is a real contract.                                                             | −9  |
| 34-44 | "### One instant per frame, memoized"         | **Compress to ~2.** The one-deep-cache rationale is already at :71-73 (inline, next to the cache vars). Keep only the tear landmine ("all passes must see the SAME instant").                                                      | −9  |
| 45-55 | "### Anchors first, then rows in focus order" | **Delete.** Restates the two loops, which each already carry their own inline comment (:85-89, :98-100).                                                                                                                           | −11 |

**LOC saved ≈ 44** (header 55 → ~11). Safe: comments only. Risk: low — the deleted
material is history and restatement; the two landmines (mid-frame tear, propagated M)
survive in compressed form.

### 2. `src/services/engine/helpers/resolvePickTable.ts:63-75` — 13 comment lines on a 5-line arm

The block explains that `localIdx` indexes the same durable seed array and that an
off-the-end index yields null. **`bodyPickRows.ts:2-6` now says the first half** ("each
body's DURABLE seed table, the array a pick tagged with that row's source code indexes
into"), and the "DATA not a branch chain" paragraph (:72-75) is refactor narration —
the git log's job. Keep ~4 lines: the off-the-end→null rule and why that makes the
single-element Earth row correct. **LOC −9.** File ratio 0.86 → ~0.65.

### 3. `tests/services/engine/frame/passes/starPickId.test.ts:18-26` — "an S-star pick id never collides with a famous-star pick id"

Cannot fail on a real bug the sibling test misses. `packSelection` is
`(code << 26) | idx` (`selectionEncoding.ts:54-56`); `Source.SStar ≠ Source.FamousStar`
(pinned numerically in `tests/data/sources.test.ts:229-240`) and both tables are far
under 2²⁶ rows, so **distinct codes make collision arithmetically impossible**. The only
mutation that produces a collision — stamping one code for both tables — is caught by
`:28-39` ("stamps the source code of the table the star actually came from"), which
fails first and more precisely. **LOC −9.** Imports stay (used by :28-39).

### 4. `tests/data/bodies/sceneEarth.test.ts:19-26` — "carries no baked position or orientation (identity-only record)"

Runtime type test. `SCENE_EARTH` is declared `: EarthBody` (`sceneEarth.ts:18`) and
`EarthBody` is a closed 3-field type — an object literal with `positionMpc`,
`orientation` or `textureUrl` is TS2353 at compile time. The assertions can only fail if
someone widens `EarthBody` itself, in which case the test is edited, not tripped. The
comment ("the split's on-disk shape") dates it to a long-finished migration. **LOC −8.**

### 5. `tests/data/bodies/scenePlanets.test.ts:28-33` — "carries identity-only records"

Same argument: `SCENE_PLANETS: readonly PlanetBody[]`, `PlanetBody` closed (4 fields),
built by `heliocentricPlanet`/`satelliteBody` whose declared return type is `PlanetBody`
(`heliocentricPlanet.ts:17`). Compiler-guaranteed. **LOC −6.**

### 6. `src/services/engine/frame/passes/starPickId.ts:11-13` — third copy of the −1 contract

Header is 14 lines (budget ≤10), ratio 1.17. The −1 paragraph is the **fourth** telling:
`seedIndexOfBody.ts:23-29` (§"The −1 contract"), `sceneBodyPickId.ts:5-6`, and the two
call sites (`starPointsPass.ts:344`, `starSpheresPass.ts:164`) that already say "see
starPickId". One sentence ("`null` = SKIP; see `seedIndexOfBody`") suffices here.
**LOC −4** (header 14 → 10). The two-table / URL-stability paragraph (:4-9) **stays** —
see traps.

### 7. `tests/data/bodies/orientationForBody.test.ts:25` — `ROTATION_ELEMENTS: rows,` in the `vi.mock` factory

Dead mock export. The module under test imports only `rotationRowById`
(`orientationForBody.ts:9`), and the test file itself imports nothing from
`rotationElements`. Verified by grep over the test file's import list. **LOC −1.** Keep
`...actual` (line 24) and `rows` (built from `actual.ROTATION_ELEMENTS`) — the spread is
what keeps the mock from silently dropping exports a future import needs.

**SAFE-NOW total: src −57 (all comments), tests −24.**

---

## NEEDS-RULING

### R1. Constant-restatement tests: `sceneEarth.test.ts:15-17` + `scenePlanets.test.ts:23-26` (+ the `findPlanet` helper :10-14 that only they use) — **−12 LOC**

`expect(SCENE_EARTH.radiusM).toBe(6371000)` mirrors `sceneEarth.ts:21` one indirection
out; `EarthBody.d.ts:19` even restates `6 371 000` in its own comment. Same for the two
planet radii. Per `testing.md` these are constant restatements. **Counter-argument** (why
it's a ruling, not a sweep): the assertion name says "authored in metres" — it does catch
a km/m unit slip, and the m→draw-space conversion is elsewhere. If the radii tests go,
`findPlanet` (5 lines) goes with them; `hypot3` stays.

### R2. Parallel route for S-stars in `sceneBodyPickId` — **0 LOC, judgement only**

`PACKABLE_BODY_ENTRIES` includes the `s-star` entry (`sources/s-star.ts:19`,
`code: Source.SStar`), so `sceneBodyPickId('s2')` now resolves inside the loop and packs
exactly what `starPickId`'s S-star branch would have. **Two routes, byte-identical
output**, so `starPickId`'s only live job on this path is famous stars. This is the
fenced backlog question (a) seen from the other side: the table already subsumes half the
tail fallback. Nothing to delete without _adding_ a second exclusion to the filter — flag
it in the backlog item, don't act on it here.

### R3. `docs/research/engine/layer-composition-review-2026-09-09.md:41,69` still names `PICK_SEEDS_BY_BODY_ID`

Missed by the "stale table names" sweep in 09be1f119. It's a dated research snapshot, so
"leave it, it was true on 2026-09-09" is defensible. Ruling: update or leave. **0 LOC.**

### R4. Adjacent, out of diff: `src/services/engine/frame/passes/seedIndexOfBody.ts` — 35 comment lines / 3 code lines (ratio 11.7)

Not touched by this branch, so strictly outside the sweep, but it is the helper both
refactored call sites now share. Lines 32-36 (the second doc block: "A thin `findIndex`
by id — its own module so…") restate the header and the body: **−5 with no argument
against**. The §8.1 "why not `instance_index`" essay (:5-21) is genuinely load-bearing
but is 17 lines where ~5 would do: **−12 more**. Ruling: does this ride PR #677 or get
its own commit?

---

## Do-NOT-remove traps (verified, with why)

1. **`sceneBodyPickId.ts:17` — `entry.id !== 'sun'`.** Reads like a one-body special
   case; it is load-bearing for _every_ famous star. `BODY_PICK_ROWS.sun` is
   `SCENE_STARS`, so without the filter `sceneBodyPickId('sirius')` matches the sun row
   and packs `Source.Sun`, diverging from the `Source.FamousStar` the star layers stamp.
   Worse, the **round-trip test would still pass** (unpack reads the same row and returns
   `sirius`). Only `sceneBodyPickId.test.ts:39-41` catches it.
2. **`sceneBodyPickId.test.ts:24-42` (test 1) is NOT subsumed by the new round-trip
   test.** I checked this specifically because it looks redundant. A _consistent_ error —
   e.g. swapping the `earth` and `sgr-a-star` rows in `BODY_PICK_ROWS` — round-trips
   perfectly while diverging from the GPU stamp (`earthPass.ts:292` writes `Source.Earth`,
   `starPointsPass.ts:338` writes `Source.SgrAStar`). Test 1's `sourceCode` assertions are
   the only pin on pack-code ↔ layer-code agreement. Keep both.
3. **`findByIdOrThrow` and `bodyTextureSpec` are not orphans** (2 live callers each,
   listed in the headline). P1 removed one caller from each; a legacy sweep would guess
   wrong here.
4. **`rotationElements.ts` row comments** (`:20-21` Venus retrograde, `:29-31` Uranus
   negative δ₀, `:38-47` Pluto/Charon convention + tidal-lock landmine). File ratio 1.14,
   over budget — but every one records a "looks wrong, would get fixed back" sign
   convention or a cross-table physics identity that `rotationElements.test.ts:40-63`
   depends on. Leave.
5. **`starPickId.ts:4-9`** — the "TWO tables, never merged / concatenating renumbers every
   famous star and breaks saved selection URLs" paragraph. Only telling of that landmine;
   it survives the header trim in SAFE-NOW #6.
6. **`orientationForBody.test.ts:11-28` `vi.mock`** — fenced ruling (e), and confirmed
   independently: no real id has a rotation row without a texture entry, so the fixture
   row is the only red-first route to the new gate.
7. **`BODY_PICK_ROWS.sun = SCENE_STARS`** — fenced ruling (c), and it is what makes trap
   #1 necessary; the unpack arm keyed by `Source.Sun` reads it.
8. **`bodyPickRows.test.ts` disjointness** — fenced ruling (f); note only that its stated
   rationale is narrower than written: the `sun` row is skipped by the scan, so a
   duplicate between `sun` and another row is decided by `starPickId` ordering, not by
   this invariant. Not an argument to delete it.

---

## Net removable

| Bucket                             | src     | tests   | note                                       |
| ---------------------------------- | ------- | ------- | ------------------------------------------ |
| SAFE-NOW                           | **−57** | **−24** | src is 100% comment lines; zero statements |
| NEEDS-RULING (R1)                  | —       | −12     | radii mirrors + their helper               |
| NEEDS-RULING (R4, out of diff)     | −17     | —       | `seedIndexOfBody.ts` header                |
| **Total if all rulings go delete** | **−74** | **−36** |                                            |

No executable src line on this branch is removable. The prep is lean; the fat is prose
in the files it happened to touch.
