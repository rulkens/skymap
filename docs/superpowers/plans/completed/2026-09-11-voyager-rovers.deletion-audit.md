# Deletion audit — `bfa77e980..5e38cf75c` (Voyager 1/2 + Mars rovers)

Read-only sweep, legacy framing (surplus presumed, every claim verified by grep/reading the
consumers). Scope: the 79 files in the branch range, plus the pre-existing headers of files the
branch edited. Spec/plan docs excluded; settled rulings in `progress.md` not re-litigated.

## Headline

**The code this branch adds is lean.** Every new `src/` export has a real consumer; the two
"parallel path" suspicions named in the brief (`SLAB_HOST_IDS` vs `slabBodyCandidates`, the
twice-written `meshBodySlabHostId(b) === b.id` predicate) both turn out load-bearing — see TRAPS.
There is essentially nothing to *delete* in the feature's logic.

What *is* surplus is **prose**: four pre-existing module headers that the branch touched are
2–5× over the comment budget and carry plan narration ("Task 5", "Task 7", "an earlier design
leaned on"), restatements of `@returns`, and — in `bodyRegions.ts` — narration that went stale two
features ago. Plus four `ATTRIBUTIONS.md` entries that re-tell the build log already written, more
precisely, in the per-asset READMEs.

Realistic net removable: **~111 src comment lines, ~4 test lines, ~16 doc lines — 0 lines of
executable code.** A further ~15 code lines sit behind rulings.

---

## SAFE-NOW — mechanical, comment/prose only, no behaviour change

Ranked by LOC × confidence.

### 1. `src/data/bodies/sceneOrbitConics.ts:1-44, 57-64, 77-89, 109-114` — −30
71 comment lines over 40 code lines; the module header alone is 44. Three of its four `###`
sections are teaching material that the code and the two adjacent headers already carry:

- "### Single source of truth: elements → shape, not body → ring" (6-14) argues against a design
  nobody proposes; the file's first line already says DERIVED.
- "### Focus resolution" (16-25) restates `keplerianEllipse`'s own header verbatim from the other
  side.
- The `deriveOrbitConics` docblock (77-89) lists which fields "pass straight through" — readable
  in the 10-line function body directly below it.

**Keep**: the "### This is the STATIC J2000 seed — live trails re-derive per frame" paragraph
(27-37). That one is a genuine landmine — it stops a reader wiring `SCENE_ORBIT_CONICS` into the
animated path — and the "no upward layer-crossing import" clause is a cross-file contract. Condense
to ~4 lines, keep the `focusResolveOrder`-throws clause.

*Why safe*: comments only. **Risk**: low; ledger already nominated this file.

### 2. `src/utils/orbit/keplerianEllipse.ts:1-45` — −27
45 header lines over 19 code lines. "### Why focus-relative (centre-OFFSET, not absolute centre)"
(22-30) restates the `@returns` two paragraphs below it and names "Task 7" — a closed ticket.
`@param`/`@returns` (42-44) restate the signature.

**Keep**: "### The one structural fact this rests on" (6-20) — the unit-circle/eccentric-anomaly
identity is a derivation a reader cannot recover from the code — and the three-line `A`/`B`/`C_off`
formula block (38-40).

*Why safe*: comments only. **Risk**: low.

### 3. `src/utils/orbit/keplerianPositionMpc.ts:1-33` — −23
33 header lines over 17 code lines; the ledger carried this here from the Task 4 review. Contains
the branch's clearest plan narration: "Because the body seed (Task 5) and the trail table (Task 7)
both derive from the *same* `A`, `B`, `C`…" (16-20) — two closed tasks. "### Focus-relative, like
the ellipse it composes" (22-28) is the third copy of the focus-relative argument in this
directory (see items 1 and 2).

**Keep**: the `X_off(E) = C + A·cos E + B·sin E` line and one sentence saying this is its single
evaluation at the body's own `E`; keep the `e > 1` dispatch comment at line 42-43 (load-bearing —
it records why `keplerianEllipse` cannot serve a hyperbola).

*Why safe*: comments only, and the hyperbolic-branch comment is untouched. **Risk**: low.

### 4. `src/services/engine/frame/passes/glintBandClass.ts:1-37` — −22
42 comment lines over **8** code lines, the worst ratio in the branch (5.25). The branch edited the
header, so it is in scope. "### The three classes" (6-20) spends 15 lines explaining a 3-value
enum whose three exported constants each carry their own docblock immediately below — and its last
two bullets restate `focusId === 'sun' ? PLANET : MOON`, which is the function's only line.

**Keep**: "### Contract with the shader" (27-36) in full — it names the WESL file, the parity test,
and the silent-failure mode. That is exactly what the budget is meant to buy. Keep the
"Earth is special-cased because it cannot be told apart by elements" sentence.

*Why safe*: comments only. **Risk**: low.

### 5. `ATTRIBUTIONS.md:510-586` — −16 (docs)
The four new entries run 13/17/18/21 lines against the whale's 12 and the petunias' 13, and the
excess is all in **Use:**, which re-tells the pre-bake internals: frame numbers, part counts
("joins 68 parts"), decimation figures ("199,482 → 100,000 tris"), material counts, "leaves 21
material-less marker cubes in place as joint parents".

Verified: every one of those facts is in the corresponding `data/raw/meshes/<key>/README.md`,
stated more precisely and with the inspection date attached (e.g. `mer/README.md` "The pre-bake"
and "As inspected (2026-09-11)" sections). The attribution file's job is credit + licence + which
bodies use it; it already points at the README and the registry for provenance.

Trim each **Use:** to the petunias shape — what it draws, "shipped as a derivative via
`npm run prebake-mesh -- <key>` then `npm run build-meshes`", and the pointer to the README.
Keep in full: every **Source**, **Licence**, **Credit** line, and the MER "the page's own download
link 404s → GitHub mirror" note (that one is not provenance flavour, it is the only way to re-fetch
the file).

*Why safe*: no code, no licence text touched. **Risk**: low — but it is a legal-adjacent file, so
worth the user's eye on the diff.

### 6. `src/data/bodies/bodyRegions.ts:24-26, 45-48` — −5 (stale legacy narration)
Two comments describe a future that arrived:

- `24-26` "Named ahead of its seed: the feature plan adds the anchor and the S-star rows, and the
  walk below claims them without this table being edited." — the anchor and the 39 S-star rows are
  seeded (`sceneSgrAStar.ts`, `sStarElements.ts`).
- `45-48` "The filter is `galactic-centre`'s alone — its anchor id is authored ahead of the feature
  plan's seed, so **until then it is empty and must resolve no position**." — `galactic-centre` is
  populated; `bodyRegions.test.ts` asserts its extent exceeds S2's apoapsis tenfold.

Both are pre-existing, but the branch edits this file, and the second actively misleads (it tells a
reader the region is empty). Replace with one line stating the filter's purpose, or delete.

*Why safe*: comments only; verified against the seeded tables and the test. **Risk**: none.

### 7. `src/data/bodies/palette.ts:33-35` — −2
Three comment lines for two constants, where the identical situation one line above
(`WHALE_GREY`/`PETUNIA_PINK`, equally unread for the same reason) gets one. Collapse to
"Thermal-blanket gold, warm and cool so the two probes stay apart; unread today — mesh bodies draw
no trail." *Do not* delete the constants: `OrbitalElements.color` is required.

### 8. `tests/utils/scene/meshBodySlabHostId.test.ts:1-6` and `tests/data/bodies/positionDrivers.test.ts:1-5` — −4
Both docblocks promise a future that landed inside this same branch:
- "Task 11's Voyagers are the first real rows of the second kind; `pluto`'s driver stands in for
  them **until then**." — Voyager 1/2 exist; the fixture can use `voyager1` and stop standing in.
- "The `surfaceFixed` arm has no row **until the sites land**." — the four sites landed.

Rewrite to the present tense (and optionally swap the `pluto` stand-in for `voyager1`, which makes
the test read against the real case it now has).

### 9. `src/data/bodies/makers/probe.ts:1-12` — −2
12 header lines against 31 code; two over. The "Horizons publishes at the FETCH epoch…" paragraph
and the unwrapped-M/negative-`a` landmine both stay (ruled load-bearing); trim the restatement of
"`M(t) = n·(t − Tp)` holds exactly for any conic" down to the clause that matters (`MA` is unread
and therefore free as a cross-check).

### 10. Two docblocks that the branch made FALSE — 0 net, correctness
- `src/@types/scene/OrbitalElements.d.ts:40` — "Eccentricity e, in **[0, 1)**. Circular at e = 0."
  Four rows now sit outside that range and the type comment is the first place a reader looks.
- `src/utils/orbit/apoapsisMpc.ts:1-6` — "Summed along a focus chain it **bounds every orbit point
  for every t**." False for `e > 1`: `a·(1+e)` with `a < 0` is negative. See NEEDS-RULING #1 for
  the structural fix; at minimum the sentence must say "for a bound orbit".

---

## NEEDS-RULING — behaviour, debug surface, or scaffolding

1. **`src/data/bodies/orbitReachByRegion.ts:15` — feed `TRAIL_ELEMENTS`, not `ORBITAL_ELEMENTS`.**
   `ORBIT_REACH_BY_REGION` exists for the orbit-trail cull, and only `TRAIL_ELEMENTS` rows draw
   trails. Today the hyperbolic rows go through `apoapsisMpc` and yield a negative reach that
   `Math.max` silently discards — correct by accident, and the reason `apoapsisMpc`'s docblock is
   now false. One-line change; verified no value change (the mesh bodies' own reach is Earth's +
   400 km, far under the planets'). Net −0 lines but removes a caveat and a false docblock.
   *Ruling needed*: it is a behaviour-surface edit, however inert.

2. **`src/data/bodies/surfaceFixedSites.ts:16-20` — the `groundOffsetM(meshKey)` helper duplicates
   the `meshBody` maker's MESH_ASSETS-lookup-or-throw (`makers/meshBody.ts:27-28`), and the sites
   table hand-types the mesh key** (`groundOffsetM('mer')` for both Spirit and Opportunity). If a
   seed's `meshKey` ever changes, the site keeps the old one. Resolving the key through
   `SCENE_MESH_BODIES` instead would make the join structural (no import cycle: `sceneMeshBodies`
   imports neither `positionDrivers` nor `surfaceFixedSites`). Net ~0 LOC; removes a duplicated
   key. `surfaceFixedSites.test.ts:66-73` currently *tests* the drift this would make impossible.

3. **`tools/meshes/prebake/meshPrebake.py:313-321, 342-343` — `bounds()` and its "extent" log.**
   11 lines whose only consumer is one operator log line. Classic concluded-investigation
   instrumentation (it was how the agent verified the models are authored in metres — a fact now
   recorded in all four READMEs). *Ruling*: keep as a units sanity check for the next asset, or
   delete. −11 if deleted.

4. **`tools/meshes/prebake/meshPrebake.py:22, 34, 348, 355-356` — the `atlas=2048` knob.**
   Parametrised, never overridden by any of the four rows. Collapse to a module constant. −2.

5. **`src/services/engine/frame/deriveBodyStates.ts:48, 56, 93, 103` — the `meanAnomalies` map's
   zero writes.** Phases 1a and 1c write `0` for anchors and sites only so phase 2's `.get(id)!`
   is total. `meanAnomalies.get(id) ?? 0` in phase 2 deletes both writes and their explanatory
   comments. −4. *Ruling*: the current form is explicit about "an anchor has no orbit for a trail
   to fade along"; the `?? 0` form states it once. Note the full collapse into one `{pos, M}` map
   is NOT recommended — it would widen `orientationForBody`'s `positions` parameter, which is
   deliberately the narrowest thing that arm needs.

6. **`DAYS_PER_JULIAN_CENTURY` is now four module-private copies** (`propagateElements.ts:41`,
   `moonRatesFromPeriods.ts:47`, `moonRatesFromSiderealPeriods.ts:43`, and this branch's
   `makers/probe.ts:20`). `src/data/time/constJ2000.ts` is the precedent for a shared time
   constant. Net ~0 LOC (−4 declarations, +1 file, +4 imports). *Ruling*: SSoT consistency vs. a
   new file for one literal.

7. **`elementsById` (`src/data/bodies/orbitalElements.ts:56`) now has ZERO src consumers** —
   verified; the branch's `glintBandClass` fix took the last one. Six test files and ~13 call sites
   use it. Deleting it saves 5 src lines and costs ~6 test lines (each file would import
   `findByIdOrThrow` + `ORBITAL_ELEMENTS`). *Recommendation*: keep, and reclassify it as a
   test-facing accessor in its docblock — deleting is net-negative.

8. **`hostBodyId` (utils/scene, texture→host) vs `bodyHostId` (data/bodies, body→driver host).**
   Two near-anagram functions in one codebase; the branch added the second and defends it with a
   "Not `utils/scene/hostBodyId`" line in the docblock — a comment that exists because the names
   collide. Renaming one (`driverHostId`? `textureHostBodyId`?) deletes the need for that line.
   0 LOC, mechanical via `npm run refactor`.

9. **`tests/data/bodies/makers/probe.test.ts:11-22` re-types Voyager 1's nine Horizons columns**
   already authored in `orbitalElements.ts:661-670` — and has **already drifted**:
   `argPeriapsisDeg: 338.25000336994` here vs `338.250003369942` in the table. The duplication is
   defensible (the test must feed `probe()` an input, and using the table's output would be
   circular), but the drifted digit should be fixed or the truncation made deliberate and
   commented.

10. **Four `if (!('poleRaDeg' in x)) throw new Error(...)` narrowing pairs** added to
    `rotationElements.test.ts` (×2), `sceneEarth.test.ts`, `scenePlanets.test.ts` — 8 lines of pure
    TS narrowing ceremony, a direct consequence of the settled "optional `kind`" ruling. A single
    `tests/helpers/iauRowById.ts` would collapse them to four imports. Net ~−4. *Ruling*: adds a
    test helper file, which the user may prefer not to.

11. **`src/utils/orbit/rotationFromIau.ts:20-27` — "### Why a single `Mat3`".** 8 lines of design
    narration in a 31/19 header. Pre-existing; the branch only narrowed the parameter type. The
    "### Why the Rz·Rx·Rz composition" block stays — it carries the pole-is-the-third-column
    contract that this branch's `surfaceLocked` arm now depends on. −8 if ruled in scope.

12. **`src/services/engine/frame/frameProgram.ts` — 408 comment lines over 236 code.** Far the
    largest comment surplus in any file the branch touched, but the branch's contribution is three
    lines. Out of scope for this audit; flagging it as the standing candidate for a dedicated
    `/comment-audit` pass.

---

## TRAPS — looked removable, verified load-bearing

1. **`tests/fixtures/bodyStatesJ2000.json:392-409` (the two Voyager rows, 18 lines of decimals).**
   Looks like the archetypal snapshot restatement. It is not removable:
   `deriveBodyStates.test.ts:69-71` asserts `Object.hasOwn(BODY_STATES_J2000, el.id)` for **every**
   `ORBITAL_ELEMENTS` row. Deleting the rows fails with `'voyager1' is in the fixture`. (Whether the
   whole-table golden fixture is a good idea is a pre-existing question, not this branch's.)

2. **`src/services/engine/frame/frameContext.ts:100` vs `src/data/bodies/hostlessMeshBodies.ts:11`
   — the same predicate written twice.** Not collapsible. `HOSTLESS_MESH_BODIES` filters the
   **static** `SCENE_MESH_BODIES` because `BODY_SLAB_CAPACITY` must be a compile-time constant
   (`createGpuTimingService` sizes its query set from it). `frameContext` filters
   `state.data.bodies.meshBodies`, the **runtime roster**, which `createBodyStore` starts EMPTY and
   a slot commit fills. Using the static table in `frameContext` would emit slab rows for bodies
   whose meshes have not loaded. Two different lists that happen to converge after boot.

3. **`src/utils/scene/meshBodySlabHostId.ts:16-20` — `SLAB_HOST_IDS` "mirroring"
   `slabBodyCandidates`.** Genuinely a mirror of the same three tables, and it cannot be replaced by
   reading `slabBodyCandidates`: that list is per-frame and runtime-gated, while this function is
   called at module load from `hostlessMeshBodies.ts` to *size* the capacity — before any frame
   exists. The mirror is the import-order cost of the constant. (A shared
   `SLAB_HOST_BODIES` data module could serve both, but it would move `frameContext`'s
   `earth === null` runtime branch into data, which is worse.)

4. **`visibleSlabBodies<T extends SceneBody>` (`visibleSlabBodies.ts:43-51`) — the generic.**
   Landed out-of-brief and looks like speculative generality. It is load-bearing:
   `frameContext.ts:123` does `visibleSlabBodies({...}).map(meshBodySlabHostId)`, and
   `meshBodySlabHostId` takes a `MeshBody`, not a `SceneBody`. Without `T` the call needs a cast.

5. **`positionDriverById` (`positionDrivers.ts:31`).** Brief flagged "one internal caller". It has
   two: `bodyHostId` (same file) and `bodyRegions.ts:79`'s `boundsExtent`. Not speculative.

6. **The `hosted` ternaries in `meshBodiesPass.ts:73, 83-90, 103-106`.** Verified against the
   maths: with `body.id === hostId`, `distToHostM` is 0, so `sunVisibleFraction` divides by zero
   and `hostSkyFraction(r, 0)` returns a half-sky. The branches are the NaN guard, not defensive
   padding. (Already ruled load-bearing; confirmed independently.)

7. **`VOYAGER_1_GOLD` / `VOYAGER_2_AMBER` (`palette.ts:36-37`).** The comment admits they are
   unread. They are still required: `OrbitalElements.color` is non-optional, so the `probe()` rows
   must supply a value, and `WHALE_GREY`/`PETUNIA_PINK` are unread for exactly the same reason.
   Only the comment is trimmable (SAFE-NOW #7).

8. **The 11 new `rawDataRegistry` rows (~115 lines), including the three `*Source`/`*Archive`
   rows no code reads.** These follow the established pattern — `meshes.petuniasSource` is
   likewise consumer-less — and the registry is the project's provenance index by convention, not a
   lookup table. Not surplus.

---

## Totals

| Bin | src code | src comments | tests | docs |
|---|---|---|---|---|
| SAFE-NOW | 0 | ~111 | ~4 | ~16 |
| NEEDS-RULING (if all ruled in) | ~15 | ~8 | ~4 | 0 |

Net realistically removable **now**: **~131 lines, none of them executable code.**
