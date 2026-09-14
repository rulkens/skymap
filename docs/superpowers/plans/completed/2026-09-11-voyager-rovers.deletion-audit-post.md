# Deletion audit — post-`5e38cf75c` (Voyager 1/2 + Mars rovers, tasks 16–17 + fix waves)

Read-only sweep, legacy framing (surplus presumed until proven otherwise). Scope:
`review-post-audit.diff` — the files the branch changed after the first audit
(`deletion-audit-branch.md`, range `bfa77e980..5e38cf75c`). That report's findings, traps and
null results are **fenced and not re-litigated**; several of its SAFE-NOW items have since been
applied and I verified they landed rather than re-reporting them.

Line numbers are against the tree at **30c652360** (post-`#690` merge). `meshBodiesPass.ts` and
`texturedBodiesPass.ts` shifted ~3 lines in that merge, so each finding also quotes its anchor
text.

## Headline

Task 16/17 added **no dead code and no speculative knobs** — every new export has a consumer,
and the four constructs that look most deletable (`hitUnitSphere`'s third parameter,
`SphereHit.t`, the second compose, the dropped `host === undefined` guard) are each load-bearing
for the contact-range precision fix. See TRAPS.

What is surplus is again **prose**, in a specific shape: the f32-cancellation story is now told
at **twelve** sites. Most of them correctly point at `lib/analyticSphere.wesl`'s depth section —
but four re-argue it instead, the header itself tells it as history ("the error this path used
to show… now computed in f64"), and `sphere.wesl` restates a byte-offset table it already
carries 14 lines below. Plus one genuine mirror test.

Realistic net removable: **~40 src comment lines, ~10 test lines, 0 lines of executable code.**

---

## SAFE-NOW — mechanical, comment/test only, no behaviour change

Ranked by LOC × confidence.

### S1. `src/services/gpu/shaders/lib/analyticSphere.wesl:69-81` — −4
13 lines, of which 4 are **history**: "the metre-scale error this path used to show instead
traced to `c`'s (`originAltitudeSq`) 0.4 m quantisation of the ray origin, now computed in f64".
The convention names this exactly ("This used to be 3000."): a comment written as a diff is
stale the moment the next change lands. The two facts under it — mvp-translation cancellation
costs 0.02–0.10 m, `originAltitudeSq` must arrive from f64 — are load-bearing and survive.

Replace 69-81 with:

```
// Projecting a hit through the SAME mvp the vertex stage used is exact only
// far from the surface: that mvp's translation column is the eye offset in
// metres, so on a planet (Mars 3.39e6 m, f32 ulp 0.25 m) a hit 10 m away is a
// difference of two huge numbers and the depth lands 0.02-0.10 m out -- enough
// to swallow or float a mesh parked on the ground. A CAMERA-RELATIVE hit
// ('rd * t', some 3e-6 body radii) through a translation-free 'vp * scale(R)'
// subtracts nothing large in f32. Same reason 'hitUnitSphere' takes
// 'dot(ro, ro) - 1' from f64 ('bodySlabCamAltitudeSq') rather than forming it:
// at that scale it and the textbook near root both cancel catastrophically.
```

*Why safe*: comments only. **Risk**: low — no fact dropped.

### S2. `src/services/gpu/shaders/lib/analyticSphere.wesl:150-153` — −2
`hitUnitSphere`'s `originAltitudeSq` paragraph re-argues the header it then cites ("(header)"),
and its last sentence ("A caller far from the surface loses nothing by handing over the f32
expression") restates what the two f32 call sites do in plain sight. Replace with:

```
// 'originAltitudeSq' is 'dot(ro, ro) - 1', a parameter because near the surface
// it is a cancellation f32 cannot do (header): the textured path supplies f64.
```

### S3. `src/services/gpu/shaders/lib/analyticSphere.wesl:214-219` — −2
`fragDepthFromClip`'s docblock is the **third** telling in this one file. Keep the frame-pairing
contract (that is the cross-file fact); drop the parenthetical "(mandatory once the eye can come
within metres of the surface)" and "-- each call site names which", both of which are argued in
the header and demonstrated at the call sites. 6 lines → 4.

### S4. `src/services/gpu/shaders/lib/sphere.wesl:167-169` — −3
`## The contact-range depth pair` ends with two offset lines:

```
//   offset 108..111: camAltitudeSq (f32 — dot(camPosLocal, camPosLocal) - 1, f64-derived)
//   offset 112..175: vpCamRelLocal (mat4x4<f32> — mvp without its eye-offset translation)
```

The `## Byte layout` table 14 lines below (182-183) already carries both, in the file's canonical
place for offsets. This is a second home for a layout fact — precisely the drift risk the byte
table exists to prevent. Delete 167-169 and close 166 with a full stop instead of a colon:
`// pad-slot-becomes-real-field trick again).`

*Why safe*: `sphere.wesl` is a byte-layout contract file (the convention's sanctioned
over-budget case), so this is not a budget trim — it is removing the **duplicate** table.

### S5. `src/utils/gpu/packTexturedBodyUniforms.ts:38-46` — −9
The nine `@param` lines restate the signature and the byte-layout table immediately above them,
down to repeating the out-indices (`out[22]`, `out[24..26]`, `out[27]`, `out[28..43]`) that the
table already gives as `f32 22`, `f32 24..26`, `f32 27`, `f32 28..43`. Convention: "Restating the
code… A field named `slot: number` documented as 'the slot number'." Delete the whole `@param`
block (keep the blank line and the `*/`).

*Note*: 7 of the 9 lines are pre-existing; the branch added 2 and is editing this docblock, so
it is in scope under the opportunistic-migration rule.

### S6. `src/utils/gpu/packTexturedBodyUniforms.ts:77` — 0 LOC (in-line edit)
`out[27] = camAltitudeSq; // byte 108 — what used to be the tail pad` → `// byte 108`. History;
every sibling line on the block is a bare byte offset.

### S7. `src/utils/camera/bodySlabCamAltitudeSq.ts:7-8` — −2
"f64 has no such trouble either way; this form just keeps the subtraction in metre units,
`|eyeRelBodyM| − radiusM`." — the `@returns` line at :13 already states
`(h/R)·(2 + h/R) for h = |eyeRelBodyM| − radiusM`. Delete the two lines; the header then ends on
"…quantises the eye's altitude before the quadratic runs.", which is the landmine worth keeping.

### S8. `src/utils/camera/composeBodySlabCamRelVp.ts:2-7` — −2
Six header lines for a two-line function, and 4-6 re-argue the cancellation before pointing at
the place that argues it. Replace 2-7 with:

```
 * composeBodySlabCamRelVp — `composeBodySlabMvp` without the translation: clip
 * from a point given RELATIVE TO THE EYE in body-radius units. That missing
 * `−eyeRelBodyM` column is the f32 cancellation at contact range — see
 * `lib/analyticSphere.wesl`'s depth section.
```

### S9. `src/data/bodies/sceneMeshBodies.ts:27-28` — −2
"Spirit and Opportunity are the same design, so they share one asset and still get their own body
rows, positions and GPU copies." — the two seed rows one line below both read `meshKey: 'mer'`
with distinct `id`s. Restatement of the data it sits on.

### S10. `src/data/bodies/makers/meshBody.ts:24-28` — −4
The `standoffRadii` field docblock and the seed-site comment at `sceneMeshBodies.ts:29-30` carry
the **same fact with the same numbers** (Voyager's boom vs its ~4 m bus). Keep it at the seed
site, where the `0.5` is authored; collapse the field doc to one line:

```
  /** Overrides `MESH_BODY_STANDOFF_RADII` where a thin boom, not the body, sets the radius. */
```

### S11. `src/services/engine/frame/passes/meshBodiesPass.ts:52-55` — −2
(anchor: `// The umbra and the host-shine solid angle are both ground geometry`) The hostless case
is explained twice, 19 lines apart; the second block (`:71-73`, `sunVisibleFraction` returns NaN
and `hostSkyFraction` a half-sky) is the one carrying the load-bearing detail. Trim the first to:

```
    // The umbra and the host-shine solid angle are both ground geometry, so the
    // host comes from the CELESTIAL roster; a hostless body misses (see below).
```

### S12. `src/services/gpu/shaders/lib/util.wesl:161-164` — −4
"Graduation to `lib/raycast.wesl` is deliberately deferred: a second WESL consumer now exists
(earth/fragment.wesl's cloud shadow)…" — deferred-refactor narration (plan content, not code
context) **and already false**: `raySphere` has six WESL consumers today (earth,
earthSurfaceTile, zoneOfAvoidance/band, skyViewLut, scattering, atmosphere/shell). Delete. The
branch edits this comment block (:154-155), so it is in scope.

### S13. `tests/utils/camera/bodySlabCamAltitudeSq.test.ts:25-34` — −10 (test)
A **mirror test**, the one anti-pattern `testing.md` names outright. The expectation

```ts
const expected = (2 * 0.4) / MARS_RADIUS_M + (10.4 ** 2 - 10 ** 2) / MARS_RADIUS_M ** 2;
```

is the algebraic expansion of `f(10.4) − f(10)` for the source's own `f(h) = 2h/R + h²/R²`, so a
wrong formula flows into both sides. Its stated purpose — "the step the f32 route would swallow"
— is not exercised: nothing in the test touches f32. Test 1 above it already pins the value at
contact range to 9 decimals and fails on every formula bug this one could catch (dropped `−R`,
squared radius, `dot` instead of `hypot`). Delete the `it` block and the blank line before it,
and trim the file docblock's last sentence to "The test pins the value at contact range."

### S14. `src/utils/orbit/keplerianEllipse.ts:8-9` — −2
"Position and trail are points of that same map, which is what makes a body sitting on its own
trail structural, not a sync invariant." is stated again in `keplerianPositionMpc.ts:7-8` ("the
same three vectors the trail is drawn from, so the body sits ON its trail"). One home; keep it at
`keplerianPositionMpc`, which is where the evaluation happens. *Lower confidence than the rest —
both headers were trimmed by the previous audit and the echo survived on both sides.*

### S15. `src/data/bodies/bodyRegions.ts:72-73` — 0 LOC (in-line edit)
"Voyager 1 sat 76 au out at J2000 and **is 172 au out today**" — a wall-clock-relative number in a
comment nothing verifies. `…and recedes ~3.6 au/yr` says the same thing without going stale.

### S16. `src/services/engine/frame/passes/texturedBodiesPass.ts:36-38` — −2
A 3-line paragraph that is purely a pointer. Fold into the paragraph above it as one clause:
`…one definition of "the frame where this body is the unit sphere" — and why the contact-range
depth pair is composed here too (see `lib/analyticSphere.wesl`'s depth section).` *Lowest
confidence item in this bin.*

---

## NEEDS-RULING — behaviour, measured-neutral work, or a test contract

1. **`src/services/gpu/shaders/lib/util.wesl:173-178` — revert task 17's WESL half? (−5)**
   The ledger records the measurement: the TS half is a real regression fix (near-root error
   4.3e-10 → 3.6e-15, with a test), the **WESL half measured NEUTRAL** — 3 of 5 f32 rays better,
   2 worse, because the f32 `c` dominates. `leanness.md` / `simplicity.md`: a neutral-or-negative
   measurement halts the landing pipeline, and land-or-park is the user's ruling. Reverting
   restores `return vec2<f32>(-b - s, -b + s);` and drops 5 lines (2 code + 3 comment); keeping it
   buys form-unification with `hitUnitSphere`. *This ruling is already open in the ledger — listed
   here because it is squarely a deletion candidate, not to re-ask it.*

2. **`src/data/bodies/bodyRegions.ts:76-79` — `boundsExtent` via the file's own map (−3).**
   It imports `positionDriverById` to answer a question the module already has an index for:

   ```ts
   const boundsExtent = (id: string): boolean => (ELEMENTS_BY_ID.get(id)?.eccentricity ?? 0) <= 1;
   ```

   Verified equivalent over every caller (members are pre-filtered to `STATES_J2000`; anchors and
   sites have no element row and fall through to `true`, matching the `kind !== 'orbit'` arm).
   Saves 3 lines and one cross-module import, but **loses the throw on an unknown id** — an inert
   guard today, a real one if the member lists ever stop being pre-filtered. *Ruling*: keep the
   guard, or take the simpler form.

3. **`tests/utils/camera/composeBodySlabCamRelVp.test.ts:104-108` — the `viaMvp` assertion (−5).**
   `expect(Math.abs(metres(viaMvp))).toBeGreaterThan(0.01)` asserts that the **rejected** route is
   broken; it is not a contract of the unit under test, and it would fail on any change to
   `wgpu-matrix`'s `lookAt`/`perspective` that happens to make the f32 columns cancel cleanly.
   Against that: it is the only executable record of why this util exists, and without it nothing
   stops a future editor collapsing the two composes back into one. *Ruling*: keep as the
   don't-revert guard, or delete as an assertion about code that is not under test. **My lean:
   keep** — the first assertion alone does not encode the regression.

4. **`src/utils/math/raySphereRoots.ts:35-37` — the `q === 0` early return (−3).**
   Reachable only when `b === 0 && discr === 0` exactly in f64 (origin precisely on the surface,
   ray precisely tangent). No shipped call path can produce it, and no test covers it. *Ruling*:
   keep as the divide-by-zero guard (it is 2 lines of comment + 1 of code), or delete as
   unreachable. Note the WESL twin carries the mirror of it (`select(c / q, 0.0, q == 0.0)`), so
   deleting one should delete both — and finding 1 above may delete the WESL side anyway.

5. **`packTexturedBodyUniforms` now takes 9 positional parameters** (`src/utils/gpu/
   packTexturedBodyUniforms.ts:57-67`), the last four being `number, Vec3, number, Float32Array`
   — two adjacent `number`s and two adjacent matrix-shaped arrays, with nothing but argument order
   keeping `camAltitudeSq` out of `limbExponent`'s slot. The sibling `packMeshBodyUniforms` takes
   one options object. Net 0 LOC (a call-site and signature change, one caller + two tests).
   *Ruling*: a simplicity fix with no deletion in it — ride this PR, backlog it, or decline.

---

## TRAPS — looked removable, verified load-bearing

1. **`hitUnitSphere`'s third parameter, and the two call sites that hand it `dot(ro, ro) - 1.0`
   inline** (`bodies/planet/fragment.wesl:46`, `bodies/spherePick.wesl:127`). The textbook shape
   is to form `c` inside the function, and the parameter reads like a knob. It is the entire fix:
   the textured path must supply the value from f64 (`bodySlabCamAltitudeSq`), because in f32
   `camPosLocal` is `1 + 3e−6` at 10 m above Mars and one ulp is 0.4 m — forming `c` inside
   quantises the eye's altitude before the quadratic runs. The two inline `dot(ro, ro) - 1.0`
   sites are callers far from the surface, where the f32 expression is exact enough.

2. **`SphereHit.t`** (`analyticSphere.wesl:135`) — a new struct field that two of the three
   consumers ignore. Not surplus: `rd * t` is the hit expressed **relative to the eye**, and it
   cannot be recovered from `point`, which is normalized (and, on a miss, is the grazing fallback
   rather than a point on the ray). It is the only form precise enough to write depth from at
   contact range.

3. **`composeBodySlabCamRelVp` beside `composeBodySlabMvp`** — looks like one function with a
   flag. It cannot be merged: `texturedBodiesPass.draw` needs **both** in the same draw (the mvp
   for the vertex stage's proxy, the cam-relative vp for the fragment's depth), so a mode
   parameter would double the call site rather than halve the file count.

4. **`bodySlabCamAltitudeSq` beside `bodySlabCamLocal`** — both take `(eyeRelBodyM, radiusM)` and
   look like one function returning four numbers. Deriving the altitude term from
   `bodySlabCamLocal`'s output defeats the purpose: that output is the f32-bound `camPosLocal`,
   and the subtraction has to happen *before* the narrow.

5. **`meshBodiesPass`'s dropped `host === undefined` return** (`:56-57`) — it reads like a deleted
   guard. It is the Voyager fix: a hostless row owns its own slab row, the `SCENE_CELESTIAL_BODIES`
   lookup legitimately misses, and returning there drew nothing at all. The `hosted` ternaries
   replace the two host-lighting terms with constants rather than letting them divide by zero.
   (Previous audit's trap 6 covered the ternaries; this covers the `return` removal.)

6. **`texturedBodiesPass:141` passing `view.slab.vp` where the line above passes
   `view.slab.vp, pose.eyeRelBodyM, body.radiusM`** — reads like a dropped argument in a
   copy-paste. It is correct and is the whole point: the eye translation is exactly what must NOT
   be in this matrix.

7. **`VOYAGER_1_GOLD` / `VOYAGER_2_AMBER` still unread** (`palette.ts:35-36`) — re-verified after
   this branch's `TRAIL_ELEMENTS` change, which now filters mesh bodies out of the trail table, so
   they will *stay* unread. Still required: `OrbitalElements.color` is non-optional. (Confirms the
   previous audit's trap 7; the comment on them is now accurate as written.)

---

## Totals

| Bin | src code | src comments | tests | docs |
|---|---|---|---|---|
| SAFE-NOW | 0 | ~40 | ~10 | 0 |
| NEEDS-RULING (if all ruled in) | ~7 | ~9 | ~5 | 0 |

**Net removable now: −50 lines, none of them executable code.**
